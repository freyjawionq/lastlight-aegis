// The deep-space backdrop: a pre-rendered nebula wash plus three
// star layers that drift at different rates, so the arena feels like
// it hangs in a living sky rather than on a flat fill.

import { PALETTE, VIEW, createRng } from './config.js';

export class Background {
  constructor() {
    this.nebula = this.renderNebula();
    this.layers = this.buildLayers();
    this.drift = 0;
  }

  // Painted once to an offscreen canvas: layered radial washes in
  // violet, teal and ember over the vertical space gradient.
  renderNebula() {
    const canvas = document.createElement('canvas');
    canvas.width = VIEW.width;
    canvas.height = VIEW.height;
    const ctx = canvas.getContext('2d');
    const base = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    base.addColorStop(0, PALETTE.spaceTop);
    base.addColorStop(1, PALETTE.spaceBottom);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const rng = createRng(1407);
    const washes = [
      { color: PALETTE.nebulaViolet, count: 7, min: 220, max: 460 },
      { color: PALETTE.nebulaTeal, count: 6, min: 160, max: 340 },
      { color: PALETTE.nebulaEmber, count: 4, min: 120, max: 260 },
    ];
    for (const wash of washes) {
      for (let i = 0; i < wash.count; i++) {
        const x = rng() * VIEW.width;
        const y = rng() * VIEW.height;
        const radius = wash.min + rng() * (wash.max - wash.min);
        const blob = ctx.createRadialGradient(x, y, 0, x, y, radius);
        blob.addColorStop(0, wash.color);
        blob.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = blob;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    }
    return canvas;
  }

  buildLayers() {
    const rng = createRng(9241);
    const definitions = [
      { count: 90, size: 1, speed: 2.5, alpha: 0.45 },
      { count: 60, size: 1.6, speed: 5, alpha: 0.7 },
      { count: 30, size: 2.4, speed: 9, alpha: 1 },
    ];
    return definitions.map((def) => {
      const stars = [];
      for (let i = 0; i < def.count; i++) {
        stars.push({
          x: rng() * VIEW.width,
          y: rng() * VIEW.height,
          phase: rng() * Math.PI * 2,
          twinkle: 0.4 + rng() * 1.4,
        });
      }
      return { ...def, stars };
    });
  }

  update(dt) {
    this.drift += dt;
  }

  draw(ctx, time) {
    ctx.drawImage(this.nebula, 0, 0);
    for (const layer of this.layers) {
      ctx.fillStyle = PALETTE.star;
      for (const star of layer.stars) {
        // Stars slide slowly left and wrap; twinkle rides a sine.
        const x = (star.x - this.drift * layer.speed) % VIEW.width;
        const wrappedX = x < 0 ? x + VIEW.width : x;
        const flicker = 0.65 + 0.35 * Math.sin(time * star.twinkle + star.phase);
        ctx.globalAlpha = layer.alpha * flicker;
        ctx.fillRect(wrappedX, star.y, layer.size, layer.size);
      }
    }
    ctx.globalAlpha = 1;
    this.drawOrbitRings(ctx, time);
  }

  // Faint orbital tracks around the core: the lanes the void crosses.
  drawOrbitRings(ctx, time) {
    ctx.save();
    ctx.translate(VIEW.coreX, VIEW.coreY);
    for (let i = 0; i < 3; i++) {
      const radius = 120 + i * 78;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(120, 180, 255, 0.07)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // A single bright mote travelling each ring sells the orbit.
      const angle = time * (0.05 + i * 0.023) * (i % 2 === 0 ? 1 : -1) + i * 2.1;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(160, 210, 255, 0.5)';
      ctx.fill();
    }
    ctx.restore();
  }
}
