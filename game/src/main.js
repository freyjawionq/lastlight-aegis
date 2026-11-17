// Bootstrap: find the canvas, build the Game, run the frame loop.
// A ?shot=<scene> query stages a frozen screenshot scene instead of
// live play (see shots.js); anything else starts at the title.

import { Game } from './game.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);

const params = new URLSearchParams(window.location.search);
if (params.has('shot')) {
  stageShot(game, params.get('shot'), Number(params.get('seed') || 1));
}

// Audio may only start after a user gesture; the title screen's own
// click handler also unlocks, this covers keyboard-first players.
window.addEventListener('pointerdown', () => game.sound.unlock());
window.addEventListener('keydown', () => game.sound.unlock());

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!game.frozen) game.update(dt);
  game.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// A handle for headless play-tests and debugging.
window.__lastlight = game;
