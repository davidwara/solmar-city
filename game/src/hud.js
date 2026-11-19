// The HUD: health and money, wanted stars, the objective line, the hint
// bar, toasts, the mission list and a live 2D minimap of Solmar City.
// Pure DOM + canvas 2D — no three.js here, just the CITY grid for roads.
import { CITY } from './city.js';
import { clamp01, formatMoney } from './utils.js';

/** Minimap world range: the mainland streets plus the island across the bay. */
const WORLD_MIN = -240;
const WORLD_MAX = 440;
const MAP_SIZE = 190;

/** Show one overlay (start / pause) and hide the other; null hides both. */
export function showScreen(id) {
  for (const name of ['start-screen', 'pause-screen']) {
    const el = document.getElementById(name);
    if (el) el.style.display = name === id ? 'flex' : 'none';
  }
}

/** Grab the HUD elements and return the live HUD handle. */
export function createHud() {
  const el = {};
  for (const id of [
    'health-fill', 'health-text', 'money', 'wanted', 'objective', 'speed',
    'hint', 'minimap', 'toast', 'mission-list', 'ammo', 'clock', 'weather',
    'packages', 'station', 'flash', 'turf', 'side-line',
  ]) {
    el[id] = document.getElementById(id);
  }
  const mapCtx = el['minimap'] ? el['minimap'].getContext('2d') : null;
  const scale = MAP_SIZE / (WORLD_MAX - WORLD_MIN);
  let toastTimer = null;
  let flashTimer = null;
  let listShowing = false;

  /** World x/z to minimap pixels. */
  const mx = (x) => (x - WORLD_MIN) * scale;
  const my = (z) => (z - WORLD_MIN) * scale;

  /** A diamond marker (mission beacon, photo spots, boats). */
  function diamond(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
  }

  /** A little chequered-flag marker (the race start). */
  function flag(ctx, x, y, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + 4);
    ctx.lineTo(x, y - 6);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x + 7, y - 3);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
  }

  /** One Phase 6 marker in its own shape and colour. */
  function drawPhase6Marker(ctx, m) {
    const x = mx(m.x);
    const y = my(m.z);
    ctx.fillStyle = m.color || '#ffffff';
    ctx.strokeStyle = m.color || '#ffffff';
    const r = m.r || 4;
    if (m.shape === 'diamond') diamond(ctx, x, y, r);
    else if (m.shape === 'flag') flag(ctx, x, y, m.color || '#ffffff');
    else if (m.shape === 'square') ctx.fillRect(x - r, y - r, r * 2, r * 2);
    else {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** The live minimap: sea, island, turf, roads, cars, peds, markers. */
  function drawMinimap(s) {
    const ctx = mapCtx;
    if (!ctx) return;
    const px = s.playerPos ? s.playerPos.x : 0;
    const pz = s.playerPos ? s.playerPos.z : 0;
    const now = Date.now();
    const pulse = 1 + 0.25 * Math.sin(now / 200);

    // Dark ground, then the sea and the beach bands.
    ctx.fillStyle = '#101820';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    ctx.fillStyle = '#2e7fb8';
    ctx.fillRect(0, my(250), MAP_SIZE, MAP_SIZE - my(250));
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(0, my(210), MAP_SIZE, my(250) - my(210));

    // The second island: sand, green heart, lighthouse dot on its tip.
    if (s.island) {
      const b = s.island;
      ctx.fillStyle = '#e8d29a';
      ctx.fillRect(mx(b.minX), my(b.minZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale);
      ctx.fillStyle = '#5a8a4a';
      ctx.fillRect(mx(b.minX + 14), my(b.minZ + 14), (b.maxX - b.minX - 28) * scale, (b.maxZ - b.minZ - 28) * scale);
      if (s.lighthousePos) {
        ctx.fillStyle = s.lighthouseLit ? '#ffe9a8' : '#ff5a5a';
        ctx.beginPath();
        ctx.arc(mx(s.lighthousePos.x), my(s.lighthousePos.z), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Gang turf: translucent discs, a gold ring when Mara owns one, and a
    // white progress arc while a claim is running.
    for (const zone of s.turfZones || []) {
      const cx = mx(zone.center.x);
      const cy = my(zone.center.z);
      const r = zone.radius * scale;
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = zone.css || '#888888';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (zone.owner === 'mara') {
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (zone.claimProgress > 0 && zone.claimProgress < 1) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 2, -Math.PI / 2, -Math.PI / 2 + zone.claimProgress * Math.PI * 2);
        ctx.stroke();
      }
    }

    // Boats as white diamonds, the garage as an orange square.
    ctx.fillStyle = '#ffffff';
    for (const boat of s.boats || []) {
      if (boat.pos) diamond(ctx, mx(boat.pos.x), my(boat.pos.z), 3.5);
    }
    if (s.garagePos) {
      ctx.fillStyle = '#ff9a3d';
      ctx.fillRect(mx(s.garagePos.x) - 3, my(s.garagePos.z) - 3, 6, 6);
    }

    // Roads: grey lines on every street centreline, both directions.
    ctx.strokeStyle = '#5a616a';
    ctx.lineWidth = 3;
    for (const c of CITY.streets) {
      ctx.beginPath();
      ctx.moveTo(mx(c), my(WORLD_MIN));
      ctx.lineTo(mx(c), my(WORLD_MAX));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx(WORLD_MIN), my(c));
      ctx.lineTo(mx(WORLD_MAX), my(c));
      ctx.stroke();
    }

    // The mission beacon: a pulsing gold diamond.
    if (s.objectivePos) {
      ctx.fillStyle = '#ffd23f';
      diamond(ctx, mx(s.objectivePos.x), my(s.objectivePos.z), 6 * pulse);
    }

    // Traffic: grey dots.
    ctx.fillStyle = '#9aa4ad';
    for (const wrap of s.traffic || []) {
      const pos = (wrap && wrap.car && wrap.car.pos) || (wrap && wrap.pos);
      if (!pos) continue;
      ctx.beginPath();
      ctx.arc(mx(pos.x), my(pos.z), 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Nearby pedestrians: pale dots, red when knocked down.
    for (const ped of s.peds || []) {
      if (!ped.pos) continue;
      if (Math.hypot(ped.pos.x - px, ped.pos.z - pz) > 90) continue;
      ctx.fillStyle = ped.down ? '#ff5a5a' : '#e8e8e8';
      ctx.beginPath();
      ctx.arc(mx(ped.pos.x), my(ped.pos.z), 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Parked cars: orange dots — white and larger when Mara drives one.
    for (const car of s.cars || []) {
      if (!car.pos) continue;
      ctx.fillStyle = car.driven ? '#ffffff' : '#ff9a3d';
      ctx.beginPath();
      ctx.arc(mx(car.pos.x), my(car.pos.z), car.driven ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Police: flashing blue/red dots.
    ctx.fillStyle = Math.floor(now / 400) % 2 === 0 ? '#3d7bff' : '#ff3d3d';
    for (const unit of s.police || []) {
      const pos = (unit && unit.car && unit.car.pos) || (unit && unit.pos);
      if (!pos) continue;
      ctx.beginPath();
      ctx.arc(mx(pos.x), my(pos.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // The gun shop: a green square.
    if (s.shopPos) {
      ctx.fillStyle = '#3fae6a';
      ctx.fillRect(mx(s.shopPos.x) - 3, my(s.shopPos.z) - 3, 6, 6);
    }

    // The bodyguard client: a pulsing gold ring.
    if (s.vipPos) {
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx(s.vipPos.x), my(s.vipPos.z), 5 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Nearby hidden packages: cyan dots.
    ctx.fillStyle = '#7df9ff';
    for (const pkg of s.packages || []) {
      ctx.beginPath();
      ctx.arc(mx(pkg.x), my(pkg.z), 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Phase 6 markers (pier, race flag + next gate, safehouse doors,
    // casino, courier depots + drop, Biscuit) in their own shapes.
    for (const m of s.phase6Markers || []) drawPhase6Marker(ctx, m);

    // Mara: a cyan arrow in a vehicle, white on foot, rotated to heading.
    const heading = s.heading || 0;
    const inVehicle = !!(s.inCar || s.inBoat);
    const hx = mx(px);
    const hy = my(pz);
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    const tipX = hx + 7 * sin;
    const tipY = hy + 7 * cos;
    const backX = hx - 5 * sin;
    const backY = hy - 5 * cos;
    const sideX = 4 * cos;
    const sideY = -4 * sin;
    ctx.fillStyle = inVehicle ? '#7df9ff' : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(backX + sideX, backY + sideY);
    ctx.lineTo(backX - sideX, backY - sideY);
    ctx.closePath();
    ctx.fill();
  }

  /** The context hint when no Phase 6 hint is showing. */
  function contextHint(s) {
    if (s.inCar) return 'WASD drive · Space brake · E exit car · Q radio · P pause';
    if (s.inBoat) return 'WASD sail · E step ashore · P pause';
    if (s.nearBoat) return 'E — board the boat';
    if (s.nearGarage) return 'G — Solmar Garage';
    if (s.nearCar) return 'E — take the car';
    if (s.nearShop) return 'G — buy a pistol ($400)';
    return 'WASD move · Shift run · Space jump · E enter car · P pause';
  }

  /** Per-frame HUD write from the state main.js assembles. */
  function update(s) {
    if (el['health-fill']) {
      el['health-fill'].style.width = `${clamp01((s.health ?? 100) / 100) * 100}%`;
    }
    if (el['health-text']) el['health-text'].textContent = String(Math.round(s.health ?? 100));
    if (el['money']) el['money'].textContent = formatMoney(s.money ?? 0);
    if (el['wanted']) {
      const level = Math.max(0, Math.min(5, Math.round(s.wanted ?? 0)));
      el['wanted'].textContent = '★'.repeat(level) + '☆'.repeat(5 - level);
      el['wanted'].style.color = level > 0 ? '#ff5a5a' : '#ffd23f';
      el['wanted'].classList.toggle('flash', level > 0);
    }
    if (el['ammo']) el['ammo'].textContent = s.ammoText || '';
    if (el['clock']) {
      el['clock'].textContent = s.clockText || '';
      el['clock'].style.color = s.isNight ? '#8fb8ff' : '#ffe9a8';
    }
    if (el['weather']) el['weather'].textContent = s.weatherIcon || '';
    if (el['packages']) el['packages'].textContent = s.packagesText || '';
    if (el['station']) el['station'].textContent = s.inCar ? (s.stationText || '') : '';
    if (el['turf']) el['turf'].textContent = s.turfText || '';
    if (el['side-line']) el['side-line'].textContent = s.sideText || '';
    if (el['objective']) el['objective'].textContent = s.objective || '';
    if (el['speed']) {
      if (s.inBoat) {
        el['speed'].textContent = `${Math.round(s.boatSpeed || 0)} km/h · BOAT`;
      } else if (s.inCar) {
        el['speed'].textContent = `${Math.round((s.speed || 0) * 3.6)} km/h`;
      } else {
        el['speed'].textContent = '';
      }
    }
    if (el['hint']) el['hint'].textContent = s.phase6Hint || contextHint(s);
    drawMinimap(s);
  }

  /** A centred toast that hides itself after ms (default 2.6s). */
  function showToast(text, ms = 2600) {
    if (!el['toast']) return;
    el['toast'].textContent = text;
    el['toast'].style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el['toast'].style.display = 'none'; }, ms);
  }

  /** The white camera flash for the Shutterbug job (140 ms). */
  function showFlash() {
    if (!el['flash']) return;
    el['flash'].style.display = 'block';
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { el['flash'].style.display = 'none'; }, 140);
  }

  /** Toggle the mission-list panel; when showing, fill it with the text. */
  function toggleMissionList(text) {
    listShowing = !listShowing;
    if (el['mission-list']) {
      el['mission-list'].style.display = listShowing ? 'block' : 'none';
      if (listShowing) el['mission-list'].textContent = text || '';
    }
    return listShowing;
  }

  return { update, showToast, toggleMissionList, showFlash };
}
