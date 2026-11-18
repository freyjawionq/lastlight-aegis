// Regression tests for the swept bullet collision (one-editor lock,
// 2026-11-18). Run with:  node --test tests/collision.test.mjs
//
// Baseline under comparison: the pre-change resolveCollisions in
// commit e2195d9 tested ONLY the bolt's endpoint against each enemy
// circle, in array order. That predicate is reproduced here verbatim
// in spirit (endpointHit) so the baseline-vs-candidate difference is
// demonstrated by the suite itself, reproducibly.
//
// Geometry used throughout: bolt speed 760 px/s (config PLAYER.
// bulletSpeed), dt cap 0.05 s (main.js) -> one step is 38 px. The
// smallest enemy is the mini: radius 8 (config ENEMY_TYPES.mini);
// bolt radius 4 -> combined reach 12 px, combined diameter 24 px.
// A 38 px step can therefore jump clean over a mini.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// The Game class wires DOM listeners in its constructor (Input) and
// pre-renders a nebula to an offscreen canvas (Background); stub just
// enough of the window/document/canvas for headless construction.
// The 2D context is a no-op proxy: every method call is accepted,
// gradients return an object with addColorStop, property sets stick.
function makeCtxStub() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === 'measureText') return () => ({ width: 0 });
      return () => {};
    },
    set() { return true; },
  });
}
function makeCanvasStub() {
  return { width: 0, height: 0, getContext: () => makeCtxStub(), addEventListener() {} };
}
globalThis.window = { addEventListener() {} };
globalThis.document = { createElement: () => makeCanvasStub() };
const canvasStub = makeCanvasStub();

const { Game } = await import('../game/src/game.js');
const { Bullet, Enemy, sweptSegmentCircle } = await import('../game/src/entities.js');
const { createRng } = await import('../game/src/config.js');

const STEP = 38; // 760 px/s * 0.05 s
const REACH_MINI = 12; // bolt 4 + mini 8

// The baseline (e2195d9) endpoint-only predicate.
function endpointHit(bx, by, ex, ey, reach) {
  if (Math.abs(bx - ex) > reach || Math.abs(by - ey) > reach) return false;
  return (bx - ex) ** 2 + (by - ey) ** 2 <= reach * reach;
}

function makeGame() {
  const game = new Game(canvasStub);
  game.enemies = [];
  game.bullets = [];
  game.orbs = [];
  game.pickups = [];
  return game;
}

function miniAt(x, y) {
  return new Enemy('mini', x, y, createRng(1234), 1);
}

// ---- unit: sweptSegmentCircle -------------------------------------

test('unit: max-dt step tunnels past a mini for the endpoint, swept hits', () => {
  // Mini dead centre of the step: both endpoints are 19 px away (> 12).
  assert.equal(endpointHit(0, 0, 19, 0, REACH_MINI), false);
  assert.equal(endpointHit(STEP, 0, 19, 0, REACH_MINI), false);
  const t = sweptSegmentCircle(0, 0, STEP, 0, 19, 0, REACH_MINI);
  assert.notEqual(t, null);
  assert.ok(Math.abs(t - 7 / STEP) < 1e-9, `t=${t}, want ${7 / STEP}`);
});

test('unit: small enemy, perpendicular graze inside reach hits, outside misses', () => {
  assert.notEqual(sweptSegmentCircle(0, 0, STEP, 0, 19, 11, REACH_MINI), null);
  assert.equal(sweptSegmentCircle(0, 0, STEP, 0, 19, 13, REACH_MINI), null);
  // Exact tangent (distance == reach) still counts as contact.
  assert.equal(sweptSegmentCircle(0, 0, STEP, 0, 19, 12, REACH_MINI), 0.5);
});

test('unit: earliest contact is the smaller t, regardless of list order', () => {
  const near = sweptSegmentCircle(0, 0, STEP, 0, 16, 0, REACH_MINI);
  const far = sweptSegmentCircle(0, 0, STEP, 0, 30, 0, REACH_MINI);
  assert.ok(Math.abs(near - 4 / STEP) < 1e-9, `near t=${near}`);
  assert.ok(Math.abs(far - 18 / STEP) < 1e-9, `far t=${far}`);
  assert.ok(near < far);
});

test('unit: start inside reach is t=0; endpoint hit keeps parity', () => {
  assert.equal(sweptSegmentCircle(0, 0, STEP, 0, 5, 0, REACH_MINI), 0);
  const t = sweptSegmentCircle(0, 0, STEP, 0, 40, 0, REACH_MINI);
  assert.ok(Math.abs(t - 28 / STEP) < 1e-9, `t=${t}`);
  assert.equal(endpointHit(STEP, 0, 40, 0, REACH_MINI), true); // baseline also hits here
});

