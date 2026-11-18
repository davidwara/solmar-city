// Biscuit: the stray dog who adopted Mara. He trots after her everywhere
// — through downtown, onto the beach, and (if she is quick) onto the
// island causeway — wagging his tail and barking at gang members who get
// too close. He has a nose for hidden packages: press V and he runs
// toward the nearest one still out there and barks at it. He gets hungry,
// though — press H to buy him a $10 snack from her wallet, and a happy
// Biscuit walks closer and keeps up better. Happiness fades slowly over
// time, so the snacks are a standing cost of friendship.
import * as THREE from 'three';
import { clampAngle } from './utils.js';

export const SNACK_PRICE = 10;
const FOLLOW_CLOSE = 2.6;
const FOLLOW_FAR = 6.5;

export function createPets(scene, audio, collectibles, gangs) {
  // Biscuit: a tan dog built from boxes — body, head, snout, two ears,
  // four legs and a tail that wags when he is happy.
  const tan = new THREE.MeshLambertMaterial({ color: 0xc89a5a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x5a4028 });
  const dog = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 1.25), tan);
  body.position.y = 0.62;
  dog.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.55), tan);
  head.position.set(0, 0.95, 0.8);
  dog.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.35), dark);
  snout.position.set(0, 0.88, 1.2);
  dog.add(snout);
  const earL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.35, 0.2), dark);
  earL.position.set(-0.24, 1.2, 0.72);
  dog.add(earL);
  const earR = earL.clone();
  earR.position.x = 0.24;
  dog.add(earR);
  const legs = [];
  for (const [lx, lz] of [[-0.24, 0.45], [0.24, 0.45], [-0.24, -0.45], [0.24, -0.45]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), dark);
    leg.position.set(lx, 0.25, lz);
    dog.add(leg);
    legs.push(leg);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.55), tan);
  tail.position.set(0, 0.85, -0.85);
  dog.add(tail);
  dog.position.set(3, 0, -16);
  scene.add(dog);

  const pets = {
    happiness: 70, // starts friendly; snacks top it up
    snacksGiven: 0,
    packagesFound: 0,
    pointing: null, // package pos Biscuit is running toward, or null
    barkCooldown: 0,
    pos: dog.position,
    lastPoint: '',
  };

  /** Feed Biscuit a $10 snack. Returns false when Mara cannot afford it. */
  function feed(money) {
    if (money < SNACK_PRICE) return false;
    pets.happiness = Math.min(100, pets.happiness + 25);
    pets.snacksGiven += 1;
    if (audio && audio.dogBark) audio.dogBark();
    return true;
  }

  /** Point Biscuit at the nearest hidden package still out there. */
  function point(playerPos) {
    if (!collectibles || !collectibles.nearestPackage) return false;
    const target = collectibles.nearestPackage(playerPos);
    if (!target) {
      pets.lastPoint = 'Biscuit sniffs the air — no packages left to find.';
      return false;
    }
    pets.pointing = { x: target.x, z: target.z };
    pets.lastPoint = 'Biscuit caught a scent — follow him!';
    if (audio && audio.dogBark) audio.dogBark();
    return true;
  }

  function bark() {
    if (pets.barkCooldown > 0) return;
    pets.barkCooldown = 4;
    if (audio && audio.dogBark) audio.dogBark();
  }

  function update(dt, playerPos, playerMoving) {
    pets.barkCooldown = Math.max(0, pets.barkCooldown - dt);
    // Happiness fades: one point a minute, so the snacks never stop.
    pets.happiness = Math.max(0, pets.happiness - dt / 60);
    const followDist = FOLLOW_CLOSE + (FOLLOW_FAR - FOLLOW_CLOSE) * (1 - pets.happiness / 100);

    // Gang members too close get a bark — Biscuit does not like them.
    if (gangs && gangs.rivalsNear) {
      const near = gangs.rivalsNear(playerPos, 12);
      if (near.length > 0) bark();
    }

    // Target: a package he is pointing at, otherwise Mara's heel.
    let tx = playerPos.x;
    let tz = playerPos.z;
    if (pets.pointing) {
      tx = pets.pointing.x;
      tz = pets.pointing.z;
      const pd = Math.hypot(tx - dog.position.x, tz - dog.position.z);
      if (pd < 2.5) {
        pets.packagesFound += 1;
        pets.pointing = null;
        bark();
      }
    }
    const dx = tx - dog.position.x;
    const dz = tz - dog.position.z;
    const dist = Math.hypot(dx, dz);
    // Too far behind and he just appears at her heel — no lost dogs.
    if (!pets.pointing && dist > 30) {
      dog.position.set(playerPos.x + 2, 0, playerPos.z + 2);
    } else if (dist > followDist) {
      const speed = pets.pointing ? 7.5 : playerMoving ? 6.5 : 5;
      const step = Math.min(dist - followDist * 0.5, speed * dt);
      dog.position.x += (dx / dist) * step;
      dog.position.z += (dz / dist) * step;
      const want = Math.atan2(dx, dz);
      dog.rotation.y += clampAngle(want - dog.rotation.y) * Math.min(1, dt * 8);
    }
    // Tail wags faster the happier he is; legs trot when he moves.
    const wag = 4 + (pets.happiness / 100) * 10;
    tail.rotation.y = Math.sin(performance.now() * 0.001 * wag) * 0.6;
    const moving = dist > followDist + 0.2;
    legs.forEach((leg, i) => {
      leg.rotation.x = moving ? Math.sin(performance.now() * 0.012 + (i % 2) * Math.PI) * 0.5 : 0;
    });
  }

  function statusText() {
    const mood = pets.happiness >= 80 ? 'thrilled' : pets.happiness >= 50 ? 'happy' : pets.happiness >= 25 ? 'peckish' : 'hungry';
    if (pets.pointing) return `Biscuit (${mood}) — following a scent!`;
    if (pets.lastPoint && pets.packagesFound === 0) return `Biscuit (${mood})`;
    return `Biscuit (${mood}) · ${pets.packagesFound} packages sniffed out`;
  }

  function promptText() {
    return 'H — snack $10 · V — Biscuit, find a package';
  }

  /** Minimap marker: Biscuit's brown dot. */
  function markers() {
    return [{ x: dog.position.x, z: dog.position.z, color: '#c89a5a', shape: 'dot', r: 3 }];
  }

  function saveData() {
    return { happiness: Math.round(pets.happiness), snacksGiven: pets.snacksGiven, packagesFound: pets.packagesFound };
  }

  function restore(data) {
    if (!data) return;
    if (typeof data.happiness === 'number') pets.happiness = Math.max(0, Math.min(100, data.happiness));
    if (typeof data.snacksGiven === 'number') pets.snacksGiven = data.snacksGiven;
    if (typeof data.packagesFound === 'number') pets.packagesFound = data.packagesFound;
  }

  pets.feed = feed;
  pets.point = point;
  pets.update = update;
  pets.statusText = statusText;
  pets.promptText = promptText;
  pets.markers = markers;
  pets.saveData = saveData;
  pets.restore = restore;
  pets.dog = dog;
  return pets;
}
