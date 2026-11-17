// Lastlight Aegis — tuning constants, palette and enemy definitions.
// Every other module reads its numbers from here so the game's balance
// lives in exactly one place.

export const VIEW = {
  width: 1280,
  height: 800,
  coreX: 640,
  coreY: 400,
  coreRadius: 34, // the star core the player defends
  coreGlowRadius: 120,
};

export const PLAYER = {
  radius: 14,
  accel: 2600,
  maxSpeed: 305,
  damping: 6.5,
  hull: 100,
  fireInterval: 0.135,
  bulletSpeed: 760,
  bulletLife: 0.95,
  dashTime: 0.18,
  dashSpeed: 1080,
  dashCooldown: 1.6,
  startBombs: 2,
  maxBombs: 3,
  scatterTime: 10, // seconds of three-bolt fan fire per scatter pickup
};

// The lancer's charge cycle: it stalks the guardian, locks on with a
// visible telegraph, then spears across the arena in a straight line.
export const LANCER = {
  stalkRange: 340, // distance at which it begins a lock-on
  telegraphTime: 0.65,
  chargeSpeed: 575,
  chargeTime: 0.46,
  recoverTime: 0.85,
  lockCooldown: 1.5,
};

export const CORE = {
  maxHp: 300,
  shieldTime: 10,
};

export const COMBO = {
  window: 3.0, // seconds to land the next kill before the chain breaks
  perTier: 8, // kills per multiplier step
  maxMultiplier: 8,
};

export const WAVES = {
  victoryWave: 10, // clearing this wave wins the game
  betweenTime: 3.2, // calm seconds between waves
  maxAlive: 42,
};

// The house palette: deep space blues, starlight gold for the core,
// guardian cyan for the player, and one hot colour per enemy family.
export const PALETTE = {
  spaceTop: '#050914',
  spaceBottom: '#0a1030',
  nebulaViolet: 'rgba(88, 60, 180, 0.16)',
  nebulaTeal: 'rgba(20, 140, 160, 0.13)',
  nebulaEmber: 'rgba(200, 90, 40, 0.10)',
  star: '#cfe8ff',
  core: '#ffd76a',
  coreHot: '#fff3c4',
  coreDeep: '#ff9d3c',
  guardian: '#5ff2ff',
  guardianDeep: '#1899c2',
  hull: '#5ff2ff',
  coreBar: '#ffd76a',
  text: '#eaf6ff',
  textDim: '#8fb4d8',
  danger: '#ff5470',
  shield: '#7dffce',
  overdrive: '#ffb347',
};

// Per-type enemy tuning. `seek` is what the type steers toward:
// 'core' marches on the star, 'player' hunts the guardian, 'both'
// hunts the guardian while it is near and the core otherwise.
export const ENEMY_TYPES = {
  shard: {
    hp: 2, speed: 62, radius: 15, score: 50, coreDamage: 8, hullDamage: 10,
    color: '#ff5470', seek: 'core', wobble: 0.6,
  },
  darter: {
    hp: 1, speed: 148, radius: 10, score: 80, coreDamage: 6, hullDamage: 8,
    color: '#ffb347', seek: 'player', wobble: 2.6,
  },
  weaver: {
    hp: 4, speed: 84, radius: 16, score: 120, coreDamage: 10, hullDamage: 12,
    color: '#c792ff', seek: 'core', wobble: 4.2,
  },
  splitter: {
    hp: 5, speed: 54, radius: 21, score: 150, coreDamage: 12, hullDamage: 14,
    color: '#7dff8a', seek: 'core', wobble: 0.4,
  },
  lancer: {
    hp: 3, speed: 92, radius: 13, score: 150, coreDamage: 10, hullDamage: 16,
    color: '#ff5df2', seek: 'player', wobble: 0.8,
  },
  mini: {
    hp: 1, speed: 118, radius: 8, score: 25, coreDamage: 4, hullDamage: 5,
    color: '#b6ff9e', seek: 'core', wobble: 1.4,
  },
  bulwark: {
    hp: 26, speed: 30, radius: 34, score: 400, coreDamage: 30, hullDamage: 24,
    color: '#ff7a59', seek: 'core', wobble: 0.15,
  },
  herald: {
    hp: 170, speed: 26, radius: 58, score: 3000, coreDamage: 60, hullDamage: 30,
    color: '#ff3d81', seek: 'orbit', wobble: 0,
  },
};

export const PICKUP_KINDS = {
  repair: { color: '#7dffce', weight: 40, label: 'REPAIR' },
  overdrive: { color: '#ffb347', weight: 25, label: 'OVERDRIVE' },
  scatter: { color: '#ffe14d', weight: 20, label: 'SCATTER CANNON' },
  nova: { color: '#5ff2ff', weight: 20, label: 'NOVA +1' },
  aegis: { color: '#ffd76a', weight: 15, label: 'AEGIS SHIELD' },
};

export const PICKUP_DROP_CHANCE = 0.12;

// Deterministic RNG (mulberry32) so staged scenes and tests reproduce.
export function createRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function distanceSq(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}
