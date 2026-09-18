import { Emitter } from '@/core/events';
import type { Vec2 } from '@/core/math';
import {
  angleBetween,
  dist,
  distSq,
  pointAlongPolyline,
  polylineLength,
  rotateTowards,
  TAU,
} from '@/core/math';
import { Rng } from '@/core/rng';
import {
  DIFFICULTIES,
  EARLY_CALL_GOLD_PER_SECOND,
  INTEREST_CAP,
  INTEREST_RATE,
  WAVE_COUNTDOWN,
} from '@/data/difficulty';
import { enemyDef } from '@/data/enemies';
import { SELL_RATIO, TOWER_BY_ID, towerLevelDef } from '@/data/towers';
import { computeDamage, waveHpMultiplier } from './damage';
import { Grid, TILE, tileCenter, worldToTile } from './grid';
import type { ResolvedPath } from './grid';
import type {
  DamageType,
  DifficultyDef,
  DifficultyId,
  Enemy,
  GameMode,
  MapDef,
  Projectile,
  ProjectileKind,
  StatusApplication,
  TargetMode,
  Tower,
  TowerLevelDef,
  Trap,
  WaveDef,
  WavePhase,
  WorldStats,
} from './types';
import { generateWave } from './waves';

export interface WorldConfig {
  map: MapDef;
  difficulty: DifficultyId;
  mode: GameMode;
  seed: number;
  unlockedTowers: string[];
}

export interface WorldEvents {
  shoot: {
    towerId: number;
    kind: ProjectileKind | 'cone' | 'tracer';
    x: number;
    y: number;
    angle: number;
    tx: number;
    ty: number;
  };
  hit: { x: number; y: number; damage: number; type: DamageType; crit: boolean; enemyId: number };
  explosion: { x: number; y: number; radius: number; type: DamageType };
  enemyDied: { enemy: Enemy; killerTowerId: number; bounty: number };
  enemyLeaked: { enemy: Enemy; lives: number };
  enemySpawned: { enemy: Enemy };
  waveStart: { index: number; boss: boolean };
  waveCleared: { index: number; reward: number };
  towerBuilt: { tower: Tower };
  towerUpgraded: { tower: Tower };
  towerSold: { tower: Tower; refund: number };
  trapPlaced: { trap: Trap };
  trapTriggered: { trap: Trap; radius: number };
  gold: { amount: number; x: number; y: number };
  gameOver: { won: boolean };
  reroute: Record<string, never>;
}

interface SpawnEntry {
  at: number;
  enemy: string;
  wave: number;
  path?: string;
}

export interface TowerStats {
  damage: number;
  cooldown: number;
  range: number;
  minRange: number;
  dps: number;
}

export type BuildFailure = 'locked' | 'gold' | 'terrain' | 'occupied' | 'blocks' | 'enemy' | 'phase';

const MAX_GENERATION = 3;
const TURRET_TURN_SPEED = 9;

export class World {
  readonly def: MapDef;
  readonly grid: Grid;
  readonly rng: Rng;
  readonly difficulty: DifficultyDef;
  mode: GameMode;
  readonly events = new Emitter<WorldEvents>();
  readonly unlockedTowers: Set<string>;
  readonly seed: number;

  gold: number;
  lives: number;
  time = 0;
  phase: WavePhase = 'idle';
  countdown = 0;
  /** Number of waves started so far. */
  waveIndex = 0;

  enemies: Enemy[] = [];
  towers: Tower[] = [];
  projectiles: Projectile[] = [];
  traps: Trap[] = [];

  stats: WorldStats = {
    kills: 0,
    leaks: 0,
    goldEarned: 0,
    goldSpent: 0,
    towersBuilt: 0,
    damageDealt: 0,
    wavesCleared: 0,
    earlyCalls: 0,
    timePlayed: 0,
  };

  private nextId = 1;
  private spawnQueue: SpawnEntry[] = [];
  private pendingWaves = new Map<number, WaveDef>();
  private waveCache = new Map<number, WaveDef>();
  private enemyById = new Map<number, Enemy>();
  private towerById = new Map<number, Tower>();

  constructor(config: WorldConfig) {
    this.def = config.map;
    this.grid = new Grid(config.map);
    this.seed = config.seed;
    this.rng = new Rng(config.seed);
    this.difficulty = DIFFICULTIES[config.difficulty];
    this.mode = config.mode;
    this.unlockedTowers = new Set(config.unlockedTowers);
    this.gold = Math.round(config.map.startGold * this.difficulty.goldMult);
    this.lives = Math.round(config.map.startLives * this.difficulty.livesMult);
  }

  // ------------------------------------------------------------------
  // Waves
  // ------------------------------------------------------------------

  get waveCount(): number {
    return this.mode === 'endless' ? Number.POSITIVE_INFINITY : this.def.waveCount;
  }

  get isOver(): boolean {
    return this.phase === 'won' || this.phase === 'lost';
  }

  get hasMoreWaves(): boolean {
    return this.waveIndex < this.waveCount;
  }

  wave(n: number): WaveDef {
    let w = this.waveCache.get(n);
    if (!w) {
      w = generateWave(this.def, n);
      this.waveCache.set(n, w);
    }
    return w;
  }

  /** The wave that will start next, or null when the game is finished. */
  get nextWave(): WaveDef | null {
    return this.hasMoreWaves ? this.wave(this.waveIndex + 1) : null;
  }

  get activeWaveCount(): number {
    return this.pendingWaves.size;
  }

  get canCallWave(): boolean {
    return (
      !this.isOver &&
      this.hasMoreWaves &&
      (this.phase === 'idle' || this.phase === 'countdown' || this.phase === 'active')
    );
  }

