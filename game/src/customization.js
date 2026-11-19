// Car customization: the Solmar garage on the east side.
// Park near the garage sign (or walk up to it) and press G: a shop
// overlay opens with six paint colours ($200 each), two engine upgrades
// ($500 / $1,000 — each level adds top speed) and bolt-on armour ($400,
// +50 max health for Mara). Purchases charge Mara's wallet on the spot
// and are saved with the game, so the paint and the engine survive a
// reload. Paint re-skins the car's body and roof by matching its original
// paint material; engine levels ride on the car object itself.
import * as THREE from 'three';

// The garage: a marked lot on the east side, under an orange sign.
export const GARAGE_POS = new THREE.Vector3(124, 0, 200);
export const GARAGE_RADIUS = 10;

// Six paints, each $200. Names show in the shop; hexes paint the car.
export const PAINTS = [
  { name: 'Sunset Red', color: 0xd23b3b, css: '#d23b3b' },
  { name: 'Ocean Blue', color: 0x2e6fd8, css: '#2e6fd8' },
  { name: 'Taxi Gold', color: 0xf2c14e, css: '#f2c14e' },
  { name: 'Viper Green', color: 0x3fae6a, css: '#3fae6a' },
  { name: 'Royal Purple', color: 0x8a5fc0, css: '#8a5fc0' },
  { name: 'Midnight', color: 0x222831, css: '#222831' },
  // Phase 6: the seventh paint — matte shark grey, for race nights.
  { name: 'Shark Grey', color: 0x6b7280, css: '#6b7280' },
  // Phase 7: the eighth paint — island teal, for the bay at noon.
  { name: 'Island Teal', color: 0x2a9d8f, css: '#2a9d8f' },
];
export const PAINT_PRICE = 200;
export const ENGINE_PRICES = [500, 1000]; // level 1, then level 2
export const ARMOR_PRICE = 400;
export const ARMOR_BONUS = 50; // +50 max health

/** Build the garage: floor pad, striped kerb, sign pole and orange sign. */
function buildGarage(scene) {
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(18, 0.3, 14),
    new THREE.MeshLambertMaterial({ color: 0x3a3f45 }),
  );
  pad.position.set(GARAGE_POS.x, 0.15, GARAGE_POS.z);
  scene.add(pad);
  const kerbMat = new THREE.MeshLambertMaterial({ color: 0xff7a2a });
  for (const dz of [-7, 7]) {
    const kerb = new THREE.Mesh(new THREE.BoxGeometry(18, 0.5, 0.8), kerbMat);
    kerb.position.set(GARAGE_POS.x, 0.4, GARAGE_POS.z + dz);
    scene.add(kerb);
  }
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 7, 8),
    new THREE.MeshLambertMaterial({ color: 0x888888 }),
  );
  pole.position.set(GARAGE_POS.x - 8, 3.5, GARAGE_POS.z - 6);
  scene.add(pole);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(6, 2.2, 0.3),
    new THREE.MeshLambertMaterial({ color: 0xff7a2a }),
  );
  sign.position.set(GARAGE_POS.x - 8, 7.4, GARAGE_POS.z - 6);
  scene.add(sign);
  // A wrench glyph on the sign: two crossed bars, visible from the road.
  const barMat = new THREE.MeshBasicMaterial({ color: 0x1a1206 });
  for (const rot of [0.6, -0.6]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 0.1), barMat);
    bar.position.set(GARAGE_POS.x - 8, 7.4, GARAGE_POS.z - 5.8);
    bar.rotation.z = rot;
    scene.add(bar);
  }
}

/**
 * Create the garage shop. hooks: { getMoney, spend(amount)->bool,
 *   onBought(text), onClosed } — the shop never touches the wallet itself.
 */
