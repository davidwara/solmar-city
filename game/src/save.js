// Save: Mara's progress in localStorage — money, jobs finished, best
// wanted level, and health. Saved on every mission completion and when the
// game is paused; loaded from the start screen's Continue button.
const SAVE_KEY = 'solmar-city-save-v1';
// Phase 7: the previous save is kept under a backup key, so one bad
// write (or a full store) never eats Mara's whole story.
const BACKUP_KEY = 'solmar-city-save-v1-backup';

/** Read the save, or null when there is none / it is unreadable. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return normalizeSave(data);
  } catch {
    // The main save is unreadable — fall back to the backup, if any.
    try {
      const backup = window.localStorage.getItem(BACKUP_KEY);
      if (!backup) return null;
      const data = JSON.parse(backup);
      if (typeof data !== 'object' || data === null) return null;
      return normalizeSave(data);
    } catch {
      return null;
    }
  }
}

/** Coerce a parsed save object into the shape the game expects. */
function normalizeSave(data) {
  const n = (v, d) => (typeof v === 'number' ? v : d);
  const o = (v) => (v && typeof v === 'object' ? v : null);
  return {
    money: n(data.money, 1250), missionsCompleted: n(data.missionsCompleted, 0),
    bestWanted: n(data.bestWanted, 0), health: n(data.health, 100),
    savedAt: n(data.savedAt, 0), timesWasted: n(data.timesWasted, 0),
    timesBusted: n(data.timesBusted, 0), shotsFired: n(data.shotsFired, 0),
    // Phase 4: hidden packages found and Shutterbug photos snapped.
    packagesCollected: n(data.packagesCollected, 0), photosTaken: n(data.photosTaken, 0),
    // Phase 5: gang turf owned, garage paint/engine/armour.
    turfOwned: Array.isArray(data.turfOwned) ? data.turfOwned.filter((t) => typeof t === 'string') : [],
    paintIndex: n(data.paintIndex, -1), engineLevel: n(data.engineLevel, 0), armor: data.armor === true,
    // Phase 6: fishing, races, safehouses, casino, courier, Biscuit.
    fishing: o(data.fishing), races: o(data.races), housing: o(data.housing),
    casino: o(data.casino), delivery: o(data.delivery), pets: o(data.pets),
  };
}

/** Write the save. Never throws (a full/blocked store just skips). */
export function saveGame(data) {
  try {
    // Rotate the backup first: the current save becomes the fallback.
    const current = window.localStorage.getItem(SAVE_KEY);
    if (current) window.localStorage.setItem(BACKUP_KEY, current);
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: data.money, missionsCompleted: data.missionsCompleted,
      bestWanted: data.bestWanted, health: data.health, savedAt: Date.now(),
      timesWasted: data.timesWasted || 0, timesBusted: data.timesBusted || 0,
      shotsFired: data.shotsFired || 0, packagesCollected: data.packagesCollected || 0,
      photosTaken: data.photosTaken || 0,
      turfOwned: Array.isArray(data.turfOwned) ? data.turfOwned : [],
      paintIndex: typeof data.paintIndex === 'number' ? data.paintIndex : -1,
      engineLevel: typeof data.engineLevel === 'number' ? data.engineLevel : 0,
      armor: data.armor === true,
      fishing: data.fishing || null, races: data.races || null, housing: data.housing || null,
      casino: data.casino || null, delivery: data.delivery || null, pets: data.pets || null,
    }));
    return true;
  } catch {
    return false;
  }
}

/** True when a save exists to continue from. */
export function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Wipe the save (used when starting a fresh story). */
export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
    window.localStorage.removeItem(BACKUP_KEY);
  } catch { /* ignore */ }
}
