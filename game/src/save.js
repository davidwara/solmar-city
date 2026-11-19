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
  return {
      money: typeof data.money === 'number' ? data.money : 1250,
      missionsCompleted: typeof data.missionsCompleted === 'number' ? data.missionsCompleted : 0,
      bestWanted: typeof data.bestWanted === 'number' ? data.bestWanted : 0,
      health: typeof data.health === 'number' ? data.health : 100,
      savedAt: typeof data.savedAt === 'number' ? data.savedAt : 0,
      timesWasted: typeof data.timesWasted === 'number' ? data.timesWasted : 0,
      timesBusted: typeof data.timesBusted === 'number' ? data.timesBusted : 0,
      shotsFired: typeof data.shotsFired === 'number' ? data.shotsFired : 0,
      // Phase 4: hidden packages found and Shutterbug photos snapped.
      packagesCollected: typeof data.packagesCollected === 'number' ? data.packagesCollected : 0,
      photosTaken: typeof data.photosTaken === 'number' ? data.photosTaken : 0,
      // Phase 5: gang turf owned, garage paint/engine/armour.
      turfOwned: Array.isArray(data.turfOwned) ? data.turfOwned : [],
      paintIndex: typeof data.paintIndex === 'number' ? data.paintIndex : -1,
      engineLevel: typeof data.engineLevel === 'number' ? data.engineLevel : 0,
      armor: data.armor === true,
      // Phase 6: fishing, races, safehouses, casino, courier, Biscuit.
      fishing: data.fishing && typeof data.fishing === 'object' ? data.fishing : null,
      races: data.races && typeof data.races === 'object' ? data.races : null,
      housing: data.housing && typeof data.housing === 'object' ? data.housing : null,
      casino: data.casino && typeof data.casino === 'object' ? data.casino : null,
      delivery: data.delivery && typeof data.delivery === 'object' ? data.delivery : null,
      pets: data.pets && typeof data.pets === 'object' ? data.pets : null,
  };
}

/** Write the save. Never throws (a full/blocked store just skips). */
export function saveGame(data) {
  try {
    // Rotate the backup first: the current save becomes the fallback.
    const current = window.localStorage.getItem(SAVE_KEY);
    if (current) window.localStorage.setItem(BACKUP_KEY, current);
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: data.money,
      missionsCompleted: data.missionsCompleted,
      bestWanted: data.bestWanted,
      health: data.health,
      savedAt: Date.now(),
      timesWasted: data.timesWasted || 0,
      timesBusted: data.timesBusted || 0,
      shotsFired: data.shotsFired || 0,
      packagesCollected: data.packagesCollected || 0,
      photosTaken: data.photosTaken || 0,
      turfOwned: Array.isArray(data.turfOwned) ? data.turfOwned : [],
      paintIndex: typeof data.paintIndex === 'number' ? data.paintIndex : -1,
      engineLevel: typeof data.engineLevel === 'number' ? data.engineLevel : 0,
      armor: data.armor === true,
      fishing: data.fishing || null,
      races: data.races || null,
      housing: data.housing || null,
      casino: data.casino || null,
      delivery: data.delivery || null,
      pets: data.pets || null,
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
