// Casino: the Golden Gull on the downtown block — slots and a
// higher-or-lower card table, played on foot at the door. No chips, no
// lobby: Mara walks up, presses G to pull the slot lever ($50 a spin),
// or C to sit at the card table ($50 a round). Slots pay on matching
// reels — three SEVENs is the $2,500 jackpot. At the card table she
// sees one card and calls higher (U) or lower (I); each right call
// doubles the pot, up to three rounds in a row, and X cashes out. The
// house takes its cut honestly: the odds are what they are, and the
// ledger (won / lost / biggest win) is saved with the game.
import * as THREE from 'three';
import { CASINO_POS } from './city.js';
import { formatMoney } from './utils.js';

export const SLOT_BET = 50;
export const SLOT_JACKPOT = 2500;
export const HILO_BET = 50;
export const HILO_MAX_ROUNDS = 3;

const REELS = ['CHERRY', 'LEMON', 'BELL', 'STAR', 'SEVEN'];
const REEL_WEIGHTS = [34, 28, 20, 12, 6];

function spinReel() {
  const total = REEL_WEIGHTS.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < REELS.length; i++) {
    roll -= REEL_WEIGHTS[i];
    if (roll <= 0) return REELS[i];
  }
  return REELS[0];
}

const FACE_CARDS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

function cardName(v) { return FACE_CARDS[v] || String(v); }

