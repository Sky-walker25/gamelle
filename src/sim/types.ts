import type { Vec2 } from '@/core/math';

export type Lang = 'fr' | 'en';
export type LocalizedText = Record<Lang, string>;

export type DamageType = 'pierce' | 'explosive' | 'fire' | 'true';
export type TargetMode = 'first' | 'last' | 'strong' | 'weak' | 'close';
export const TARGET_MODES: TargetMode[] = ['first', 'last', 'strong', 'weak', 'close'];

export type Era = 'antiquity' | 'medieval' | 'renaissance' | 'industrial' | 'modern';

export type AttackKind =
  /** Homing projectile that flies to its target. */
  | 'projectile'
  /** Instant hit (bullets). */
  | 'hitscan'
  /** Ballistic shell that lands on the target's predicted position and deals splash damage. */
  | 'artillery'
  /** Damages every enemy inside a cone in front of the tower. */
  | 'cone'
  /** Fires several projectiles at distinct targets. */
  | 'salvo'
  /** Continuous area effect on enemies in range (slow/damage). */
  | 'aura'
  /** Periodically places traps on nearby path tiles. */
  | 'trap'
  /** Buffs neighbouring towers; never attacks. */
  | 'support';

export interface StatusApplication {
  /** Speed multiplier applied while slowed (0.6 = 40% slower). */
  slow?: { factor: number; duration: number };
  burn?: { dps: number; duration: number };
  /** Flat armor reduction. */
  shred?: { amount: number; duration: number };
  stun?: { duration: number };
}

export interface TowerAura {
  /** Multiplier bonus applied to damage of towers in range (0.15 = +15%). */
  damage?: number;
  /** Multiplier bonus applied to attack rate. */
  rate?: number;
  /** Multiplier bonus applied to range. */
  range?: number;
  /** Extra gold from kills made by towers in range. */
  gold?: number;
  /** Reveals stealth enemies to towers in range. */
  reveal?: boolean;
}

export interface TowerLevelDef {
  name: LocalizedText;
  era: Era;
  year: string;
  /** Gold needed to reach this level (for level 1 this is the build cost). */
  cost: number;
  range: number;
  minRange?: number;
  /** Seconds between two attacks. */
  cooldown: number;
  damage: number;
  damageType: DamageType;
  /** Portion of armor ignored (0..1). */
  armorPierce?: number;
  /** Splash radius, in world pixels. */
  splash?: number;
  attack: AttackKind;
  projectileSpeed?: number;
  targetsAir: boolean;
  targetsGround: boolean;
  /** Number of projectiles fired at distinct targets (salvo attack). */
  salvo?: number;
  /** Cone angle in degrees (cone attack). */
  coneAngle?: number;
  /** Status effects applied to enemies hit (or in range for aura attack). */
  status?: StatusApplication;
  crit?: { chance: number; multiplier: number };
  bonusVsAir?: number;
  aura?: TowerAura;
  trap?: { maxActive: number; triggerRadius: number; placeInterval: number };
  description: LocalizedText;
  lore: LocalizedText;
}

export interface TowerDef {
  id: string;
  /** Short role label. */
  role: LocalizedText;
  /** Ordered levels 1..3 then the two level-4 specialisations. */
  levels: [TowerLevelDef, TowerLevelDef, TowerLevelDef];
  branches: [TowerLevelDef, TowerLevelDef];
  hotkey: string;
}

export interface EnemyDef {
  id: string;
  name: LocalizedText;
  era: Era;
  year: string;
  hp: number;
  /** World pixels per second. */
  speed: number;
  /** Fraction of pierce damage negated (0..1). Explosive is affected at half strength. */
  armor: number;
  /** Damage multipliers per type (0.5 = takes half damage). */
  resist?: Partial<Record<DamageType, number>>;
  reward: number;
  livesDamage: number;
  radius: number;
  flying?: boolean;
  stealth?: boolean;
  boss?: boolean;
  shield?: { amount: number; regen: number; delay: number };
  heal?: { radius: number; hps: number };
  spawnOnDeath?: { enemy: string; count: number };
  spawnPeriodic?: { enemy: string; interval: number; max: number };
  berserk?: { maxSpeedMult: number };
  description: LocalizedText;
  lore: LocalizedText;
}

export type ThemeId = 'sunny' | 'green' | 'dusk' | 'rain' | 'night' | 'snow';

export interface PathDef {
  id: string;
  /** Waypoints in tile coordinates [col, row]; consecutive points must share a row or a column. */
  waypoints: [number, number][];
  /** Relative probability of an enemy picking this path among those sharing its spawn group. */
  weight?: number;
  /** Optional spawn group; waves can target a group. */
  group?: string;
}

export interface WaveGroup {
  enemy: string;
  count: number;
  /** Seconds between two spawns of this group. */
  interval: number;
  /** Seconds after wave start before the first spawn. */
  delay: number;
  /** Path id or spawn group; random if omitted. */
  path?: string;
}