export function createCustomization(scene, hooks) {
  buildGarage(scene);
  const overlay = document.getElementById('garage-overlay');
  const listEl = document.getElementById('garage-list');
  const moneyEl = document.getElementById('garage-money');
  const closeBtn = document.getElementById('garage-close');

  const state = {
    open: false,
    paintIndex: -1, // -1 = factory paint
    engineLevel: 0, // 0..2
    armor: false,
  };

  /** True when Mara (on foot) or her car stands at the garage. */
  function nearGarage(pos) {
    return Math.hypot(pos.x - GARAGE_POS.x, pos.z - GARAGE_POS.z) < GARAGE_RADIUS;
  }

  /** Re-paint a car: recolour every mesh sharing its factory paint. */
  function applyPaint(car, paintIndex) {
    if (!car || paintIndex < 0) return false;
    const paint = PAINTS[paintIndex];
    if (!paint) return false;
    car.group.traverse((child) => {
      if (!child.isMesh || !child.material || !child.material.color) return;
      if (child.material.color.getHex() === car.color) {
        child.material.color.setHex(paint.color);
      }
    });
    car.color = paint.color;
    return true;
  }

  /** Apply every saved upgrade to a car Mara just entered. */
  function applyTo(car) {
    if (!car) return;
    if (state.paintIndex >= 0) applyPaint(car, state.paintIndex);
    car.engineLevel = state.engineLevel;
    car.armored = state.armor;
  }

  /** Refresh the shop's money line and button states. */
  function render() {
    if (!overlay) return;
    if (moneyEl) moneyEl.textContent = `Wallet: $${hooks.getMoney().toLocaleString('en-US')}`;
    if (!listEl) return;
    const rows = [];
    for (let i = 0; i < PAINTS.length; i++) {
      const p = PAINTS[i];
      const owned = state.paintIndex === i;
      rows.push(
        `<button data-kind="paint" data-i="${i}" ${owned ? 'disabled' : ''} style="background:${p.css}">`
        + `${owned ? '✓ ' : ''}${p.name} — $${PAINT_PRICE}</button>`,
      );
    }
    const engNext = state.engineLevel < 2 ? ENGINE_PRICES[state.engineLevel] : null;
    rows.push(
      `<button data-kind="engine" ${engNext === null ? 'disabled' : ''}>`
      + (engNext === null ? '✓ Engine MAX (Lv 2)' : `Engine Lv ${state.engineLevel + 1} — $${engNext} (+top speed)`),
    );
    // Phase 7: strip the paint back to factory, free — the car keeps its
    // engine and armour, only the colour goes back to how it rolled in.
    rows.push(
      `<button data-kind="factory" ${state.paintIndex < 0 ? 'disabled' : ''}>`
      + (state.paintIndex < 0 ? '✓ Factory paint' : 'Back to factory paint — FREE'),
    );
    rows.push(
      `<button data-kind="armor" ${state.armor ? 'disabled' : ''}>`
      + (state.armor ? '✓ Armour fitted (+50 max health)' : `Bolt-on armour — $${ARMOR_PRICE} (+50 max health)`),
    );
    listEl.innerHTML = rows.join('');
  }

  function open() {
    state.open = true;
    render();
    if (overlay) overlay.style.display = 'flex';
  }

  function close() {
    state.open = false;
    if (overlay) overlay.style.display = 'none';
    if (hooks.onClosed) hooks.onClosed();
  }

  /** Handle a shop click: buy paint / engine / armour, or close. */
  function onShopClick(e) {
    const btn = e.target.closest('button[data-kind]');
    if (!btn) return;
    const kind = btn.dataset.kind;
    if (kind === 'paint') {
      const i = Number(btn.dataset.i);
      if (hooks.spend(PAINT_PRICE)) {
        state.paintIndex = i;
        if (hooks.onBought) hooks.onBought(`Paint: ${PAINTS[i].name} — $200. Fresh coat, Mara.`);
      } else if (hooks.onBought) {
        hooks.onBought('Not enough cash for that paint — $200.');
      }
    } else if (kind === 'engine') {
      const price = ENGINE_PRICES[state.engineLevel];
      if (price === undefined) return;
      if (hooks.spend(price)) {
        state.engineLevel += 1;
        if (hooks.onBought) hooks.onBought(`Engine Lv ${state.engineLevel} fitted — $${price}. She pulls harder now.`);
      } else if (hooks.onBought) {
        hooks.onBought(`Not enough cash — Engine Lv ${state.engineLevel + 1} is $${price}.`);
      }
    } else if (kind === 'factory') {
      // Back to factory paint: the next car Mara takes keeps its own
      // coat, and the saved paint choice is cleared.
      if (state.paintIndex >= 0) {
        state.paintIndex = -1;
        if (hooks.onBought) hooks.onBought('Factory paint restored — the next ride keeps its own coat.');
      }
    } else if (kind === 'armor') {
      if (hooks.spend(ARMOR_PRICE)) {
        state.armor = true;
        if (hooks.onBought) hooks.onBought('Armour fitted — +50 max health. Mara can take a beating now.');
      } else if (hooks.onBought) {
        hooks.onBought('Not enough cash — armour is $400.');
      }
    }
    render();
  }

  if (listEl) listEl.addEventListener('click', onShopClick);
  if (closeBtn) closeBtn.addEventListener('click', close);

  /** Save-friendly snapshot of the shop's state. */
  function saveData() {
    return { paintIndex: state.paintIndex, engineLevel: state.engineLevel, armor: state.armor };
  }

  /** Restore the shop's state from a save. */
  function restore(data) {
    if (!data) return;
    if (typeof data.paintIndex === 'number') state.paintIndex = data.paintIndex;
    if (typeof data.engineLevel === 'number') state.engineLevel = data.engineLevel;
    if (data.armor === true) state.armor = true;
  }

  return {
    state,
    garagePos: GARAGE_POS.clone(),
    nearGarage,
    open,
    close,
    applyPaint,
    applyTo,
    render,
    saveData,
    restore,
  };
}