test('unit: moving away and stationary-outside are misses', () => {
  assert.equal(sweptSegmentCircle(0, 0, -STEP, 0, 19, 0, REACH_MINI), null);
  assert.equal(sweptSegmentCircle(0, 0, 0, 0, 19, 0, REACH_MINI), null);
  assert.equal(sweptSegmentCircle(0, 0, 0, 0, 5, 0, REACH_MINI), 0);
});

// ---- integration: the real Bullet.update + Game.resolveCollisions --

test('integration: a max-dt bolt kills the mini it tunnels through', () => {
  const game = makeGame();
  const enemy = miniAt(119, 100);
  const bullet = new Bullet(100, 100, 0);
  bullet.update(0.05); // endpoint lands at x=138, 19 px past the centre
  assert.equal(endpointHit(bullet.x, bullet.y, enemy.x, enemy.y, REACH_MINI), false); // baseline misses
  game.bullets = [bullet];
  game.enemies = [enemy];
  game.resolveCollisions();
  assert.equal(enemy.dead, true);
  assert.equal(bullet.dead, true);
  assert.equal(game.stats.hits, 1);
  // The bolt is parked at the contact point (119 - 12), not past it.
  assert.ok(Math.abs(bullet.x - 107) < 1e-9, `bullet.x=${bullet.x}`);
});

test('integration: earliest hit wins over enemy list order', () => {
  const game = makeGame();
  const farFirst = miniAt(130, 100); // listed first, contacted second
  const nearSecond = miniAt(114, 100); // listed second, contacted first
  const bullet = new Bullet(100, 100, 0);
  bullet.update(0.05);
  // The baseline would have hit farFirst: its endpoint overlaps it
  // (138 vs 130 -> 8 <= 12) and it comes first in the array, while
  // the nearer mini is never touched. The sweep must invert that.
  assert.equal(endpointHit(bullet.x, bullet.y, farFirst.x, farFirst.y, REACH_MINI), true);
  game.bullets = [bullet];
  game.enemies = [farFirst, nearSecond];
  game.resolveCollisions();
  assert.equal(nearSecond.dead, true);
  assert.equal(farFirst.dead, false);
  assert.equal(farFirst.hp, 1);
  assert.equal(game.stats.hits, 1); // one bolt, one hit — no double-count
  assert.ok(Math.abs(bullet.x - 102) < 1e-9, `bullet.x=${bullet.x}`);
});

test('integration: normal 60 fps step still hits (no regression)', () => {
  const game = makeGame();
  const shard = new Enemy('shard', 112, 100, createRng(77), 1); // hp 2, radius 15
  const bullet = new Bullet(100, 100, 0);
  bullet.update(1 / 60); // 12.67 px step, endpoint inside reach 19
  assert.equal(endpointHit(bullet.x, bullet.y, shard.x, shard.y, 4 + 15), true); // baseline hits too
  game.bullets = [bullet];
  game.enemies = [shard];
  game.resolveCollisions();
  assert.equal(shard.hp, 1); // damaged, not killed — same as baseline
  assert.equal(shard.dead, false);
  assert.equal(game.stats.hits, 1);
});

test('integration: a clean miss stays a miss', () => {
  const game = makeGame();
  const enemy = miniAt(119, 130); // 30 px off the bolt line, reach 12
  const bullet = new Bullet(100, 100, 0);
  bullet.update(0.05);
  game.bullets = [bullet];
  game.enemies = [enemy];
  game.resolveCollisions();
  assert.equal(enemy.hp, 1);
  assert.equal(enemy.dead, false);
  assert.equal(bullet.dead, false);
  assert.equal(game.stats.hits, 0);
});

test('integration: a moving mini crossing the bolt path is hit', () => {
  const game = makeGame();
  const enemy = miniAt(108, 110.5);
  const bullet = new Bullet(100, 100, 0);
  enemy.update(0.05, game, 0);
  bullet.update(0.05);

  // Baseline at 1b4870b swept the bolt against the enemy's final
  // position as if the target had stood still; its 14.05 px offset
  // exceeds the 12 px combined reach, so it misses this real crossing.
  const baselineT = sweptSegmentCircle(
    bullet.prevX, bullet.prevY, bullet.x, bullet.y,
    enemy.x, enemy.y, bullet.radius + enemy.radius,
  );
  assert.equal(baselineT, null);
  const candidateT = sweptSegmentCircle(
    bullet.prevX - enemy.prevX, bullet.prevY - enemy.prevY,
    bullet.x - enemy.x, bullet.y - enemy.y,
    0, 0, bullet.radius + enemy.radius,
  );
  assert.notEqual(candidateT, null);

  game.bullets = [bullet];
  game.enemies = [enemy];
  game.resolveCollisions();
  assert.equal(enemy.dead, true);
  assert.equal(bullet.dead, true);
  assert.equal(game.stats.hits, 1);
  assert.ok(bullet.x > bullet.prevX && bullet.x < bullet.x + (bullet.vx * 0.05));
});
