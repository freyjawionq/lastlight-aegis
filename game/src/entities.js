// Everything that moves and can be shot: the guardian, its bolts,
// the void-spawn families, the Herald's orbs and the pickups the
// fallen drop. Each class owns its own update and draw; the Game
// class only orchestrates collisions and scoring.

import { ENEMY_TYPES, LANCER, PALETTE, PLAYER, PICKUP_KINDS, VIEW, clamp } from './config.js';
import { drawGlow, drawOrb } from './sprites.js';

export class Player {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = VIEW.coreX;
    this.y = VIEW.coreY + 190;
    this.vx = 0;
    this.vy = 0;
    this.angle = -Math.PI / 2;
    this.hull = PLAYER.hull;
    this.fireTimer = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.invulnerable = 0;
    this.thrust = 0; // 0..1 engine flare for drawing
    this.ghosts = []; // dash afterimages
  }

  get alive() {
    return this.hull > 0;
  }

  update(dt, input, particles) {
    const axis = input.moveAxis();
    const dashing = this.dashTimer > 0;
    if (dashing) {
      this.dashTimer -= dt;
      this.ghosts.push({ x: this.x, y: this.y, angle: this.angle, life: 0.28 });
      // Dash keeps the velocity it was launched with.
    } else {
      this.vx += axis.x * PLAYER.accel * dt;
      this.vy += axis.y * PLAYER.accel * dt;
    }
    const dampFactor = Math.max(0, 1 - PLAYER.damping * dt);
    if (!dashing) {
      this.vx *= dampFactor;
      this.vy *= dampFactor;
    }
    const speed = Math.hypot(this.vx, this.vy);
    const cap = dashing ? PLAYER.dashSpeed : PLAYER.maxSpeed;
    if (speed > cap) {
      this.vx = (this.vx / speed) * cap;
      this.vy = (this.vy / speed) * cap;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // Soft walls: the arena is the screen, with a margin for the HUD.
    this.x = clamp(this.x, 26, VIEW.width - 26);
    this.y = clamp(this.y, 64, VIEW.height - 26);
    // The guardian may not hide inside the star it guards.
    const dx = this.x - VIEW.coreX;
    const dy = this.y - VIEW.coreY;
    const dist = Math.hypot(dx, dy);
    const minDist = VIEW.coreRadius + PLAYER.radius + 6;
    if (dist < minDist && dist > 0.01) {
      this.x = VIEW.coreX + (dx / dist) * minDist;
      this.y = VIEW.coreY + (dy / dist) * minDist;
    }
    this.angle = Math.atan2(input.mouseY - this.y, input.mouseX - this.x);
    this.thrust = Math.min(1, speed / PLAYER.maxSpeed);
    if (speed > 40 && Math.random() < 0.75) {
      const backX = this.x - Math.cos(this.angle) * PLAYER.radius;
      const backY = this.y - Math.sin(this.angle) * PLAYER.radius;
      particles.trail(backX, backY, PALETTE.guardian, 7);
    }
    this.ghosts = this.ghosts.filter((ghost) => (ghost.life -= dt) > 0);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.fireTimer -= dt;
  }

  tryDash(input, sound) {
    const wantsDash = input.pressed('ShiftLeft') || input.pressed('ShiftRight') || input.pressed('Space');
    if (!wantsDash || this.dashCooldown > 0 || this.dashTimer > 0) return;
    const axis = input.moveAxis();
    let dirX = axis.x;
    let dirY = axis.y;
    if (dirX === 0 && dirY === 0) {
      dirX = Math.cos(this.angle);
      dirY = Math.sin(this.angle);
    }
    const len = Math.hypot(dirX, dirY) || 1;
    this.vx = (dirX / len) * PLAYER.dashSpeed;
    this.vy = (dirY / len) * PLAYER.dashSpeed;
    this.dashTimer = PLAYER.dashTime;
    this.dashCooldown = PLAYER.dashCooldown;
    this.invulnerable = Math.max(this.invulnerable, PLAYER.dashTime + 0.08);
    sound.dash();
  }

  drawShipShape(ctx, alpha) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.globalAlpha = alpha;
    // Engine flare behind the hull, sized by thrust.
    const flare = 10 + this.thrust * 16 + Math.random() * 4;
    const flame = ctx.createLinearGradient(-PLAYER.radius, 0, -PLAYER.radius - flare, 0);
    flame.addColorStop(0, 'rgba(160, 250, 255, 0.95)');
    flame.addColorStop(0.4, 'rgba(60, 190, 255, 0.55)');
    flame.addColorStop(1, 'rgba(60, 120, 255, 0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-PLAYER.radius + 2, -4.5);
    ctx.lineTo(-PLAYER.radius - flare, 0);
    ctx.lineTo(-PLAYER.radius + 2, 4.5);
    ctx.closePath();
    ctx.fill();
    // Hull: a swept dart with notched wings.
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-6, -6);
    ctx.lineTo(-14, -14);
    ctx.lineTo(-10, -2);
    ctx.lineTo(-12, 0);
    ctx.lineTo(-10, 2);
    ctx.lineTo(-14, 14);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    const hullGradient = ctx.createLinearGradient(0, -14, 0, 14);
    hullGradient.addColorStop(0, '#bdf6ff');
    hullGradient.addColorStop(0.5, PALETTE.guardian);
    hullGradient.addColorStop(1, PALETTE.guardianDeep);
    ctx.fillStyle = hullGradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(230, 255, 255, 0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Cockpit heart.
    ctx.beginPath();
    ctx.arc(4, 0, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }

  draw(ctx) {
    for (const ghost of this.ghosts) {
      const keepX = this.x;
      const keepY = this.y;
      const keepAngle = this.angle;
      const keepThrust = this.thrust;
      this.x = ghost.x;
      this.y = ghost.y;
      this.angle = ghost.angle;
      this.thrust = 0.2;
      this.drawShipShape(ctx, Math.max(0, ghost.life / 0.28) * 0.35);
      this.x = keepX;
      this.y = keepY;
      this.angle = keepAngle;
      this.thrust = keepThrust;
    }
    // Invulnerability shimmer while dashing or freshly hit.
    if (this.invulnerable > 0) {
      drawGlow(ctx, PALETTE.guardian, this.x, this.y, 74 + Math.sin(performance.now() * 0.03) * 8, 0.3);
    }
    drawGlow(ctx, PALETTE.guardian, this.x, this.y, 64, 0.4);
    this.drawShipShape(ctx, 1);
  }
}

export class Bullet {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * PLAYER.bulletSpeed;
    this.vy = Math.sin(angle) * PLAYER.bulletSpeed;
    this.life = PLAYER.bulletLife;
    this.radius = 4;
    this.dead = false;
    this.trail = []; // recent positions, drawn as a fading comet tail
  }

  update(dt) {
    this.trail.unshift({ x: this.x, y: this.y });
    if (this.trail.length > 5) this.trail.pop();
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0 || this.x < -20 || this.x > VIEW.width + 20 || this.y < -20 || this.y > VIEW.height + 20) {
      this.dead = true;
    }
  }

  draw(ctx) {
    // Comet tail: a tapering polyline through the last few positions.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const point = this.trail[i];
      const t = 1 - i / Math.max(1, this.trail.length);
      ctx.strokeStyle = PALETTE.guardian;
      ctx.globalAlpha = 0.14 + t * 0.3;
      ctx.lineWidth = 1 + t * 2.4;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
    }
    ctx.restore();
    drawOrb(ctx, PALETTE.guardian, this.x, this.y, 2.6);
  }
}

