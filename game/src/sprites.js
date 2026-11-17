// Pre-rendered radial glow textures. Drawing shadowBlur every frame is
// slow and looks muddy; a cached gradient sprite per colour, drawn with
// additive blending, gives the neon look at a fraction of the cost.

const cache = new Map();

export function glowTexture(color) {
  let texture = cache.get(color);
  if (texture) return texture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  // Multiply the alpha down with a destination-out radial falloff, so
  // the sprite is full-strength at the centre and gone at the rim.
  const falloff = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  falloff.addColorStop(0, 'rgba(0,0,0,0)');
  falloff.addColorStop(0.35, 'rgba(0,0,0,0.25)');
  falloff.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = falloff;
  ctx.fillRect(0, 0, size, size);
  cache.set(color, canvas);
  return canvas;
}

// Draw a soft glow centred at (x, y) with the given diameter and alpha.
export function drawGlow(ctx, color, x, y, diameter, alpha) {
  const texture = glowTexture(color);
  ctx.globalAlpha = alpha;
  ctx.drawImage(texture, x - diameter / 2, y - diameter / 2, diameter, diameter);
  ctx.globalAlpha = 1;
}

// A crisp bright core dot with a coloured halo — used for bullets,
// pickup hearts and the star core itself.
export function drawOrb(ctx, color, x, y, radius, coreColor = '#ffffff') {
  drawGlow(ctx, color, x, y, radius * 6, 0.55);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = coreColor;
  ctx.fill();
}
