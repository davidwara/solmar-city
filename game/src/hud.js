// HUD: health, money, wanted stars, mission tracker, and a live 2D minimap.
// The minimap is a top-down canvas: roads, beach, sea, the player arrow,
// parked cars, moving traffic (grey), police (flashing blue/red), nearby
// pedestrians (tiny dots) and the current mission marker (gold diamond).
// Phase 3 adds the pistol ammo counter, the day/night clock, a flashing
// wanted display, and gun-shop + bodyguard-client markers on the minimap.
import { CITY } from './city.js';
import { clamp01, formatMoney } from './utils.js';

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
    turf: document.getElementById('turf'),
    sideLine: document.getElementById('side-line'),
  };
  const ctx = els.minimap.getContext('2d');
  const S = els.minimap.width; // 190
  const WORLD_MIN = -240;
  const WORLD_MAX = 440; // Phase 5: the minimap now reaches the second island across the bay
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
    // Phase 5: the second island across the bay (sand + grass block).
    if (extra.island) {
      const [ix1, iz1] = toMap(extra.island.minX, extra.island.minZ);
      const [ix2, iz2] = toMap(extra.island.maxX, extra.island.maxZ);
      ctx.fillStyle = '#d9c184';
      ctx.fillRect(ix1, iz1, ix2 - ix1, iz2 - iz1);
      ctx.fillStyle = '#6fae62';
      ctx.fillRect(ix1 + 3, iz1 + 3, ix2 - ix1 - 6, iz2 - iz1 - 6);
      // Lighthouse dot on the island's south tip.
      if (extra.lighthousePos) {
        const [lx, ly] = toMap(extra.lighthousePos.x, extra.lighthousePos.z);
        ctx.fillStyle = extra.lighthouseLit ? '#fff6c8' : '#ff5a5a';
        ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Phase 5: gang turf zones — coloured rings, gold when Mara owns them.
    for (const zone of extra.turfZones || []) {
      const [zx, zy] = toMap(zone.center.x, zone.center.z);
      const zr = zone.radius * scale;
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = zone.css;
      ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = zone.owner === 'mara' ? '#ffd23f' : zone.css;
      ctx.lineWidth = zone.owner === 'mara' ? 3 : 1.5;
      ctx.beginPath(); ctx.arc(zx, zy, zr, 0, Math.PI * 2); ctx.stroke();
      // Claim progress: a filling arc while Mara stands in the zone.
      if (zone.claimProgress > 0 && zone.claimProgress < 1) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(zx, zy, zr - 3, -Math.PI / 2, -Math.PI / 2 + zone.claimProgress * Math.PI * 2); ctx.stroke();
      }
    }
    // Phase 5: boats (white diamonds on the water) and the garage (orange square).
    for (const boat of extra.boats || []) {
      const [bx, by] = toMap(boat.pos.x, boat.pos.z);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(bx, by - 4); ctx.lineTo(bx + 3, by); ctx.lineTo(bx, by + 4); ctx.lineTo(bx - 3, by);
      ctx.closePath(); ctx.fill();
    }
    if (extra.garagePos) {
      const [gx, gy] = toMap(extra.garagePos.x, extra.garagePos.z);
      ctx.fillStyle = '#ff7a2a';
      ctx.fillRect(gx - 3.5, gy - 3.5, 7, 7);
    }
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
    // Phase 6 markers: the pier, race flag + next gate, safehouse doors,
    // the casino, courier depots + drop, and Biscuit's brown dot.
    for (const m of extra.phase6 || []) {
      const [mx, my] = toMap(m.x, m.z);
      ctx.fillStyle = m.color;
      if (m.shape === 'diamond') {
        ctx.beginPath();
        ctx.moveTo(mx, my - m.r); ctx.lineTo(mx + m.r * 0.8, my); ctx.lineTo(mx, my + m.r); ctx.lineTo(mx - m.r * 0.8, my);
        ctx.closePath(); ctx.fill();
      } else if (m.shape === 'flag') {
        ctx.fillRect(mx - 1, my - m.r - 2, 2, m.r * 2 + 2);
        ctx.fillRect(mx + 1, my - m.r - 2, m.r, m.r * 0.6);
      } else if (m.shape === 'square') {
        ctx.fillRect(mx - m.r, my - m.r, m.r * 2, m.r * 2);
      } else {
        ctx.beginPath(); ctx.arc(mx, my, m.r, 0, Math.PI * 2); ctx.fill();
      }
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
    els.money.textContent = formatMoney(state.money);
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
    // Phase 5 readouts: turf owned, and boat speed on the water.
    if (els.turf) els.turf.textContent = state.turfText || '';
    // Phase 6 readout: the side-hustle line (fishing, race, courier,
    // casino, safehouse, Biscuit) under the counters.
    if (els.sideLine) els.sideLine.textContent = state.sideText || '';
    els.objective.textContent = state.objective;
    els.speed.textContent = state.inCar
      ? Math.round(Math.abs(state.speed) * 3.6) + ' km/h'
      : state.inBoat
        ? Math.round(state.boatSpeed || 0) + ' km/h · BOAT'
        : '';
    els.hint.textContent = state.phase6Hint || (state.inCar
      ? 'WASD drive · E exit car · F punch · M mute · J jobs · P pause'
      : state.inBoat
        ? 'WASD sail · E step ashore · M mute · J jobs · P pause'
        : (state.nearBoat ? 'E — board the boat · F punch · Click shoot · R reload · M mute · J jobs' : state.nearGarage ? 'G — Solmar Garage: paint, engine & armour · WASD move · Shift run · Space jump · F punch · M mute · J jobs · P pause' : state.nearCar ? 'E — take the car · F punch · Click shoot · R reload · M mute · J jobs' : state.nearShop ? 'G — buy pistol $400 · WASD move · Shift run · Space jump · F punch · M mute · J jobs · P pause' : 'WASD move · Shift run · Space jump · E enter car · F punch · Click shoot · M mute · J jobs · P pause'));
    drawMinimap(state.playerPos, state.heading, state.cars, state.inCar, state.objectivePos, {
      traffic: state.traffic || [],
      police: state.police || [],
      peds: state.peds || [],
      shopPos: state.shopPos || null,
      vipPos: state.vipPos || null,
      packages: state.packageDots || [],
      island: state.island || null,
      lighthousePos: state.lighthousePos || null,
      lighthouseLit: state.lighthouseLit || false,
      turfZones: state.turfZones || [],
      boats: state.boats || [],
      garagePos: state.garagePos || null,
      phase6: state.phase6Markers || [],
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
