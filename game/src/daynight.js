// Day / night cycle: Solmar City runs on a living clock.
// The sun arcs across the sky, dusk turns the sky orange, night turns it
// deep blue and the street lamps glow — driving at night feels different,
// and the "Night Run" job only makes sense after dark. Time advances slowly
// in play (a full day takes ~24 minutes) and can be set directly for
// screenshots. The HUD clock reads this clock.
import * as THREE from 'three';

// One game hour lasts this many real seconds while playing.
export const SECONDS_PER_HOUR = 60;

const SKY_DAY = new THREE.Color(0x87bfe8);
const SKY_DUSK = new THREE.Color(0xff9a52);
const SKY_NIGHT = new THREE.Color(0x0d1b33);
const FOG_DAY = new THREE.Color(0x9fc6e8);
const FOG_NIGHT = new THREE.Color(0x16233a);

// Keyframes: [hour, sky colour, fog colour, sun intensity, hemi intensity]
const KEYS = [
  [0, SKY_NIGHT, FOG_NIGHT, 0.0, 0.28],
  [5, SKY_NIGHT, FOG_NIGHT, 0.0, 0.28],
  [7, SKY_DAY, FOG_DAY, 1.4, 0.8],
  [12, SKY_DAY, FOG_DAY, 2.1, 0.95],
  [17, SKY_DAY, FOG_DAY, 1.9, 0.9],
  [19, SKY_DUSK, FOG_DAY, 1.1, 0.6],
  [20.5, SKY_NIGHT, FOG_NIGHT, 0.0, 0.32],
  [24, SKY_NIGHT, FOG_NIGHT, 0.0, 0.28],
];

function sampleKeys(hours) {
  if (!Number.isFinite(hours)) hours = 10;
  const h = ((hours % 24) + 24) % 24;
  let a = KEYS[0];
  let b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (h >= KEYS[i][0] && h <= KEYS[i + 1][0]) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  }
  const span = Math.max(0.0001, b[0] - a[0]);
  const t = Math.min(1, Math.max(0, (h - a[0]) / span));
  return {
    sky: a[1].clone().lerp(b[1], t),
    fog: a[2].clone().lerp(b[2], t),
    sun: a[3] + (b[3] - a[3]) * t,
    hemi: a[4] + (b[4] - a[4]) * t,
    night: h < 6 || h >= 20 ? 1 : h < 7 ? (7 - h) : h < 19 ? 0 : h < 20 ? (h - 19) : 1,
  };
}

/**
 * Lighthouse beam brightness for an hour: 0 by day, 1 in the deep night,
 * ramping smoothly up at dusk (19:00–20:30) and down at dawn (05:00–07:00)
 * so the beam fades in and out instead of snapping. island.js drives the
 * beam cone and lamp from this value.
 */
export function lighthouseBeamIntensity(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 20.5 || h < 5) return 1;
  if (h < 7) return 1 - (h - 5) / 2;
  if (h < 19) return 0;
  return (h - 19) / 1.5;
}

/** "07:30" / "23:05" style clock text for the HUD. */
export function formatClock(hours) {
  const h = ((hours % 24) + 24) % 24;
  const hh = Math.floor(h);
  return String(hh).padStart(2, '0') + ':' + String(Math.floor((h - hh) * 60)).padStart(2, '0');
}

/**
 * Phase 6: true in the golden hour (17:00–19:00), when the bay turns to
 * copper — fishing's Golden Koi bites twice as often then, and the
 * screenshot poses use it for their warmest light.
 */
export function isGoldenHour(hours) {
  const h = ((hours % 24) + 24) % 24;
  return h >= 17 && h < 19;
}

/**
 * Phase 7: how far into dusk the hour is, 0 at 19:00 rising to 1 at
 * 20:30 — the lamps ramp up through it instead of snapping on at dark.
 */
export function duskFactor(hours) {
  const h = ((hours % 24) + 24) % 24;
  if (h < 19 || h >= 20.5) return 0;
  return (h - 19) / 1.5;
}

/** Create the day/night system. The city starts at 10:00, mid-morning. */
export function createDayNight(scene, city) {
  // Lamp glows: soft additive sprites at every street lamp, invisible by
  // day and glowing amber at night. Lamp positions match city.js.
  const glowTex = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255, 220, 130, 0.9)');
    g.addColorStop(1, 'rgba(255, 220, 130, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  })();
  const glows = [];
  for (const s of [-124, 0, 124]) {
    for (let z = -180; z <= 180; z += 62) {
      const mat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(s + 8.5, 6.2, z);
      sprite.scale.setScalar(7);
      scene.add(sprite);
      glows.push(sprite);
    }
  }
  // A pale moon that only shows at night.
  const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 10), new THREE.MeshBasicMaterial({ color: 0xe8eef7 }));
  moon.position.set(-260, 190, -180);
  moon.visible = false;
  scene.add(moon);

  const daynight = {
    hours: 10,
    nightFactor: 0,
    isNight: false,
    stormDim: 0, // Phase 4: weather sets this 0..1 in a storm to dim the sun
  };

  /** Apply the light for the current hour to the scene. */
  function apply() {
    const k = sampleKeys(daynight.hours);
    scene.background.copy(k.sky);
    if (scene.fog) scene.fog.color.copy(k.fog);
    // Sun: rises east, sets west; below the horizon at night.
    const dayFrac = (daynight.hours - 6) / 12; // 0 at 06:00, 1 at 18:00
    const ang = Math.PI * Math.max(0, Math.min(1, dayFrac));
    city.sun.position.set(Math.cos(ang) * 220 - 40, Math.max(12, Math.sin(ang) * 200), 60);
    city.sun.intensity = k.sun * (1 - daynight.stormDim * 0.45);
    city.sun.color.setHex(daynight.hours >= 17 && daynight.hours < 20 ? 0xffb36b : 0xffe6b0);
    city.hemi.intensity = k.hemi * (1 - daynight.stormDim * 0.3);
    daynight.nightFactor = k.night;
    daynight.isNight = k.night > 0.5;
    // Phase 7: the lamps wake up early — in the golden hour (17:00–19:00)
    // they already glow at a third strength, then ramp up through dusk
    // (19:00–20:30), so evening never snaps dark.
    const lampGlow = Math.max(k.night, isGoldenHour(daynight.hours) ? 0.35 : 0, duskFactor(daynight.hours) * 0.6);
    for (const g of glows) g.material.opacity = lampGlow * 0.85;
    if (city.lampMat) city.lampMat.color.setHex(lampGlow > 0.2 ? 0xffe9a8 : 0xfff2c0);
    moon.visible = daynight.isNight;
  }

  /** Jump to an hour (used by screenshots and the Night Run job). */
  function setHours(h) {
    daynight.hours = ((h % 24) + 24) % 24;
    apply();
  }

  /** Advance the clock while playing; night falls, then morning comes. */
  function update(dt) {
    daynight.hours = (daynight.hours + dt / SECONDS_PER_HOUR) % 24;
    apply();
  }

  apply();
  Object.assign(daynight, { apply, setHours, update,
    clockText: () => formatClock(daynight.hours),
    isGoldenHour: () => isGoldenHour(daynight.hours) });
  return daynight;
}