// A slow orb of void the Herald spits at the guardian and the core.
export class EnemyOrb {
  constructor(x, y, angle, speed = 120) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.radius = 7;
    this.life = 7;
    this.dead = false;
    this.hullDamage = 8;
    this.coreDamage = 10;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx, time) {
    const pulse = 1 + Math.sin(time * 9 + this.x) * 0.15;
    drawOrb(ctx, ENEMY_TYPES.herald.color, this.x, this.y, this.radius * pulse, '#ffd7ea');
  }
}

export class Enemy {
  constructor(type, x, y, rng, hpScale = 1) {
    const def = ENEMY_TYPES[type];
    this.type = type;
    this.def = def;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.hp = Math.max(1, Math.round(def.hp * hpScale));
    this.maxHp = this.hp;
    this.radius = def.radius;
    this.phase = rng() * Math.PI * 2;
    this.spin = (rng() - 0.5) * 1.6;
    this.rotation = rng() * Math.PI * 2;
    this.hitFlash = 0;
    this.fireTimer = 2 + rng() * 2.5; // Herald orb cadence
    this.spawnTimer = 3.5; // Herald shard cadence
    this.orbitDir = rng() < 0.5 ? 1 : -1;
    // Lancer charge-cycle state (only the lancer family uses it).
    this.mode = 'stalk';
    this.modeTimer = 0;
    this.lockTimer = 0; // cooldown before the next lock-on
    this.chargeDirX = 0;
    this.chargeDirY = 0;
    this.lockX = 0; // the point the telegraph line is drawn toward
    this.lockY = 0;
    this.dead = false;
    this.reachedCore = false;
  }

