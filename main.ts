// Solmar City — the program that hands the game in (Node 22, stdlib only).
// Phase 3: the game now ships a pistol from the gun shop, six story jobs
// (night run, bodyguard, taxi king), a WASTED hospital respawn, traffic
// lights with horns, talking pedestrians, a day/night cycle and a polished
// HUD — alongside the Phase 1 city, driving and HUD and the Phase 2
// traffic, pedestrians, police/wanted, missions, combat, audio and saves.
// This program is unchanged in shape: it copies game/ and screenshots/
// and writes the dossier the judge reads.
// Phase 3 note: the dossier now covers three new source modules
// (weapons.js, daynight.js, wasted.js) and the extended missions, traffic,
// pedestrians, HUD and shot poses — the build below is what the judge sees.
// Phase 4: two more source modules (weather.js, collectibles.js), three
// more jobs (smuggler's run, getaway driver, shutterbug), a car radio in
// audio.js, and rain/storm screenshot poses — same build, same dossier.
// Phase 5: five more source modules (boats.js, island.js, gangs.js,
// customization.js, story.js), three more jobs (island hopper, lighthouse
// keeper, turf war), a second island with a lighthouse across the bay,
// gang turf with passive income, a garage shop, and story cutscenes —
// the mission screenshot now sails the bay to the island.
// Phase 6: six more source modules (fishing.js, races.js, housing.js,
// casino.js, delivery.js, pets.js) — pier fishing with a Golden Koi,
// three checkpoint street races from the garage flag, three buyable
// safehouses with a home respawn, slots + higher-or-lower at the Golden
// Gull casino, courier parcels with tips, and Biscuit the stray dog —
// plus a 3-star police ram run, a traffic intersection queue, tourist
// pedestrians, an itemised hospital bill and a $50 melee bat. The
// dossier now covers six more modules; the chase screenshot runs at
// three stars and the mission screenshot fishes the pier at golden hour.
// PHASE6_SYSTEMS lists the new systems for the build log below.
//
// The game is plain static files under this directory's game/ folder: a
// three.js open-world crime game (game/index.html plus its ES modules, no
// network request at runtime). This program copies game/ and screenshots/
// beside it into /output and writes /output/dossier.json, the summary the
// judge reads, using the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fresh output directory: copy the whole game, then the screenshots.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (from the kit's gate): only text_max_bytes shapes
// the dossier bytes; the other limits refuse an entry the scorer would
// refuse (more than 4 screenshots or one over 256 KiB; more than 993 files
// in game/ or 48 MiB of game files in all, or a path under game/ over 1000
// bytes — game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
// Phase 6 systems, for the build log: the six new modules plus the five
// small system upgrades they ride on.
const PHASE6_SYSTEMS = [
  'fishing', 'races', 'housing', 'casino', 'delivery', 'pets',
  'police-ram-run', 'traffic-queue', 'tourist-peds', 'hospital-bill', 'melee-bat',
];
console.log(`Solmar City Phase 6 — ${PHASE6_SYSTEMS.length} new systems: ${PHASE6_SYSTEMS.join(', ')}`);
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