export function createCasino(scene, audio) {
  // A gold neon sign over the door so the casino reads at night.
  const sign = new THREE.Mesh(new THREE.BoxGeometry(7, 1.6, 0.4), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  sign.position.set(CASINO_POS.x, 6.4, CASINO_POS.z - 11);
  scene.add(sign);
  const door = new THREE.Mesh(new THREE.BoxGeometry(3.4, 4.2, 0.4), new THREE.MeshLambertMaterial({ color: 0x8a5fc0 }));
  door.position.set(CASINO_POS.x, 2.1, CASINO_POS.z - 11);
  scene.add(door);

  const casino = {
    won: 0,
    lost: 0,
    biggestWin: 0,
    spins: 0,
    streak: 0, // Phase 7: consecutive winning spins — three in a row pays a $25 streak bonus
    lastSpin: '',
    hiLo: null, // { card, pot, round } while a card round is live
    lastHiLo: '',
  };

  /** True when Mara stands at the casino door, on foot. */
  function nearCasino(pos) {
    return Math.hypot(pos.x - CASINO_POS.x, pos.z - (CASINO_POS.z - 11)) < 7;
  }

  /**
   * Pull the slot lever. Returns { ok, delta, text }: delta is the cash
   * change (negative on a loss), text is the reel result for the toast.
   */
  function slots(money) {
    if (money < SLOT_BET) return { ok: false, delta: 0, text: 'Slots need $50 — the lever stays put.' };
    const reels = [spinReel(), spinReel(), spinReel()];
    casino.spins += 1;
    let delta = -SLOT_BET;
    let text = `${reels.join(' · ')} — no match, ${formatMoney(SLOT_BET)} gone.`;
    // Three SEVENs is the jackpot; any three of a kind pays $250, any pair $75.
    const win = reels[0] === 'SEVEN' && reels[1] === 'SEVEN' && reels[2] === 'SEVEN' ? SLOT_JACKPOT
      : reels[0] === reels[1] && reels[1] === reels[2] ? 250
      : reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2] ? 75 : 0;
    if (win === SLOT_JACKPOT) {
      delta = SLOT_JACKPOT - SLOT_BET;
      text = `SEVEN · SEVEN · SEVEN — JACKPOT ${formatMoney(SLOT_JACKPOT)}!`;
    } else if (win > 0) {
      delta = win - SLOT_BET;
      text = win === 250 ? `${reels[0]} ×3 — three of a kind, +${formatMoney(250)}!`
        : `${reels.join(' · ')} — a pair, +${formatMoney(75)}.`;
    }
    if (delta > 0) {
      casino.won += delta;
      casino.biggestWin = Math.max(casino.biggestWin, delta);
      // A hot machine: three winning spins in a row pays a $25 streak bonus.
      casino.streak += 1;
      if (casino.streak >= 3) {
        casino.streak = 0;
        delta += 25;
        casino.won += 25;
        text += ' Hot streak — +$25 bonus!';
      }
      if (audio && audio.jingle) audio.jingle();
    } else {
      casino.streak = 0;
      casino.lost += SLOT_BET;
      if (audio && audio.dryClick) audio.dryClick();
    }
    casino.lastSpin = text;
    return { ok: true, delta, text };
  }

  /** Sit at the card table: $50 in, one card face up. */
  function startHiLo(money) {
    if (casino.hiLo) return { ok: false, text: 'A round is already live — U higher, I lower, X cash out.' };
    if (money < HILO_BET) return { ok: false, text: 'The card table needs $50 to sit down.' };
    casino.hiLo = { card: 1 + Math.floor(Math.random() * 13), pot: HILO_BET, round: 0 };
    casino.lastHiLo = `Card is ${cardName(casino.hiLo.card)} — U higher, I lower, X cash out.`;
    return { ok: true, delta: -HILO_BET, text: casino.lastHiLo };
  }

  /**
   * Call the next card higher or lower. Returns { ok, delta, text, done }:
   * delta pays out only when the round ends (cash out or a wrong call).
   */
  function guessHiLo(higher) {
    const round = casino.hiLo;
    if (!round) return { ok: false, delta: 0, text: 'No card round live — C to sit down first.', done: true };
    let next = 1 + Math.floor(Math.random() * 13);
    let tries = 0;
    while (next === round.card && tries++ < 20) next = 1 + Math.floor(Math.random() * 13);
    if (next === round.card) next = (round.card % 13) + 1; // never a tie, even on a cold streak
    const right = higher ? next > round.card : next < round.card;
    const shown = `${cardName(round.card)} → ${cardName(next)}`;
    if (!right) {
      const lost = round.pot;
      casino.hiLo = null;
      casino.lost += lost;
      casino.lastHiLo = `${shown} — wrong call, the house keeps ${formatMoney(lost)}.`;
      if (audio && audio.thud) audio.thud();
      return { ok: true, delta: 0, text: casino.lastHiLo, done: true };
    }
    round.pot *= 2;
    round.round += 1;
    round.card = next;
    if (round.round >= HILO_MAX_ROUNDS) {
      const pot = round.pot;
      casino.hiLo = null;
      casino.won += pot;
      casino.biggestWin = Math.max(casino.biggestWin, pot);
      casino.lastHiLo = `${shown} — three in a row! ${formatMoney(pot)} is yours.`;
      if (audio && audio.jingle) audio.jingle();
      return { ok: true, delta: pot, text: casino.lastHiLo, done: true };
    }
    casino.lastHiLo = `${shown} — right! Pot ${formatMoney(round.pot)} · U/I again, X to cash out.`;
    if (audio && audio.chime) audio.chime();
    return { ok: true, delta: 0, text: casino.lastHiLo, done: false };
  }

  /** Walk away with the pot mid-round. Returns the cash paid, or 0. */
  function cashOut() {
    if (!casino.hiLo) return { delta: 0, text: '' };
    const pot = casino.hiLo.pot;
    casino.hiLo = null;
    casino.won += pot;
    casino.biggestWin = Math.max(casino.biggestWin, pot);
    casino.lastHiLo = `Cashed out — ${formatMoney(pot)} in hand.`;
    if (audio && audio.jingle) audio.jingle();
    return { delta: pot, text: casino.lastHiLo };
  }

  function statusText() {
    if (casino.hiLo) return casino.lastHiLo;
    if (casino.lastSpin) return `Slots: ${casino.lastSpin}`;
    if (casino.won > 0 || casino.lost > 0) {
      return `Casino: won ${formatMoney(casino.won)} · lost ${formatMoney(casino.lost)}`;
    }
    return '';
  }

  function promptText() {
    if (casino.hiLo) return 'U — higher · I — lower · X — cash out';
    return 'G — slots $50 · C — card table $50';
  }

  /** Minimap marker: the golden door. */
  function markers() {
    return [{ x: CASINO_POS.x, z: CASINO_POS.z - 11, color: '#ffd23f', shape: 'square', r: 5 }];
  }

  function saveData() {
    return { won: casino.won, lost: casino.lost, biggestWin: casino.biggestWin, spins: casino.spins, streak: casino.streak };
  }

  function restore(data) {
    if (!data) return;
    for (const k of ['won', 'lost', 'biggestWin', 'spins']) if (typeof data[k] === 'number') casino[k] = data[k];
    if (typeof data.streak === 'number') casino.streak = Math.max(0, Math.min(2, data.streak));
  }

  Object.assign(casino, { nearCasino, slots, startHiLo, guessHiLo, cashOut, statusText, promptText, markers, saveData, restore });
  return casino;
}
