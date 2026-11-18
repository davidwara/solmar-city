// Save: Mara's progress in localStorage — money, jobs finished, best
// wanted level, and health. Saved on every mission completion and when the
// game is paused; loaded from the start screen's Continue button.
const SAVE_KEY = 'solmar-city-save-v1';

/** Read the save, or null when there is none / it is unreadable. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
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
    };
  } catch {
    return null;
  }
}

/** Write the save. Never throws (a full/blocked store just skips). */
export function saveGame(data) {
  try {
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
  } catch { /* ignore */ }
}
