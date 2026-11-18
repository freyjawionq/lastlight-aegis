// Reproducible baseline-vs-candidate demonstration for moving-target
// collision. Run from the repo root with:
//   node tests/demo-moving-target-baseline-vs-candidate.mjs
//
// Baseline is commit 1b4870b: sweep the bolt segment against the enemy's
// final position. Candidate sweeps bolt-minus-enemy relative motion.

const gradient = { addColorStop() {} };
function makeCtxStub() {
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
const canvas = makeCanvasStub();
globalThis.window = { addEventListener() {} };
globalThis.document = { createElement: () => makeCanvasStub() };

const { Game } = await import('../game/src/game.js');
const { Bullet, Enemy, sweptSegmentCircle } = await import('../game/src/entities.js');
const { createRng } = await import('../game/src/config.js');

const game = new Game(canvas);
const enemy = new Enemy('mini', 108, 110.5, createRng(1234), 1);
const bullet = new Bullet(100, 100, 0);
enemy.update(0.05, game, 0);
bullet.update(0.05);
const reach = bullet.radius + enemy.radius;
const baselineT = sweptSegmentCircle(
  bullet.prevX, bullet.prevY, bullet.x, bullet.y,
  enemy.x, enemy.y, reach,
);
const candidateT = sweptSegmentCircle(
  bullet.prevX - enemy.prevX, bullet.prevY - enemy.prevY,
  bullet.x - enemy.x, bullet.y - enemy.y,
  0, 0, reach,
);

if (baselineT !== null) throw new Error(`Expected baseline miss, got t=${baselineT}`);
if (candidateT === null) throw new Error('Expected relative-motion candidate hit');

game.bullets = [bullet];
game.enemies = [enemy];
game.resolveCollisions();
if (game.stats.hits !== 1 || !enemy.dead || !bullet.dead) {
  throw new Error('Game.resolveCollisions did not apply exactly one moving-target hit');
}

console.log(`baseline 1b4870b (bolt sweep vs final enemy point): MISS`);
console.log(`candidate (relative swept motion): HIT at t=${candidateT.toFixed(6)}`);
console.log(`mini: (${enemy.prevX}, ${enemy.prevY}) -> (${enemy.x.toFixed(3)}, ${enemy.y.toFixed(3)})`);
console.log(`bolt: (${bullet.prevX}, ${bullet.prevY}) -> (${bullet.x.toFixed(3)}, ${bullet.y.toFixed(3)}) after impact`);
console.log(`integration: ${game.stats.hits} hit, enemy dead=${enemy.dead}, bolt dead=${bullet.dead}`);