export interface WaveDef {
  index: number;
  groups: WaveGroup[];
  boss?: boolean;
  /** Bonus gold awarded when the wave is cleared. */
  reward: number;
}

export interface MapDef {
  id: string;
  order: number;
  name: LocalizedText;
  subtitle: LocalizedText;
  cols: number;
  rows: number;
  /**
   * Terrain rows; one character per tile:
   * '.' buildable, '#' rock (blocked), 'T' tree (blocked), '~' water/mud (blocked),
   * 'x' decorative ruin (blocked). Path tiles are derived from `paths`.
   * For open (maze) maps, 'S' marks spawns and 'H' the base.
   */
  terrain: string[];
  paths: PathDef[];
  /** Straight-line routes for flying enemies. Defaults to ground paths. */
  airPaths?: PathDef[];
  /** Open maps have no fixed path: enemies find their way through the player's towers. */
  open?: boolean;
  theme: ThemeId;
  waveCount: number;
  startGold: number;
  startLives: number;
  /** Enemies the wave generator may use, with the wave they first appear at. */
  roster: { id: string; from: number }[];
  /** Towers unlocked when this map is won for the first time. */
  unlocks: string[];
  /** Difficulty scaling applied on top of global scaling. */
  hpScale: number;
  lore: LocalizedText;
  seed: number;
}

export type DifficultyId = 'easy' | 'normal' | 'hard';

export interface DifficultyDef {
  id: DifficultyId;
  hpMult: number;
  goldMult: number;
  livesMult: number;
  rewardStars: number;
}

export type GameMode = 'classic' | 'endless';

export type TileKind = 'build' | 'path' | 'rock' | 'tree' | 'water' | 'ruin' | 'spawn' | 'base';

export interface Tile {
  col: number;
  row: number;
  kind: TileKind;
  /** Decoration variant index. */
  variant: number;
}

export interface StatusState {
  slowFactor: number;
  slowT: number;
  burnDps: number;
  burnT: number;
  burnSource: number;
  shred: number;
  shredT: number;
  stunT: number;
}

export interface Enemy {
  id: number;
  defId: string;
  hp: number;
  maxHp: number;
  shield: number;
  x: number;
  y: number;
  angle: number;
  /** Per-enemy path (shared reference for fixed maps). */
  path: Vec2[];
  pathId: string;
  /** Distance travelled along the current path. */
  travelled: number;
  pathLength: number;
  /** Perpendicular offset for lane variety. */
  lane: number;
  baseSpeed: number;
  status: StatusState;
  lastDamageAt: number;
  spawnedCount: number;
  spawnTimer: number;
  flying: boolean;
  stealth: boolean;
  /** Revealed by a support tower this tick. */
  revealed: boolean;
  dead: boolean;
  leaked: boolean;
  spawnedAt: number;
  hitFlash: number;
  bounty: number;
  livesDamage: number;
  radius: number;
  /** Generation from spawn-on-death (to prevent infinite chains). */
  generation: number;
  /** Wave this enemy belongs to. */
  wave: number;
}

export interface Trap {
  id: number;
  x: number;
  y: number;
  ownerId: number;
  armedAt: number;
}

export interface Tower {
  id: number;
  defId: string;
  /** 1..3, or 4 when a branch is chosen. */
  level: number;
  branch: -1 | 0 | 1;
  col: number;
  row: number;
  x: number;
  y: number;
  cooldown: number;
  targetMode: TargetMode;
  targetId: number;
  angle: number;
  kills: number;
  damageDealt: number;
  invested: number;
  trapTimer: number;
  traps: number[];
  /** Buffs computed from nearby support towers. */
  buff: { damage: number; rate: number; range: number; gold: number; reveal: boolean };
  /** Salvo alternator to spread rockets. */
  salvoPhase: number;
  builtAt: number;
  /** Recoil animation timer for the renderer. */
  fireAnim: number;
}

export type ProjectileKind = 'arrow' | 'bolt' | 'ball' | 'shell' | 'rocket' | 'bullet' | 'drum';

export interface Projectile {
  id: number;
  kind: ProjectileKind;
  x: number;
  y: number;
  z: number;
  fromX: number;
  fromY: number;
  targetId: number;
  targetX: number;
  targetY: number;
  speed: number;
  damage: number;
  damageType: DamageType;
  armorPierce: number;
  splash: number;
  status: StatusApplication | undefined;
  ownerId: number;
  /** Arc flight: total time and elapsed time. */
  flightTime: number;
  elapsed: number;
  angle: number;
  bonusVsAir: number;
  crit: boolean;
  dead: boolean;
}

export type WavePhase = 'idle' | 'countdown' | 'active' | 'won' | 'lost';

export interface WorldStats {
  kills: number;
  leaks: number;
  goldEarned: number;
  goldSpent: number;
  towersBuilt: number;
  damageDealt: number;
  wavesCleared: number;
  earlyCalls: number;
  timePlayed: number;
}
