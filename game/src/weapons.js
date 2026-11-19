// Weapons: Mara's pistol, bought at the gun shop on the downtown corner.
// A pistol changes the game: Mara can fight back instead of only running,
// but every shot in public is a crime — firing near witnesses raises heat,
// and hitting a patrol car makes the law hunt her harder. Ammo is scarce:
// a 12-round magazine, spare rounds bought with the gun, R reloads.
// Phase 4: the pistol shares the C key's neighbourhood, not its job — C is
// the camera on the Shutterbug tour, so the pistol stays on the mouse click
// and never fires while Mara is framing a photo.
import * as THREE from 'three';

export const GUN_PRICE = 400;
export const MAG_SIZE = 12;
export const SHOT_RANGE = 46;
export const SHOP_POS = new THREE.Vector3(10.5, 0, 62);
// Phase 6: the melee bat — cheap, longer reach than a bare fist, no ammo.
export const BAT_PRICE = 50;
export const BAT_REACH = 3.6;
// Phase 7: a box of reserve rounds — $60 for 24, sold at the same shop.
export const AMMO_BOX_PRICE = 60;
export const AMMO_BOX_ROUNDS = 24;

// A canvas sign for the shop front: green board, white lettering, no assets.
function shopSignTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#123524';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#7dff8a';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 244, 116);
  ctx.fillStyle = '#7dff8a';
  ctx.font = 'bold 44px Verdana, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GUN SHOP', 128, 58);
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 30px Verdana, sans-serif';
  ctx.fillText('PISTOL $400', 128, 102);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A boxy little pistol, floating and spinning above the shop marker.
function buildPistolMesh() {
  const group = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c1f24 });
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.22), dark);
  grip.position.y = -0.18;
  grip.rotation.z = 0.25;
  group.add(grip);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.9), dark);
  barrel.position.set(0, 0.12, 0.3);
  group.add(barrel);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.08), new THREE.MeshLambertMaterial({ color: 0xffd23f }));
  sight.position.set(0, 0.28, -0.05);
  group.add(sight);
  return group;
}

