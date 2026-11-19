// HUD: the health bar, money, wanted stars, objective, speed and hint
// lines, the mission list, toasts and the camera flash — plus a live 2D
// minimap of the whole bay, from downtown to the second island. Pure
// DOM + canvas 2D; it never touches the 3D scene, it only reads the
// state object the game loop hands it each frame.
import { CITY } from './city.js';
import { clamp01, formatMoney } from './utils.js';

// The minimap covers the mainland and the second island: world −240 to
// 440 on both axes, drawn into a 190px square canvas.
const WORLD_MIN = -240;
const WORLD_MAX = 440;
const MAP_SIZE = 190;

// Island bounds (and the lighthouse) when the state does not carry them.
const ISLAND_FALLBACK = { minX: -80, maxX: 160, minZ: 300, maxZ: 430 };
const LIGHTHOUSE_FALLBACK = { x: 120, z: 398 };

/** Show one overlay screen and hide the other; null hides both. */
export function showScreen(id) {
  for (const screenId of ['start-screen', 'pause-screen']) {
    const el = document.getElementById(screenId);
    if (el) el.style.display = screenId === id ? 'flex' : 'none';
  }
}

/** Grab the HUD elements and the minimap context. Returns the per-frame
 *  update plus the toast / mission-list / flash helpers. */