  /** Gold the player would receive by calling the next wave right now. */
  get earlyCallBonus(): number {
    if (this.phase === 'countdown') return Math.round(this.countdown * EARLY_CALL_GOLD_PER_SECOND);
    if (this.phase === 'active' && this.hasMoreWaves)
      return Math.round(this.wave(this.waveIndex + 1).reward * 0.15);
    return 0;
  }

  /** After a campaign victory, keep playing with endless scaling. */
  continueEndless(): void {
    if (this.phase !== 'won') return;
    this.mode = 'endless';
    this.phase = 'countdown';
    this.countdown = WAVE_COUNTDOWN;
  }

  callNextWave(): boolean {
    if (!this.canCallWave) return false;
    const bonus = this.earlyCallBonus;
    if (bonus > 0) {
      this.addGold(bonus, this.grid.width / 2, 40);
      this.stats.earlyCalls++;
    }
    this.beginWave();
    return true;
  }

  private beginWave(): void {
    this.waveIndex++;
    const wave = this.wave(this.waveIndex);
    this.pendingWaves.set(wave.index, wave);
    for (const group of wave.groups) {
      for (let i = 0; i < group.count; i++) {
        this.spawnQueue.push({
          at: this.time + group.delay + i * group.interval,
          enemy: group.enemy,
          wave: wave.index,
          path: group.path,
        });
      }
    }
    this.spawnQueue.sort((a, b) => a.at - b.at);
    this.phase = 'active';
    this.countdown = 0;
    this.events.emit('waveStart', { index: wave.index, boss: wave.boss === true });
  }

