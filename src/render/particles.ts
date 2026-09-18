import type { DamageType } from '@/sim/types';
import { PALETTE } from './theme';

export type ParticleKind =
  'spark' | 'smoke' | 'fire' | 'debris' | 'ring' | 'flash' | 'text' | 'drop' | 'coin' | 'glow';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  drag: number;
  text?: string;
  rot?: number;
  vrot?: number;
  /** Ring end radius. */
  endSize?: number;
  bold?: boolean;
}

const MAX_PARTICLES = 1000;

export class ParticleSystem {
  particles: Particle[] = [];
  /** 1 = full effects, 0.35 = reduced motion. */
  density = 1;

  clear(): void {
    this.particles.length = 0;
  }

  add(p: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  private count(n: number): number {
    return Math.max(1, Math.round(n * this.density));
  }

  update(dt: number): void {
    const list = this.particles;
    let write = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i] as Particle;
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.gravity * dt;
      const drag = Math.max(0, 1 - p.drag * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.vrot) p.rot = (p.rot ?? 0) + p.vrot * dt;
      list[write++] = p;
    }
    list.length = write;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const t = 1 - p.life / p.maxLife;
      const alpha = p.kind === 'text' || p.kind === 'coin' ? (t < 0.7 ? 1 : (1 - t) / 0.3) : 1 - t;
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      switch (p.kind) {
        case 'spark':
        case 'drop':
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          ctx.stroke();
          break;
        case 'smoke': {
          const r = p.size * (0.6 + t * 1.2);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'fire': {
          const r = p.size * (1 - t * 0.7);
          ctx.fillStyle = t < 0.4 ? PALETTE.fireCore : t < 0.75 ? PALETTE.fire : '#b33a1a';
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.5, r), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'glow': {
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          g.addColorStop(0, p.color);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'debris':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot ?? 0);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
          break;
        case 'ring': {
          const r = p.size + ((p.endSize ?? p.size * 3) - p.size) * t;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(0.5, 3 * (1 - t));
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'flash': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'text':
        case 'coin':
          ctx.font = `${p.bold ? '700' : '600'} ${p.size}px "Segoe UI", system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.75)';
          ctx.strokeText(p.text ?? '', p.x, p.y);
          ctx.fillStyle = p.color;
          ctx.fillText(p.text ?? '', p.x, p.y);
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------
  // Effect recipes
  // ------------------------------------------------------------------

  explosion(x: number, y: number, radius: number, type: DamageType): void {
    const big = radius > 90;
    this.add({
      kind: 'flash',
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.12,
      maxLife: 0.12,
      size: radius * 0.5,
      color: 'rgba(255,230,160,0.9)',
      gravity: 0,
      drag: 0,
    });
    this.add({
      kind: 'ring',
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.35,
      maxLife: 0.35,
      size: radius * 0.2,
      endSize: radius,
      color: 'rgba(255,200,120,0.8)',
      gravity: 0,
      drag: 0,
    });
    const sparks = this.count(big ? 26 : 14);
    for (let i = 0; i < sparks; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 90 + Math.random() * 220;
      this.add({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.25 + Math.random() * 0.3,
        maxLife: 0.55,
        size: 2,
        color: type === 'fire' ? PALETTE.fire : '#ffd27a',
        gravity: 200,
        drag: 2,
      });
    }
    const smoke = this.count(big ? 14 : 7);
    for (let i = 0; i < smoke; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 20 + Math.random() * 50;
      this.add({
        kind: 'smoke',
        x: x + Math.cos(a) * radius * 0.2,
        y: y + Math.sin(a) * radius * 0.2,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 20,
        life: 0.6 + Math.random() * 0.6,
        maxLife: 1.2,
        size: radius * 0.16 + 3,
        color: type === 'fire' ? 'rgba(60,40,30,0.55)' : 'rgba(90,90,90,0.5)',
        gravity: -10,
        drag: 1.5,
      });
    }
    const debris = this.count(big ? 12 : 5);
    for (let i = 0; i < debris; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 160;
      this.add({
        kind: 'debris',
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 60,
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.9,
        size: 3 + Math.random() * 4,
        color: '#5a4a3a',
        gravity: 300,
        drag: 1,
        rot: Math.random() * 6,
        vrot: (Math.random() - 0.5) * 20,
      });
    }
    if (type === 'fire') {
      const n = this.count(12);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * radius * 0.7;
        this.add({
          kind: 'fire',
          x: x + Math.cos(a) * d,
          y: y + Math.sin(a) * d,
          vx: 0,
          vy: -30 - Math.random() * 40,
          life: 0.4 + Math.random() * 0.5,
          maxLife: 0.9,
          size: 5 + Math.random() * 6,
          color: PALETTE.fire,
          gravity: 0,
          drag: 0,
        });
      }
    }
  }

  muzzle(x: number, y: number, angle: number, size = 1): void {
    this.add({
      kind: 'flash',
      x: x + Math.cos(angle) * 20,
      y: y + Math.sin(angle) * 20,
      vx: 0,
      vy: 0,
      life: 0.08,
      maxLife: 0.08,
      size: 7 * size,
      color: 'rgba(255,220,140,0.9)',
      gravity: 0,
      drag: 0,
    });
    const n = this.count(3 * size);
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * 0.6;
      this.add({
        kind: 'smoke',
        x: x + Math.cos(angle) * 22,
        y: y + Math.sin(angle) * 22,
        vx: Math.cos(a) * 40,
        vy: Math.sin(a) * 40,
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.9,
        size: 4 * size,
        color: 'rgba(200,200,200,0.45)',
        gravity: -15,
        drag: 2,
      });
    }
  }

  cone(x: number, y: number, angle: number, range: number, halfAngle: number): void {
    const n = this.count(7);
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * 2 * halfAngle;
      const s = range * (1.4 + Math.random() * 0.8);
      this.add({
        kind: 'fire',
        x: x + Math.cos(a) * 14,
        y: y + Math.sin(a) * 14,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        size: 5 + Math.random() * 5,
        color: PALETTE.fire,
        gravity: 0,
        drag: 2.2,
      });
    }
    if (Math.random() < 0.5) {
      const a = angle + (Math.random() - 0.5) * halfAngle;
      this.add({
        kind: 'smoke',
        x: x + Math.cos(a) * range * 0.6,
        y: y + Math.sin(a) * range * 0.6,
        vx: Math.cos(a) * 30,
        vy: -25,
        life: 0.8,
        maxLife: 0.8,
        size: 6,
        color: 'rgba(50,40,30,0.4)',
        gravity: -10,
        drag: 1,
      });
    }
  }

  waterJet(x: number, y: number, angle: number, range: number): void {
    const n = this.count(5);
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * 0.5;
      const s = range * (1.5 + Math.random() * 0.6);
      this.add({
        kind: 'drop',
        x: x + Math.cos(a) * 16,
        y: y + Math.sin(a) * 16,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.3 + Math.random() * 0.2,
        maxLife: 0.5,
        size: 2,
        color: 'rgba(160,210,255,0.8)',
        gravity: 60,
        drag: 1.5,
      });
    }
  }

  rocketTrail(x: number, y: number, angle: number): void {
    // Trails are cosmetic: skip them when the budget is nearly spent.
    if (this.particles.length > MAX_PARTICLES * 0.7 && Math.random() < 0.6) return;
    this.add({
      kind: 'smoke',
      x,
      y,
      vx: -Math.cos(angle) * 20 + (Math.random() - 0.5) * 20,
      vy: -Math.sin(angle) * 20 + (Math.random() - 0.5) * 20,
      life: 0.35 + Math.random() * 0.25,
      maxLife: 0.6,
      size: 3,
      color: 'rgba(220,220,220,0.5)',
      gravity: -10,
      drag: 1,
    });
    if (Math.random() < 0.6)
      this.add({
        kind: 'fire',
        x,
        y,
        vx: 0,
        vy: 0,
        life: 0.08,
        maxLife: 0.08,
        size: 3,
        color: PALETTE.fire,
        gravity: 0,
        drag: 0,
      });
  }

  hit(x: number, y: number, type: DamageType, crit: boolean): void {
    const n = this.count(crit ? 8 : 4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 90;
      this.add({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.15 + Math.random() * 0.15,
        maxLife: 0.3,
        size: 1.5,
        color: type === 'fire' ? PALETTE.fire : crit ? '#ffe680' : '#f5f5f5',
        gravity: 150,
        drag: 3,
      });
    }
  }

  death(x: number, y: number, radius: number, flying: boolean): void {
    const n = this.count(6 + radius * 0.4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 20 + Math.random() * 60;
      this.add({
        kind: 'smoke',
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - (flying ? 0 : 10),
        life: 0.5 + Math.random() * 0.5,
        maxLife: 1,
        size: radius * 0.35 + 2,
        color: flying ? 'rgba(60,60,60,0.5)' : 'rgba(150,130,100,0.5)',
        gravity: flying ? 120 : -5,
        drag: 1.5,
      });
    }
    if (flying) {
      const d = this.count(8);
      for (let i = 0; i < d; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 40 + Math.random() * 100;
        this.add({
          kind: 'debris',
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: 0.7 + Math.random() * 0.4,
          maxLife: 1.1,
          size: 4 + Math.random() * 4,
          color: '#8a7a5a',
          gravity: 260,
          drag: 0.5,
          rot: Math.random() * 6,
          vrot: (Math.random() - 0.5) * 15,
        });
      }
    }
  }

  damageText(x: number, y: number, amount: number, crit: boolean, type: DamageType): void {
    const color = crit
      ? '#ffe066'
      : type === 'fire'
        ? '#ff9a3a'
        : type === 'explosive'
          ? '#ffb56b'
          : '#ffffff';
    this.add({
      kind: 'text',
      x: x + (Math.random() - 0.5) * 14,
      y: y - 12,
      vx: (Math.random() - 0.5) * 20,
      vy: -45,
      life: crit ? 1 : 0.75,
      maxLife: crit ? 1 : 0.75,
      size: crit ? 15 : 11,
      color,
      gravity: 30,
      drag: 1,
      text: `${Math.round(amount)}${crit ? '!' : ''}`,
      bold: crit,
    });
  }

  coinText(x: number, y: number, amount: number): void {
    this.add({
      kind: 'coin',
      x,
      y: y - 6,
      vx: 0,
      vy: -35,
      life: 1,
      maxLife: 1,
      size: 12,
      color: '#ffd84a',
      gravity: 0,
      drag: 0,
      text: `+${amount}`,
      bold: true,
    });
  }

  gold(x: number, y: number): void {
    const n = this.count(4);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
      const s = 50 + Math.random() * 60;
      this.add({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.35,
        maxLife: 0.35,
        size: 2.5,
        color: '#ffd84a',
        gravity: 250,
        drag: 1,
      });
    }
  }

  build(x: number, y: number): void {
    this.add({
      kind: 'ring',
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.4,
      maxLife: 0.4,
      size: 10,
      endSize: 40,
      color: 'rgba(255,255,255,0.8)',
      gravity: 0,
      drag: 0,
    });
    const n = this.count(10);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 30 + Math.random() * 50;
      this.add({
        kind: 'smoke',
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.5,
        maxLife: 0.5,
        size: 5,
        color: 'rgba(200,180,140,0.5)',
        gravity: 0,
        drag: 2,
      });
    }
  }

  upgrade(x: number, y: number): void {
    this.add({
      kind: 'ring',
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.5,
      maxLife: 0.5,
      size: 12,
      endSize: 46,
      color: 'rgba(255,220,100,0.9)',
      gravity: 0,
      drag: 0,
    });
    const n = this.count(12);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.add({
        kind: 'spark',
        x: x + Math.cos(a) * 18,
        y: y + Math.sin(a) * 18,
        vx: 0,
        vy: -60 - Math.random() * 40,
        life: 0.6,
        maxLife: 0.6,
        size: 2,
        color: '#ffe066',
        gravity: -20,
        drag: 0,
      });
    }
  }

  trap(x: number, y: number, radius: number): void {
    this.add({
      kind: 'ring',
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.3,
      maxLife: 0.3,
      size: 6,
      endSize: radius + 10,
      color: 'rgba(255,170,90,0.8)',
      gravity: 0,
      drag: 0,
    });
    const n = this.count(10);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 50 + Math.random() * 120;
      this.add({
        kind: 'debris',
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 80,
        life: 0.5,
        maxLife: 0.5,
        size: 3,
        color: '#4a3a2a',
        gravity: 320,
        drag: 0.5,
        rot: 0,
        vrot: 10,
      });
    }
  }

  leak(x: number, y: number): void {
    this.add({
      kind: 'ring',
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.6,
      maxLife: 0.6,
      size: 8,
      endSize: 60,
      color: 'rgba(255,60,60,0.9)',
      gravity: 0,
      drag: 0,
    });
  }

  torchGlow(x: number, y: number): void {
    this.add({
      kind: 'glow',
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.1,
      maxLife: 0.1,
      size: 30,
      color: 'rgba(255,170,70,0.35)',
      gravity: 0,
      drag: 0,
    });
  }
}