export function createHud() {
  const byId = (id) => document.getElementById(id);
  const els = {
    healthFill: byId('health-fill'),
    healthText: byId('health-text'),
    money: byId('money'),
    wanted: byId('wanted'),
    objective: byId('objective'),
    speed: byId('speed'),
    hint: byId('hint'),
    minimap: byId('minimap'),
    toast: byId('toast'),
    missionList: byId('mission-list'),
    ammo: byId('ammo'),
    clock: byId('clock'),
    weather: byId('weather'),
    packages: byId('packages'),
    station: byId('station'),
    flash: byId('flash'),
    turf: byId('turf'),
    sideLine: byId('side-line'),
    staminaFill: byId('stamina-fill'),
  };
  const mapCtx = els.minimap ? els.minimap.getContext('2d') : null;

  let toastTimer = null;
  let flashTimer = null;
  let listShowing = false;

  /** A hex colour (number or '#rrggbb') as a CSS string. */
  function css(color) {
    if (typeof color === 'number') return `#${color.toString(16).padStart(6, '0')}`;
    return color || '#ffffff';
  }

  /** A translucent fill from a colour + alpha, via globalAlpha. */
  function disc(x, y, r, color, alpha = 1) {
    mapCtx.globalAlpha = alpha;
    mapCtx.fillStyle = css(color);
    mapCtx.beginPath();
    mapCtx.arc(x, y, r, 0, Math.PI * 2);
    mapCtx.fill();
    mapCtx.globalAlpha = 1;
  }

  function diamond(x, y, r, color) {
    mapCtx.fillStyle = css(color);
    mapCtx.beginPath();
    mapCtx.moveTo(x, y - r);
    mapCtx.lineTo(x + r, y);
    mapCtx.lineTo(x, y + r);
    mapCtx.lineTo(x - r, y);
    mapCtx.closePath();
    mapCtx.fill();
  }

  function square(x, y, r, color) {
    mapCtx.fillStyle = css(color);
    mapCtx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /** Draw one Phase 6-style marker in its own shape and colour. */
  function drawMarker(m, toX, toY) {
    const x = toX(m.x);
    const y = toY(m.z);
    const r = m.r || 4;
    if (m.shape === 'diamond') diamond(x, y, r, m.color);
    else if (m.shape === 'square') square(x, y, r, m.color);
    else if (m.shape === 'flag') {
      mapCtx.strokeStyle = css(m.color);
      mapCtx.lineWidth = 2;
      mapCtx.beginPath();
      mapCtx.moveTo(x, y + r);
      mapCtx.lineTo(x, y - r);
      mapCtx.moveTo(x, y - r);
      mapCtx.lineTo(x + r, y - r + 3);
      mapCtx.stroke();
    } else disc(x, y, r, m.color);
  }

  /** The minimap: sea and beach bands, the island, turf, roads, and
   *  every live dot — traffic, peds, cars, police, the player arrow. */
  function drawMinimap(state) {
    if (!mapCtx) return;
    const scale = MAP_SIZE / (WORLD_MAX - WORLD_MIN);
    const toX = (x) => (x - WORLD_MIN) * scale;
    const toY = (z) => (z - WORLD_MIN) * scale;
    const ex = state.extras || {};
    const playerPos = state.playerPos || { x: 0, z: 0 };
    const now = performance.now() / 1000;
    // Minimap sources live on the state itself (main.js passes them
    // top-level); the extras object is only a fallback.
    const traffic = state.traffic ?? ex.traffic ?? [];
    const police = state.police ?? ex.police ?? [];
    const peds = state.peds ?? ex.peds ?? [];
    const shopPos = state.shopPos ?? ex.shopPos ?? null;
    const vipPos = state.vipPos ?? ex.vipPos ?? null;
    const packageDots = state.packageDots ?? ex.packages ?? (Array.isArray(state.packages) ? state.packages : []);
    const island = state.island ?? ex.island ?? null;
    const lighthousePos = state.lighthousePos ?? ex.lighthousePos ?? null;
    const lighthouseLit = state.lighthouseLit ?? ex.lighthouseLit ?? false;
    const turfZones = state.turfZones ?? ex.turfZones ?? [];
    const boats = state.boats ?? ex.boats ?? [];
    const garagePos = state.garagePos ?? ex.garagePos ?? null;
    const phase6src = state.phase6Markers ?? ex.phase6 ?? [];

    // Dark ground, then the sea (z >= 250) and the beach (210–250).
    mapCtx.fillStyle = '#101820';
    mapCtx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    mapCtx.fillStyle = '#2e7fb8';
    mapCtx.fillRect(0, toY(250), MAP_SIZE, MAP_SIZE - toY(250));
    mapCtx.fillStyle = '#e8d29a';
    mapCtx.fillRect(0, toY(210), MAP_SIZE, toY(250) - toY(210));

    // The second island: sand rect, green inner rect, and the
    // lighthouse dot on its south tip — pale gold when lit, red when dark.
    if (island) {
      const b = island.minX !== undefined ? island : ISLAND_FALLBACK;
      mapCtx.fillStyle = '#e8d29a';
      mapCtx.fillRect(toX(b.minX), toY(b.minZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale);
      mapCtx.fillStyle = '#6fae62';
      mapCtx.fillRect(toX(b.minX + 12), toY(b.minZ + 10), (b.maxX - b.minX - 24) * scale, (b.maxZ - b.minZ - 20) * scale);
      const lp = lighthousePos || LIGHTHOUSE_FALLBACK;
      disc(toX(lp.x), toY(lp.z), 4, lighthouseLit ? '#ffe9a8' : '#ff3b30');
    }

    // Gang turf zones: translucent discs, a gold ring when Mara owns
    // one, a white progress arc while a claim is in progress.
    for (const zone of turfZones) {
      const cx = toX(zone.center.x);
      const cy = toY(zone.center.z);
      disc(cx, cy, zone.radius * scale, zone.color || zone.css || '#888888', 0.35);
      if (zone.owner === 'mara') {
        mapCtx.strokeStyle = '#ffd23f';
        mapCtx.lineWidth = 2;
        mapCtx.beginPath();
        mapCtx.arc(cx, cy, zone.radius * scale, 0, Math.PI * 2);
        mapCtx.stroke();
      }
      const prog = zone.claimProgress || 0;
      if (prog > 0 && prog < 1) {
        mapCtx.strokeStyle = '#ffffff';
        mapCtx.lineWidth = 2;
        mapCtx.beginPath();
        mapCtx.arc(cx, cy, zone.radius * scale, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
        mapCtx.stroke();
      }
    }

    // Boats as white diamonds, the garage as an orange square.
    for (const boat of boats) {
      const p = boat.pos || boat;
      diamond(toX(p.x), toY(p.z), 4, '#ffffff');
    }
    if (garagePos) square(toX(garagePos.x), toY(garagePos.z), 5, '#ff7a2a');

    // Roads: grey lines on every street centreline, both directions.
    mapCtx.strokeStyle = '#5a6068';
    mapCtx.lineWidth = 2;
    for (const s of CITY.streets) {
      mapCtx.beginPath();
      mapCtx.moveTo(toX(s), 0);
      mapCtx.lineTo(toX(s), MAP_SIZE);
      mapCtx.stroke();
      mapCtx.beginPath();
      mapCtx.moveTo(0, toY(s));
      mapCtx.lineTo(MAP_SIZE, toY(s));
      mapCtx.stroke();
    }

    // The mission marker: a pulsing gold diamond on the objective.
    if (state.objectivePos) {
      const pulse = 5 + Math.sin(now * 4) * 1.5;
      diamond(toX(state.objectivePos.x), toY(state.objectivePos.z), pulse, '#ffd23f');
    }

    // Moving traffic as grey dots.
    for (const w of traffic) {
      const p = (w.car && w.car.pos) || w.pos || w;
      if (p) disc(toX(p.x), toY(p.z), 2.5, '#9aa4ae');
    }

    // Nearby pedestrians (within 90m): tiny pale dots, red when down.
    for (const p of peds) {
      const d = Math.hypot(p.pos.x - playerPos.x, p.pos.z - playerPos.z);
      if (d > 90) continue;
      disc(toX(p.pos.x), toY(p.pos.z), 1.8, p.down ? '#ff3b30' : '#e8f4ff');
    }

    // Parked cars as orange dots — the driven one white and larger.
    for (const car of state.cars || []) {
      const p = car.pos || car;
      disc(toX(p.x), toY(p.z), car.driven ? 4 : 2.5, car.driven ? '#ffffff' : '#ff7a2a');
    }

    // Police: flashing blue/red dots.
    const copColor = Math.floor(now * 2) % 2 === 0 ? '#2266ff' : '#ff2222';
    for (const unit of police) {
      const p = (unit.car && unit.car.pos) || unit.pos || unit;
      if (p) disc(toX(p.x), toY(p.z), 3.5, copColor);
    }

    // The gun shop as a green square, the bodyguard client as a pulsing
    // gold ring, nearby hidden packages as cyan dots.
    if (shopPos) square(toX(shopPos.x), toY(shopPos.z), 5, '#7dff8a');
    if (vipPos) {
      mapCtx.strokeStyle = '#ffd23f';
      mapCtx.lineWidth = 2;
      mapCtx.beginPath();
      mapCtx.arc(toX(vipPos.x), toY(vipPos.z), 5 + Math.sin(now * 4) * 1.5, 0, Math.PI * 2);
      mapCtx.stroke();
    }
    for (const pkg of packageDots) {
      disc(toX(pkg.x), toY(pkg.z), 3, '#7df9ff');
    }

    // Phase 6 markers (pier, race flag + next gate, safehouse doors,
    // casino, courier depots + drop, Biscuit) in their own shapes.
    const markers = Array.isArray(phase6src) ? phase6src : Object.values(phase6src).flat();
    for (const m of markers) {
      if (m && typeof m.x === 'number') drawMarker(m, toX, toY);
    }

    // The player arrow, rotated to the heading: cyan in a vehicle,
    // white on foot.
    const px = toX(playerPos.x);
    const py = toY(playerPos.z);
    const heading = state.heading || 0;
    mapCtx.save();
    mapCtx.translate(px, py);
    mapCtx.rotate(heading);
    mapCtx.fillStyle = state.inCar || state.inBoat ? '#7df9ff' : '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -7);
    mapCtx.lineTo(5, 6);
    mapCtx.lineTo(-5, 6);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  }

  /** The context hint when no Phase 6 hint is live: driving keys in a
   *  car, sailing keys in a boat, and on foot the nearest interaction
   *  first (boat, garage, car, gun shop), then the default on-foot keys. */
  function contextHint(state) {
    if (state.inCar) return 'WASD drive · E exit car · Q radio · T race at the flag';
    if (state.inBoat) return 'WASD sail · E step ashore';
    if (state.nearBoat) return 'E — board the boat';
    if (state.nearGarage) return 'G — Solmar Garage';
    if (state.nearCar) return 'E — take the car';
    if (state.nearShop) return 'G — buy pistol ($400)';
    return 'WASD move · Shift run · Space jump · E enter car · P pause';
  }

  /** Write the whole HUD from one state object. Missing fields fall back
   *  to safe defaults so a partial state never throws. */
  function update(state) {
    const s = state || {};
    const health = Math.max(0, s.health ?? 100);
    if (els.healthFill) els.healthFill.style.width = `${health}%`;
    if (els.healthText) els.healthText.textContent = String(Math.round(health));
    if (els.staminaFill) {
      els.staminaFill.style.width = `${clamp01((s.stamina ?? 100) / 100) * 100}%`;
    }
    if (els.money) els.money.textContent = formatMoney(s.money ?? 0);

    const wanted = Math.max(0, Math.min(5, Math.round(s.wanted ?? 0)));
    if (els.wanted) {
      els.wanted.textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
      els.wanted.classList.toggle('flash', wanted > 0);
      els.wanted.style.color = wanted > 0 ? '#ff5a5a' : '#ffd23f';
    }

    if (els.ammo) els.ammo.textContent = s.ammoText ?? s.ammo ?? '';
    if (els.clock) {
      els.clock.textContent = s.clockText ?? s.clock ?? '';
      const night = s.isNight ?? s.night ?? (() => {
        const m = /^(\d{1,2}):/.exec(s.clockText || s.clock || '');
        if (!m) return false;
        const h = Number(m[1]);
        return h >= 20 || h < 6;
      })();
      els.clock.style.color = night ? '#7df9ff' : '#ffe9a8';
    }
    if (els.weather) els.weather.textContent = s.weatherIcon ?? s.weather ?? '';
    if (els.packages) {
      // The counter is a string; the nearby-dots array lives in
      // packageDots, so a stray array here never prints as an object.
      els.packages.textContent = s.packagesText
        ?? (typeof s.packages === 'string' ? s.packages : '')
        ?? s.packageText ?? '';
    }
    if (els.station) els.station.textContent = s.inCar ? (s.stationText ?? s.station ?? '') : '';
    if (els.turf) els.turf.textContent = s.turfText ?? s.turf ?? '';
    if (els.sideLine) els.sideLine.textContent = s.sideText ?? s.sideLine ?? s.side ?? '';
    if (els.objective) els.objective.textContent = s.objective ?? '';

    if (els.speed) {
      // Car speed arrives in m/s — the HUD shows km/h. The boat speed
      // already arrives in km/h (the boats speed helper converts it).
      if (s.inBoat) els.speed.textContent = `${Math.round(s.boatSpeed ?? s.speedKmh ?? 0)} km/h · BOAT`;
      else if (s.inCar) els.speed.textContent = `${Math.round((s.speedKmh ?? (s.speed ?? 0) * 3.6))} km/h`;
      else els.speed.textContent = '';
    }
    if (els.hint) {
      els.hint.textContent = s.phase6Hint || s.hint || contextHint(s);
    }

    drawMinimap(s);
  }

  /** A toast line for a few seconds (any previous toast is replaced). */
  function showToast(text, ms = 2600) {
    if (!els.toast) return;
    els.toast.textContent = text;
    els.toast.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.style.display = 'none';
      toastTimer = null;
    }, ms);
  }

  /** The white camera flash for the Shutterbug job: 140ms, then gone. */
  function showFlash() {
    if (!els.flash) return;
    els.flash.style.display = 'block';
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      els.flash.style.display = 'none';
      flashTimer = null;
    }, 140);
  }

  /** Toggle the mission-list panel; when showing, fill it with the
   *  text. Returns whether it is now showing. */
  function toggleMissionList(text) {
    if (!els.missionList) return false;
    listShowing = !listShowing;
    if (listShowing) {
      if (text !== undefined) els.missionList.textContent = text;
      els.missionList.style.display = 'block';
    } else {
      els.missionList.style.display = 'none';
    }
    return listShowing;
  }

  return { update, showToast, toggleMissionList, showFlash };
}
