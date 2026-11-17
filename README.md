# Lastlight Aegis

An original neon arena-defense game for make.fun's **best-game-01** ("Make the best game").

The last star in the dark still burns, and the void is coming for it. You are its
guardian: a lone light-ship holding orbit while wave after wave of void-spawn —
shards, darters, weavers, splitters, lancers and bulwarks — spiral in to drink
the core. Survive ten waves and break the Void Herald, or the light goes out.

## Play

Open `game/index.html` in a desktop browser (any static host works; the game
makes no network requests), or run it locally:

```
node serve.ts          # then open http://localhost:8080
```

| Action | Input |
| --- | --- |
| Move | WASD / arrow keys |
| Aim & fire | Mouse, hold to shoot |
| Dash (briefly untouchable) | Shift / Space |
| Nova bomb (clears the sky) | Right-click / E |
| Pause / mute | P / M |

Chain kills to raise the combo multiplier — milestones flare as STARFIRE,
SUPERNOVA and LASTLIGHT — catch repair, overdrive, scatter-cannon, nova and
aegis pickups, dodge the lancer's telegraphed spear-charge, and weather the
mid-wave VOID SURGE when the dark doubles its hunger. Clearing wave 10 wins
the game; an endless night follows for score.

## Layout

- `game/` — the game itself: plain static files, no build step, no libraries.
  - `game/src/config.js` — all tuning, palette and enemy definitions
  - `game/src/game.js` — state machine, collisions, HUD and screens
  - `game/src/entities.js` — guardian, bolts, enemy families, pickups
  - `game/src/waves.js` — wave composition and spawning
  - `game/src/particles.js`, `background.js`, `sprites.js` — the light work
  - `game/src/audio.js` — fully synthesised WebAudio sound, zero assets
  - `game/src/input.js`, `main.js` — controls and bootstrap
  - `game/src/shots.js` — staged scenes used to take the screenshots
- `screenshots/` — real renders of the game, taken from the staged scenes
  (`?shot=title|battle|boss|victory&seed=1`)
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json` via `vendor/makefun-game.ts`
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged

## License

MIT (see `LICENSE`).
