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