  targetFor(game) {
    if (this.def.seek === 'player') return game.player;
    if (this.def.seek === 'both') {
      const nearPlayer = Math.hypot(game.player.x - this.x, game.player.y - this.y) < 240;
      return nearPlayer ? game.player : game.core;
    }
    return game.core; // 'core' and 'orbit' both home on the star
  }

  // The lancer's hunt, in four beats: stalk the guardian, lock on
  // with a flashing telegraph the player can read and dodge, spear
  // straight through the locked line, then drift while it recovers.
  updateLancer(dt, game) {
    const speedScale = game.slowmo > 0 ? 0.45 : 1;
    const player = game.player;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.lockTimer = Math.max(0, this.lockTimer - dt);

    if (this.mode === 'stalk') {
      this.vx = (dx / dist) * this.def.speed * speedScale;
      this.vy = (dy / dist) * this.def.speed * speedScale;
      if (dist < LANCER.stalkRange && this.lockTimer <= 0) {
        this.mode = 'telegraph';
        this.modeTimer = LANCER.telegraphTime;
      }
    } else if (this.mode === 'telegraph') {
      // It hangs almost still, shivering, while the lock line tracks
      // the guardian — the dodge window is the whole point.
      this.vx *= 0.8;
      this.vy *= 0.8;
      this.lockX = player.x;
      this.lockY = player.y;
      this.modeTimer -= dt;
      if (this.modeTimer <= 0) {
        this.chargeDirX = dx / dist;
        this.chargeDirY = dy / dist;
        this.mode = 'charge';
        this.modeTimer = LANCER.chargeTime;
      }
    } else if (this.mode === 'charge') {
      this.vx = this.chargeDirX * LANCER.chargeSpeed * speedScale;
      this.vy = this.chargeDirY * LANCER.chargeSpeed * speedScale;
      this.modeTimer -= dt;
      if (this.modeTimer <= 0) {
        this.mode = 'recover';
        this.modeTimer = LANCER.recoverTime;
        this.lockTimer = LANCER.lockCooldown;
      }
    } else {
      // Recover: a slow drift on its last heading while vulnerable.
      this.vx *= Math.max(0, 1 - 2.4 * dt);
      this.vy *= Math.max(0, 1 - 2.4 * dt);
      this.modeTimer -= dt;
      if (this.modeTimer <= 0) this.mode = 'stalk';
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  update(dt, game, time) {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.rotation += this.spin * dt;
    if (this.type === 'lancer') {
      this.updateLancer(dt, game);
      return;
    }
    const target = this.targetFor(game);
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    let steerX = dx / dist;
    let steerY = dy / dist;

    if (this.type === 'herald') {
      // The Herald closes to an orbit lane, circles the star, and
      // rains orbs and shards while it circles.
      const orbitRadius = 265;
      if (dist > orbitRadius + 12) {
        // approach the core
      } else if (dist < orbitRadius - 12) {
        steerX = -steerX;
        steerY = -steerY;
      } else {
        steerX = (-dy / dist) * this.orbitDir;
        steerY = (dx / dist) * this.orbitDir;
      }
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = 2.1;
        game.spawnHeraldOrbs(this);
      }
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 4.2;
        game.spawnHeraldShards(this);
      }
    } else {
      // Wobble: a perpendicular sine makes paths feel alive and
      // keeps straight-line dodging from solving every family.
      const wobble = Math.sin(time * 2.2 + this.phase) * this.def.wobble * 0.24;
      const perpX = -steerY;
      const perpY = steerX;
      steerX += perpX * wobble;
      steerY += perpY * wobble;
      const len = Math.hypot(steerX, steerY) || 1;
      steerX /= len;
      steerY /= len;
    }

    const speed = this.def.speed * (game.slowmo > 0 ? 0.45 : 1);
    this.vx = steerX * speed;
    this.vy = steerY * speed;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  draw(ctx, time) {
    const { color } = this.def;
    // The lancer's telegraph: a dashed magenta lock line to the
    // guardian, drawn under everything else so it reads as a warning.
    if (this.type === 'lancer' && this.mode === 'telegraph') {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(time * 26);
      ctx.lineWidth = 1.6;
      ctx.setLineDash([9, 7]);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.lockX, this.lockY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    drawGlow(ctx, color, this.x, this.y, this.radius * 4.6, 0.4);
    ctx.save();
    ctx.translate(this.x, this.y);
    let facing;
    if (this.type === 'herald' || this.type === 'bulwark') facing = this.rotation;
    else if (this.type === 'lancer' && this.mode === 'telegraph') facing = Math.atan2(this.lockY - this.y, this.lockX - this.x);
    else if (this.type === 'lancer' && this.mode === 'charge') facing = Math.atan2(this.chargeDirY, this.chargeDirX);
    else facing = Math.atan2(this.vy, this.vx);
    ctx.rotate(facing);
    const flash = this.hitFlash > 0 || (this.type === 'lancer' && this.mode === 'telegraph' && Math.sin(time * 30) > 0.2);
    ctx.fillStyle = flash ? '#ffffff' : color;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.2;
    const r = this.radius;
    ctx.beginPath();
    if (this.type === 'shard' || this.type === 'mini') {
      // Jagged tri-shard.
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.8, -r * 0.72);
      ctx.lineTo(-r * 0.35, 0);
      ctx.lineTo(-r * 0.8, r * 0.72);
      ctx.closePath();
    } else if (this.type === 'darter') {
      // Needle dart.
      ctx.moveTo(r * 1.25, 0);
      ctx.lineTo(-r, -r * 0.55);
      ctx.lineTo(-r * 0.55, 0);
      ctx.lineTo(-r, r * 0.55);
      ctx.closePath();
    } else if (this.type === 'lancer') {
      // A long spearhead with swept fins; mid-charge it stretches.
      const stretch = this.mode === 'charge' ? 1.45 : 1;
      ctx.moveTo(r * 1.9 * stretch, 0);
      ctx.lineTo(r * 0.2, -r * 0.42);
      ctx.lineTo(-r * 0.9, -r * 0.95);
      ctx.lineTo(-r * 0.45, 0);
      ctx.lineTo(-r * 0.9, r * 0.95);
      ctx.lineTo(r * 0.2, r * 0.42);
      ctx.closePath();
    } else if (this.type === 'weaver') {
      // Diamond with a hollow heart.
      ctx.moveTo(r, 0);
      ctx.lineTo(0, -r);
      ctx.lineTo(-r, 0);
      ctx.lineTo(0, r);
      ctx.closePath();
    } else if (this.type === 'splitter') {
      // Cluster orb: three fused circles read as one lumpy mass.
      for (const [ox, oy, orad] of [[0, 0, r * 0.72], [-r * 0.55, r * 0.3, r * 0.45], [r * 0.5, -r * 0.35, r * 0.5]]) {
        ctx.moveTo(ox + orad, oy);
        ctx.arc(ox, oy, orad, 0, Math.PI * 2);
      }
    } else if (this.type === 'bulwark') {
      // Heavy hexagon with an inner rotating plate.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
    } else if (this.type === 'herald') {
      // The Void Herald: a great spoked wheel around a burning eye.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    if (this.type === 'weaver') {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = flash ? '#ffffff' : '#2a1050';
      ctx.fill();
    }
    if (this.type === 'herald') {
      ctx.rotate(-this.rotation * 2.2);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
        else ctx.lineTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
      }
      ctx.closePath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
    // Inner burning heart on every family.
    drawOrb(ctx, color, this.x, this.y, Math.max(2.5, this.radius * 0.22), '#ffffff');
    // Damage arc for the heavies.
    if ((this.type === 'bulwark' || this.type === 'herald') && this.hp < this.maxHp) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 9, -Math.PI / 2, -Math.PI / 2 + (this.hp / this.maxHp) * Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
}

export class Pickup {
  constructor(kind, x, y) {
    this.kind = kind;
    this.def = PICKUP_KINDS[kind];
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.age = 0;
    this.life = 11; // seconds before it fades
    this.radius = 13;
    this.dead = false;
  }

  update(dt, player) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 110 && dist > 1) {
      // Magnet drift toward the guardian.
      const pull = 260 * (1 - dist / 110) + 40;
      this.vx += (dx / dist) * pull * dt * 4;
      this.vy += (dy / dist) * pull * dt * 4;
    }
    this.vx *= Math.max(0, 1 - 3 * dt);
    this.vy *= Math.max(0, 1 - 3 * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  draw(ctx, time) {
    const bob = Math.sin(time * 3 + this.x) * 3;
    const y = this.y + bob;
    const blink = this.life < 3 ? (Math.sin(time * 14) > 0 ? 1 : 0.25) : 1;
    ctx.save();
    ctx.globalAlpha = blink;
    drawGlow(ctx, this.def.color, this.x, y, 62, 0.65);
    ctx.beginPath();
    ctx.arc(this.x, y, this.radius + 4 + Math.sin(time * 4) * 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = this.def.color;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = this.def.color;
    ctx.strokeStyle = this.def.color;
    if (this.kind === 'repair') {
      ctx.fillRect(this.x - 2.5, y - 8, 5, 16);
      ctx.fillRect(this.x - 8, y - 2.5, 16, 5);
    } else if (this.kind === 'overdrive') {
      ctx.beginPath();
      ctx.moveTo(2, -10);
      ctx.lineTo(-5, 2);
      ctx.lineTo(0, 2);
      ctx.lineTo(-2, 10);
      ctx.lineTo(6, -2);
      ctx.lineTo(1, -2);
      ctx.closePath();
      ctx.fill();
    } else if (this.kind === 'scatter') {
      // A three-pronged fan: the cannon's spread, drawn as its icon.
      for (const a of [-0.5, 0, 0.5]) {
        const tipX = this.x + Math.sin(a) * 10;
        const tipY = y - Math.cos(a) * 10;
        ctx.beginPath();
        ctx.moveTo(this.x, y + 6);
        ctx.lineTo(tipX, tipY);
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(tipX, tipY, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.kind === 'nova') {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rad = i % 2 === 0 ? 10 : 4;
        const px = this.x + Math.cos(a) * rad;
        const py = y + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    } else if (this.kind === 'aegis') {
      ctx.beginPath();
      ctx.moveTo(this.x, y - 10);
      ctx.lineTo(this.x + 8, y - 6);
      ctx.lineTo(this.x + 8, y + 3);
      ctx.quadraticCurveTo(this.x + 8, y + 9, this.x, y + 11);
      ctx.quadraticCurveTo(this.x - 8, y + 9, this.x - 8, y + 3);
      ctx.lineTo(this.x - 8, y - 6);
      ctx.closePath();
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }
    ctx.restore();
  }
}
