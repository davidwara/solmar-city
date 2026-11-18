// Story: mission intro cutscenes for Mara Voss.
// Before jobs 1, 4, 7 and 10 a short dialogue plays over the city: the
// speaker's name in gold, their line typed out letter by letter, any key
// (or click) to advance, another to skip the rest. The game pauses while
// a cutscene runs — the city waits, the story doesn't. Lines are written
// for this game only: Mara the courier, Dex the fixer, Rosa the mechanic,
// and Rico's crew pulling her deeper into Solmar's underworld.
import { createRng } from './utils.js';

// Dialogue scripts, keyed by the job they introduce (0-based job index).
// Job 1: First Job. Job 4: Night Run. Job 7: Smuggler's Run. Job 10:
// Island Hopper — the first job across the bay.
const SCRIPTS = {
  0: [
    { who: 'Dex', line: 'Mara. You owe me for the harbour bail — so you work it off. One package, marina pier, no questions.' },
    { who: 'Mara', line: 'One package. Then I am done running errands for Rico\'s crew.' },
    { who: 'Dex', line: 'Sure you are. The pier is south, past the beachfront. Don\'t keep Rico waiting.' },
  ],
  3: [
    { who: 'Rosa', line: 'Night shift, Mara. The streets go dark after ten and the law gets twitchy. Your car is tuned — don\'t waste it.' },
    { who: 'Mara', line: 'A midnight pickup on the north edge. Who leaves a package out there at night?' },
    { who: 'Rosa', line: 'People who pay triple. Drive like the moon is chasing you.' },
  ],
  6: [
    { who: 'Dex', line: 'This one is hot, Mara. A crate at the marina, and the moment you lift it the roadblocks go up.' },
    { who: 'Mara', line: 'Roadblocks? You said courier work, Dex. Not a war.' },
    { who: 'Dex', line: 'East docks, fast, and don\'t stop for anyone in a uniform. The pay is worth the heat.' },
  ],
  9: [
    { who: 'Rosa', line: 'The bay job. Take a boat from the marina — the causeway is watched, the water isn\'t.' },
    { who: 'Mara', line: 'An island drop. Who lives out there that needs a courier?' },
    { who: 'Rosa', line: 'People who own the island. Mind the lighthouse on the way back — it sees everything.' },
  ],
};

/** The jobs that open with a cutscene (0-based). */
export const STORY_JOBS = [0, 3, 6, 9];

/** Create the cutscene player. Returns show / advance / update. */
export function createStory() {
  const overlay = document.getElementById('story-overlay');
  const whoEl = document.getElementById('story-who');
  const textEl = document.getElementById('story-text');
  const hintEl = document.getElementById('story-hint');

  const story = {
    active: false,
    lines: [],
    index: 0,
    shown: 0, // characters of the current line typed so far
    done: null, // callback when the cutscene ends
    typeTimer: 0,
  };

  /** Type the current line out, a few characters per tick. */
  function update(dt) {
    if (!story.active) return;
    const line = story.lines[story.index];
    if (!line) return;
    if (story.shown < line.line.length) {
      story.typeTimer += dt;
      const chars = Math.floor(story.typeTimer * 55);
      story.shown = Math.min(line.line.length, chars);
      if (textEl) textEl.textContent = line.line.slice(0, story.shown);
    }
  }

  /** Show the current line's speaker and reset the typewriter. */
  function showLine() {
    const line = story.lines[story.index];
    if (!line) { end(); return; }
    if (whoEl) whoEl.textContent = line.who;
    if (textEl) textEl.textContent = '';
    if (hintEl) {
      hintEl.textContent = story.index < story.lines.length - 1
        ? 'Any key / click — next line'
        : 'Any key / click — start the job';
    }
    story.shown = 0;
    story.typeTimer = 0;
  }

  /** End the cutscene, hide the overlay, resume the game. */
  function end() {
    story.active = false;
    story.lines = [];
    story.index = 0;
    if (overlay) overlay.style.display = 'none';
    const done = story.done;
    story.done = null;
    if (done) done();
  }

  /**
   * Advance: if the line is still typing, finish it instantly; otherwise
   * move to the next line, or end the cutscene on the last one.
   */
  function advance() {
    if (!story.active) return false;
    const line = story.lines[story.index];
    if (!line) { end(); return true; }
    if (story.shown < line.line.length) {
      story.shown = line.line.length;
      if (textEl) textEl.textContent = line.line;
      return true;
    }
    story.index += 1;
    if (story.index >= story.lines.length) end();
    else showLine();
    return true;
  }

  /** Skip the whole cutscene at once (used by the pause key). */
  function skip() {
    if (!story.active) return false;
    end();
    return true;
  }

  /**
   * Play the script for a job index, if it has one. Returns true when a
   * cutscene started (the caller should pause play until onDone fires).
   */
  function showFor(jobIndex, onDone) {
    const lines = SCRIPTS[jobIndex];
    if (!lines || !overlay) return false;
    story.lines = lines;
    story.index = 0;
    story.done = onDone || null;
    story.active = true;
    overlay.style.display = 'flex';
    showLine();
    return true;
  }

  /** True when a job opens with a cutscene. */
  function hasScript(jobIndex) {
    return Boolean(SCRIPTS[jobIndex]);
  }

  /**
   * Phase 6: a one-off side scene — Biscuit the stray dog adopts Mara
   * the first time she walks up to him. Same typewriter overlay as the
   * job cutscenes, but it plays once and never blocks a job.
   */
  function showBiscuit(onDone) {
    if (!overlay || story.biscuitShown) return false;
    story.biscuitShown = true;
    story.lines = [
      { who: 'Mara', line: 'Hey — where did you come from? You look like you own this street.' },
      { who: 'Biscuit', line: '(The stray wags his tail and falls in beside her. He is hers now.)' },
      { who: 'Mara', line: 'Fine. Biscuit it is. Stay close — and stay out of the road.' },
    ];
    story.index = 0;
    story.done = onDone || null;
    story.active = true;
    overlay.style.display = 'flex';
    showLine();
    return true;
  }

  /** A random idle bark for the overlay's flavour line (unused by play). */
  function randomTagline(seed) {
    const rng = createRng(seed);
    const tags = [
      'Solmar City never sleeps — it just changes shifts.',
      'The bay keeps its own secrets.',
      'Every job pays. Every job costs.',
    ];
    return tags[Math.floor(rng() * tags.length)];
  }

  return { story, active: () => story.active, showFor, showBiscuit, advance, skip, update, hasScript, randomTagline };
}
