import { TAU, clamp } from '@/core/math';
import { enemyDef } from '@/data/enemies';
import { towerLevelDef } from '@/data/towers';
import { TILE, tileCenter } from '@/sim/grid';
import type { Enemy, Projectile, Tower } from '@/sim/types';
import type { World } from '@/sim/world';
import { drawEnemy, drawHealthBar } from './enemies';
import { ParticleSystem } from './particles';
import { circle, line } from './primitives';
import { renderTerrain } from './terrain';
import { drawTower, drawTrap, trapTier } from './towers';
import { PALETTE, theme } from './theme';
import type { Theme } from './theme';

export interface ViewState {
  hoverCol: number;
  hoverRow: number;
  buildDefId: string | null;
  selectedTowerId: number;
  showAllRanges: boolean;
  showDamageNumbers: boolean;
  reducedMotion: boolean;
}

interface Tracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  color: string;
  width: number;
}

interface WeatherDrop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
}

export class Renderer {
  readonly particles = new ParticleSystem();
  private ctx: CanvasRenderingContext2D;
  private world: World | null = null;
  private theme: Theme = theme('sunny');
  private terrain: HTMLCanvasElement | null = null;
  private terrainScale = 1;
  private lightmap: HTMLCanvasElement | null = null;
  private dpr = 1;
  private scale = 1;
  private fitScale = 1;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private offsetX = 0;
  private offsetY = 0;
  private cssWidth = 0;
  private cssHeight = 0;
  private time = 0;
  private tracers: Tracer[] = [];
  private weather: WeatherDrop[] = [];
  private shake = 0;
  private shakeX = 0;
  private shakeY = 0;
  private unsubscribe: (() => void)[] = [];

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
  }

  setWorld(world: World | null): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    this.world = world;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.particles.clear();
    this.tracers = [];
    this.terrain = null;
    if (!world) return;
    this.theme = theme(world.def.theme);
    this.initWeather();
    this.bind(world);
    this.rebuildTerrain();
  }

  private bind(world: World): void {
    const p = this.particles;
    const on = world.events.on.bind(world.events);
    this.unsubscribe.push(
      on('shoot', (e) => {
        if (e.kind === 'cone') {
          const lvl = world.tower(e.towerId);
          const def = lvl ? world.levelDef(lvl) : null;
          const range = lvl ? world.towerStats(lvl).range : 100;
          const half = ((def?.coneAngle ?? 60) * Math.PI) / 360;
          p.cone(e.x, e.y, e.angle, range, half);
        } else if (e.kind === 'tracer') {
          this.tracers.push({
            x1: e.x + Math.cos(e.angle) * 18,
            y1: e.y + Math.sin(e.angle) * 18,
            x2: e.tx,
            y2: e.ty,
            life: 0.08,
            color: 'rgba(255,240,200,0.9)',
            width: 1.5,
          });
          p.muzzle(e.x, e.y, e.angle, 1);
        } else if (e.kind === 'ball' || e.kind === 'shell' || e.kind === 'drum') {
          p.muzzle(e.x, e.y, e.angle, 1.8);
          this.addShake(e.kind === 'shell' ? 1.5 : 1);
        } else if (e.kind === 'rocket') {
          p.muzzle(e.x, e.y, e.angle, 1.2);
        }
      }),
      on('hit', (e) => {
        p.hit(e.x, e.y, e.type, e.crit);
        if (this.showDamage && e.damage >= 1) p.damageText(e.x, e.y, e.damage, e.crit, e.type);
      }),
      on('explosion', (e) => {
        p.explosion(e.x, e.y, e.radius, e.type);
        this.addShake(Math.min(6, e.radius / 25));
      }),
      on('enemyDied', (e) => {
        p.death(e.enemy.x, e.enemy.y, e.enemy.radius, e.enemy.flying);
        if (e.bounty > 0) {
          p.gold(e.enemy.x, e.enemy.y);
          if (this.showDamage) p.coinText(e.enemy.x, e.enemy.y - 10, e.bounty);
        }
      }),
      on('enemyLeaked', (e) => {
        p.leak(e.enemy.x, e.enemy.y);
        this.addShake(4);
      }),
      on('towerBuilt', (e) => p.build(e.tower.x, e.tower.y)),
      on('towerUpgraded', (e) => p.upgrade(e.tower.x, e.tower.y)),
      on('towerSold', (e) => p.build(e.tower.x, e.tower.y)),
      on('trapTriggered', (e) => {
        p.trap(e.trap.x, e.trap.y, e.radius);
        this.addShake(2);
      }),
      on('gold', (e) => {
        if (e.y <= 40 && this.showDamage) p.coinText(e.x, e.y + 20, e.amount);
      }),
    );
  }

  private showDamage = true;

  private addShake(amount: number): void {
    if (this.reduced) return;
    this.shake = Math.min(10, this.shake + amount);
  }

  private reduced = false;

  private initWeather(): void {
    this.weather = [];
    const kind = this.theme.weather;
    if (kind === 'none' || !this.world) return;
    const n = kind === 'rain' ? 220 : kind === 'snow' ? 140 : kind === 'embers' ? 40 : 30;
    for (let i = 0; i < n; i++) this.weather.push(this.spawnDrop(true));
  }

  private spawnDrop(anywhere: boolean): WeatherDrop {
    const w = this.world?.grid.width ?? 1280;
    const h = this.world?.grid.height ?? 768;
    const kind = this.theme.weather;
    const y = anywhere ? Math.random() * h : kind === 'embers' ? h + 10 : -10;
    switch (kind) {
      case 'rain':
        return {
          x: Math.random() * (w + 200) - 100,
          y,
          vx: 120,
          vy: 900 + Math.random() * 300,
          size: 8 + Math.random() * 8,
          phase: 0,
        };
      case 'snow':
        return {
          x: Math.random() * (w + 100) - 50,
          y,
          vx: 10,
          vy: 30 + Math.random() * 40,
          size: 1.5 + Math.random() * 2,
          phase: Math.random() * TAU,
        };
      case 'embers':
        return {
          x: Math.random() * w,
          y,
          vx: 0,
          vy: -20 - Math.random() * 30,
          size: 1 + Math.random() * 2,
          phase: Math.random() * TAU,
        };
      default:
        return {
          x: Math.random() * w,
          y,
          vx: 30,
          vy: 20 + Math.random() * 20,
          size: 3 + Math.random() * 2,
          phase: Math.random() * TAU,
        };
    }
  }

  private updateWeather(dt: number): void {
    if (!this.world || this.reduced) return;
    const w = this.world.grid.width;
    const h = this.world.grid.height;
    const kind = this.theme.weather;
    for (let i = 0; i < this.weather.length; i++) {
      const d = this.weather[i] as WeatherDrop;
      d.phase += dt * 2;
      d.x +=
        (d.vx +
          (kind === 'snow' || kind === 'leaves'
            ? Math.sin(d.phase) * 25
            : kind === 'embers'
              ? Math.sin(d.phase) * 12
              : 0)) *
        dt;
      d.y += d.vy * dt;
      const out = kind === 'embers' ? d.y < -10 : d.y > h + 10 || d.x > w + 120;
      if (out) this.weather[i] = this.spawnDrop(false);
    }
  }

  private drawWeather(ctx: CanvasRenderingContext2D): void {
    if (this.reduced) return;
    const kind = this.theme.weather;
    if (kind === 'none') return;
    if (kind === 'rain') {
      ctx.strokeStyle = 'rgba(200,220,255,0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const d of this.weather) {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.size * 0.15, d.y - d.size);
      }
      ctx.stroke();
    } else if (kind === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const d of this.weather) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size, 0, TAU);
        ctx.fill();
      }
    } else if (kind === 'embers') {
      ctx.globalCompositeOperation = 'lighter';
      for (const d of this.weather) {
        ctx.fillStyle = `rgba(255,${120 + Math.floor(Math.sin(d.phase) * 60 + 60)},60,0.8)`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = 'rgba(190,150,60,0.7)';
      for (const d of this.weather) {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.phase);
        ctx.beginPath();
        ctx.ellipse(0, 0, d.size, d.size * 0.5, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // ------------------------------------------------------------------
  // Camera
  // ------------------------------------------------------------------

  resize(cssWidth: number, cssHeight: number): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.canvas.width = Math.max(1, Math.round(cssWidth * this.dpr));
    this.canvas.height = Math.max(1, Math.round(cssHeight * this.dpr));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.updateCamera();
  }

  /**
   * The camera fits the whole map by default (`zoom` 1). Zooming in keeps the
   * map inside the viewport: the pan offset is always clamped so no empty
   * space shows on a side unless the map is smaller than the viewport, in
   * which case it stays centred on that axis.
   */
  private updateCamera(): void {
    if (!this.world) return;
    const w = this.world.grid.width;
    const h = this.world.grid.height;
    this.fitScale = Math.min(this.cssWidth / w, this.cssHeight / h);
    this.scale = this.fitScale * this.zoom;
    const viewW = w * this.scale;
    const viewH = h * this.scale;
    if (viewW <= this.cssWidth) {
      this.panX = 0;
      this.offsetX = (this.cssWidth - viewW) / 2;
    } else {
      const maxPan = (viewW - this.cssWidth) / 2 / this.scale;
      this.panX = clamp(this.panX, -maxPan, maxPan);
      this.offsetX = (this.cssWidth - viewW) / 2 - this.panX * this.scale;
    }
    if (viewH <= this.cssHeight) {
      this.panY = 0;
      this.offsetY = (this.cssHeight - viewH) / 2;
    } else {
      const maxPan = (viewH - this.cssHeight) / 2 / this.scale;
      this.panY = clamp(this.panY, -maxPan, maxPan);
      this.offsetY = (this.cssHeight - viewH) / 2 - this.panY * this.scale;
    }
    const wanted = Math.min(2, Math.max(1, Math.ceil(this.scale * this.dpr * 2) / 2));
    if (!this.terrain || Math.abs(wanted - this.terrainScale) > 0.01) this.rebuildTerrain(wanted);
  }

  /** Zoom level, 1 = the whole map fits. */
  get zoomLevel(): number {
    return this.zoom;
  }

  get minZoom(): number {
    return 1;
  }

  /** Enough zoom for a tile to be comfortably tappable, capped so it stays useful. */
  get maxZoom(): number {
    if (!this.world) return 3;
    const wanted = 72 / Math.max(1, this.fitScale * TILE);
    return clamp(wanted, 1.5, 5);
  }

  /**
   * Zoom that makes a tile about `tilePx` wide, used to open small screens at a
   * size where a finger can actually hit a tile. Never zooms out past the fit.
   */
  zoomForTileSize(tilePx: number): number {
    return clamp(tilePx / Math.max(1, this.fitScale * TILE), 1, this.maxZoom);
  }

  /**
   * Zoom needed for the map to cover this share of the viewport height. Wide
   * maps on tall phones otherwise leave most of the screen empty.
   */
  zoomToCoverHeight(fraction: number): number {
    if (!this.world) return 1;
    const mapHeight = this.world.grid.height * this.fitScale;
    if (mapHeight <= 0) return 1;
    return clamp((this.cssHeight * fraction) / mapHeight, 1, this.maxZoom);
  }

  /** Sets the zoom, keeping the given screen point anchored under the finger or cursor. */
  setZoom(zoom: number, anchorX?: number, anchorY?: number): void {
    const next = clamp(zoom, this.minZoom, this.maxZoom);
    if (Math.abs(next - this.zoom) < 0.0005) return;
    const ax = anchorX ?? this.cssWidth / 2;
    const ay = anchorY ?? this.cssHeight / 2;
    const before = this.screenToWorld(ax, ay);
    this.zoom = next;
    this.updateCamera();
    const after = this.screenToWorld(ax, ay);
    this.panX += before.x - after.x;
    this.panY += before.y - after.y;
    this.updateCamera();
  }

  /** Moves the camera by a screen-space delta (drag). */
  panBy(dxScreen: number, dyScreen: number): void {
    if (this.zoom <= 1) return;
    this.panX -= dxScreen / this.scale;
    this.panY -= dyScreen / this.scale;
    this.updateCamera();
  }

  /** Centres the camera on a world point, as far as the clamp allows. */
  centerOn(x: number, y: number): void {
    if (!this.world) return;
    this.panX = x - this.world.grid.width / 2;
    this.panY = y - this.world.grid.height / 2;
    this.updateCamera();
  }

  resetCamera(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.updateCamera();
  }

  private rebuildTerrain(scale = this.terrainScale): void {
    if (!this.world) return;
    this.terrainScale = scale;
    this.terrain = renderTerrain(this.world.grid, this.theme, scale);
  }

  screenToWorld(px: number, py: number): { x: number; y: number } {
    return { x: (px - this.offsetX) / this.scale, y: (py - this.offsetY) / this.scale };
  }

  worldToScreen(x: number, y: number): { x: number; y: number } {
    return { x: x * this.scale + this.offsetX, y: y * this.scale + this.offsetY };
  }

  get viewScale(): number {
    return this.scale;
  }

  // ------------------------------------------------------------------
  // Frame
  // ------------------------------------------------------------------

  draw(view: ViewState, frameDt: number): void {
    const ctx = this.ctx;
    const world = this.world;
    this.showDamage = view.showDamageNumbers;
    this.reduced = view.reducedMotion;
    this.particles.density = view.reducedMotion ? 0.35 : 1;
    this.time += frameDt;
    this.particles.update(frameDt);
    this.updateWeather(frameDt);
    for (const t of this.tracers) t.life -= frameDt;
    this.tracers = this.tracers.filter((t) => t.life > 0);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - frameDt * 18);
      this.shakeX = (Math.random() - 0.5) * this.shake;
      this.shakeY = (Math.random() - 0.5) * this.shake;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = world ? this.theme.edge : '#0d1016';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!world) return;
    // Soft vignette in the letterbox so the map does not float on a flat colour.
    const vg = ctx.createRadialGradient(
      this.canvas.width / 2,
      this.canvas.height / 2,
      Math.min(this.canvas.width, this.canvas.height) * 0.3,
      this.canvas.width / 2,
      this.canvas.height / 2,
      Math.max(this.canvas.width, this.canvas.height) * 0.75,
    );
    vg.addColorStop(0, 'rgba(255,255,255,0.05)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.setTransform(
      this.dpr * this.scale,
      0,
      0,
      this.dpr * this.scale,
      (this.offsetX + this.shakeX) * this.dpr,
      (this.offsetY + this.shakeY) * this.dpr,
    );
    ctx.imageSmoothingEnabled = true;

    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(-1.5, -1.5, world.grid.width + 3, world.grid.height + 3);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, world.grid.width, world.grid.height);
    ctx.clip();
    if (this.terrain) ctx.drawImage(this.terrain, 0, 0, world.grid.width, world.grid.height);
    if (world.grid.open) this.drawRoutes(ctx, world);
    this.drawGridOverlay(ctx, world, view);
    this.drawTraps(ctx, world);
    this.drawRanges(ctx, world, view);
    // Ground shadows for all units.
    for (const e of world.enemies) {
      if (e.dead) continue;
      const def = enemyDef(e.defId);
      const ox = e.flying ? 14 : 2;
      const oy = e.flying ? 18 : 3;
      ctx.fillStyle = PALETTE.shadow;
      ctx.beginPath();
      ctx.ellipse(e.x + ox, e.y + oy, def.radius * 0.9, def.radius * 0.55, 0, 0, TAU);
      ctx.fill();
    }
    for (const e of world.enemies) if (!e.dead && !e.flying) this.drawEnemyUnit(ctx, e);
    for (const t of world.towers) this.drawTowerUnit(ctx, world, t, t.id === view.selectedTowerId);
    for (const p of world.projectiles) this.drawProjectile(ctx, p);
    for (const e of world.enemies) if (!e.dead && e.flying) this.drawEnemyUnit(ctx, e);
    for (const t of this.tracers) {
      ctx.globalAlpha = Math.min(1, t.life / 0.08);
      line(ctx, t.x1, t.y1, t.x2, t.y2, t.color, t.width);
      ctx.globalAlpha = 1;
    }
    this.particles.draw(ctx);
    for (const e of world.enemies) {
      if (e.dead) continue;
      if (e.hp < e.maxHp || e.shield > 0 || enemyDef(e.defId).boss) drawHealthBar(ctx, e, enemyDef(e.defId));
    }
    this.drawGhost(ctx, world, view);
    this.drawWeather(ctx);
    this.drawLighting(ctx, world);
    this.drawOverlay(ctx, world);
    ctx.restore();
  }

  private drawRoutes(ctx: CanvasRenderingContext2D, world: World): void {
    ctx.save();
    ctx.setLineDash([8, 10]);
    ctx.lineDashOffset = -this.time * 40;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const spawn of world.grid.spawns) {
      const pts = world.grid.spawnRoute(spawn);
      if (pts.length < 2) continue;
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawGridOverlay(ctx: CanvasRenderingContext2D, world: World, view: ViewState): void {
    if (!view.buildDefId) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    for (const t of world.grid.tiles) {
      if (t.kind !== 'build') continue;
      ctx.strokeRect(t.col * TILE + 0.5, t.row * TILE + 0.5, TILE - 1, TILE - 1);
      if (world.grid.isOccupied(t.col, t.row)) continue;
      ctx.fillStyle = 'rgba(120,220,120,0.07)';
      ctx.fillRect(t.col * TILE, t.row * TILE, TILE, TILE);
    }
    ctx.restore();
  }

  private drawTraps(ctx: CanvasRenderingContext2D, world: World): void {
    for (const trap of world.traps) {
      const owner = world.tower(trap.ownerId);
      if (!owner) continue;
      ctx.save();
      ctx.translate(trap.x, trap.y);
      drawTrap(ctx, trap, trapTier(owner), this.time);
      ctx.restore();
    }
  }

  private drawRanges(ctx: CanvasRenderingContext2D, world: World, view: ViewState): void {
    const draw = (t: Tower, strong: boolean) => {
      const lvl = world.levelDef(t);
      const stats = world.towerStats(t);
      if (lvl.attack === 'support' || lvl.attack === 'aura') {
        ctx.save();
        ctx.setLineDash([5, 6]);
        circle(
          ctx,
          t.x,
          t.y,
          stats.range,
          strong ? 'rgba(120,200,255,0.10)' : 'rgba(120,200,255,0.05)',
          strong ? 'rgba(160,220,255,0.7)' : 'rgba(160,220,255,0.3)',
          1.5,
        );
        ctx.restore();
        return;
      }
      circle(
        ctx,
        t.x,
        t.y,
        stats.range,
        strong ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)',
        strong ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.25)',
        strong ? 1.5 : 1,
      );
      if (stats.minRange > 0) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        circle(ctx, t.x, t.y, stats.minRange, 'rgba(255,80,80,0.08)', 'rgba(255,120,120,0.6)', 1);
        ctx.restore();
      }
    };
    if (view.showAllRanges) for (const t of world.towers) if (t.id !== view.selectedTowerId) draw(t, false);
    const sel = world.tower(view.selectedTowerId);
    if (sel) {
      draw(sel, true);
      const target = world.enemy(sel.targetId);
      if (target && !target.dead) {
        ctx.save();
        ctx.setLineDash([3, 5]);
        line(ctx, sel.x, sel.y, target.x, target.y, 'rgba(255,90,90,0.6)', 1);
        ctx.restore();
        circle(ctx, target.x, target.y, target.radius + 4, 'rgba(0,0,0,0)', 'rgba(255,90,90,0.8)', 1.5);
      }
    }
    if (!sel && view.hoverCol >= 0 && !view.buildDefId) {
      const hovered = world.towerAt(view.hoverCol, view.hoverRow);
      if (hovered) draw(hovered, true);
    }
  }

  private drawEnemyUnit(ctx: CanvasRenderingContext2D, e: Enemy): void {
    const def = enemyDef(e.defId);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    if (e.status.stunT > 0) ctx.rotate(Math.sin(this.time * 30) * 0.15);
    drawEnemy(ctx, e, def, this.time);
    ctx.restore();
    // Status markers.
    if (e.status.slowT > 0) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      circle(ctx, e.x, e.y, def.radius + 3, 'rgba(0,0,0,0)', PALETTE.frost, 1.5);
      ctx.restore();
    }
    if (e.status.burnT > 0 && !this.reduced) {
      const n = 2;
      for (let i = 0; i < n; i++) {
        if (Math.random() > 0.5) continue;
        const a = Math.random() * TAU;
        this.particles.add({
          kind: 'fire',
          x: e.x + Math.cos(a) * def.radius * 0.6,
          y: e.y + Math.sin(a) * def.radius * 0.6,
          vx: 0,
          vy: -40,
          life: 0.3,
          maxLife: 0.3,
          size: 3 + Math.random() * 3,
          color: PALETTE.fire,
          gravity: 0,
          drag: 0,
        });
      }
    }
    if (e.status.stunT > 0) {
      for (let i = 0; i < 3; i++) {
        const a = this.time * 6 + (i / 3) * TAU;
        circle(ctx, e.x + Math.cos(a) * 8, e.y - def.radius - 6 + Math.sin(a) * 3, 1.6, '#ffe066');
      }
    }
  }

  private drawTowerUnit(ctx: CanvasRenderingContext2D, world: World, t: Tower, selected: boolean): void {
    const lvl = world.levelDef(t);
    ctx.save();
    ctx.translate(t.x, t.y);
    drawTower(ctx, t, lvl, this.time, selected);
    if (t.buff.damage > 0 || t.buff.rate > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(this.time * 3) * 0.2;
      circle(ctx, 20, -20, 3, PALETTE.gold);
      ctx.restore();
    }
    ctx.restore();
    if (lvl.attack === 'aura' && !this.reduced) {
      if (t.level === 4 && t.branch === 0) {
        // Water cannon spray towards the nearest enemy.
        const stats = world.towerStats(t);
        let target: Enemy | undefined;
        let best = Infinity;
        for (const e of world.enemies) {
          if (e.dead) continue;
          const d = (e.x - t.x) ** 2 + (e.y - t.y) ** 2;
          if (d < best && d <= stats.range * stats.range) {
            best = d;
            target = e;
          }
        }
        if (target)
          this.particles.waterJet(t.x, t.y, Math.atan2(target.y - t.y, target.x - t.x), Math.sqrt(best));
      }
    }
    if (lvl.attack === 'cone' && t.fireAnim > 0.5 && t.targetId) {
      // Continuous flame handled by shoot events; nothing more here.
    }
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile): void {
    const y = p.y - p.z;
    if (p.z > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 4, 2.5, 0, 0, TAU);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(p.x, y);
    ctx.rotate(p.angle);
    switch (p.kind) {
      case 'arrow':
        line(ctx, -8, 0, 6, 0, PALETTE.woodLight, 1.5);
        line(ctx, 4, -2, 7, 0, PALETTE.ironLight, 1.5);
        line(ctx, 4, 2, 7, 0, PALETTE.ironLight, 1.5);
        break;
      case 'bolt':
        line(ctx, -10, 0, 8, 0, PALETTE.iron, 2.5);
        line(ctx, 5, -3, 9, 0, PALETTE.ironLight, 2);
        line(ctx, 5, 3, 9, 0, PALETTE.ironLight, 2);
        break;
      case 'bullet':
        line(ctx, -6, 0, 2, 0, 'rgba(255,240,180,0.9)', 2);
        break;
      case 'ball':
        circle(ctx, 0, 0, 4, PALETTE.black, PALETTE.ironDark, 1);
        break;
      case 'shell':
        ctx.beginPath();
        ctx.ellipse(0, 0, 6, 3, 0, 0, TAU);
        ctx.fillStyle = PALETTE.ironDark;
        ctx.fill();
        break;
      case 'drum':
        ctx.fillStyle = PALETTE.iron;
        ctx.fillRect(-5, -3, 10, 6);
        ctx.strokeStyle = PALETTE.ironDark;
        ctx.lineWidth = 1;
        ctx.strokeRect(-5, -3, 10, 6);
        break;
      case 'rocket':
        line(ctx, -7, 0, 5, 0, PALETTE.ironLight, 3);
        line(ctx, 4, 0, 7, 0, PALETTE.red, 3);
        if (!this.reduced)
          this.particles.rocketTrail(p.x - Math.cos(p.angle) * 8, y - Math.sin(p.angle) * 8, p.angle);
        break;
    }
    ctx.restore();
  }

  private drawGhost(ctx: CanvasRenderingContext2D, world: World, view: ViewState): void {
    if (view.hoverCol < 0 || view.hoverRow < 0) return;
    const c = tileCenter(view.hoverCol, view.hoverRow);
    if (view.buildDefId) {
      const failure = world.canBuild(view.buildDefId, view.hoverCol, view.hoverRow);
      const ok = failure === null;
      const lvl = towerLevelDef(view.buildDefId, 1, -1);
      ctx.save();
      ctx.globalAlpha = 0.9;
      circle(
        ctx,
        c.x,
        c.y,
        lvl.range,
        ok ? 'rgba(120,220,120,0.10)' : 'rgba(220,80,80,0.10)',
        ok ? 'rgba(120,220,120,0.7)' : 'rgba(220,80,80,0.7)',
        1.5,
      );
      if (lvl.minRange) {
        ctx.setLineDash([4, 4]);
        circle(ctx, c.x, c.y, lvl.minRange, 'rgba(0,0,0,0)', 'rgba(255,120,120,0.6)', 1);
        ctx.setLineDash([]);
      }
      ctx.fillStyle = ok ? 'rgba(120,220,120,0.25)' : 'rgba(220,80,80,0.3)';
      ctx.fillRect(view.hoverCol * TILE, view.hoverRow * TILE, TILE, TILE);
      ctx.globalAlpha = ok ? 0.7 : 0.35;
      ctx.translate(c.x, c.y);
      const ghost: Tower = {
        id: -1,
        defId: view.buildDefId,
        level: 1,
        branch: -1,
        col: view.hoverCol,
        row: view.hoverRow,
        x: c.x,
        y: c.y,
        cooldown: 0,
        targetMode: 'first',
        targetId: 0,
        angle: -Math.PI / 2,
        kills: 0,
        damageDealt: 0,
        invested: 0,
        trapTimer: 0,
        traps: [],
        buff: { damage: 0, rate: 0, range: 0, gold: 0, reveal: false },
        salvoPhase: 0,
        builtAt: 0,
        fireAnim: 0,
      };
      drawTower(ctx, ghost, lvl, this.time, false);
      ctx.restore();
    } else {
      const tile = world.grid.tile(view.hoverCol, view.hoverRow);
      if (tile && (tile.kind === 'build' || world.grid.isOccupied(tile.col, tile.row))) {
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(view.hoverCol * TILE, view.hoverRow * TILE, TILE, TILE);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(view.hoverCol * TILE + 1, view.hoverRow * TILE + 1, TILE - 2, TILE - 2);
      }
    }
  }

  private drawLighting(ctx: CanvasRenderingContext2D, world: World): void {
    if (!this.theme.night) return;
    const w = world.grid.width;
    const h = world.grid.height;
    const lmScale = 0.25;
    if (!this.lightmap) {
      this.lightmap = document.createElement('canvas');
      this.lightmap.width = Math.ceil(w * lmScale);
      this.lightmap.height = Math.ceil(h * lmScale);
    }
    const lm = this.lightmap.getContext('2d') as CanvasRenderingContext2D;
    lm.setTransform(lmScale, 0, 0, lmScale, 0, 0);
    lm.globalCompositeOperation = 'source-over';
    lm.fillStyle = this.theme.ambient;
    lm.fillRect(0, 0, w, h);
    lm.globalCompositeOperation = 'lighter';
    const light = (x: number, y: number, r: number, color: string) => {
      const g = lm.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lm.fillStyle = g;
      lm.beginPath();
      lm.arc(x, y, r, 0, TAU);
      lm.fill();
    };
    for (const t of world.towers) {
      const lvl = world.levelDef(t);
      const warm = lvl.attack === 'cone' ? 'rgba(255,170,90,0.9)' : 'rgba(255,220,170,0.75)';
      light(t.x, t.y, lvl.attack === 'cone' ? 150 : 110 + t.level * 8, warm);
      if (t.fireAnim > 0.4)
        light(t.x + Math.cos(t.angle) * 20, t.y + Math.sin(t.angle) * 20, 90, 'rgba(255,200,120,0.9)');
    }
    for (const p of world.projectiles) {
      if (p.kind === 'rocket' || p.kind === 'drum') light(p.x, p.y - p.z, 60, 'rgba(255,160,80,0.8)');
    }
    for (const e of world.enemies) {
      if (e.dead) continue;
      if (e.status.burnT > 0) light(e.x, e.y, 70, 'rgba(255,150,70,0.9)');
      if (enemyDef(e.defId).boss) light(e.x, e.y, 90, 'rgba(200,220,255,0.5)');
    }
    for (const [c, r] of world.grid.bases) {
      const p = tileCenter(c, r);
      light(p.x, p.y, 160, 'rgba(255,220,170,0.9)');
    }
    for (const [c, r] of world.grid.spawns) {
      const p = tileCenter(c, r);
      light(p.x, p.y, 110, 'rgba(255,170,90,0.7)');
    }
    for (const part of this.particles.particles) {
      if (part.kind === 'flash' || part.kind === 'fire')
        light(part.x, part.y, part.size * 6, 'rgba(255,190,110,0.7)');
    }
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.lightmap, 0, 0, w, h);
    ctx.restore();
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, world: World): void {
    const ov = this.theme.overlay;
    if (ov.alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = ov.blend;
    ctx.globalAlpha = ov.alpha;
    ctx.fillStyle = ov.color;
    ctx.fillRect(0, 0, world.grid.width, world.grid.height);
    ctx.restore();
  }
}
