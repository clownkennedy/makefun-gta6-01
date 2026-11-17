// DOCKLINE — a harbour-city boat chase set in Port Meridian.
// You play a speedboat runner working the docks of a busy port town:
// six jobs in a row, each one a run through canals, piers and open water
// while the tide climbs and drops, opening some channels and shutting
// others. The cargo everyone wants is gold stashed inside shipping
// containers, so every job is a race to grab the haul, dodge the patrol
// boats and harbour hazards, and slip back to the dock before the water
// turns against you.
//
// This file is the submission script for the game, nothing more. It takes
// the finished game sitting in game/ next to this file, together with the
// pictures in screenshots/, and stages both into the output folder the
// competition expects. It then asks the bundled make.fun helper to write
// dossier.json there, the little summary file the competition reads to
// check the entry. The game itself is plain web files — open game/index.html
// in a desktop browser and it just runs, with no downloads from the
// internet and no extra packages to install. Everything here runs on the
// Node 22 built-ins alone.
//
// To try it on your own machine first, run `node serve.ts` and visit
// http://localhost:8080. When you are not inside the competition's own
// container, point the output somewhere else with the environment
// variable, for example:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Where this script lives on disk, and where the finished entry goes.
// The destination defaults to /output and can be pointed elsewhere
// through MAKEFUN_OUTPUT_DIR when testing outside the grader.
const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Make the destination folder, then copy the whole game in as-is.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });

// The screenshots folder always exists in the output, even if this
// checkout somehow has no pictures yet — copy them over when present.
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The size and count ceilings below mirror the competition's own gate
// (reference/gate.json), so a bad entry fails here instead of later.
// text_max_bytes trims the write-up; the rest are hard ceilings — at
// most 4 screenshots and none bigger than 256 KiB, at most 993 files
// totalling 48 MiB inside game/, and no path under game/ longer than
// 1000 bytes. game/ itself is counted alongside the output folder's
// own 1000-entry ceiling, its screenshots/ and dossier.json included.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
