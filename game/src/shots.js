// Screenshot staging. The kit's own entries take their screenshots
// from staged scenes (?shot=<scene>&seed=<n>), and this module does
// the same for Lastlight Aegis: each scene is assembled from the
// game's real state and then played forward with a scripted pilot
// for a few seconds, so bullets, explosions and HUD values in the
// frame are the game's own — nothing is painted or composited.
// After staging, the simulation freezes on the composed frame.

import { VIEW, createRng } from './config.js';
import { Enemy, Pickup } from './entities.js';

const STEP = 1 / 60;

function reseed(game, seed) {
  game.rng = createRng(seed * 7919 + 13);
  game.particles.rng = game.rng;
  game.director.rng = game.rng;
}

function place(game, type, x, y, hp = null) {
  const enemy = new Enemy(type, x, y, game.rng, 1);
  if (hp !== null) enemy.hp = hp;
  game.enemies.push(enemy);
  return enemy;
}

// A tireless stand-in pilot: tracks the nearest enemy with the
// mouse, holds fire, and strafes slowly so trails and muzzle
// flashes appear naturally during the staged seconds.
function scriptedPilot(game) {
  let nearest = null;
  let best = Infinity;
  for (const enemy of game.enemies) {
    const d = (enemy.x - game.player.x) ** 2 + (enemy.y - game.player.y) ** 2;
    if (d < best) {
      best = d;
      nearest = enemy;
    }
  }
  if (nearest) {
    game.input.mouseX = nearest.x;
    game.input.mouseY = nearest.y;
  }
  game.input.mouseDown = true;
  game.input.keys.clear();
  game.input.keys.add(Math.floor(game.time * 0.7) % 2 === 0 ? 'KeyA' : 'KeyD');
}

function runSteps(game, steps, pilot = false) {
  for (let i = 0; i < steps; i++) {
    if (pilot) scriptedPilot(game);
    game.update(STEP);
  }
  game.input.mouseDown = false;
  game.input.keys.clear();
}

// A lancer caught mid-telegraph, its dashed lock line drawn on the
// guardian: placed after the staged seconds so the composed frame
// keeps the warning exactly as a player would read it.
function placeTelegraphingLancer(game, x, y) {
  const lancer = place(game, 'lancer', x, y);
  lancer.mode = 'telegraph';
  lancer.modeTimer = 0.5;
  lancer.lockX = game.player.x;
  lancer.lockY = game.player.y;
  return lancer;
}

function stageTitle(game) {
  game.state = 'title';
  runSteps(game, 240); // let the attract orbit and drifting shards settle
}

function stageBattle(game, seed) {
  game.resetRun();
  game.state = 'playing';
  game.director.wave = 6;
  game.director.buildWave(6);
  game.director.queue = game.director.queue.slice(0, 5); // still mid-wave
  game.player.x = 402;
  game.player.y = 566;
  game.player.hull = 76;
  game.player.invulnerable = 0;
  game.core.hp = 212;
  game.score = 12480;
  game.combo = 21;
  game.comboTimer = 2.4;
  game.bombs = 2;
  game.overdriveT = 5.5;
  game.scatterT = 6.5; // the fan cannon is live: HUD line and bolt fan
  game.stats.kills = 96;
  game.stats.shots = 402;
  game.stats.hits = 301;
  game.stats.timePlayed = 386;
  place(game, 'shard', 872, 190);
  place(game, 'shard', 958, 300);
  place(game, 'shard', 210, 168);
  place(game, 'darter', 1050, 520);
  place(game, 'darter', 300, 640);
  place(game, 'weaver', 700, 120, 2);
  place(game, 'weaver', 150, 430);
  place(game, 'splitter', 1010, 120);
  place(game, 'bulwark', 880, 620);
  place(game, 'lancer', 560, 210);
  game.pickups.push(new Pickup('scatter', 742, 618));
  game.pickups.push(new Pickup('repair', 262, 318));
  game.player.invulnerable = 999; // the stand-in pilot must survive its own scene
  runSteps(game, 150, true);
  game.player.invulnerable = 0;
  game.player.hull = 76;
  game.core.hp = 212;
  game.scatterT = 6;
  placeTelegraphingLancer(game, 935, 415);
  game.banner = null;
}

function stageBoss(game) {
  game.resetRun();
  game.state = 'playing';
  game.director.wave = 10;
  game.director.buildWave(10);
  game.director.queue = game.director.queue.slice(0, 4);
  // The queue's first slot is the Herald itself; the staged Herald
  // below is the only one this scene fields.
  game.director.queue = game.director.queue.filter((type) => type !== 'herald');
  game.enemies = game.enemies.filter(() => false);
  const herald = place(game, 'herald', 768, 205);
  herald.hp = 102;
  place(game, 'shard', 240, 150);
  place(game, 'shard', 1080, 180);
  place(game, 'mini', 700, 300);
  place(game, 'mini', 830, 290);
  place(game, 'darter', 1050, 430);
  place(game, 'lancer', 330, 560);
  game.pickups.push(new Pickup('aegis', 452, 196));
  game.player.x = 548;
  game.player.y = 606;
  game.player.hull = 58;
  game.core.hp = 164;
  game.score = 28750;
  game.combo = 34;
  game.comboTimer = 2.6;
  game.bombs = 1;
  game.scatterT = 5;
  game.stats.kills = 178;
  game.stats.shots = 655;
  game.stats.hits = 470;
  game.stats.timePlayed = 701;
  game.player.invulnerable = 999;
  runSteps(game, 100, true);
  game.player.invulnerable = 0;
  game.player.hull = 58;
  game.core.hp = 164;
  game.scatterT = 5;
  placeTelegraphingLancer(game, 985, 585);
  // The Herald orbited during the staged seconds; compose it clear
  // of the banner for the frozen frame.
  herald.x = 852;
  herald.y = 322;
  herald.hp = 96; // the boss health arc reads mid-fight
  // Set the banner after the sim: its fade is driven by time left.
  game.showBanner('THE VOID HERALD', 'Break the Herald and the night ends', 2.3);
}

function stageVictory(game) {
  game.resetRun();
  game.state = 'victory';
  game.newBest = true; // a first clear in a fresh profile is a best
  game.score = 31420;
  game.core.hp = 96;
  game.stats.kills = 212;
  game.stats.shots = 688;
  game.stats.hits = 502;
  game.stats.timePlayed = 754;
  game.stats.wavesCleared = 10;
  game.player.x = 988;
  game.player.y = 566;
  game.player.angle = -2.25;
  runSteps(game, 110); // celebration embers rise around the star
}

export function stageShot(game, kind, seed = 1) {
  reseed(game, seed);
  if (kind === 'battle') stageBattle(game, seed);
  else if (kind === 'boss') stageBoss(game);
  else if (kind === 'victory') stageVictory(game);
  else stageTitle(game);
  game.frozen = true;
}