  private updateWaves(dt: number): void {
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.countdown = 0;
        if (this.hasMoreWaves) this.beginWave();
      }
      return;
    }
    if (this.phase !== 'active') return;

    while (this.spawnQueue.length > 0 && (this.spawnQueue[0] as SpawnEntry).at <= this.time) {
      const entry = this.spawnQueue.shift() as SpawnEntry;
      this.spawnWaveEnemy(entry);
    }

    for (const [index, wave] of this.pendingWaves) {
      const queued = this.spawnQueue.some((s) => s.wave === index);
      if (queued) continue;
      const alive = this.enemies.some((e) => !e.dead && e.wave === index);
      if (alive) continue;
      this.pendingWaves.delete(index);
      const interest = Math.min(INTEREST_CAP, Math.floor(this.gold * INTEREST_RATE));
      const reward = Math.round(wave.reward * this.difficulty.goldMult) + interest;
      this.addGold(reward, this.grid.width / 2, 40);
      this.stats.wavesCleared++;
      this.events.emit('waveCleared', { index, reward });
    }

    if (this.pendingWaves.size === 0) {
      if (this.hasMoreWaves) {
        this.phase = 'countdown';
        this.countdown = WAVE_COUNTDOWN;
      } else {
        this.phase = 'won';
        this.events.emit('gameOver', { won: true });
      }
    }
  }

  private spawnWaveEnemy(entry: SpawnEntry): void {
    const def = enemyDef(entry.enemy);
    if (this.grid.open && !def.flying) {
      const spawn = this.rng.pick(this.grid.spawns);
      const points = this.grid.spawnRoute(spawn);
      if (points.length < 2) return;
      this.spawnEnemy(entry.enemy, entry.wave, points, 'flow', 0, 0);
      return;
    }
    const candidates = def.flying ? this.grid.airPaths : this.grid.paths;
    let list = candidates;
    if (entry.path) {
      const filtered = candidates.filter((p) => p.id === entry.path || p.group === entry.path);
      if (filtered.length > 0) list = filtered;
    }
    const path = this.rng.weighted(
      list,
      list.map((p) => p.weight),
    ) as ResolvedPath;
    this.spawnEnemy(entry.enemy, entry.wave, path.points, path.id, 0, 0);
  }

  spawnEnemy(
    defId: string,
    wave: number,
    points: Vec2[],
    pathId: string,
    travelled: number,
    generation: number,
  ): Enemy {
    const def = enemyDef(defId);
    const hpMult = waveHpMultiplier(
      Math.max(1, wave),
      this.def.hpScale,
      this.difficulty.hpMult,
      this.def.waveCount,
    );
    const maxHp = Math.round(def.hp * hpMult);
    const lane = this.rng.range(-1, 1) * (def.flying ? 22 : 13);
    const enemy: Enemy = {
      id: this.nextId++,
      defId,
      hp: maxHp,
      maxHp,
      shield: def.shield ? Math.round(def.shield.amount * hpMult) : 0,
      x: 0,
      y: 0,
      angle: 0,
      path: points,
      pathId,
      travelled,
      pathLength: polylineLength(points),
      lane,
      baseSpeed: def.speed,
      status: { slowFactor: 1, slowT: 0, burnDps: 0, burnT: 0, burnSource: 0, shred: 0, shredT: 0, stunT: 0 },
      lastDamageAt: -100,
      spawnedCount: 0,
      spawnTimer: def.spawnPeriodic?.interval ?? 0,
      flying: def.flying === true,
      stealth: def.stealth === true,
      revealed: false,
      dead: false,
      leaked: false,
      spawnedAt: this.time,
      hitFlash: 0,
      bounty: def.reward,
      livesDamage: def.livesDamage,
      radius: def.radius,
      generation,
      wave,
    };
    this.placeOnPath(enemy);
    this.enemies.push(enemy);
    this.enemyById.set(enemy.id, enemy);
    this.events.emit('enemySpawned', { enemy });
    return enemy;
  }

  private placeOnPath(e: Enemy): void {
    const p = pointAlongPolyline(e.path, e.travelled);
    e.angle = p.angle;
    e.x = p.x - Math.sin(p.angle) * e.lane;
    e.y = p.y + Math.cos(p.angle) * e.lane;
  }

  // ------------------------------------------------------------------
  // Main step
  // ------------------------------------------------------------------

  step(dt: number): void {
    if (this.isOver) return;
    this.time += dt;
    this.stats.timePlayed += dt;
    this.updateWaves(dt);
    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateTraps();
    this.cleanup();
  }

  // ------------------------------------------------------------------
  // Enemies
  // ------------------------------------------------------------------

  private updateEnemies(dt: number): void {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const def = enemyDef(e.defId);
      const s = e.status;
      e.revealed = false;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 6);

      if (s.stunT > 0) s.stunT -= dt;
      if (s.slowT > 0) {
        s.slowT -= dt;
        if (s.slowT <= 0) s.slowFactor = 1;
      }
      if (s.shredT > 0) {
        s.shredT -= dt;
        if (s.shredT <= 0) s.shred = 0;
      }
      if (s.burnT > 0) {
        s.burnT -= dt;
        this.damageEnemy(e, s.burnDps * dt, 'fire', 0, s.burnSource, false, 1, true);
        if (e.dead) continue;
      }

      if (def.shield && e.shield < def.shield.amount && this.time - e.lastDamageAt > def.shield.delay) {
        e.shield = Math.min(def.shield.amount, e.shield + def.shield.regen * dt);
      }

      if (def.heal) {
        const r2 = def.heal.radius * def.heal.radius;
        for (const o of this.enemies) {
          if (o === e || o.dead || o.hp >= o.maxHp) continue;
          if (distSq(e.x, e.y, o.x, o.y) <= r2) o.hp = Math.min(o.maxHp, o.hp + def.heal.hps * dt);
        }
      }

      if (def.spawnPeriodic && e.spawnedCount < def.spawnPeriodic.max) {
        e.spawnTimer -= dt;
        if (e.spawnTimer <= 0) {
          e.spawnTimer = def.spawnPeriodic.interval;
          e.spawnedCount++;
          this.spawnChild(e, def.spawnPeriodic.enemy, -18);
        }
      }

      let speed = e.baseSpeed * s.slowFactor;
      if (def.berserk) {
        const missing = 1 - e.hp / e.maxHp;
        speed *= 1 + (def.berserk.maxSpeedMult - 1) * missing;
      }
      if (s.stunT > 0) speed = 0;
      e.travelled += speed * dt;
      if (e.travelled >= e.pathLength) {
        this.leak(e);
        continue;
      }
      this.placeOnPath(e);
    }
  }

  /** Spawn an enemy next to a parent (troop trucks, dying elephants). */
  private spawnChild(parent: Enemy, defId: string, offset: number): Enemy | null {
    if (parent.generation >= MAX_GENERATION) return null;
    const childDef = enemyDef(defId);
    if (this.grid.open && !childDef.flying) {
      const [c, r] = worldToTile(parent.x, parent.y);
      const route = this.grid.routeFrom(c, r);
      if (route.length === 0) return null;
      const points = [{ x: parent.x, y: parent.y }, ...route.slice(route.length > 1 ? 1 : 0)];
      return this.spawnEnemy(defId, parent.wave, points, 'flow', 0, parent.generation + 1);
    }
    if (childDef.flying !== parent.flying) {
      // Different movement domain: use the parent's spawn path family.
      const list = childDef.flying ? this.grid.airPaths : this.grid.paths;
      const path = list[0];
      if (!path) return null;
      return this.spawnEnemy(defId, parent.wave, path.points, path.id, 0, parent.generation + 1);
    }
    const travelled = Math.max(0, parent.travelled + offset);
    return this.spawnEnemy(defId, parent.wave, parent.path, parent.pathId, travelled, parent.generation + 1);
  }

  private leak(e: Enemy): void {
    e.dead = true;
    e.leaked = true;
    this.lives = Math.max(0, this.lives - e.livesDamage);
    this.stats.leaks++;
    this.events.emit('enemyLeaked', { enemy: e, lives: e.livesDamage });
    if (this.lives <= 0 && !this.isOver) {
      this.phase = 'lost';
      this.events.emit('gameOver', { won: false });
    }
  }

  damageEnemy(
    e: Enemy,
    base: number,
    type: DamageType,
    armorPierce: number,
    ownerId: number,
    crit: boolean,
    bonusVsAir: number,
    silent = false,
  ): number {
    if (e.dead || base <= 0) return 0;
    const def = enemyDef(e.defId);
    const armor = Math.max(0, def.armor - e.status.shred);
    let dmg = computeDamage({
      base,
      type,
      armor,
      armorPierce,
      resist: def.resist,
      flying: e.flying,
      bonusVsAir,
      critMultiplier: crit ? 2 : 1,
    });
    if (dmg <= 0) return 0;
    if (e.shield > 0) {
      const absorbed = Math.min(e.shield, dmg);
      e.shield -= absorbed;
      dmg -= absorbed;
    }
    e.hp -= dmg;
    e.lastDamageAt = this.time;
    if (!silent) e.hitFlash = 1;
    this.stats.damageDealt += dmg;
    const owner = this.towerById.get(ownerId);
    if (owner) owner.damageDealt += dmg;
    if (!silent) this.events.emit('hit', { x: e.x, y: e.y, damage: dmg, type, crit, enemyId: e.id });
    if (e.hp <= 0) this.kill(e, ownerId);
    return dmg;
  }

  private kill(e: Enemy, killerTowerId: number): void {
    if (e.dead) return;
    e.dead = true;
    const owner = this.towerById.get(killerTowerId);
    let bounty = e.bounty * this.difficulty.goldMult;
    if (owner) {
      owner.kills++;
      bounty *= 1 + owner.buff.gold;
    }
    bounty = Math.round(bounty);
    this.stats.kills++;
    this.addGold(bounty, e.x, e.y);
    this.events.emit('enemyDied', { enemy: e, killerTowerId, bounty });
    const def = enemyDef(e.defId);
    if (def.spawnOnDeath) {
      for (let i = 0; i < def.spawnOnDeath.count; i++) {
        this.spawnChild(e, def.spawnOnDeath.enemy, (i - (def.spawnOnDeath.count - 1) / 2) * 16);
      }
    }
  }

  private addGold(amount: number, x: number, y: number): void {
    if (amount <= 0) return;
    this.gold += amount;
    this.stats.goldEarned += amount;
    this.events.emit('gold', { amount, x, y });
  }

  applyStatus(e: Enemy, status: StatusApplication | undefined, sourceId: number): void {
    if (!status || e.dead) return;
    const s = e.status;
    if (status.slow) {
      // Strongest slow wins; refresh duration.
      if (status.slow.factor <= s.slowFactor || s.slowT <= 0) {
        s.slowFactor = status.slow.factor;
        s.slowT = Math.max(s.slowT, status.slow.duration);
      }
    }
    if (status.burn && !(e.flying && enemyDef(e.defId).resist?.fire === 0)) {
      if (status.burn.dps >= s.burnDps || s.burnT <= 0) {
        s.burnDps = status.burn.dps;
        s.burnSource = sourceId;
      }
      s.burnT = Math.max(s.burnT, status.burn.duration);
    }
    if (status.shred) {
      s.shred = Math.max(s.shred, status.shred.amount);
      s.shredT = Math.max(s.shredT, status.shred.duration);
    }
    if (status.stun && !enemyDef(e.defId).boss) {
      s.stunT = Math.max(s.stunT, status.stun.duration);
    }
  }

  // ------------------------------------------------------------------
  // Towers
  // ------------------------------------------------------------------

  levelDef(t: Tower): TowerLevelDef {
    return towerLevelDef(t.defId, t.level, t.branch);
  }

  towerStats(t: Tower): TowerStats {
    const lvl = this.levelDef(t);
    const damage = lvl.damage * (1 + t.buff.damage);
    const cooldown = lvl.cooldown > 0 ? lvl.cooldown / (1 + t.buff.rate) : 0;
    const range = lvl.range * (1 + t.buff.range);
    let dps = 0;
    if (lvl.attack === 'aura') dps = damage;
    else if (cooldown > 0) dps = (damage * (lvl.salvo ?? 1)) / cooldown;
    return { damage, cooldown, range, minRange: lvl.minRange ?? 0, dps };
  }

  private updateTowers(dt: number): void {
    for (const t of this.towers) {
      const lvl = this.levelDef(t);
      const stats = this.towerStats(t);
      if (t.cooldown > 0) t.cooldown -= dt;
      if (t.fireAnim > 0) t.fireAnim = Math.max(0, t.fireAnim - dt * 4);

      if (t.buff.reveal) {
        const r2 = stats.range * stats.range;
        for (const e of this.enemies) {
          if (!e.dead && e.stealth && distSq(t.x, t.y, e.x, e.y) <= r2) e.revealed = true;
        }
      }

      switch (lvl.attack) {
        case 'support':
          break;
        case 'aura':
          this.updateAura(t, lvl, stats, dt);
          break;
        case 'trap':
          this.updateTrapLayer(t, lvl, stats, dt);
          break;
        default:
          this.updateTurret(t, lvl, stats, dt);
      }
    }
  }

  private updateAura(t: Tower, lvl: TowerLevelDef, stats: TowerStats, dt: number): void {
    const r2 = stats.range * stats.range;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.flying ? !lvl.targetsAir : !lvl.targetsGround) continue;
      if (distSq(t.x, t.y, e.x, e.y) > r2) continue;
      this.applyStatus(e, lvl.status, t.id);
      if (stats.damage > 0)
        this.damageEnemy(e, stats.damage * dt, lvl.damageType, lvl.armorPierce ?? 0, t.id, false, 1, true);
    }
  }

  private updateTrapLayer(t: Tower, lvl: TowerLevelDef, stats: TowerStats, dt: number): void {
    const cfg = lvl.trap;
    if (!cfg) return;
    t.trapTimer -= dt;
    if (t.trapTimer > 0 || t.traps.length >= cfg.maxActive) return;
    t.trapTimer = cfg.placeInterval / (1 + t.buff.rate);
    const tiles = this.grid.pathTilesNear(t.x, t.y, stats.range);
    const free = tiles.filter((tile) => {
      const c = tileCenter(tile.col, tile.row);
      return !this.traps.some((tr) => Math.abs(tr.x - c.x) < TILE * 0.5 && Math.abs(tr.y - c.y) < TILE * 0.5);
    });
    if (free.length === 0) return;
    const tile = this.rng.pick(free);
    const c = tileCenter(tile.col, tile.row);
    const trap: Trap = {
      id: this.nextId++,
      x: c.x + this.rng.range(-10, 10),
      y: c.y + this.rng.range(-10, 10),
      ownerId: t.id,
      armedAt: this.time,
    };
    this.traps.push(trap);
    t.traps.push(trap.id);
    this.events.emit('trapPlaced', { trap });
  }

  /** Enemies this tower may target right now, honouring range, domain and stealth. */
  candidates(t: Tower, lvl: TowerLevelDef, stats: TowerStats): Enemy[] {
    const out: Enemy[] = [];
    const min2 = stats.minRange * stats.minRange;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.flying ? !lvl.targetsAir : !lvl.targetsGround) continue;
      let range = stats.range + e.radius;
      if (e.stealth && !t.buff.reveal) range = stats.range * 0.5 + e.radius;
      const d2 = distSq(t.x, t.y, e.x, e.y);
      if (d2 > range * range) continue;
      if (min2 > 0 && d2 < min2) continue;
      out.push(e);
    }
    return out;
  }

  private selectTarget(t: Tower, list: Enemy[]): Enemy | undefined {
    if (list.length === 0) return undefined;
    let best: Enemy | undefined;
    let bestScore = 0;
    for (const e of list) {
      const score = this.targetScore(t, e);
      if (!best || score < bestScore) {
        best = e;
        bestScore = score;
      }
    }
    return best;
  }

  private targetScore(t: Tower, e: Enemy): number {
    switch (t.targetMode) {
      case 'first':
        return e.pathLength - e.travelled;
      case 'last':
        return -(e.pathLength - e.travelled);
      case 'strong':
        return -(e.hp + e.shield);
      case 'weak':
        return e.hp + e.shield;
      case 'close':
        return distSq(t.x, t.y, e.x, e.y);
    }
  }

  private updateTurret(t: Tower, lvl: TowerLevelDef, stats: TowerStats, dt: number): void {
    const list = this.candidates(t, lvl, stats);
    let target = this.enemyById.get(t.targetId);
    if (!target || target.dead || !list.includes(target) || t.targetMode !== 'close') {
      target = this.selectTarget(t, list);
    }
    t.targetId = target ? target.id : 0;
    if (!target) return;

    const desired = angleBetween(t.x, t.y, target.x, target.y);
    t.angle = rotateTowards(t.angle, desired, TURRET_TURN_SPEED * dt);
    if (t.cooldown > 0) return;
    t.cooldown = stats.cooldown;
    t.fireAnim = 1;

    switch (lvl.attack) {
      case 'projectile':
        this.fireProjectile(t, lvl, stats, target, projectileKindFor(t.defId, lvl));
        break;
      case 'hitscan':
        this.fireHitscan(t, lvl, stats, target);
        break;
      case 'artillery':
        this.fireArtillery(t, lvl, stats, target);
        break;
      case 'cone':
        this.fireCone(t, lvl, stats, target, list);
        break;
      case 'salvo':
        this.fireSalvo(t, lvl, stats, target, list);
        break;
      default:
        break;
    }
  }

  private rollCrit(lvl: TowerLevelDef): boolean {
    return !!lvl.crit && this.rng.chance(lvl.crit.chance);
  }

  private fireProjectile(
    t: Tower,
    lvl: TowerLevelDef,
    stats: TowerStats,
    target: Enemy,
    kind: ProjectileKind,
  ): Projectile {
    const p = this.makeProjectile(t, lvl, stats, target, kind);
    this.projectiles.push(p);
    this.events.emit('shoot', {
      towerId: t.id,
      kind,
      x: t.x,
      y: t.y,
      angle: t.angle,
      tx: target.x,
      ty: target.y,
    });
    return p;
  }

  private makeProjectile(
    t: Tower,
    lvl: TowerLevelDef,
    stats: TowerStats,
    target: Enemy,
    kind: ProjectileKind,
  ): Projectile {
    const muzzle = 18;
    return {
      id: this.nextId++,
      kind,
      x: t.x + Math.cos(t.angle) * muzzle,
      y: t.y + Math.sin(t.angle) * muzzle,
      z: 0,
      fromX: t.x,
      fromY: t.y,
      targetId: target.id,
      targetX: target.x,
      targetY: target.y,
      speed: lvl.projectileSpeed ?? 500,
      damage: stats.damage,
      damageType: lvl.damageType,
      armorPierce: lvl.armorPierce ?? 0,
      splash: lvl.splash ?? 0,
      status: lvl.status,
      ownerId: t.id,
      flightTime: 0,
      elapsed: 0,
      angle: t.angle,
      bonusVsAir: lvl.bonusVsAir ?? 1,
      crit: this.rollCrit(lvl),
      dead: false,
    };
  }

  private fireHitscan(t: Tower, lvl: TowerLevelDef, stats: TowerStats, target: Enemy): void {
    const crit = this.rollCrit(lvl);
    this.events.emit('shoot', {
      towerId: t.id,
      kind: 'tracer',
      x: t.x,
      y: t.y,
      angle: t.angle,
      tx: target.x,
      ty: target.y,
    });
    if (lvl.splash) {
      this.areaDamage(target.x, target.y, lvl.splash, stats.damage, lvl, t.id, crit);
    } else {
      this.damageEnemy(
        target,
        stats.damage,
        lvl.damageType,
        lvl.armorPierce ?? 0,
        t.id,
        crit,
        lvl.bonusVsAir ?? 1,
      );
      this.applyStatus(target, lvl.status, t.id);
    }
  }

  private fireArtillery(t: Tower, lvl: TowerLevelDef, stats: TowerStats, target: Enemy): void {
    const speed = lvl.projectileSpeed ?? 300;
    const d = dist(t.x, t.y, target.x, target.y);
    const flightTime = Math.max(0.35, d / speed);
    // Lead the target along its path.
    const def = enemyDef(target.defId);
    const lead = pointAlongPolyline(
      target.path,
      target.travelled + target.baseSpeed * target.status.slowFactor * flightTime * 0.9,
    );
    const kind: ProjectileKind =
      t.defId === 'fire' ? 'drum' : t.defId === 'siege' && t.level < 3 ? 'ball' : 'shell';
    const p = this.makeProjectile(t, lvl, stats, target, kind);
    p.targetX = lead.x - Math.sin(lead.angle) * target.lane;
    p.targetY = lead.y + Math.cos(lead.angle) * target.lane;
    p.targetId = 0;
    p.flightTime = flightTime;
    p.x = t.x;
    p.y = t.y;
    void def;
    this.projectiles.push(p);
    this.events.emit('shoot', {
      towerId: t.id,
      kind,
      x: t.x,
      y: t.y,
      angle: t.angle,
      tx: p.targetX,
      ty: p.targetY,
    });
  }

  private fireCone(t: Tower, lvl: TowerLevelDef, stats: TowerStats, target: Enemy, list: Enemy[]): void {
    const half = ((lvl.coneAngle ?? 60) * Math.PI) / 360;
    const aim = angleBetween(t.x, t.y, target.x, target.y);
    t.angle = aim;
    this.events.emit('shoot', {
      towerId: t.id,
      kind: 'cone',
      x: t.x,
      y: t.y,
      angle: aim,
      tx: target.x,
      ty: target.y,
    });
    for (const e of list) {
      const a = angleBetween(t.x, t.y, e.x, e.y);
      let delta = Math.abs(a - aim) % TAU;
      if (delta > Math.PI) delta = TAU - delta;
      if (delta > half) continue;
      this.damageEnemy(
        e,
        stats.damage,
        lvl.damageType,
        lvl.armorPierce ?? 0,
        t.id,
        false,
        lvl.bonusVsAir ?? 1,
        true,
      );
      this.applyStatus(e, lvl.status, t.id);
    }
  }

  private fireSalvo(t: Tower, lvl: TowerLevelDef, stats: TowerStats, target: Enemy, list: Enemy[]): void {
    const count = lvl.salvo ?? 4;
    const sorted = [...list].sort((a, b) => this.targetScore(t, a) - this.targetScore(t, b));
    for (let i = 0; i < count; i++) {
      const victim = sorted[(i + t.salvoPhase) % sorted.length] ?? target;
      const p = this.makeProjectile(t, lvl, stats, victim, 'rocket');
      p.angle = t.angle + this.rng.range(-0.9, 0.9);
      p.x = t.x + Math.cos(p.angle) * 10;
      p.y = t.y + Math.sin(p.angle) * 10;
      p.speed = (lvl.projectileSpeed ?? 400) * this.rng.range(0.85, 1.15);
      this.projectiles.push(p);
    }
    t.salvoPhase = (t.salvoPhase + 1) % Math.max(1, sorted.length);
    this.events.emit('shoot', {
      towerId: t.id,
      kind: 'rocket',
      x: t.x,
      y: t.y,
      angle: t.angle,
      tx: target.x,
      ty: target.y,
    });
  }

  areaDamage(
    x: number,
    y: number,
    radius: number,
    damage: number,
    lvl: TowerLevelDef,
    ownerId: number,
    crit: boolean,
  ): void {
    this.events.emit('explosion', { x, y, radius, type: lvl.damageType });
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.flying ? !lvl.targetsAir : !lvl.targetsGround) continue;
      const d = dist(x, y, e.x, e.y) - e.radius;
      if (d > radius) continue;
      const falloff = d <= radius * 0.5 ? 1 : 1 - ((d - radius * 0.5) / (radius * 0.5)) * 0.4;
      this.damageEnemy(
        e,
        damage * falloff,
        lvl.damageType,
        lvl.armorPierce ?? 0,
        ownerId,
        crit,
        lvl.bonusVsAir ?? 1,
      );
      this.applyStatus(e, lvl.status, ownerId);
    }
  }

  // ------------------------------------------------------------------
  // Projectiles
  // ------------------------------------------------------------------

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (p.dead) continue;
      const owner = this.towerById.get(p.ownerId);
      const lvl = owner ? this.levelDef(owner) : undefined;
      if (p.flightTime > 0) {
        p.elapsed += dt;
        const u = Math.min(1, p.elapsed / p.flightTime);
        p.x = p.fromX + (p.targetX - p.fromX) * u;
        p.y = p.fromY + (p.targetY - p.fromY) * u;
        const height = Math.min(220, dist(p.fromX, p.fromY, p.targetX, p.targetY) * 0.55);
        p.z = Math.sin(u * Math.PI) * height;
        p.angle = angleBetween(p.fromX, p.fromY, p.targetX, p.targetY);
        if (u >= 1) {
          p.dead = true;
          if (lvl) this.areaDamage(p.targetX, p.targetY, p.splash, p.damage, lvl, p.ownerId, p.crit);
        }
        continue;
      }

      const target = this.enemyById.get(p.targetId);
      if (target && !target.dead) {
        p.targetX = target.x;
        p.targetY = target.y;
      }
      const d = dist(p.x, p.y, p.targetX, p.targetY);
      const stepLen = p.speed * dt;
      const hitRadius = target && !target.dead ? target.radius : 6;
      if (d <= stepLen + hitRadius * 0.5) {
        p.x = p.targetX;
        p.y = p.targetY;
        p.dead = true;
        if (!lvl) continue;
        if (p.splash > 0) {
          this.areaDamage(p.x, p.y, p.splash, p.damage, lvl, p.ownerId, p.crit);
        } else if (target && !target.dead) {
          this.damageEnemy(target, p.damage, p.damageType, p.armorPierce, p.ownerId, p.crit, p.bonusVsAir);
          this.applyStatus(target, p.status, p.ownerId);
        }
        continue;
      }
      const a = angleBetween(p.x, p.y, p.targetX, p.targetY);
      if (p.kind === 'rocket') {
        p.angle = rotateTowards(p.angle, a, 7 * dt);
      } else {
        p.angle = a;
      }
      p.x += Math.cos(p.angle) * stepLen;
      p.y += Math.sin(p.angle) * stepLen;
      p.elapsed += dt;
      if (p.elapsed > 6) p.dead = true;
    }
  }

  // ------------------------------------------------------------------
  // Traps
  // ------------------------------------------------------------------

  private updateTraps(): void {
    for (const trap of this.traps) {
      const owner = this.towerById.get(trap.ownerId);
      if (!owner) continue;
      const lvl = this.levelDef(owner);
      const cfg = lvl.trap;
      if (!cfg) continue;
      let victim: Enemy | undefined;
      for (const e of this.enemies) {
        if (e.dead || e.flying) continue;
        if (dist(trap.x, trap.y, e.x, e.y) <= cfg.triggerRadius + e.radius) {
          victim = e;
          break;
        }
      }
      if (!victim) continue;
      const stats = this.towerStats(owner);
      this.events.emit('trapTriggered', { trap, radius: lvl.splash ?? 24 });
      if (lvl.splash) {
        this.areaDamage(trap.x, trap.y, lvl.splash, stats.damage, lvl, owner.id, false);
      } else {
        this.damageEnemy(victim, stats.damage, lvl.damageType, lvl.armorPierce ?? 0, owner.id, false, 1);
        this.applyStatus(victim, lvl.status, owner.id);
      }
      owner.traps = owner.traps.filter((id) => id !== trap.id);
      trap.armedAt = -1;
    }
    if (this.traps.some((t) => t.armedAt < 0)) this.traps = this.traps.filter((t) => t.armedAt >= 0);
  }

  // ------------------------------------------------------------------
  // Building
  // ------------------------------------------------------------------

  towerCost(defId: string): number {
    return towerLevelDef(defId, 1, -1).cost;
  }

  canBuild(defId: string, col: number, row: number): BuildFailure | null {
    if (this.isOver) return 'phase';
    const def = TOWER_BY_ID[defId];
    if (!def) return 'locked';
    if (!this.unlockedTowers.has(defId)) return 'locked';
    const tile = this.grid.tile(col, row);
    if (!tile || tile.kind !== 'build') return 'terrain';
    if (this.grid.isOccupied(col, row)) return 'occupied';
    if (this.gold < this.towerCost(defId)) return 'gold';
    if (this.grid.open) {
      for (const e of this.enemies) {
        if (e.dead || e.flying) continue;
        const [c, r] = worldToTile(e.x, e.y);
        if (c === col && r === row) return 'enemy';
      }
      if (this.grid.wouldBlock(col, row)) return 'blocks';
      if (this.wouldTrapEnemies(col, row)) return 'blocks';
    }
    return null;
  }

  private wouldTrapEnemies(col: number, row: number): boolean {
    this.grid.setOccupied(col, row, true);
    let trapped = false;
    for (const e of this.enemies) {
      if (e.dead || e.flying) continue;
      const [c, r] = worldToTile(e.x, e.y);
      // Enemies still walking in from off-screen are not on the grid yet.
      if (!this.grid.inBounds(c, r) || !this.grid.isWalkable(c, r)) continue;
      if (this.grid.flowDistance(c, r) < 0) {
        trapped = true;
        break;
      }
    }
    this.grid.setOccupied(col, row, false);
    return trapped;
  }

  build(defId: string, col: number, row: number): Tower | null {
    if (this.canBuild(defId, col, row) !== null) return null;
    const cost = this.towerCost(defId);
    this.gold -= cost;
    this.stats.goldSpent += cost;
    this.stats.towersBuilt++;
    const c = tileCenter(col, row);
    const tower: Tower = {
      id: this.nextId++,
      defId,
      level: 1,
      branch: -1,
      col,
      row,
      x: c.x,
      y: c.y,
      cooldown: 0,
      targetMode: 'first',
      targetId: 0,
      angle: -Math.PI / 2,
      kills: 0,
      damageDealt: 0,
      invested: cost,
      trapTimer: 1,
      traps: [],
      buff: { damage: 0, rate: 0, range: 0, gold: 0, reveal: false },
      salvoPhase: 0,
      builtAt: this.time,
      fireAnim: 0,
    };
    this.towers.push(tower);
    this.towerById.set(tower.id, tower);
    this.grid.setOccupied(col, row, true);
    this.recomputeBuffs();
    if (this.grid.open) this.rerouteEnemies();
    this.events.emit('towerBuilt', { tower });
    return tower;
  }

  upgradeCost(t: Tower, branch: 0 | 1 = 0): number | null {
    const def = TOWER_BY_ID[t.defId];
    if (!def) return null;
    if (t.level >= 4) return null;
    if (t.level < 3) return (def.levels[t.level] as TowerLevelDef).cost;
    return def.branches[branch].cost;
  }

  canUpgrade(t: Tower, branch: 0 | 1 = 0): boolean {
    const cost = this.upgradeCost(t, branch);
    return cost !== null && this.gold >= cost && !this.isOver;
  }

  upgrade(towerId: number, branch: 0 | 1 = 0): boolean {
    const t = this.towerById.get(towerId);
    if (!t || !this.canUpgrade(t, branch)) return false;
    const cost = this.upgradeCost(t, branch) as number;
    this.gold -= cost;
    this.stats.goldSpent += cost;
    t.invested += cost;
    if (t.level < 3) {
      t.level++;
    } else {
      t.level = 4;
      t.branch = branch;
    }
    t.cooldown = 0;
    this.recomputeBuffs();
    this.events.emit('towerUpgraded', { tower: t });
    return true;
  }

  sellValue(t: Tower): number {
    return Math.floor(t.invested * SELL_RATIO);
  }

  sell(towerId: number): number {
    const t = this.towerById.get(towerId);
    if (!t || this.isOver) return 0;
    const refund = this.sellValue(t);
    this.gold += refund;
    this.towers = this.towers.filter((x) => x !== t);
    this.towerById.delete(t.id);
    this.traps = this.traps.filter((tr) => tr.ownerId !== t.id);
    this.grid.setOccupied(t.col, t.row, false);
    this.recomputeBuffs();
    if (this.grid.open) this.rerouteEnemies();
    this.events.emit('towerSold', { tower: t, refund });
    return refund;
  }

  setTargetMode(towerId: number, mode: TargetMode): void {
    const t = this.towerById.get(towerId);
    if (t) {
      t.targetMode = mode;
      t.targetId = 0;
    }
  }

  tower(id: number): Tower | undefined {
    return this.towerById.get(id);
  }

  enemy(id: number): Enemy | undefined {
    return this.enemyById.get(id);
  }

  towerAt(col: number, row: number): Tower | undefined {
    return this.towers.find((t) => t.col === col && t.row === row);
  }

  recomputeBuffs(): void {
    for (const t of this.towers) {
      t.buff = { damage: 0, rate: 0, range: 0, gold: 0, reveal: false };
    }
    for (const s of this.towers) {
      const lvl = this.levelDef(s);
      const aura = lvl.aura;
      if (!aura) continue;
      const r2 = lvl.range * lvl.range;
      for (const t of this.towers) {
        if (t === s) continue;
        if (distSq(s.x, s.y, t.x, t.y) > r2) continue;
        t.buff.damage = Math.max(t.buff.damage, aura.damage ?? 0);
        t.buff.rate = Math.max(t.buff.rate, aura.rate ?? 0);
        t.buff.range = Math.max(t.buff.range, aura.range ?? 0);
        t.buff.gold = Math.max(t.buff.gold, aura.gold ?? 0);
        t.buff.reveal = t.buff.reveal || aura.reveal === true;
      }
    }
  }

  /** Open maps: recompute every ground enemy's route after the maze changed. */
  rerouteEnemies(): void {
    for (const e of this.enemies) {
      if (e.dead || e.flying) continue;
      const [c, r] = worldToTile(e.x, e.y);
      const heading = pointAlongPolyline(e.path, e.travelled).angle;
      const route = this.grid.routeFrom(c, r, Math.round(Math.cos(heading)), Math.round(Math.sin(heading)));
      if (route.length === 0) continue;
      const start = { x: e.x + Math.sin(e.angle) * e.lane, y: e.y - Math.cos(e.angle) * e.lane };
      const rest = route.length > 1 ? route.slice(1) : route;
      e.path = [start, ...rest];
      e.travelled = 0;
      e.pathLength = polylineLength(e.path);
    }
    this.events.emit('reroute', {});
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  private cleanup(): void {
    if (this.enemies.some((e) => e.dead)) {
      for (const e of this.enemies) if (e.dead) this.enemyById.delete(e.id);
      this.enemies = this.enemies.filter((e) => !e.dead);
    }
    if (this.projectiles.some((p) => p.dead)) this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  // ------------------------------------------------------------------
  // Persistence
  // ------------------------------------------------------------------

  serialize(): WorldSave {
    return {
      version: 1,
      map: this.def.id,
      difficulty: this.difficulty.id,
      mode: this.mode,
      seed: this.seed,
      rng: this.rng.getState(),
      unlockedTowers: [...this.unlockedTowers],
      gold: this.gold,
      lives: this.lives,
      time: this.time,
      phase: this.phase,
      countdown: this.countdown,
      waveIndex: this.waveIndex,
      nextId: this.nextId,
      stats: { ...this.stats },
      spawnQueue: this.spawnQueue.map((s) => ({ ...s })),
      pendingWaves: [...this.pendingWaves.keys()],
      towers: this.towers.map((t) => ({ ...t, buff: { ...t.buff }, traps: [...t.traps] })),
      enemies: this.enemies.map((e) => ({
        ...e,
        status: { ...e.status },
        path: e.pathId === 'flow' || this.grid.open ? e.path.map((p) => ({ x: p.x, y: p.y })) : [],
      })),
      projectiles: this.projectiles.map((p) => ({ ...p })),
      traps: this.traps.map((t) => ({ ...t })),
    };
  }

  static restore(save: WorldSave, map: MapDef): World {
    const world = new World({
      map,
      difficulty: save.difficulty,
      mode: save.mode,
      seed: save.seed,
      unlockedTowers: save.unlockedTowers,
    });
    world.rng.setState(save.rng);
    world.gold = save.gold;
    world.lives = save.lives;
    world.time = save.time;
    world.phase = save.phase;
    world.countdown = save.countdown;
    world.waveIndex = save.waveIndex;
    world.nextId = save.nextId;
    world.stats = { ...save.stats };
    world.spawnQueue = save.spawnQueue.map((s) => ({ ...s }));
    for (const index of save.pendingWaves) world.pendingWaves.set(index, world.wave(index));
    for (const t of save.towers) {
      const tower: Tower = { ...t, buff: { ...t.buff }, traps: [...t.traps] };
      world.towers.push(tower);
      world.towerById.set(tower.id, tower);
      world.grid.setOccupied(tower.col, tower.row, true);
    }
    for (const e of save.enemies) {
      const enemy: Enemy = { ...e, status: { ...e.status }, path: e.path };
      if (enemy.path.length === 0) {
        const path = [...world.grid.paths, ...world.grid.airPaths].find((p) => p.id === enemy.pathId);
        enemy.path = path ? path.points : (world.grid.paths[0]?.points ?? []);
      }
      enemy.pathLength = polylineLength(enemy.path);
      world.enemies.push(enemy);
      world.enemyById.set(enemy.id, enemy);
    }
    world.projectiles = save.projectiles.map((p) => ({ ...p }));
    world.traps = save.traps.map((t) => ({ ...t }));
    world.recomputeBuffs();
    return world;
  }
}

export interface WorldSave {
  version: number;
  map: string;
  difficulty: DifficultyId;
  mode: GameMode;
  seed: number;
  rng: number;
  unlockedTowers: string[];
  gold: number;
  lives: number;
  time: number;
  phase: WavePhase;
  countdown: number;
  waveIndex: number;
  nextId: number;
  stats: WorldStats;
  spawnQueue: SpawnEntry[];
  pendingWaves: number[];
  towers: Tower[];
  enemies: Enemy[];
  projectiles: Projectile[];
  traps: Trap[];
}

function projectileKindFor(defId: string, lvl: TowerLevelDef): ProjectileKind {
  switch (defId) {
    case 'archers':
      return lvl.era === 'medieval' ? 'arrow' : 'bullet';
    case 'ballista':
      return lvl.era === 'antiquity' ? 'bolt' : 'ball';
    case 'cannon':
      return lvl.era === 'modern' || lvl.era === 'industrial' ? 'shell' : 'ball';
    case 'rockets':
      return 'rocket';
    default:
      return 'ball';
  }
}

export { TILE };
