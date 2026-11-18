// Lastlight Aegis — the Game itself. Owns the state machine
// (title, playing, paused, victory, game over), the star core under
// attack, every collision, the HUD and all menu screens. The other
// modules are specialists; this one conducts.

import {
  CORE, COMBO, PALETTE, PICKUP_DROP_CHANCE, PICKUP_KINDS, PLAYER, VIEW, WAVES,
  clamp, createRng, randRange,
} from './config.js';
import { SoundEngine } from './audio.js';
import { Input } from './input.js';
import { Background } from './background.js';
import { ParticleSystem } from './particles.js';
import { Bullet, Enemy, EnemyOrb, Pickup, Player, sweptSegmentCircle } from './entities.js';
import { WaveDirector } from './waves.js';
import { drawGlow, drawOrb } from './sprites.js';

const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input(canvas);
    this.sound = new SoundEngine();
    this.background = new Background();
    this.rng = createRng((Date.now() % 2147483647) + 7);
    this.particles = new ParticleSystem(this.rng);
    this.director = new WaveDirector(this.rng);
    this.player = new Player();
    this.core = { x: VIEW.coreX, y: VIEW.coreY, hp: CORE.maxHp, maxHp: CORE.maxHp, shieldT: 0 };
    this.state = 'title';
    this.time = 0;
    this.frozen = false; // screenshot staging freezes the sim
    this.endless = false;
    this.hiScore = this.loadHiScore();
    this.attractTimer = 0;
    this.attractEnemies = [];
    this.resetRun();
  }

  loadHiScore() {
    try {
      return Number(localStorage.getItem('lastlight-aegis-hiscore')) || 0;
    } catch {
      return 0;
    }
  }

  saveHiScore() {
    if (this.score <= this.hiScore) return;
    this.hiScore = this.score;
    try {
      localStorage.setItem('lastlight-aegis-hiscore', String(this.hiScore));
    } catch {
      // Storage may be unavailable (sandboxed frame); the score
      // still shows for this session.
    }
  }

  resetRun() {
    this.player.reset();
    this.core.hp = CORE.maxHp;
    this.core.shieldT = 0;
    this.bullets = [];
    this.enemies = [];
    this.orbs = [];
    this.pickups = [];
    this.particles.clear();
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.bombs = PLAYER.startBombs;
    this.overdriveT = 0;
    this.scatterT = 0;
    this.hitstop = 0; // brief freeze frames on heavy kills
    this.coreFlash = 0; // red pulse on the core when it takes a hit
    this.slowmo = 0;
    this.shake = 0;
    this.flash = 0;
    this.phase = 'combat';
    this.intermission = 0;
    this.waveTotal = 0;
    this.surgeDone = true; // armed per wave in startWave
    this.newBest = false;
    this.banner = null;
    this.gameOverCause = '';
    this.stats = { kills: 0, shots: 0, hits: 0, timePlayed: 0, wavesCleared: 0 };
  }

  get multiplier() {
    return Math.min(COMBO.maxMultiplier, 1 + Math.floor(this.combo / COMBO.perTier));
  }

  startGame() {
    this.resetRun();
    this.endless = false;
    this.state = 'playing';
    this.startWave(1);
  }

  startWave(wave) {
    this.director.wave = wave;
    this.director.buildWave(wave);
    this.waveTotal = this.director.queue.length;
    this.surgeDone = false;
    this.phase = 'combat';
    const isBoss = wave === WAVES.victoryWave;
    this.banner = {
      title: isBoss ? 'THE VOID HERALD' : `WAVE ${wave}`,
      sub: isBoss ? 'Break the Herald and the night ends' : wave === 1 ? 'Hold the light' : '',
      t: 2.6,
    };
    if (isBoss) this.sound.bossWarning();
    else this.sound.waveStart();
  }

  showBanner(title, sub = '', t = 2.2) {
    this.banner = { title, sub, t };
  }

  // ---- spawning helpers used by entities --------------------------

  spawnHeraldOrbs(herald) {
    const targets = [this.player, this.core];
    for (const target of targets) {
      const angle = Math.atan2(target.y - herald.y, target.x - herald.x);
      this.orbs.push(new EnemyOrb(herald.x, herald.y, angle, 128));
    }
    this.particles.puff(herald.x, herald.y, '#ff3d81', 60, 0.3);
  }

  spawnHeraldShards(herald) {
    for (let i = 0; i < 2; i++) {
      const angle = this.rng() * Math.PI * 2;
      const shard = new Enemy(
        'shard',
        herald.x + Math.cos(angle) * (herald.radius + 16),
        herald.y + Math.sin(angle) * (herald.radius + 16),
        this.rng,
        this.director.hpScale(),
      );
      this.enemies.push(shard);
    }
  }

  // ---- main update -------------------------------------------------

  update(dt) {
    this.time += dt;
    this.background.update(dt);
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }
    if (this.input.pressed('KeyM')) this.sound.setMuted(!this.sound.muted);

    if (this.state === 'title') this.updateTitle(dt);
    else if (this.state === 'playing') this.updatePlaying(dt);
    else if (this.state === 'paused') this.updatePaused();
    else if (this.state === 'victory' || this.state === 'gameover') this.updateEndScreen(dt);
    this.input.endFrame();
  }

  updateTitle(dt) {
    // Attract mode: the guardian circles its star while stray shards
    // drift in and dissolve on the light.
    const orbitAngle = this.time * 0.35;
    this.player.x = VIEW.coreX + Math.cos(orbitAngle) * 150;
    this.player.y = VIEW.coreY + Math.sin(orbitAngle) * 150;
    this.player.angle = orbitAngle + Math.PI / 2;
    this.player.thrust = 0.6;
    this.attractTimer -= dt;
    if (this.attractTimer <= 0 && this.attractEnemies.length < 5) {
      this.attractTimer = 2.4;
      const point = this.director.spawnPoint();
      this.attractEnemies.push(new Enemy('shard', point.x, point.y, this.rng, 1));
    }
    for (const enemy of this.attractEnemies) enemy.update(dt, this, this.time);
    this.attractEnemies = this.attractEnemies.filter((enemy) => {
      const dist = Math.hypot(enemy.x - VIEW.coreX, enemy.y - VIEW.coreY);
      if (dist < VIEW.coreRadius + 44) {
        this.particles.explosion(enemy.x, enemy.y, enemy.def.color, 10, 150);
        return false;
      }
      return true;
    });
    this.particles.update(dt);
    if (this.input.mouseClicked || this.input.pressed('Enter') || this.input.pressed('Space')) {
      this.sound.unlock();
      this.sound.uiClick();
      this.attractEnemies = [];
      this.startGame();
    }
  }

  updatePaused() {
    if (this.input.pressed('KeyP') || this.input.pressed('Escape') || this.input.mouseClicked) {
      this.state = 'playing';
    }
  }

  updateEndScreen(dt) {
    this.particles.update(dt);
    if (this.state === 'victory' && Math.random() < 0.3) {
      this.particles.celebrate(
        VIEW.coreX + randRange(this.rng, -260, 260),
        VIEW.coreY + randRange(this.rng, -60, 120),
        [PALETTE.core, PALETTE.guardian, '#ff8fb2', '#b6ff9e'],
      );
    }
    if (this.input.mouseClicked) {
      const button = this.buttonAt(this.input.mouseX, this.input.mouseY);
      if (button) {
        this.sound.unlock();
        this.sound.uiClick();
        this.activateButton(button);
      }
    }
    if (this.input.pressed('KeyR') || this.input.pressed('Enter')) this.startGame();
  }

  updatePlaying(dt) {
    if (this.input.pressed('KeyP') || this.input.pressed('Escape')) {
      this.state = 'paused';
      return;
    }
    // Hitstop: on a heavy kill the world holds its breath for a few
    // frames while the particles play out — cheap, enormous feel.
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      this.particles.update(dt * 0.3);
      return;
    }
    this.stats.timePlayed += dt;
    this.slowmo = Math.max(0, this.slowmo - dt);
    this.shake = Math.max(0, this.shake - dt * 26);
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.overdriveT = Math.max(0, this.overdriveT - dt);
    this.scatterT = Math.max(0, this.scatterT - dt);
    this.coreFlash = Math.max(0, this.coreFlash - dt * 2.6);
    this.core.shieldT = Math.max(0, this.core.shieldT - dt);
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    // Spawning.
    if (this.phase === 'combat') {
      const type = this.director.update(dt, this.enemies.length);
      if (type) {
        const point = this.director.spawnPoint();
        this.enemies.push(new Enemy(type, point.x, point.y, this.rng, this.director.hpScale()));
      }
      // Mid-wave surge: once half the wave is dealt, the void throws
      // a ring of shards at the star in one breath (deep waves only).
      if (!this.surgeDone && this.waveTotal >= 12 && this.director.wave >= 4
        && this.director.remaining <= Math.floor(this.waveTotal / 2) && this.director.remaining > 0) {
        this.triggerSurge();
      }
      if (this.director.doneSpawning && this.enemies.length === 0) {
        this.onWaveCleared();
      }
    } else {
      this.intermission -= dt;
      if (this.intermission <= 0) this.startWave(this.director.wave + 1);
    }

    // Player, weapons, nova.
    this.player.tryDash(this.input, this.sound);
    this.player.update(dt, this.input, this.particles);
    this.updateFiring(dt);
    if ((this.input.rightClicked || this.input.pressed('KeyE')) && this.bombs > 0) this.detonateNova();

    // World.
    for (const bullet of this.bullets) bullet.update(dt);
    this.bullets = this.bullets.filter((bullet) => !bullet.dead);
    for (const enemy of this.enemies) enemy.update(dt, this, this.time);
    for (const orb of this.orbs) orb.update(dt);
    this.orbs = this.orbs.filter((orb) => !orb.dead);
    for (const pickup of this.pickups) pickup.update(dt, this.player);
    this.pickups = this.pickups.filter((pickup) => !pickup.dead);
    this.particles.update(dt);

    this.resolveCollisions();
    this.enemies = this.enemies.filter((enemy) => !enemy.dead);
    this.orbs = this.orbs.filter((orb) => !orb.dead);
  }

  // A ring of void-spawn arrives all at once from the edges — the
  // wave's second act. They still have to be cleared to hold the wave.
  triggerSurge() {
    this.surgeDone = true;
    const count = 6 + Math.min(4, this.director.wave - 4);
    for (let i = 0; i < count; i++) {
      const point = this.director.spawnPoint();
      const type = i % 3 === 2 ? 'mini' : 'shard';
      this.enemies.push(new Enemy(type, point.x, point.y, this.rng, this.director.hpScale()));
    }
    this.showBanner('VOID SURGE', 'The dark doubles its hunger', 1.6);
    this.sound.surge();
    this.shake = Math.max(this.shake, 5);
  }

  updateFiring(dt) {
    const interval = this.overdriveT > 0 ? PLAYER.fireInterval * 0.45 : PLAYER.fireInterval;
    if (!this.input.mouseDown || this.player.fireTimer > 0) return;
    this.player.fireTimer = interval;
    const noseX = this.player.x + Math.cos(this.player.angle) * (PLAYER.radius + 6);
    const noseY = this.player.y + Math.sin(this.player.angle) * (PLAYER.radius + 6);
    // Muzzles: overdrive splits the cannon into twin parallel bolts;
    // the scatter pickup fans every muzzle into a three-bolt spread.
    const perpX = -Math.sin(this.player.angle);
    const perpY = Math.cos(this.player.angle);
    const muzzles = this.overdriveT > 0 ? [-6, 6] : [0];
    const fan = this.scatterT > 0 ? [-0.17, 0, 0.17] : [0];
    for (const offset of muzzles) {
      const muzzleX = noseX + perpX * offset;
      const muzzleY = noseY + perpY * offset;
      for (const spread of fan) {
        this.bullets.push(new Bullet(muzzleX, muzzleY, this.player.angle + spread));
        this.stats.shots += 1;
      }
    }
    this.particles.puff(noseX, noseY, PALETTE.guardian, 22, 0.16);
    this.sound.shoot();
  }

  detonateNova() {
    this.bombs -= 1;
    this.flash = 0.85;
    this.shake = 14;
    this.slowmo = 0.5;
    this.sound.nova();
    this.particles.ring(this.player.x, this.player.y, PALETTE.guardian, 620, 0.7);
    this.particles.ring(this.player.x, this.player.y, '#ffffff', 420, 0.55);
    for (const enemy of this.enemies) {
      if (enemy.type === 'herald') {
        enemy.hp -= 60;
        enemy.hitFlash = 0.15;
        if (enemy.hp <= 0) this.killEnemy(enemy);
      } else {
        this.killEnemy(enemy, false);
      }
    }
    this.orbs = [];
    this.showBanner('NOVA', '', 0.9);
  }

  onWaveCleared() {
    const wave = this.director.wave;
    this.stats.wavesCleared = wave;
    const bonus = Math.round((this.core.hp / this.core.maxHp) * 100);
    this.score += bonus;
    if (wave === WAVES.victoryWave && !this.endless) {
      this.winGame();
      return;
    }
    this.phase = 'intermission';
    this.intermission = WAVES.betweenTime;
    this.showBanner(`WAVE ${wave} HELD`, bonus > 0 ? `Core integrity bonus +${bonus}` : '', 2.4);
    // A bomb restocks every third held wave, up to the cap.
    if (wave % 3 === 0 && this.bombs < PLAYER.maxBombs) this.bombs += 1;
  }

  winGame() {
    this.state = 'victory';
    this.flash = 0.7;
    this.newBest = this.score > this.hiScore;
    this.saveHiScore();
    this.sound.victory();
    this.particles.ring(VIEW.coreX, VIEW.coreY, PALETTE.core, 700, 1.1);
    this.particles.explosion(VIEW.coreX, VIEW.coreY, PALETTE.core, 60, 420);
  }

  loseGame(cause) {
    this.state = 'gameover';
    this.gameOverCause = cause;
    this.shake = 18;
    this.flash = 0.6;
    this.newBest = this.score > this.hiScore;
    this.saveHiScore();
    this.sound.gameOver();
    const x = cause === 'core' ? VIEW.coreX : this.player.x;
    const y = cause === 'core' ? VIEW.coreY : this.player.y;
    this.particles.explosion(x, y, cause === 'core' ? PALETTE.core : PALETTE.guardian, 70, 460);
    this.particles.ring(x, y, '#ffffff', 380, 0.8);
  }

  continueEndless() {
    this.endless = true;
    this.state = 'playing';
    this.startWave(WAVES.victoryWave + 1);
  }

  // ---- collisions ---------------------------------------------------

  resolveCollisions() {
    // Bolts versus void-spawn. A bolt travels up to 38 px in one step
    // (760 px/s at the 0.05 s dt cap) — more than the combined
    // diameter of the smallest void-spawn (bolt 4 + mini 8, doubled)
    // — so testing only the endpoint lets a bolt tunnel clean through
    // a target it crossed mid-step. Sweep the segment from the bolt's
    // previous position to its new one instead, and take the earliest
    // contact along it: that is the enemy the bolt really meets first.
    for (const bullet of this.bullets) {
      let hitEnemy = null;
      let hitT = Infinity;
      for (const enemy of this.enemies) {
        if (enemy.dead) continue;
        const reach = bullet.radius + enemy.radius;
        // Cheap reject: the enemy must come within reach of the
        // segment's bounding box before the exact test is worth it.
        if (Math.max(bullet.prevX, bullet.x) < enemy.x - reach || Math.min(bullet.prevX, bullet.x) > enemy.x + reach) continue;
        if (Math.max(bullet.prevY, bullet.y) < enemy.y - reach || Math.min(bullet.prevY, bullet.y) > enemy.y + reach) continue;
        const t = sweptSegmentCircle(bullet.prevX, bullet.prevY, bullet.x, bullet.y, enemy.x, enemy.y, reach);
        if (t !== null && t < hitT) {
          hitT = t;
          hitEnemy = enemy;
        }
      }
      if (!hitEnemy) continue;
      // Park the bolt at the contact point so the impact particles
      // originate where the hit actually happened, not past the target.
      bullet.x = bullet.prevX + (bullet.x - bullet.prevX) * hitT;
      bullet.y = bullet.prevY + (bullet.y - bullet.prevY) * hitT;
      bullet.dead = true;
      this.stats.hits += 1;
      hitEnemy.hp -= 1;
      hitEnemy.hitFlash = 0.09;
      this.particles.puff(bullet.x, bullet.y, hitEnemy.def.color, 20, 0.18);
      this.particles.impact(bullet.x, bullet.y, Math.atan2(bullet.vy, bullet.vx), hitEnemy.def.color);
      if (hitEnemy.hp <= 0) this.killEnemy(hitEnemy);
    }
    // Void-spawn versus the core and the guardian.
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const coreDist = Math.hypot(enemy.x - this.core.x, enemy.y - this.core.y);
      if (coreDist < VIEW.coreRadius + enemy.radius * 0.55) {
        this.enemyHitsCore(enemy);
        continue;
      }
      const playerDist = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);
      if (playerDist < enemy.radius + PLAYER.radius - 2) this.enemyHitsPlayer(enemy);
    }
    // Herald orbs versus the core and the guardian.
    for (const orb of this.orbs) {
      if (orb.dead) continue;
      if (Math.hypot(orb.x - this.core.x, orb.y - this.core.y) < VIEW.coreRadius + orb.radius) {
        orb.dead = true;
        this.damageCore(orb.coreDamage, orb.x, orb.y);
      } else if (Math.hypot(orb.x - this.player.x, orb.y - this.player.y) < orb.radius + PLAYER.radius) {
        orb.dead = true;
        this.damagePlayer(orb.hullDamage, orb.x, orb.y);
      }
    }
    // Pickups versus the guardian.
    for (const pickup of this.pickups) {
      if (pickup.dead) continue;
      if (Math.hypot(pickup.x - this.player.x, pickup.y - this.player.y) < pickup.radius + PLAYER.radius + 4) {
        pickup.dead = true;
        this.applyPickup(pickup);
      }
    }
  }

  killEnemy(enemy, awardScore = true) {
    if (enemy.dead) return;
    enemy.dead = true;
    const size = clamp(enemy.radius / 16, 0.7, 3);
    this.particles.explosion(enemy.x, enemy.y, enemy.def.color, Math.round(16 * size), 240 * size);
    this.sound.explosion(size * 0.7);
    // Weight you can feel: heavies stop the world for a frame and
    // rock the camera; even a splitter's pop nudges it.
    if (enemy.type === 'bulwark') {
      this.hitstop = Math.max(this.hitstop, 0.05);
      this.shake = Math.max(this.shake, 7);
    } else if (enemy.type === 'splitter' || enemy.type === 'lancer') {
      this.shake = Math.max(this.shake, 3);
    }
    if (awardScore) {
      const multBefore = this.multiplier;
      this.combo += 1;
      this.comboTimer = COMBO.window;
      const gained = enemy.def.score * this.multiplier;
      this.score += gained;
      this.stats.kills += 1;
      if (gained >= 100) this.particles.text(enemy.x, enemy.y - 10, `+${gained}`, enemy.def.color, 16);
      // A multiplier step is an event: name it, ring it, chime it.
      if (this.multiplier > multBefore) {
        const names = { 4: 'STARFIRE', 6: 'SUPERNOVA', 8: 'LASTLIGHT' };
        const label = `${names[this.multiplier] || 'COMBO'} ×${this.multiplier}`;
        const color = this.multiplier >= 6 ? '#ffb347' : PALETTE.guardian;
        this.particles.text(VIEW.width / 2, 216, label, color, 30);
        this.particles.ring(this.player.x, this.player.y, color, 90, 0.4);
        this.sound.milestone();
      }
    }
    if (enemy.type === 'splitter') {
      for (let i = 0; i < 3; i++) {
        const mini = new Enemy('mini', enemy.x + (this.rng() - 0.5) * 26, enemy.y + (this.rng() - 0.5) * 26, this.rng, 1);
        this.enemies.push(mini);
      }
    }
    if (enemy.type === 'herald') {
      this.flash = 0.9;
      this.shake = 16;
      this.particles.explosion(enemy.x, enemy.y, '#ffffff', 80, 520);
    }
    if (this.rng() < PICKUP_DROP_CHANCE && enemy.type !== 'mini') {
      this.dropPickup(enemy.x, enemy.y);
    }
  }

  dropPickup(x, y) {
    const total = Object.values(PICKUP_KINDS).reduce((sum, kind) => sum + kind.weight, 0);
    let roll = this.rng() * total;
    for (const [kind, def] of Object.entries(PICKUP_KINDS)) {
      roll -= def.weight;
      if (roll <= 0) {
        this.pickups.push(new Pickup(kind, x, y));
        return;
      }
    }
  }

  applyPickup(pickup) {
    this.sound.pickup();
    this.particles.ring(pickup.x, pickup.y, pickup.def.color, 54, 0.35);
    this.particles.text(this.player.x, this.player.y - 30, pickup.def.label, pickup.def.color, 15);
    if (pickup.kind === 'repair') {
      this.player.hull = Math.min(PLAYER.hull, this.player.hull + 26);
      this.core.hp = Math.min(this.core.maxHp, this.core.hp + 45);
    } else if (pickup.kind === 'overdrive') {
      this.overdriveT = 8;
    } else if (pickup.kind === 'scatter') {
      this.scatterT = PLAYER.scatterTime;
    } else if (pickup.kind === 'nova') {
      this.bombs = Math.min(PLAYER.maxBombs, this.bombs + 1);
    } else if (pickup.kind === 'aegis') {
      this.core.shieldT = CORE.shieldTime;
    }
  }

  enemyHitsCore(enemy) {
    enemy.dead = true;
    this.particles.explosion(enemy.x, enemy.y, enemy.def.color, 20, 240);
    if (this.core.shieldT > 0) {
      this.particles.ring(VIEW.coreX, VIEW.coreY, PALETTE.shield, 130, 0.4);
      this.particles.text(VIEW.coreX, VIEW.coreY - 70, 'AEGIS HOLDS', PALETTE.shield, 15);
      this.sound.explosion(0.5);
      return;
    }
    this.damageCore(enemy.def.coreDamage, enemy.x, enemy.y);
  }

  damageCore(amount, x, y) {
    this.core.hp -= amount;
    this.coreFlash = 0.5;
    this.shake = Math.max(this.shake, 9);
    this.slowmo = Math.max(this.slowmo, 0.3);
    this.sound.coreHit();
    this.particles.text(x, y - 14, `-${amount}`, PALETTE.danger, 16);
    if (this.core.hp <= 0) {
      this.core.hp = 0;
      this.loseGame('core');
    }
  }

  enemyHitsPlayer(enemy) {
    const heavy = enemy.type === 'bulwark' || enemy.type === 'herald';
    if (!heavy) {
      enemy.dead = true;
      this.particles.explosion(enemy.x, enemy.y, enemy.def.color, 18, 230);
    } else {
      enemy.hp -= 3;
      if (enemy.hp <= 0) this.killEnemy(enemy);
    }
    this.damagePlayer(enemy.def.hullDamage, enemy.x, enemy.y);
  }

  damagePlayer(amount, x, y) {
    if (this.player.invulnerable > 0 || this.state !== 'playing') return;
    this.player.hull -= amount;
    this.player.invulnerable = 0.85;
    this.shake = Math.max(this.shake, 11);
    this.combo = 0;
    this.comboTimer = 0;
    this.sound.playerHit();
    this.particles.text(this.player.x, this.player.y - 26, `-${amount} HULL`, PALETTE.danger, 15);
    if (this.player.hull <= 0) {
      this.player.hull = 0;
      this.loseGame('hull');
    }
  }

  // ---- buttons --------------------------------------------------------

  menuButtons() {
    if (this.state === 'victory') {
      return [
        { id: 'endless', label: 'CONTINUE — ENDLESS NIGHT', x: VIEW.width / 2 - 190, y: 500, w: 380, h: 52 },
        { id: 'restart', label: 'PLAY AGAIN', x: VIEW.width / 2 - 190, y: 564, w: 380, h: 52 },
      ];
    }
    if (this.state === 'gameover') {
      return [{ id: 'restart', label: 'RETRY — RELIGHT THE STAR', x: VIEW.width / 2 - 190, y: 524, w: 380, h: 52 }];
    }
    return [];
  }

  buttonAt(x, y) {
    return this.menuButtons().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;
  }

  activateButton(button) {
    if (button.id === 'endless') this.continueEndless();
    else if (button.id === 'restart') this.startGame();
  }

  // ---- drawing --------------------------------------------------------

  draw() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    this.background.draw(ctx, this.time);
    this.drawCore(ctx);
    for (const pickup of this.pickups) pickup.draw(ctx, this.time);
    if (this.state === 'title') {
      for (const enemy of this.attractEnemies) enemy.draw(ctx, this.time);
      this.player.draw(ctx);
    } else {
      for (const enemy of this.enemies) enemy.draw(ctx, this.time);
      for (const orb of this.orbs) orb.draw(ctx, this.time);
      if (this.state !== 'gameover' || this.gameOverCause === 'core') this.player.draw(ctx);
      for (const bullet of this.bullets) bullet.draw(ctx);
    }
    this.particles.draw(ctx);
    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 244, 214, ${this.flash * 0.55})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    this.drawVignette(ctx);
    this.drawDangerVignette(ctx);

    if (this.state === 'playing' || this.state === 'paused') this.drawHud(ctx);
    if (this.banner && (this.state === 'playing')) this.drawBanner(ctx);
    if (this.state === 'title') this.drawTitle(ctx);
    if (this.state === 'paused') this.drawPaused(ctx);
    if (this.state === 'victory') this.drawVictory(ctx);
    if (this.state === 'gameover') this.drawGameOver(ctx);
  }

  drawCore(ctx) {
    const { coreX: x, coreY: y } = VIEW;
    const pulse = 1 + Math.sin(this.time * 2.1) * 0.05;
    const hpFrac = this.core.hp / this.core.maxHp;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, PALETTE.coreDeep, x, y, VIEW.coreGlowRadius * 2.5 * pulse, 0.5);
    drawGlow(ctx, PALETTE.core, x, y, VIEW.coreGlowRadius * 1.5 * pulse, 0.55);
    ctx.restore();
    // Rotating corona spikes.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.time * 0.25);
    ctx.fillStyle = 'rgba(255, 183, 77, 0.5)';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const len = VIEW.coreRadius * (1.25 + 0.3 * Math.sin(this.time * 3 + i * 1.7));
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(VIEW.coreRadius * 0.8, -4);
      ctx.lineTo(len, 0);
      ctx.lineTo(VIEW.coreRadius * 0.8, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    // The star's body: a hot gradient sphere.
    const body = ctx.createRadialGradient(x - 8, y - 8, 2, x, y, VIEW.coreRadius);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.35, PALETTE.coreHot);
    body.addColorStop(0.75, PALETTE.core);
    body.addColorStop(1, PALETTE.coreDeep);
    ctx.beginPath();
    ctx.arc(x, y, VIEW.coreRadius * pulse, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    // Fresh damage smoulders red over the gold before it fades.
    if (this.coreFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, PALETTE.danger, x, y, 210, this.coreFlash * 0.55);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x, y, VIEW.coreRadius * pulse, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 60, 70, ${this.coreFlash * 0.35})`;
      ctx.fill();
    }
    // Ember sparks ride a slow orbit just outside the corona.
    for (let i = 0; i < 6; i++) {
      const a = this.time * 0.85 + (i * Math.PI) / 3;
      const orbitR = VIEW.coreRadius + 27 + Math.sin(this.time * 2.2 + i * 1.9) * 4;
      drawOrb(ctx, PALETTE.core, x + Math.cos(a) * orbitR, y + Math.sin(a) * orbitR, 2.2, '#fff6da');
    }
    // Health ring: gold while strong, red as the star fades.
    ctx.beginPath();
    ctx.arc(x, y, VIEW.coreRadius + 12, -Math.PI / 2, -Math.PI / 2 + hpFrac * Math.PI * 2);
    ctx.strokeStyle = hpFrac > 0.3 ? PALETTE.core : PALETTE.danger;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    // Aegis shield bubble.
    if (this.core.shieldT > 0) {
      ctx.beginPath();
      ctx.arc(x, y, VIEW.coreRadius + 24 + Math.sin(this.time * 5) * 2, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(125, 255, 206, ${0.45 + 0.25 * Math.sin(this.time * 7)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      drawGlow(ctx, PALETTE.shield, x, y, 170, 0.18);
    }
    if (this.state === 'gameover' && this.gameOverCause === 'core') {
      // The dead star: a cracked grey ember.
      ctx.beginPath();
      ctx.arc(x, y, VIEW.coreRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(40, 42, 55, 0.88)';
      ctx.fill();
      drawOrb(ctx, '#ff7a3c', x, y, 5, '#ffd7a8');
    }
  }

  drawBar(ctx, x, y, w, h, frac, color, label, valueText) {
    ctx.fillStyle = 'rgba(8, 16, 34, 0.72)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(160, 210, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    const fillW = Math.max(0, w * clamp(frac, 0, 1));
    const gradient = ctx.createLinearGradient(x, y, x + w, y);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, '#ffffff');
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = gradient;
    ctx.fillRect(x + 1, y + 1, Math.max(0, fillW - 2), h - 2);
    ctx.globalAlpha = 1;
    ctx.font = `700 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(label, x, y - 5);
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(valueText, x + w, y - 5);
  }

  drawHud(ctx) {
    // Top-left: hull and core integrity.
    this.drawBar(ctx, 24, 34, 250, 13, this.player.hull / PLAYER.hull, PALETTE.hull, 'GUARDIAN HULL', `${Math.ceil(this.player.hull)}`);
    this.drawBar(ctx, 24, 76, 250, 13, this.core.hp / this.core.maxHp, PALETTE.coreBar, 'STAR CORE', `${Math.ceil(this.core.hp)}`);
    if (this.core.shieldT > 0) {
      ctx.font = `700 12px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.shield;
      ctx.fillText(`AEGIS ${this.core.shieldT.toFixed(0)}s`, 24, 112);
    }
    // Top-center: the wave and what remains of it.
    ctx.textAlign = 'center';
    ctx.font = `800 24px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    const waveLabel = this.phase === 'intermission' ? 'HELD' : `WAVE ${this.director.wave}`;
    ctx.fillText(waveLabel, VIEW.width / 2, 42);
    ctx.font = `600 13px ${FONT}`;
    ctx.fillStyle = PALETTE.textDim;
    const remaining = this.director.remaining + this.enemies.length;
    ctx.fillText(this.phase === 'intermission' ? `Next wave in ${Math.ceil(this.intermission)}` : `${remaining} void-spawn remain`, VIEW.width / 2, 64);
    // Top-right: score, best, combo.
    ctx.textAlign = 'right';
    ctx.font = `800 30px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(String(this.score).padStart(6, '0'), VIEW.width - 24, 44);
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(`BEST ${Math.max(this.hiScore, this.score)}`, VIEW.width - 24, 64);
    if (this.combo > 1) {
      const mult = this.multiplier;
      ctx.font = `800 ${18 + Math.min(10, this.combo)}px ${FONT}`;
      ctx.fillStyle = mult >= 4 ? '#ffb347' : PALETTE.guardian;
      ctx.fillText(`COMBO ×${mult}`, VIEW.width - 24, 96);
      this.drawBar(ctx, VIEW.width - 174, 108, 150, 5, this.comboTimer / COMBO.window, PALETTE.guardian, '', '');
    }
    // Bottom-left: dash readiness. Bottom-right: nova bombs.
    ctx.textAlign = 'left';
    ctx.font = `700 11px ${FONT}`;
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText('DASH', 24, VIEW.height - 34);
    this.drawBar(ctx, 24, VIEW.height - 28, 110, 7, 1 - this.player.dashCooldown / PLAYER.dashCooldown, PALETTE.guardian, '', '');
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText('NOVA', VIEW.width - 24, VIEW.height - 34);
    for (let i = 0; i < PLAYER.maxBombs; i++) {
      drawOrb(ctx, i < this.bombs ? PALETTE.guardian : 'rgba(90,120,150,0.5)', VIEW.width - 36 - i * 24, VIEW.height - 22, 6, '#ffffff');
    }
    // Bottom-center weapon timers, stacked when both run at once.
    let timerRow = 0;
    if (this.overdriveT > 0) {
      ctx.textAlign = 'center';
      ctx.font = `800 15px ${FONT}`;
      ctx.fillStyle = PALETTE.overdrive;
      ctx.fillText(`OVERDRIVE ${this.overdriveT.toFixed(0)}s`, VIEW.width / 2, VIEW.height - 18 - timerRow * 22);
      timerRow += 1;
    }
    if (this.scatterT > 0) {
      ctx.textAlign = 'center';
      ctx.font = `800 15px ${FONT}`;
      ctx.fillStyle = PICKUP_KINDS.scatter.color;
      ctx.fillText(`SCATTER CANNON ${this.scatterT.toFixed(0)}s`, VIEW.width / 2, VIEW.height - 18 - timerRow * 22);
      timerRow += 1;
    }
    if (this.sound.muted) {
      ctx.textAlign = 'right';
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = PALETTE.textDim;
      ctx.fillText('MUTED (M)', VIEW.width - 24, 128);
    }
  }

  drawBanner(ctx) {
    const t = this.banner.t;
    const alpha = clamp(t / 0.6, 0, 1) * clamp((2.6 - t) / 0.4 + 0.6, 0, 1);
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha + 0.25);
    ctx.textAlign = 'center';
    ctx.font = `800 44px ${FONT}`;
    ctx.shadowColor = PALETTE.guardian;
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this.banner.title, VIEW.width / 2, 150);
    ctx.shadowBlur = 0;
    if (this.banner.sub) {
      ctx.font = `600 17px ${FONT}`;
      ctx.fillStyle = PALETTE.textDim;
      ctx.fillText(this.banner.sub, VIEW.width / 2, 182);
    }
    ctx.restore();
  }

  drawVignette(ctx) {
    const gradient = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.42, VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.95);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(2,4,12,0.55)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  // When the hull or the star is nearly gone, the edges of the
  // world pulse red — danger you feel before you read the bars.
  drawDangerVignette(ctx) {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    const hullDanger = clamp(1 - this.player.hull / 30, 0, 1);
    const coreDanger = clamp(1 - this.core.hp / (this.core.maxHp * 0.3), 0, 1);
    const danger = Math.max(hullDanger, coreDanger);
    if (danger <= 0) return;
    const pulse = (0.13 + 0.09 * Math.sin(this.time * 6)) * danger;
    const gradient = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.36, VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.92);
    gradient.addColorStop(0, 'rgba(255,40,60,0)');
    gradient.addColorStop(1, `rgba(255, 40, 60, ${pulse})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  drawPanel(ctx, w, h) {
    const x = VIEW.width / 2 - w / 2;
    const y = VIEW.height / 2 - h / 2;
    ctx.fillStyle = 'rgba(5, 10, 24, 0.78)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    return { x, y };
  }

  drawButton(ctx, button) {
    const hover = this.input.mouseX >= button.x && this.input.mouseX <= button.x + button.w
      && this.input.mouseY >= button.y && this.input.mouseY <= button.y + button.h;
    ctx.fillStyle = hover ? 'rgba(95, 242, 255, 0.22)' : 'rgba(20, 40, 70, 0.65)';
    ctx.fillRect(button.x, button.y, button.w, button.h);
    ctx.strokeStyle = hover ? PALETTE.guardian : 'rgba(120, 200, 255, 0.5)';
    ctx.lineWidth = hover ? 2 : 1.2;
    ctx.strokeRect(button.x, button.y, button.w, button.h);
    ctx.font = `800 17px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(button.label, button.x + button.w / 2, button.y + button.h / 2 + 6);
  }

  drawTitle(ctx) {
    ctx.fillStyle = 'rgba(3, 6, 16, 0.42)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    // Title with a layered glow: the cover shot lives or dies here.
    ctx.font = `900 92px ${FONT}`;
    ctx.shadowColor = PALETTE.core;
    ctx.shadowBlur = 42;
    ctx.fillStyle = '#fff6da';
    ctx.fillText('LASTLIGHT', VIEW.width / 2, 158);
    ctx.shadowColor = PALETTE.guardian;
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#dffaff';
    ctx.font = `900 54px ${FONT}`;
    ctx.fillText('A E G I S', VIEW.width / 2, 222);
    ctx.shadowBlur = 0;
    ctx.font = `600 19px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText('The last star still burns. The void is coming for it.', VIEW.width / 2, 268);
    ctx.font = `500 16px ${FONT}`;
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText('Pilot the guardian. Hold ten waves. Break the Void Herald — or the light goes out.', VIEW.width / 2, 296);

    const lines = [
      ['MOVE', 'W A S D / Arrows'],
      ['AIM + FIRE', 'Mouse — hold to shoot'],
      ['DASH', 'Shift / Space (briefly untouchable)'],
      ['NOVA BOMB', 'Right-click / E — clears the sky'],
      ['PAUSE · MUTE', 'P · M'],
    ];
    ctx.font = `600 15px ${FONT}`;
    lines.forEach(([key, desc], i) => {
      const y = 592 + i * 26;
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.guardian;
      ctx.fillText(key, VIEW.width / 2 - 14, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(desc, VIEW.width / 2 + 14, y);
    });

    const pulse = 0.65 + 0.35 * Math.sin(this.time * 4);
    ctx.globalAlpha = pulse;
    ctx.font = `800 24px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('CLICK TO BEGIN', VIEW.width / 2, 500);
    ctx.globalAlpha = 1;
    if (this.hiScore > 0) {
      ctx.font = `600 14px ${FONT}`;
      ctx.fillStyle = PALETTE.core;
      ctx.fillText(`BEST ${this.hiScore}`, VIEW.width / 2, 742);
    }
    ctx.font = `500 12px ${FONT}`;
    ctx.fillStyle = 'rgba(143, 180, 216, 0.7)';
    ctx.fillText('An original canvas game — no libraries, no assets, only light.', VIEW.width / 2, 770);
  }

  drawPaused(ctx) {
    ctx.fillStyle = 'rgba(3, 6, 16, 0.6)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.font = `900 52px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('PAUSED', VIEW.width / 2, VIEW.height / 2 - 10);
    ctx.font = `600 16px ${FONT}`;
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText('P or click to resume — the void waits, impatiently', VIEW.width / 2, VIEW.height / 2 + 28);
  }

  statsLines() {
    const accuracy = this.stats.shots > 0 ? Math.round((this.stats.hits / this.stats.shots) * 100) : 0;
    const minutes = Math.floor(this.stats.timePlayed / 60);
    const seconds = Math.floor(this.stats.timePlayed % 60).toString().padStart(2, '0');
    return [
      ['FINAL SCORE', String(this.score)],
      ['WAVES HELD', String(this.stats.wavesCleared)],
      ['VOID-SPAWN BROKEN', String(this.stats.kills)],
      ['ACCURACY', `${accuracy}%`],
      ['TIME IN THE DARK', `${minutes}:${seconds}`],
      ['STAR CORE LEFT', `${Math.ceil(this.core.hp)} / ${this.core.maxHp}`],
    ];
  }

  drawStats(ctx, topY) {
    ctx.font = `600 16px ${FONT}`;
    this.statsLines().forEach(([label, value], i) => {
      const y = topY + i * 27;
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.textDim;
      ctx.fillText(label, VIEW.width / 2 - 16, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(value, VIEW.width / 2 + 16, y);
    });
  }

  drawVictory(ctx) {
    this.drawPanel(ctx, 640, 520);
    ctx.textAlign = 'center';
    ctx.font = `900 46px ${FONT}`;
    ctx.shadowColor = PALETTE.core;
    ctx.shadowBlur = 26;
    ctx.fillStyle = '#fff6da';
    ctx.fillText('THE VOID RETREATS', VIEW.width / 2, 232);
    ctx.shadowBlur = 0;
    ctx.font = `600 16px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    ctx.fillText('The Herald is broken and the last star still burns — because you held.', VIEW.width / 2, 266);
    if (this.newBest) {
      ctx.font = `800 15px ${FONT}`;
      ctx.fillStyle = PALETTE.core;
      ctx.fillText('★ NEW BEST ★', VIEW.width / 2, 292);
    }
    this.drawStats(ctx, 314);
    for (const button of this.menuButtons()) this.drawButton(ctx, button);
    ctx.font = `500 13px ${FONT}`;
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText('or press R to play again', VIEW.width / 2, 642);
  }

  drawGameOver(ctx) {
    this.drawPanel(ctx, 640, 440);
    ctx.textAlign = 'center';
    ctx.font = `900 48px ${FONT}`;
    ctx.shadowColor = PALETTE.danger;
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffe3e9';
    ctx.fillText('THE LIGHT FALLS', VIEW.width / 2, 252);
    ctx.shadowBlur = 0;
    ctx.font = `600 16px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    const cause = this.gameOverCause === 'core'
      ? 'The void reached the star core and drank it dark.'
      : 'Your guardian broke apart among the shards.';
    ctx.fillText(cause, VIEW.width / 2, 286);
    if (this.newBest) {
      ctx.font = `800 15px ${FONT}`;
      ctx.fillStyle = PALETTE.core;
      ctx.fillText('★ NEW BEST ★', VIEW.width / 2, 312);
    }
    this.drawStats(ctx, 330);
    for (const button of this.menuButtons()) this.drawButton(ctx, button);
  }
}
