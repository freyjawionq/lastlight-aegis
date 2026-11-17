// Lastlight Aegis — the hand-in program for make.fun's best-game-01.
//
// The game itself is the static site in game/ (open game/index.html in
// a desktop browser and play; it loads nothing from the network).
// This program's one job is to hand that game in: it copies game/ and
// screenshots/ into the output directory and writes dossier.json —
// the summary the judge reads — with the kit's vendored library.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps, mirrored so an oversized entry fails here with a
// clear error instead of at the gate: at most 4 screenshots of
// 256 KiB, at most 993 files and 48 MiB under game/, no game path
// over 1000 bytes, and the dossier text capped at 160 KiB.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(outputDir, DOSSIER_CAPS);
writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`Lastlight Aegis handed in: dossier ${Buffer.byteLength(dossier)} bytes -> ${outputDir}`);
