# Swept bullet collision — review & evidence log

Change made under the one-editor lock recorded 2026-11-18 15:27 WIB
(Evernote workflow "Agent Workflow — Make.fun Bounty Team"): sole
editor Muse/Kaname, baseline commit
`e2195d985c745db668c0e871106128b5770cb920`, scope limited to the
bullet-vs-enemy collision path. No Make.fun access or submission is
part of this change.

## The defect (verified in baseline code)

- `game/src/main.js` caps `dt` at 0.05 s; `PLAYER.bulletSpeed` is
  760 px/s (`game/src/config.js`), so one step moves a bolt 38 px.
- The smallest enemy, the mini, has radius 8; the bolt radius is 4.
  Combined reach 12 px, combined diameter 24 px < 38 px step.
- Baseline `Game.resolveCollisions` tested only the bolt's endpoint
  after the step, in enemy array order. A bolt could therefore jump
  clean over a mini it crossed mid-step (tunnelling), and when the
  endpoint overlapped a farther enemy listed earlier, that enemy took
  the hit instead of the nearer one the bolt met first.

## The fix

- `Bullet` now records `prevX/prevY` (position at step start) in
  `game/src/entities.js`, and exports the pure helper
  `sweptSegmentCircle(x0, y0, x1, y1, cx, cy, reach)`, which returns
  the earliest contact parameter `t` of the swept segment against a
  circle expanded by the bolt radius, or `null`.
- `Game.resolveCollisions` (`game/src/game.js`) sweeps prev -> current
  for every bolt/enemy pair (with a segment-bounding-box cheap reject),
  applies the hit to the earliest contact only, and parks the bolt at
  the contact point so impact particles originate where the hit
  happened. Everything else — damage, scoring, kill handling, the
  enemy-vs-core/player and orb/pickup sections — is unchanged.

## Evidence (2026-11-18, Node v24.22.1)

Commands, run from the repo root:

```
node --test tests/collision.test.mjs
node tests/demo-baseline-vs-candidate.mjs
node --check game/src/*.js tests/*.mjs        # parse sweep
```

Results:

- Test suite: **9 pass / 0 fail** — 5 unit tests of
  `sweptSegmentCircle` (max-dt tunnelling geometry, small-enemy
  graze/miss/tangent, earliest-t ordering, start-inside and endpoint
  parity, moving-away/stationary) and 4 integration tests through the
  real `Bullet.update` + `Game.resolveCollisions` (tunnelled mini is
  killed and the bolt parks at contact x=107; earliest hit beats list
  order — the 114 mini dies, the 130 mini keeps hp 1, exactly 1 hit;
  a normal 60 fps step still damages a shard exactly as baseline; a
  clean miss stays a miss).
- Baseline-vs-candidate demo (pure geometry, reproducible):
  tunnelling case baseline **miss** / candidate **HIT (t=0.184)**;
  earliest case baseline miss on the near mini / candidate HIT
  (t=0.053); endpoint-overlap and shard parity cases HIT under both;
  clean miss under both.
- Headless full-loop smoke (throwaway harness, not committed): 1,800
  frames at dt=1/60 and 600 frames at dt=0.05 with scripted aim —
  no exceptions, shots 200 / hits 15 / kills 7 (60 fps) and shots 200
  / hits 7 / kills 3 (max dt), hits never exceed shots; all four
  staged screenshot scenes (`title`, `battle`, `boss`, `victory`)
  still stage without error.
- Parse sweep: all 11 game modules + both test files parse clean.

What this does **not** show: any official make.fun score change.
The entry's scored submission is untouched; this commit is a repo
improvement backed by the tests above, nothing more.


## Follow-up: moving-target collision — 2026-11-18

### Defect reproduced against baseline `1b4870b1e5b03cc4dd59e734a6d89471919f3361`

The swept collision added in the prior fix moved only the bolt along its frame segment and treated each enemy as stationary at its **end-of-frame** position. Enemies also move during the same capped `dt=0.05 s` step, so a mini can cross the bolt's collision corridor and end outside it. A mini moves at 118 px/s (up to 5.9 px per capped step); the bolt moves 38 px; their combined collision reach is 12 px.

Deterministic reproduction: a mini starts at `(108, 110.5)` and updates toward the core to `(112.709, 114.055)` while the bolt travels from `(100, 100)` toward `(138, 100)`. The baseline sweep against the mini's final position misses (vertical gap 14.055 px > 12 px), while the relative-motion sweep hits at `t=0.082843`. The real integration test runs both `Enemy.update` and `Bullet.update`, then calls `Game.resolveCollisions`.

### Focused fix

`Enemy` now stores `prevX/prevY` immediately before each update. Collision sweeps the segment of `bolt position - enemy position` against a radius-`bolt+enemy` circle at the origin; the bounding-box quick reject is performed in that same relative coordinate space. Earliest-contact selection, damage, scoring, and impact placement remain unchanged.

### Verification

- `node --test tests/collision.test.mjs`: **10 pass / 0 fail** (the previous nine collision tests plus the moving-mini regression).
- `node tests/demo-moving-target-baseline-vs-candidate.mjs`: baseline **MISS**, relative-motion candidate **HIT at t=0.082843**, integration records exactly one hit and kills the mini.
- `node --check` over all `game/src/*.js` and `tests/*.mjs`: passed.
- No Make.fun entry was accessed or changed; no payment was made.

Commit and independent review status will be recorded after the push under the current one-editor lock.


Additional headless full-loop smoke after the follow-up fix (throwaway Node harness, no rendering): 1,800 frames at `dt=1/60` completed with 200 shots / 8 hits / 3 kills; 600 frames at `dt=0.05` completed with 200 shots / 3 hits / 2 kills. Both runs remained in wave 2 without exceptions, and hits never exceeded shots.
