// Wave composition and spawn scheduling. Each wave is a queue of
// spawn events dealt out on a timer; the mix leans harder on the
// fast and heavy families as the night deepens, and wave 10 brings
// the Void Herald.

import { VIEW, WAVES, randRange } from './config.js';

export class WaveDirector {
  constructor(rng) {
    this.rng = rng;
    this.wave = 0;
    this.queue = [];
    this.spawnTimer = 0;
    this.active = false;
  }

  // Build the spawn queue for a wave number (1-based). Endless waves
  // past the victory wave keep scaling off the same recipe.
  buildWave(wave) {
    const list = [];
    const add = (type, count) => {
      for (let i = 0; i < count; i++) list.push(type);
    };
    add('shard', 5 + wave * 2);
    if (wave >= 2) add('darter', 1 + wave);
    if (wave >= 3) add('weaver', wave - 1);
    if (wave >= 3) add('lancer', Math.min(5, wave - 2));
    if (wave >= 4) add('splitter', wave - 3);
    if (wave >= 5) add('bulwark', Math.floor((wave - 2) / 2));
    if (wave > WAVES.victoryWave) {
      add('shard', wave - WAVES.victoryWave);
      add('darter', Math.floor((wave - WAVES.victoryWave) / 2));
      add('lancer', 2);
      add('bulwark', 1);
    }
    // Shuffle so families interleave instead of arriving in blocks.
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    if (wave === WAVES.victoryWave) list.unshift('herald');
    this.queue = list;
    this.spawnInterval = Math.max(0.34, 1.05 - wave * 0.06);
    this.spawnTimer = 0.5;
    this.active = true;
  }

  // Slightly tougher bodies the deeper the night gets.
  hpScale() {
    return 1 + Math.max(0, this.wave - 4) * 0.12;
  }

  get remaining() {
    return this.queue.length;
  }

  get doneSpawning() {
    return this.active && this.queue.length === 0;
  }

  // A spawn point just outside a random edge, biased to corners so
  // pressure arrives from every direction over a wave.
  spawnPoint() {
    const margin = 46;
    const side = Math.floor(this.rng() * 4);
    if (side === 0) return { x: randRange(this.rng, 0, VIEW.width), y: -margin };
    if (side === 1) return { x: VIEW.width + margin, y: randRange(this.rng, 0, VIEW.height) };
    if (side === 2) return { x: randRange(this.rng, 0, VIEW.width), y: VIEW.height + margin };
    return { x: -margin, y: randRange(this.rng, 0, VIEW.height) };
  }

  // Emits at most one spawn per call; returns the enemy type to make
  // or null. The game caps how many may be alive at once.
  update(dt, aliveCount) {
    if (!this.active || this.queue.length === 0) return null;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return null;
    if (aliveCount >= WAVES.maxAlive) return null;
    this.spawnTimer = this.spawnInterval * randRange(this.rng, 0.7, 1.3);
    return this.queue.shift();
  }
}
