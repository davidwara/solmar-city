// weapons.js — Mara's pistol, the melee bat, and spare rounds.
//
// All three are sold at the gun shop on the downtown corner. A pistol
// changes the game: Mara can fight back instead of only running, but every
// shot in public is a crime — firing near witnesses raises heat, and
// hitting a patrol car makes the law hunt her harder. Ammo is scarce:
// a 12-round magazine, spare rounds bought with the gun, R reloads.
import * as THREE from 'three';

export const GUN_PRICE = 400;
export const MAG_SIZE = 12;
export const SHOT_RANGE = 46;
export const SHOP_POS = new THREE.Vector3(10.5, 0, 62);
export const BAT_PRICE = 50;
export const BAT_REACH = 3.6;
export const AMMO_BOX_PRICE = 60;
export const AMMO_BOX_ROUNDS = 24;

export function createWeapons(scene) {
  // --- The gun shop, at SHOP_POS ---------------------------------------
  const shop = new THREE.Group();
  shop.position.copy(SHOP_POS);

  // Sign board: dark green, bright border, gold price line.
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 256;
  signCanvas.height = 128;
  const sg = signCanvas.getContext('2d');
  sg.fillStyle = '#123524';
  sg.fillRect(0, 0, 256, 128);
  sg.strokeStyle = '#2eff7a';
  sg.lineWidth = 6;
  sg.strokeRect(6, 6, 244, 116);
  sg.fillStyle = '#ffffff';
  sg.font = 'bold 44px Verdana';
  sg.textAlign = 'center';
  sg.fillText('GUN SHOP', 128, 58);
  sg.fillStyle = '#ffd23f';
  sg.font = 'bold 30px Verdana';
  sg.fillText('PISTOL $400', 128, 102);
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 3.2),
    new THREE.MeshBasicMaterial({ map: signTex })
  );
  sign.position.y = 4.4;
  shop.add(sign);

  // Two posts holding the sign up.
  const postMat = new THREE.MeshLambertMaterial({ color: 0x2e3438 });
  for (const sx of [-3, 3]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.6, 6), postMat);
    post.position.set(sx, 2.3, 0);
    shop.add(post);
  }

  // Spinning display pistol: tilted grip, barrel, gold sight.
  const pistol = new THREE.Group();
  const gunmetal = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const brass = new THREE.MeshLambertMaterial({ color: 0xffd23f });
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.12), gunmetal);
  grip.position.set(-0.18, -0.12, 0);
  grip.rotation.z = 0.35;
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.13, 0.12), gunmetal);
  barrel.position.set(0.12, 0.12, 0);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), brass);
  sight.position.set(0.3, 0.22, 0);
  pistol.add(grip, barrel, sight);
  pistol.scale.setScalar(1.6);
  pistol.position.y = 2.6;
  shop.add(pistol);

  // Green beacon beam so the shop reads from across downtown.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 1.4, 18, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x7dff8a, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
  );
  beam.position.y = 9;
  shop.add(beam);

  // A wooden bat for sale, leaning on the right post.
  const batMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.13, 1.5, 8),
    new THREE.MeshLambertMaterial({ color: 0x8a6a45 })
  );
  batMesh.position.set(3.4, 1.4, 0.6);
  batMesh.rotation.z = 0.35;
  shop.add(batMesh);
  scene.add(shop);

  // --- Shot feedback: tracer line + muzzle flash -----------------------
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 });
  const tracer = new THREE.Line(tracerGeo, tracerMat);
  tracer.frustumCulled = false;
  scene.add(tracer);

  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0, side: THREE.DoubleSide });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), flashMat);
  scene.add(flash);

  const weapons = {
    owned: false,
    bat: false,
    mag: 0,
    reserve: 0,
    cooldown: 0,
    reloadTimer: 0,
    flashTimer: 0,
    tracerTimer: 0,
    spinTimer: 0,
    lastShotPos: null,
    shotsFired: 0,
    nearShop,
    buy,
    buyBat,
    buyAmmo,
    meleeReach,
    ammoText,
    shoot,
    reload,
    stageOwned,
    update,
    shopPos: SHOP_POS,
  };

  function nearShop(pos, maxDist = 5) {
    return Math.hypot(pos.x - SHOP_POS.x, pos.z - SHOP_POS.z) <= maxDist;
  }

  function buy(money) {
    if (weapons.owned) return 'owned';
    if (money < GUN_PRICE) return 'broke';
    weapons.owned = true;
    weapons.mag = MAG_SIZE;
    weapons.reserve = 36;
    return 'ok';
  }

  function buyBat(money) {
    if (weapons.bat) return 'owned';
    if (money < BAT_PRICE) return 'broke';
    weapons.bat = true;
    return 'ok';
  }

  function buyAmmo(money) {
    if (!weapons.owned) return 'no-gun';
    if (money < AMMO_BOX_PRICE) return 'broke';
    weapons.reserve += AMMO_BOX_ROUNDS;
    return 'ok';
  }

  function meleeReach() {
    return weapons.bat ? BAT_REACH : 2.4;
  }

  function ammoText() {
    if (!weapons.owned) return 'NO GUN — visit the GUN SHOP ($400)';
    if (weapons.mag === 0 && weapons.reserve === 0) return 'OUT OF AMMO — G at the shop, $60 a box';
    if (weapons.reloadTimer > 0) return `RELOADING… ${weapons.mag} / ${weapons.reserve}`;
    return `PISTOL ${weapons.mag} / ${weapons.reserve}`;
  }

  /**
   * Fire one round along `yaw` from `origin`. `targets` carries the
   * pedestrians, traffic cars and police cars to test, plus (when the
   * caller wires it) a knockDown for the peds system. Nearest hit wins.
   */
  function shoot(origin, yaw, targets) {
    if (!weapons.owned || weapons.cooldown > 0 || weapons.reloadTimer > 0) return null;
    if (weapons.mag <= 0) {
      weapons.cooldown = 0.3;
      return { kind: 'dry' };
    }
    weapons.cooldown = 0.22;
    weapons.mag -= 1;
    weapons.shotsFired += 1;

    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const muzzle = new THREE.Vector3(origin.x + fx * 1.1, 1.45, origin.z + fz * 1.1);

    let bestKind = 'none';
    let bestDist = SHOT_RANGE;
    let bestPed = null;
    let bestCar = null;
    let bestUnit = null;

    // A target counts when it sits inside the cone: 0.5..range along the
    // ray and closer than its radius perpendicular to it.
    const consider = (pos, radius, kind, ref) => {
      const dx = pos.x - muzzle.x;
      const dz = pos.z - muzzle.z;
      const along = dx * fx + dz * fz;
      if (along < 0.5 || along > SHOT_RANGE) return;
      if (Math.abs(dx * fz - dz * fx) >= radius) return;
      if (along < bestDist) {
        bestDist = along;
        bestKind = kind;
        bestPed = ref.ped || null;
        bestCar = ref.car || null;
        bestUnit = ref.unit || null;
      }
    };

    const t = targets || {};
    for (const p of t.peds || t.pedestrians || []) {
      if (!p.down) consider(p.pos, 1.4, 'ped', { ped: p });
    }
    for (const entry of t.traffic || t.trafficCars || []) {
      const c = entry.car || entry;
      consider(c.pos, 2.4, 'traffic', { car: c });
    }
    for (const entry of t.police || t.policeCars || []) {
      const c = entry.car || entry;
      consider(c.pos, 2.4, 'police', { car: c, unit: entry });
    }

    // Draw the tracer to the hit point (or the full range on a miss).
    const endX = muzzle.x + fx * bestDist;
    const endZ = muzzle.z + fz * bestDist;
    const attr = tracerGeo.attributes.position;
    attr.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
    attr.setXYZ(1, endX, muzzle.y, endZ);
    attr.needsUpdate = true;
    tracerMat.opacity = 0.95;
    weapons.tracerTimer = 0.09;
    flash.position.copy(muzzle);
    flashMat.opacity = 1;
    weapons.flashTimer = 0.06;
    weapons.lastShotPos = muzzle.clone();

    if (bestKind === 'ped' && bestPed) {
      if (typeof t.knockDown === 'function') t.knockDown(bestPed);
      else if (typeof bestPed.knockDown === 'function') bestPed.knockDown();
      else {
        bestPed.down = true;
        bestPed.downTimer = 2.8;
        bestPed.group.rotation.x = -Math.PI / 2 + 0.15;
        bestPed.group.position.y = 0.35;
      }
      return { kind: 'ped', dist: bestDist };
    }
    if (bestKind === 'traffic') return { kind: 'traffic', car: bestCar, dist: bestDist };
    if (bestKind === 'police') return { kind: 'police', car: bestCar, unit: bestUnit, dist: bestDist };
    return { kind: 'none', dist: bestDist };
  }

  function reload() {
    if (!weapons.owned || weapons.reloadTimer > 0 || weapons.mag >= MAG_SIZE || weapons.reserve <= 0) return false;
    weapons.reloadTimer = 1.1;
    return true;
  }

  /** Mark the pistol owned with the given ammo (screenshot poses). */
  function stageOwned(mag = MAG_SIZE, reserve = 36) {
    weapons.owned = true;
    weapons.mag = mag;
    weapons.reserve = reserve;
  }

  function update(dt) {
    weapons.spinTimer += dt;
    pistol.rotation.y = weapons.spinTimer * 1.4;
    pistol.position.y = 2.6 + Math.sin(weapons.spinTimer * 2) * 0.25;
    if (weapons.cooldown > 0) weapons.cooldown = Math.max(0, weapons.cooldown - dt);
    if (weapons.reloadTimer > 0) {
      weapons.reloadTimer -= dt;
      if (weapons.reloadTimer <= 0) {
        weapons.reloadTimer = 0;
        const moved = Math.min(MAG_SIZE - weapons.mag, weapons.reserve);
        weapons.mag += moved;
        weapons.reserve -= moved;
      }
    }
    if (weapons.tracerTimer > 0) {
      weapons.tracerTimer -= dt;
      if (weapons.tracerTimer <= 0) tracerMat.opacity = 0;
    }
    if (weapons.flashTimer > 0) {
      weapons.flashTimer -= dt;
      flashMat.opacity = Math.max(0, weapons.flashTimer / 0.06);
      flash.rotation.z += dt * 20;
    }
  }

  return weapons;
}
