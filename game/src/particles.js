// Particles, shockwave rings and floating score text. One pooled
// system owns all transient effects so explosions, engine trails,
// dash ghosts and pickup sparkles share the same cheap update loop.

import { drawGlow } from './sprites.js';

const MAX_PARTICLES = 900;

export class ParticleSystem {
  constructor(rng) {
    this.rng = rng;
    this.particles = [];
    this.rings = [];
    this.floaters = [];
  }

  spawnParticle(particle) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(particle);
  }

  // A burst of coloured sparks flying outward with drag.
  explosion(x, y, color, count = 22, power = 260) {
    for (let i = 0; i < count; i++) {
      const angle = this.rng() * Math.PI * 2;
      const speed = power * (0.25 + this.rng() * 0.95);
      const life = 0.35 + this.rng() * 0.55;
      this.spawnParticle({
        kind: 'spark',
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life, maxLife: life,
        size: 1.5 + this.rng() * 2.6,
        color,
        drag: 3.2,
      });
    }
    this.ring(x, y, color, 90, 0.45);
  }

  // Short-lived streaks behind the guardian's engines and dash.
  trail(x, y, color, spread = 14) {
    this.spawnParticle({
      kind: 'spark',
      x: x + (this.rng() - 0.5) * spread,
      y: y + (this.rng() - 0.5) * spread,
      vx: (this.rng() - 0.5) * 30,
      vy: (this.rng() - 0.5) * 30,
      life: 0.3, maxLife: 0.3,
      size: 2.2,
      color,
      drag: 1.5,
    });
  }

  // A soft glow puff that grows and fades (muzzle flash, impacts).
  puff(x, y, color, size = 30, life = 0.25) {
    this.spawnParticle({
      kind: 'puff',
      x, y, vx: 0, vy: 0,
      life, maxLife: life,
      size, color, drag: 0,
    });
  }

  ring(x, y, color, maxRadius = 120, life = 0.4) {
    this.rings.push({ x, y, color, maxRadius, life, maxLife: life, radius: 6 });
  }

  text(x, y, value, color = '#ffffff', size = 15) {
    this.floaters.push({ x, y, value, color, size, life: 0.9, maxLife: 0.9 });
  }

  // A fountain of rising embers, used on the victory screen.
  celebrate(x, y, colors) {
    for (let i = 0; i < 5; i++) {
      const life = 0.8 + this.rng() * 0.9;
      this.spawnParticle({
        kind: 'spark',
        x: x + (this.rng() - 0.5) * 60,
        y,
        vx: (this.rng() - 0.5) * 90,
        vy: -(90 + this.rng() * 190),
        life, maxLife: life,
        size: 2 + this.rng() * 2.4,
        color: colors[Math.floor(this.rng() * colors.length)],
        drag: 0.4,
        gravity: 150,
      });
    }
  }

  update(dt) {
    const alive = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      const dragFactor = Math.max(0, 1 - p.drag * dt);
      p.vx *= dragFactor;
      p.vy *= dragFactor;
      if (p.gravity) p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      alive.push(p);
    }
    this.particles = alive;
    this.rings = this.rings.filter((ring) => {
      ring.life -= dt;
      const t = 1 - ring.life / ring.maxLife;
      ring.radius = 6 + (ring.maxRadius - 6) * (1 - (1 - t) * (1 - t));
      return ring.life > 0;
    });
    this.floaters = this.floaters.filter((floater) => {
      floater.life -= dt;
      floater.y -= 44 * dt;
      return floater.life > 0;
    });
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      if (p.kind === 'puff') {
        drawGlow(ctx, p.color, p.x, p.y, p.size * (1.6 - t * 0.6), 0.35 * t);
      } else {
        ctx.globalAlpha = Math.min(1, t * 1.6);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + t * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const ring of this.rings) {
      const t = ring.life / ring.maxLife;
      ctx.globalAlpha = t * 0.8;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 2.5 * t + 0.5;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.textAlign = 'center';
    for (const floater of this.floaters) {
      const t = floater.life / floater.maxLife;
      ctx.globalAlpha = Math.min(1, t * 2);
      ctx.font = `700 ${floater.size}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillStyle = floater.color;
      ctx.fillText(floater.value, floater.x, floater.y);
    }
    ctx.restore();
  }

  clear() {
    this.particles = [];
    this.rings = [];
    this.floaters = [];
  }
}
