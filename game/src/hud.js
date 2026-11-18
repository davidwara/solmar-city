// HUD: health, money, wanted stars, mission tracker, and a live 2D minimap.
// The minimap is a top-down canvas: roads, beach, sea, the player arrow,
// parked cars, moving traffic (grey), police (flashing blue/red), nearby
// pedestrians (tiny dots) and the current mission marker (gold diamond).
// Phase 3 adds the pistol ammo counter, the day/night clock, a flashing
// wanted display, and gun-shop + bodyguard-client markers on the minimap.
import { CITY } from './city.js';
import { clamp01 } from './utils.js';

const STREETS = CITY.streets;

export function createHud() {
  const els = {
    healthFill: document.getElementById('health-fill'),
    healthText: document.getElementById('health-text'),
    money: document.getElementById('money'),
    wanted: document.getElementById('wanted'),
    objective: document.getElementById('objective'),
    speed: document.getElementById('speed'),
    hint: document.getElementById('hint'),
    minimap: document.getElementById('minimap'),
    toast: document.getElementById('toast'),
    missionList: document.getElementById('mission-list'),
    ammo: document.getElementById('ammo'),
    clock: document.getElementById('clock'),
    weather: document.getElementById('weather'),
    packages: document.getElementById('packages'),
    station: document.getElementById('station'),
    flash: document.getElementById('flash'),
  };
  const ctx = els.minimap.getContext('2d');
  const S = els.minimap.width; // 190
  const WORLD_MIN = -240;
  const WORLD_MAX = 280;
  const scale = S / (WORLD_MAX - WORLD_MIN);
  function toMap(x, z) {
    return [(x - WORLD_MIN) * scale, (z - WORLD_MIN) * scale];
  }
  let toastTimer = null;
  let flashPhase = 0;

  function drawMinimap(playerPos, heading, cars, inCar, objectivePos, extra) {
    flashPhase += 0.08;
    ctx.fillStyle = '#101820';
    ctx.fillRect(0, 0, S, S);
    // Sea + beach (south edge).
    const [, seaY] = toMap(0, 250);
    ctx.fillStyle = '#1e6fa8';
    ctx.fillRect(0, seaY, S, S - seaY);
    const [, sandY] = toMap(0, 210);
    ctx.fillStyle = '#d9c184';
    ctx.fillRect(0, sandY, S, seaY - sandY);
    // Roads.
    ctx.strokeStyle = '#5a636e';
    ctx.lineWidth = 5;
    for (const c of STREETS) {
      const [x] = toMap(c, 0);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
      const [, z] = toMap(0, c);
      ctx.beginPath(); ctx.moveTo(0, z); ctx.lineTo(S, z); ctx.stroke();
    }
    // Mission marker (gold diamond, pulsing).
    if (objectivePos) {
      const [ox, oy] = toMap(objectivePos.x, objectivePos.z);
      const r = 7 + Math.sin(flashPhase * 2) * 1.5;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(ox, oy - r); ctx.lineTo(ox + r * 0.85, oy); ctx.lineTo(ox, oy + r); ctx.lineTo(ox - r * 0.85, oy);
      ctx.closePath(); ctx.fill();
    }
    // Moving traffic (grey dots).
    for (const w of extra.traffic || []) {
      const [tx, ty] = toMap(w.car.pos.x, w.car.pos.z);
      ctx.fillStyle = '#b8c4cc';
      ctx.beginPath(); ctx.arc(tx, ty, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // Pedestrians (tiny pale dots, only near the player to avoid clutter).
    for (const p of extra.peds || []) {
      const d = Math.hypot(p.pos.x - playerPos.x, p.pos.z - playerPos.z);
      if (d > 90) continue;
      const [px, py] = toMap(p.pos.x, p.pos.z);
      ctx.fillStyle = p.down ? '#ff5a5a' : '#d8e6ee';
      ctx.beginPath(); ctx.arc(px, py, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    // Parked cars (orange; white when driven).
    for (const car of cars) {
      const [cx, cy] = toMap(car.pos.x, car.pos.z);
      ctx.fillStyle = car.driven ? '#ffffff' : '#ff8a3d';
      ctx.beginPath(); ctx.arc(cx, cy, car.driven ? 4 : 3, 0, Math.PI * 2); ctx.fill();
    }
    // Police (flashing blue/red).
    for (const unit of extra.police || []) {
      const [px, py] = toMap(unit.car.pos.x, unit.car.pos.z);
      ctx.fillStyle = Math.sin(flashPhase * 3) > 0 ? '#3d7bff' : '#ff3d3d';
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
    }
    // Gun shop (green square) — the pistol lives here.
    if (extra.shopPos) {
      const [sx, sy] = toMap(extra.shopPos.x, extra.shopPos.z);
      ctx.fillStyle = '#7dff8a';
      ctx.fillRect(sx - 3.5, sy - 3.5, 7, 7);
    }
    // Bodyguard client (gold ring) — keep him in sight.
    if (extra.vipPos) {
      const [vx, vy] = toMap(extra.vipPos.x, extra.vipPos.z);
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(vx, vy, 5 + Math.sin(flashPhase * 2) * 1.5, 0, Math.PI * 2); ctx.stroke();
    }
    // Hidden packages (cyan dots) — only the ones Mara is close to.
    for (const pos of extra.packages || []) {
      const [gx, gy] = toMap(pos.x, pos.z);
      ctx.fillStyle = '#7df9ff';
      ctx.beginPath(); ctx.arc(gx, gy, 3, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow.
    const [px, py] = toMap(playerPos.x, playerPos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(heading);
    ctx.fillStyle = inCar ? '#7df9ff' : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /** Flash a short message above the minimap (pickup, bust, mute, ...). */
  function showToast(text, ms = 2600) {
    if (!els.toast) return;
    els.toast.textContent = text;
    els.toast.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.style.display = 'none'; }, ms);
  }

  /** Camera flash for the Shutterbug job: a white blink over the frame. */
  function showFlash() {
    if (!els.flash) return;
    els.flash.style.display = 'block';
    setTimeout(() => { els.flash.style.display = 'none'; }, 140);
  }

  /** Show / hide the jobs (mission list) panel. */
  function toggleMissionList(text) {
    if (!els.missionList) return false;
    const showing = els.missionList.style.display !== 'block';
    els.missionList.style.display = showing ? 'block' : 'none';
    if (showing) els.missionList.textContent = text;
    return showing;
  }

  function update(state) {
    els.healthFill.style.width = Math.max(0, state.health) + '%';
    els.healthText.textContent = Math.round(state.health);
    els.money.textContent = '$' + state.money.toLocaleString('en-US');
    // Wanted: up to 3 stars shine red-hot, the rest stay empty. While the
    // law is on Mara the whole row pulses so it cannot be missed.
    const stars = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
    els.wanted.textContent = stars;
    els.wanted.style.color = state.wanted > 0 ? '#ff5a5a' : '#ffd23f';
    els.wanted.style.opacity = state.wanted > 0 ? 0.65 + 0.35 * clamp01(Math.abs(Math.sin(flashPhase * 2))) : 1;
    els.wanted.classList.toggle('flash', state.wanted > 0);
    // Phase 3 readouts: pistol ammo (or the shop hint) and the clock.
    if (els.ammo) els.ammo.textContent = state.ammoText || '';
    if (els.clock) {
      els.clock.textContent = state.clockText || '';
      els.clock.style.color = state.isNight ? '#9db8ff' : '#ffe9a8';
    }
    // Phase 4 readouts: weather, hidden-package count, radio station.
    if (els.weather) els.weather.textContent = state.weatherIcon || '';
    if (els.packages) els.packages.textContent = state.packagesText || '';
    if (els.station) els.station.textContent = state.inCar ? (state.stationText || '') : '';
    els.objective.textContent = state.objective;
    els.speed.textContent = state.inCar
      ? Math.round(Math.abs(state.speed) * 3.6) + ' km/h'
      : '';
    els.hint.textContent = state.inCar
      ? 'WASD drive · E exit car · F punch · M mute · J jobs · P pause'
      : (state.nearCar ? 'E — take the car · F punch · Click shoot · R reload · M mute · J jobs' : state.nearShop ? 'G — buy pistol $400 · WASD move · Shift run · Space jump · F punch · M mute · J jobs · P pause' : 'WASD move · Shift run · Space jump · E enter car · F punch · Click shoot · M mute · J jobs · P pause');
    drawMinimap(state.playerPos, state.heading, state.cars, state.inCar, state.objectivePos, {
      traffic: state.traffic || [],
      police: state.police || [],
      peds: state.peds || [],
      shopPos: state.shopPos || null,
      vipPos: state.vipPos || null,
      packages: state.packageDots || [],
    });
  }

  return { update, showToast, toggleMissionList, showFlash };
}

/** Show or hide the start screen / pause menu overlays. */
export function showScreen(id) {
  for (const name of ['start-screen', 'pause-screen']) {
    const el = document.getElementById(name);
    if (el) el.style.display = name === id ? 'flex' : 'none';
  }
}
