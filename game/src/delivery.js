// Courier side-jobs: parcels for cash, on foot or behind the wheel.
// Three depots take parcels — Downtown, Westside, and the Marina Market
// — and Mara delivers them to doorsteps all over the city. Press E at a
// depot to pick a parcel up; the drop point shows on the minimap and the
// clock starts. Deliver fast and the tip grows: a base $40 plus up to
// $60 for speed. Let the timer run out and the parcel goes back to the
// depot unpaid. Jobs done and tips earned are saved with the game, and
// the depot markers stay on the minimap so a courier never gets lost.
import * as THREE from 'three';
import { MARINA_MARKET_POS } from './boats.js';
import { formatMoney } from './utils.js';

export const DEPOTS = [
  // Depots stand on sidewalks, not block centres — a block centre is
  // where the buildings are, and the collision push would shove Mara
  // out of pickup range. Sidewalk spots stay walkable.
  { id: 'downtown', name: 'Downtown Depot', x: 10.5, z: 31 },
  { id: 'westside', name: 'Westside Depot', x: -72.5, z: 93 },
  { id: 'marina', name: 'Marina Market', x: MARINA_MARKET_POS.x, z: MARINA_MARKET_POS.z },
];

// Doorsteps all over the city — sidewalk and beachfront spots, never a
// block centre, so Mara can always walk right up to the gold diamond.
const DROPS = [
  { x: -176, z: -114, label: 'North Flats' },
  { x: 176, z: -114, label: 'East Towers' },
  { x: -176, z: 114, label: 'West Docks' },
  { x: 135, z: 140, label: 'Casino Row' },
  { x: -10, z: -73, label: 'Old Town' },
  { x: 73, z: 31, label: 'Market Lane' },
  { x: -31, z: 197, label: 'Beachfront' },
  { x: 40, z: 360, label: 'Island Villa Row' },
];

const BASE_PAY = 40;
const MAX_TIP = 60;

export function createDelivery(scene) {
  // A parcel crate and a painted sign at each depot so they read as
  // workplaces, not empty street corners.
  for (const depot of DEPOTS) {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 2.4, 2.4),
      new THREE.MeshLambertMaterial({ color: 0xd9a441 }),
    );
    crate.position.set(depot.x + 3, 1.2, depot.z);
    scene.add(crate);
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 4.4, 6),
      new THREE.MeshLambertMaterial({ color: 0x2e3438 }),
    );
    post.position.set(depot.x - 3, 2.2, depot.z);
    scene.add(post);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.1, 0.15),
      new THREE.MeshLambertMaterial({ color: 0x7fb3c8 }),
    );
    sign.position.set(depot.x - 3, 4.6, depot.z);
    scene.add(sign);
    depot._crate = crate;
  }

  // The drop marker: a floating gold diamond over the doorstep.
  const dropMarker = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color: 0xffd23f }),
  );
  dropMarker.visible = false;
  scene.add(dropMarker);

  const delivery = {
    job: null, // { depot, drop, timeLeft, timeTotal }
    jobsDone: 0,
    tipsEarned: 0,
    jobsFailed: 0,
    lastResult: '',
  };

  /** The depot Mara stands at (within 6m), or null. */
  function nearDepot(pos) {
    for (const depot of DEPOTS) {
      if (Math.hypot(pos.x - depot.x, pos.z - depot.z) < 6) return depot;
    }
    return null;
  }

  /**
   * Pick up a parcel at a depot. Returns the job, or null when Mara
   * already carries one (finish it first) or stands nowhere near a depot.
   */
  function pickup(pos) {
    if (delivery.job) return null;
    const depot = nearDepot(pos);
    if (!depot) return null;
    let drop = DROPS[Math.floor(Math.random() * DROPS.length)];
    // Never deliver back to the depot she just left.
    while (Math.hypot(drop.x - depot.x, drop.z - depot.z) < 40) {
      drop = DROPS[Math.floor(Math.random() * DROPS.length)];
    }
    const dist = Math.hypot(drop.x - depot.x, drop.z - depot.z);
    const timeTotal = Math.round(30 + dist / 3.2);
    delivery.job = { depot, drop, timeLeft: timeTotal, timeTotal };
    dropMarker.position.set(drop.x, 3.2, drop.z);
    dropMarker.visible = true;
    return delivery.job;
  }

  /**
   * Advance the job clock. Returns an event when the parcel lands or
   * the timer runs out: { delivered, pay, tip } or { failed: true }.
   */
  function update(dt, focusPos) {
    if (dropMarker.visible) {
      dropMarker.rotation.y += dt * 2;
      dropMarker.position.y = 3.2 + Math.sin(performance.now() * 0.002) * 0.4;
    }
    if (!delivery.job) return null;
    const job = delivery.job;
    job.timeLeft -= dt;
    if (job.timeLeft <= 0) {
      delivery.job = null;
      delivery.jobsFailed += 1;
      dropMarker.visible = false;
      delivery.lastResult = 'Parcel late — it went back to the depot unpaid.';
      return { failed: true };
    }
    const d = Math.hypot(focusPos.x - job.drop.x, focusPos.z - job.drop.z);
    if (d < 5) {
      const tip = Math.round((job.timeLeft / job.timeTotal) * MAX_TIP);
      const pay = BASE_PAY + tip;
      delivery.jobsDone += 1;
      delivery.tipsEarned += tip;
      delivery.job = null;
      dropMarker.visible = false;
      delivery.lastResult = `Delivered to ${job.drop.label} — ${formatMoney(BASE_PAY)} + ${formatMoney(tip)} tip.`;
      return { delivered: true, pay, tip };
    }
    return null;
  }

  function statusText() {
    if (delivery.job) {
      const job = delivery.job;
      return `Parcel → ${job.drop.label} · ${Math.ceil(job.timeLeft)}s left`;
    }
    if (delivery.jobsDone > 0) return `Courier: ${delivery.jobsDone} delivered · ${formatMoney(delivery.tipsEarned)} in tips`;
    return '';
  }

  function promptText() {
    if (delivery.job) return 'Deliver the parcel — gold diamond on the minimap';
    return 'E — pick up a parcel';
  }

  /** Minimap markers: blue depots, gold drop while a job runs. */
  function markers() {
    const out = DEPOTS.map((d) => ({ x: d.x, z: d.z, color: '#7fb3c8', shape: 'square', r: 4 }));
    if (delivery.job) {
      out.push({ x: delivery.job.drop.x, z: delivery.job.drop.z, color: '#ffd23f', shape: 'diamond', r: 6 });
    }
    return out;
  }

  function saveData() {
    return { jobsDone: delivery.jobsDone, tipsEarned: delivery.tipsEarned, jobsFailed: delivery.jobsFailed };
  }

  function restore(data) {
    if (!data) return;
    if (typeof data.jobsDone === 'number') delivery.jobsDone = data.jobsDone;
    if (typeof data.tipsEarned === 'number') delivery.tipsEarned = data.tipsEarned;
    if (typeof data.jobsFailed === 'number') delivery.jobsFailed = data.jobsFailed;
  }

  delivery.nearDepot = nearDepot;
  delivery.pickup = pickup;
  delivery.update = update;
  delivery.statusText = statusText;
  delivery.promptText = promptText;
  delivery.markers = markers;
  delivery.saveData = saveData;
  delivery.restore = restore;
  return delivery;
}
