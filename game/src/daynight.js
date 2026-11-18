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

/** "07:30" / "23:05" style clock text for the HUD. */
export function formatClock(hours) {
  const h = Math.floor(((hours % 24) + 24) % 24);
  const m = Math.floor((((hours % 24) + 24) % 24 - h) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
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
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(9, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xe8eef7 }),
  );
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
    for (const g of glows) g.material.opacity = k.night * 0.85;
    if (city.lampMat) city.lampMat.color.setHex(k.night > 0.5 ? 0xffe9a8 : 0xfff2c0);
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
  daynight.apply = apply;
  daynight.setHours = setHours;
  daynight.update = update;
  daynight.clockText = () => formatClock(daynight.hours);
  return daynight;
}
