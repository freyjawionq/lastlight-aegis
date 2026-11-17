// The deep-space backdrop: a pre-rendered nebula wash plus three
// star layers that drift at different rates, so the arena feels like
// it hangs in a living sky rather than on a flat fill.

import { PALETTE, VIEW, createRng } from './config.js';
import { drawGlow } from './sprites.js';

export class Background {
  constructor() {
    this.nebula = this.renderNebula();
    this.layers = this.buildLayers();
    this.motes = this.buildMotes();
    this.meteors = [];
    this.meteorTimer = 5;
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
    this.paintMilkyWay(ctx, rng);
    this.paintDistantGalaxies(ctx, rng);
    this.paintRingedGiant(ctx);
    return canvas;
  }

  // A dense diagonal river of micro-stars — the galactic band the
  // arena hangs in. Baked into the still so it costs nothing a frame.
  paintMilkyWay(ctx, rng) {
    ctx.save();
    ctx.translate(VIEW.width / 2, VIEW.height / 2);
    ctx.rotate(-0.42);
    for (let i = 0; i < 900; i++) {
      // Gaussian-ish falloff from the band's spine.
      const along = (rng() + rng() + rng() - 1.5) / 1.5;
      const across = (rng() + rng() - 1) * 90;
      const x = along * VIEW.width * 0.72;
      const y = across + Math.sin(x * 0.004) * 26;
      const alpha = 0.05 + rng() * 0.3 * (1 - Math.abs(across) / 110);
      if (alpha <= 0.02) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = rng() < 0.12 ? '#ffd9a0' : PALETTE.star;
      const size = rng() < 0.9 ? 1 : 2;
      ctx.fillRect(x, y, size, size);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Two far spiral smudges: soft elliptical discs with a bright
  // heart, tilted like photographs of other people's skies.
  paintDistantGalaxies(ctx, rng) {
    const galaxies = [
      { x: 190, y: 620, radius: 64, tilt: 0.7, color: 'rgba(150, 170, 255, 0.20)' },
      { x: 1150, y: 130, radius: 44, tilt: -0.5, color: 'rgba(255, 190, 150, 0.16)' },
    ];
    for (const galaxy of galaxies) {
      ctx.save();
      ctx.translate(galaxy.x, galaxy.y);
      ctx.rotate(galaxy.tilt);
      ctx.scale(1, 0.36);
      const disc = ctx.createRadialGradient(0, 0, 0, 0, 0, galaxy.radius);
      disc.addColorStop(0, galaxy.color);
      disc.addColorStop(0.55, galaxy.color.replace(/[\d.]+\)$/, '0.06)'));
      disc.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(0, 0, galaxy.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawGlow(ctx, '#ffffff', galaxy.x, galaxy.y, 15, 0.25);
    }
  }

  // A ringed gas giant hanging in the upper right, mostly silhouette
  // against the nebula with a lit crescent rim — the arena's landmark.
  paintRingedGiant(ctx) {
    const x = 1085;
    const y = 168;
    const radius = 86;
    ctx.save();
    // The ring, drawn first so the planet's body overlaps its heart.
    ctx.translate(x, y);
    ctx.rotate(-0.32);
    ctx.scale(1, 0.3);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.75, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(170, 200, 255, 0.13)';
    ctx.lineWidth = 15;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.45, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(200, 220, 255, 0.10)';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();
    // The body: near-black violet with banding and a lit left rim.
    const body = ctx.createRadialGradient(x - radius * 0.55, y - radius * 0.3, radius * 0.1, x, y, radius);
    body.addColorStop(0, 'rgba(74, 62, 120, 0.85)');
    body.addColorStop(0.55, 'rgba(38, 32, 74, 0.92)');
    body.addColorStop(1, 'rgba(10, 9, 30, 0.96)');
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = `rgba(140, 120, 200, ${0.05 + (i % 2) * 0.03})`;
      ctx.fillRect(x - radius, y - radius + i * (radius * 0.42) + 8, radius * 2, radius * 0.2);
    }
    // Crescent light from the defended star's direction.
    const rim = ctx.createRadialGradient(x - radius * 1.15, y, radius * 0.2, x - radius * 0.4, y, radius * 1.5);
    rim.addColorStop(0, 'rgba(255, 215, 140, 0.20)');
    rim.addColorStop(1, 'rgba(255, 215, 140, 0)');
    ctx.fillStyle = rim;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
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

  // Slow dust motes: big, nearly invisible nebula wisps that drift
  // across the arena so even a frozen moment feels suspended in gas.
  buildMotes() {
    const rng = createRng(5150);
    const colors = [PALETTE.nebulaViolet, PALETTE.nebulaTeal, PALETTE.nebulaEmber];
    const motes = [];
    for (let i = 0; i < 7; i++) {
      motes.push({
        x: rng() * VIEW.width,
        y: rng() * VIEW.height,
        size: 180 + rng() * 260,
        speed: 4 + rng() * 8,
        color: colors[i % colors.length].replace(/[\d.]+\)$/, '1)'),
        alpha: 0.05 + rng() * 0.04,
      });
    }
    return motes;
  }

  update(dt) {
    this.drift += dt;
    for (const mote of this.motes) {
      mote.x -= mote.speed * dt;
      if (mote.x < -mote.size) {
        mote.x = VIEW.width + mote.size * 0.5;
        mote.y = Math.random() * VIEW.height;
      }
    }
    // Occasional shooting stars stitch the still sky together.
    this.meteorTimer -= dt;
    if (this.meteorTimer <= 0) {
      this.meteorTimer = 4 + Math.random() * 7;
      this.meteors.push({
        x: 500 + Math.random() * 760,
        y: Math.random() * 200,
        vx: -(430 + Math.random() * 320),
        vy: 250 + Math.random() * 190,
        life: 0.7,
      });
    }
    this.meteors = this.meteors.filter((meteor) => {
      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;
      meteor.life -= dt;
      return meteor.life > 0;
    });
  }

  draw(ctx, time) {
    ctx.drawImage(this.nebula, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const mote of this.motes) {
      drawGlow(ctx, mote.color, mote.x, mote.y, mote.size, mote.alpha);
    }
    ctx.restore();
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
    this.drawMeteors(ctx);
    this.drawOrbitRings(ctx, time);
  }

  drawMeteors(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const meteor of this.meteors) {
      const fade = Math.min(1, meteor.life / 0.35);
      const tail = 0.11;
      ctx.strokeStyle = `rgba(210, 235, 255, ${0.75 * fade})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(meteor.x - meteor.vx * tail, meteor.y - meteor.vy * tail);
      ctx.lineTo(meteor.x, meteor.y);
      ctx.stroke();
      drawGlow(ctx, '#cfe8ff', meteor.x, meteor.y, 22, 0.5 * fade);
    }
    ctx.restore();
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
