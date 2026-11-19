// WASTED: what happens when Mara's health hits zero.
// The screen goes red, the city takes 10% of her cash as the hospital bill,
// and she wakes up at St. Solmar Hospital with her jobs intact — the story
// goes on, but the wallet remembers. Busted and wasted counts are tracked
// as lifetime stats and shown on the start screen.
// Phase 4: getting busted or wasted during the Getaway Driver job ends the
// run the hard way — the 100-second timer only pays out if Mara stays free.
export const HOSPITAL_POS = { x: 186, z: 124 };

/** Create the wasted system. Returns the overlay + stats + respawn math. */
export function createWasted() {
  const wasted = {
    timesWasted: 0,
    timesBusted: 0,
    overlayTimer: 0,
    active: false,
  };

  /** Cash lost to the hospital bill: 10% of what Mara carries. */
  function hospitalBill(money) {
    // Phase 7: the bill is capped at $500 — St. Solmar has seen worse
    // nights than Mara's, and it charges like it.
    return Math.min(500, Math.floor(money * 0.1));
  }

  /**
   * Phase 6: the itemised bill behind the 10% — a bed charge (4% of her
   * cash) plus treatment (6%), so the WASTED screen can show what the
   * hospital actually charged her for. The two parts always add up to
   * hospitalBill().
   */
  function billBreakdown(money) {
    const total = hospitalBill(money);
    const bed = Math.min(Math.floor(money * 0.04), 200);
    const treatment = total - bed;
    return { bed, treatment, total };
  }

  /**
   * Show the WASTED overlay for `seconds`, then call done(). While the
   * overlay is up the game is paused behind it.
   */
  function showWasted(done, seconds = 2.6) {
    wasted.timesWasted += 1;
    wasted.active = true;
    wasted.overlayTimer = seconds;
    const el = document.getElementById('wasted-screen');
    if (el) el.style.display = 'flex';
    wasted._done = done;
  }

  /** Count a bust (separate stat, same idea: the law took its cut). */
  function countBusted() {
    wasted.timesBusted += 1;
  }

  /** Advance the overlay timer; fires the respawn callback when it ends. */
  function update(dt) {
    if (!wasted.active) return;
    wasted.overlayTimer -= Math.max(0, dt);
    if (wasted.overlayTimer <= 0) {
      wasted.active = false;
      const el = document.getElementById('wasted-screen');
      if (el) el.style.display = 'none';
      const done = wasted._done;
      wasted._done = null;
      if (done) done();
    }
  }

  /** Lifetime stats line for the start screen. */
  function statsText() {
    const parts = [];
    if (wasted.timesWasted > 0) parts.push(`WASTED ×${wasted.timesWasted}`);
    if (wasted.timesBusted > 0) parts.push(`BUSTED ×${wasted.timesBusted}`);
    return parts.join(' · ');
  }

  Object.assign(wasted, { hospitalBill, billBreakdown, showWasted, countBusted, update, statsText });
  return wasted;
}
