// Reproducible baseline-vs-candidate demonstration for the swept
// bullet collision. Run with:  node tests/demo-baseline-vs-candidate.mjs
//
// Baseline = endpoint-only test from commit e2195d9 (bolt position
// after the step vs enemy circle). Candidate = sweptSegmentCircle
// over the whole step segment, earliest contact. Pure geometry, no
// DOM: the same scenarios are asserted end-to-end (real Bullet +
// Game.resolveCollisions) in tests/collision.test.mjs.

const { sweptSegmentCircle } = await import('../game/src/entities.js');

function endpointHit(bx, by, ex, ey, reach) {
  if (Math.abs(bx - ex) > reach || Math.abs(by - ey) > reach) return false;
  return (bx - ex) ** 2 + (by - ey) ** 2 <= reach * reach;
}

// One bolt step at the dt cap: (100, 100) -> (138, 100), reach 12
// (bolt 4 + mini 8) unless a scenario says otherwise.
const scenarios = [
  ['tunnelling: mini at step centre (119,100)', 119, 100, 12],
  ['earliest: mini at (114,100) before mini at (130,100)', 114, 100, 12],
  ['endpoint overlap: mini at (130,100)', 130, 100, 12],
  ['graze inside reach: mini at (119,111)', 119, 111, 12],
  ['clean miss: mini at (119,130)', 119, 130, 12],
  ['endpoint hit parity: shard at (140,100), reach 19', 140, 100, 19],
];

console.log('bolt step (100,100) -> (138,100), one 0.05 s step at 760 px/s');
for (const [label, ex, ey, reach] of scenarios) {
  const base = endpointHit(138, 100, ex, ey, reach) ? 'HIT ' : 'miss';
  const t = sweptSegmentCircle(100, 100, 138, 100, ex, ey, reach);
  const cand = t === null ? 'miss' : `HIT  (t=${t.toFixed(3)}, contact x=${(100 + 38 * t).toFixed(1)})`;
  console.log(`  ${label}\n    baseline endpoint-only: ${base}   candidate swept: ${cand}`);
}
