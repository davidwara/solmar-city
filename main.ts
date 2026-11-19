// Solmar City — packs the game and its screenshots into a make.fun submission.
//
// What this little program does, start to finish:
//   1. Works out where the finished bundle goes (MAKEFUN_OUTPUT_DIR, else /output).
//   2. Copies the whole game/ tree and the whole screenshots/ tree there.
//   3. Asks the vendored make.fun library to build the dossier from what was copied.
//   4. Writes that dossier as dossier.json next to them and prints one summary line.
//
// Plain JavaScript in a .ts file, standard library only — Node 24 runs it as-is.

import { cpSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's limits, exactly as the gate states them.
const TEXT_BUDGET_BYTES = 163840;
const SHOT_LIMIT = 4;
const SHOT_MAX_BYTES = 262144;
const GAME_MAX_ENTRIES = 993;
const GAME_MAX_BYTES = 50331648;
const PATH_MAX_BYTES = 1000;

// Where the bundle lands: the environment wins, /output is the fallback.
function destinationDir() {
  const wanted = (process.env.MAKEFUN_OUTPUT_DIR ?? '').trim();
  return wanted === '' ? '/output' : wanted;
}

// How many plain files sit under a directory, subdirectories included.
function tallyFiles(root) {
  let total = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) total += 1;
    }
  };
  walk(root);
  return total;
}

// How many screenshots (image files) a directory holds.
function tallyShots(dir) {
  return readdirSync(dir).filter((name) => {
    if (name.startsWith('.')) return false;
    const lower = name.toLowerCase();
    if (!lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.endsWith('.jpeg')) return false;
    return statSync(join(dir, name)).isFile();
  }).length;
}

function pack() {
  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = destinationDir();
  const gameSrc = join(here, 'game');
  const shotsSrc = join(here, 'screenshots');

  mkdirSync(outDir, { recursive: true });

  // The whole trees, overwriting anything an earlier run left behind.
  cpSync(gameSrc, join(outDir, 'game'), { recursive: true, force: true });
  cpSync(shotsSrc, join(outDir, 'screenshots'), { recursive: true, force: true });

  const copied = tallyFiles(gameSrc) + tallyFiles(shotsSrc);

  // The dossier is built from the copies in the output directory, under the gate's caps.
  const dossier = buildDossier(outDir, {
    text_max_bytes: TEXT_BUDGET_BYTES,
    screenshots: { max: SHOT_LIMIT, max_bytes: SHOT_MAX_BYTES },
    game_max_files: GAME_MAX_ENTRIES,
    game_max_bytes: GAME_MAX_BYTES,
    game_path_max_bytes: PATH_MAX_BYTES,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  const shots = tallyShots(join(outDir, 'screenshots'));
  console.log(
    `Packed ${copied} files into ${outDir}: dossier.json is ${dossier.length} bytes with ${shots} screenshots.`,
  );
}

try {
  pack();
} catch (err) {
  console.error(`Failed to pack the submission: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