/** Create the weapons system. Returns the gun shop + pistol state. */
export function createWeapons(scene) {
  // Shop marker: sign board on two posts + a spinning pistol + a green beam.
  const shop = new THREE.Group();
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 3.2),
    new THREE.MeshLambertMaterial({ map: shopSignTexture() }),
  );
  sign.position.set(0, 4.4, 0);
  shop.add(sign);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x2e3438 });
  for (const x of [-3, 3]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.6, 6), postMat);
    post.position.set(x, 2.3, 0);
    shop.add(post);
  }
  const pistol = buildPistolMesh();
  pistol.position.set(0, 2.6, 0);
  pistol.scale.setScalar(1.6);
  shop.add(pistol);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 1.4, 18, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x7dff8a, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
  );
  beam.position.y = 9;
  shop.add(beam);
  // Phase 6: the bat for sale — a wooden slugger leaning on the shop post.
  const batMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.13, 1.5, 8),
    new THREE.MeshLambertMaterial({ color: 0x8a6a45 }),
  );
  batMesh.position.set(3.4, 1.4, 0.6);
  batMesh.rotation.z = 0.35;
  shop.add(batMesh);
  shop.position.copy(SHOP_POS);
  scene.add(shop);

  // Tracer: a bright line from the muzzle to the hit point, fades fast.
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
  tracer.frustumCulled = false;
  scene.add(tracer);
  // Muzzle flash: a small star of planes at the barrel tip.
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0 });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), flashMat);
  scene.add(flash);

  const weapons = {
    owned: false,
    bat: false, // Phase 6: the $50 melee bat from the same shop
    mag: 0,
    reserve: 0,
    cooldown: 0,
    reloadTimer: 0,
    flashTimer: 0,
    tracerTimer: 0,
    spinTimer: 0,
    lastShotPos: null, // where the last shot went off (peds flee from it)
    shotsFired: 0,
  };

  /** True when Mara stands close enough to buy from the shop. */
  function nearShop(pos, maxDist = 5) {
    return Math.hypot(pos.x - SHOP_POS.x, pos.z - SHOP_POS.z) < maxDist;
  }

  /** Buy the pistol. Returns 'ok', 'owned' or 'broke'. Money moves in main. */
  function buy(money) {
    if (weapons.owned) return 'owned';
    if (money < GUN_PRICE) return 'broke';
    weapons.owned = true;
    weapons.mag = MAG_SIZE;
    weapons.reserve = 36;
    return 'ok';
  }

  /**
   * Phase 6: buy the bat at the same shop — $50, no ammo, and a longer
   * swing than a bare fist. Returns 'ok', 'owned' or 'broke'.
   */
  function buyBat(money) {
    if (weapons.bat) return 'owned';
    if (money < BAT_PRICE) return 'broke';
    weapons.bat = true;
    return 'ok';
  }

  /**
   * Phase 7: buy a box of reserve rounds at the shop — $60 for 24.
   * Returns 'ok', 'no-gun' (buy the pistol first) or 'broke'. Money
   * moves in main.
   */
  function buyAmmo(money) {
    if (!weapons.owned) return 'no-gun';
    if (money < AMMO_BOX_PRICE) return 'broke';
    weapons.reserve += AMMO_BOX_ROUNDS;
    return 'ok';
  }

  /** Melee reach: the bat's 3.6m when owned, otherwise the bare-fist 2.4m. */
  function meleeReach() {
    return weapons.bat ? BAT_REACH : 2.4;
  }

  /** HUD line: pistol + rounds, or the shop hint when unarmed. */
  function ammoText() {
    if (!weapons.owned) return 'NO GUN — visit the GUN SHOP ($400)';
    if (weapons.mag === 0 && weapons.reserve === 0) return 'OUT OF AMMO — G at the shop, $60 a box';
    if (weapons.reloadTimer > 0) return `RELOADING… ${weapons.mag} / ${weapons.reserve}`;
    return `PISTOL ${weapons.mag} / ${weapons.reserve}`;
  }

  // Project a target onto the shot ray: returns the along-ray distance when
  // the target sits inside the cone, otherwise Infinity.
  function rayHit(origin, dir, targetPos, radius) {
    const dx = targetPos.x - origin.x;
    const dz = targetPos.z - origin.z;
    const along = dx * dir.x + dz * dir.z;
    if (along < 0.5 || along > SHOT_RANGE) return Infinity;
    const px = dx - dir.x * along;
    const pz = dz - dir.z * along;
    const perp = Math.hypot(px, pz);
    return perp < radius ? along : Infinity;
  }

  /**
   * Fire one round. origin: Mara's position, yaw: her facing (radians).
   * targets: { peds, traffic, police } — the live systems to hit.
   * Returns { kind, ... } or { kind: 'none' } / { kind: 'dry' } / null
   * when the trigger is still on cooldown or Mara is reloading.
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
    const dir = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const muzzle = new THREE.Vector3(origin.x + dir.x * 1.1, 1.45, origin.z + dir.z * 1.1);
    weapons.lastShotPos = muzzle.clone();

    // Nearest thing inside the shot cone wins: peds, traffic, patrol cars.
    let best = null;
    let bestD = SHOT_RANGE;
    for (const p of targets.peds?.peds || []) {
      if (p.down) continue;
      const d = rayHit(origin, dir, p.pos, 1.4);
      if (d < bestD) { bestD = d; best = { kind: 'ped', ped: p }; }
    }
    for (const w of targets.traffic?.cars || []) {
      const d = rayHit(origin, dir, w.car.pos, 2.4);
      if (d < bestD) { bestD = d; best = { kind: 'traffic', car: w.car }; }
    }
    for (const unit of targets.police?.cars || []) {
      const d = rayHit(origin, dir, unit.car.pos, 2.4);
      if (d < bestD) { bestD = d; best = { kind: 'police', car: unit.car, unit }; }
    }
    const end = new THREE.Vector3(origin.x + dir.x * bestD, 1.3, origin.z + dir.z * bestD);
    const posAttr = tracer.geometry.getAttribute('position');
    posAttr.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
    posAttr.setXYZ(1, end.x, end.y, end.z);
    posAttr.needsUpdate = true;
    tracer.material.opacity = 0.95;
    weapons.tracerTimer = 0.09;
    flash.position.copy(muzzle);
    flash.material.opacity = 1;
    weapons.flashTimer = 0.06;
    if (best) {
      if (best.kind === 'ped') targets.peds.knockDown(best.ped);
      return { kind: best.kind, car: best.car || null, unit: best.unit || null, dist: bestD };
    }
    return { kind: 'none', dist: bestD };
  }

  /** Start a reload: 1.1s, then the magazine refills from the reserve. */
  function reload() {
    if (!weapons.owned || weapons.reloadTimer > 0) return false;
    if (weapons.mag >= MAG_SIZE || weapons.reserve <= 0) return false;
    weapons.reloadTimer = 1.1;
    return true;
  }

  /** Stage the pistol for a screenshot pose (bought, loaded). */
  function stageOwned(mag = MAG_SIZE, reserve = 36) {
    weapons.owned = true;
    weapons.mag = mag;
    weapons.reserve = reserve;
  }

  function update(dt) {
    weapons.spinTimer += dt;
    pistol.rotation.y = weapons.spinTimer * 1.4;
    pistol.position.y = 2.6 + Math.sin(weapons.spinTimer * 2) * 0.25;
    if (weapons.cooldown > 0) weapons.cooldown -= dt;
    if (weapons.reloadTimer > 0) {
      weapons.reloadTimer -= dt;
      if (weapons.reloadTimer <= 0) {
        const need = MAG_SIZE - weapons.mag;
        const take = Math.min(need, weapons.reserve);
        weapons.mag += take;
        weapons.reserve -= take;
      }
    }
    if (weapons.tracerTimer > 0) {
      weapons.tracerTimer -= dt;
      if (weapons.tracerTimer <= 0) tracer.material.opacity = 0;
    }
    if (weapons.flashTimer > 0) {
      weapons.flashTimer -= dt;
      flash.material.opacity = Math.max(0, weapons.flashTimer / 0.06);
      flash.rotation.z += dt * 20;
    }
  }

  weapons.nearShop = nearShop;
  weapons.buy = buy;
  weapons.buyBat = buyBat;
  weapons.buyAmmo = buyAmmo;
  weapons.meleeReach = meleeReach;
  weapons.ammoText = ammoText;
  weapons.shoot = shoot;
  weapons.reload = reload;
  weapons.stageOwned = stageOwned;
  weapons.update = update;
  weapons.shopPos = SHOP_POS;
  return weapons;
}
