// Solmar City — the program that hands the game in to make.fun.
// Node 22, standard library only, no build step: copy the playable
// game/ folder and the screenshots/ folder into the output directory,
// then write dossier.json with the vendored make.fun library, under the
// scorer's caps. Run it as:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The game it ships: Mara Voss, a courier pulled into the Solmar
// underworld, in a procedural coastal city — 7x7 blocks of towers,
// palms, beach and sea, a second island across the bay with a striped
// lighthouse, and a causeway between them. Twelve story jobs for Rico
// (marina pickups, hot deliveries, a night run, bodyguard duty, a taxi
// shift, smuggling past roadblocks, a getaway, a photo tour, an island
// sail, the lighthouse, a turf war), live traffic that stops at red
// lights, pedestrians who talk and flee, a 1–3 star police pursuit with
// a three-star ram run, a day/night cycle, rain and storms with
// lightning, a pistol and a bat from the gun shop, and a WASTED hospital
// bill when Mara goes down. When Rico has no work the city still pays:
// fishing off the east pier, three checkpoint street races, three
// buyable safehouses, the Golden Gull casino, courier parcels, gang
// turf that pays by the minute, a garage that tunes her ride, fifteen
// hidden packages, and Biscuit the stray dog. Sound is fully procedural
// WebAudio — engine hum, sirens, footsteps, gunshots and two radio
// stations — and progress saves to the browser.
//
// Phase 7 rewrote the game from the inside out without changing what
// the player sees: main.js got a fresh bootstrap and loop, missions,
// traffic and police got fresh implementations, and this build rewrites
// the city generator, the procedural audio, the HUD and minimap, and
// this very program — plus a small improvement in every remaining
// module and a fresh set of screenshots taken inside the recording.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Where the entry lives and where it goes: MAKEFUN_OUTPUT_DIR when set,
// else /output (the scorer's directory).
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// The scorer's caps for this bounty: the text budget, at most four
// screenshots of at most 256 KiB each, and the game tree's limits.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// Copy the whole game in, and the screenshots when they exist — the
// dossier is built from exactly what lands in the output directory.
mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
const shotsDir = join(repoRoot, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
}

// The dossier must equal what the scorer's own copy of the vendored
// library writes from this same tree — build it, then write it out.
const dossier = buildDossier(outDir, CAPS);
const dossierPath = join(outDir, 'dossier.json');
writeFileSync(dossierPath, dossier);

console.log(
  'Solmar City — Phase 7 build: city / audio / hud / main.ts rewritten, '
  + 'missions / traffic / police / bootstrap rewritten, touches in every '
  + 'remaining module, screenshots re-taken — dossier written to '
  + `${dossierPath} (${dossier.length} bytes)`,
);
