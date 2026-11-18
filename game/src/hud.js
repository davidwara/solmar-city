// HUD: health, money, wanted stars, objective line, and a live 2D minimap.
// The minimap is a top-down canvas: roads, beach, sea, the player arrow,
// parked cars and the current objective marker.
import { CITY } from './city.js';

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
  };
  const ctx = els.minimap.getContext('2d');
  const S = els.minimap.width; // 190
  const WORLD_MIN = -240;
  const WORLD_MAX = 280;
  const scale = S / (WORLD_MAX - WORLD_MIN);
  function toMap(x, z) {
    return [(x - WORLD_MIN) * scale, (z - WORLD_MIN) * scale];
  }

  function drawMinimap(playerPos, heading, cars, inCar, objectivePos) {
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
    // Objective marker (marina).
    if (objectivePos) {
      const [ox, oy] = toMap(objectivePos.x, objectivePos.z);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(ox, oy - 7); ctx.lineTo(ox + 6, oy); ctx.lineTo(ox, oy + 7); ctx.lineTo(ox - 6, oy);
      ctx.closePath(); ctx.fill();
    }
    // Cars.
    for (const car of cars) {
      const [cx, cy] = toMap(car.pos.x, car.pos.z);
      ctx.fillStyle = car.driven ? '#ffffff' : '#ff8a3d';
      ctx.beginPath(); ctx.arc(cx, cy, car.driven ? 4 : 3, 0, Math.PI * 2); ctx.fill();
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

  function update(state) {
    els.healthFill.style.width = state.health + '%';
    els.healthText.textContent = Math.round(state.health);
    els.money.textContent = '$' + state.money.toLocaleString('en-US');
    els.wanted.textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
    els.objective.textContent = state.objective;
    els.speed.textContent = state.inCar
      ? Math.round(Math.abs(state.speed) * 3.6) + ' km/h'
      : '';
    els.hint.textContent = state.inCar
      ? 'WASD drive · E exit car · P pause'
      : (state.nearCar ? 'E — take the car' : 'WASD move · Shift run · Space jump · E enter car · P pause');
    drawMinimap(state.playerPos, state.heading, state.cars, state.inCar, state.objectivePos);
  }

  return { update };
}

/** Show or hide the start screen / pause menu overlays. */
export function showScreen(id) {
  for (const name of ['start-screen', 'pause-screen']) {
    const el = document.getElementById(name);
    if (el) el.style.display = name === id ? 'flex' : 'none';
  }
}
