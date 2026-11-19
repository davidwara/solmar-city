// Pedestrians: Solmar City residents walking the sidewalks.
// Each one wanders between sidewalk points at its own pace, in its own
// shirt colour. They flee from fast cars, and they go down (then get back
// up and run) when hit by a car or punched — which the police notice.
import * as THREE from 'three';
import { CITY, randomSidewalkPoint } from './city.js';
import { createRng, rand, pick, clamp } from './utils.js';

const SHIRTS = [0x2e6fd8, 0xd23b3b, 0x3fae6a, 0xf2c14e, 0x8a5fc0, 0xff7a2a, 0x7fb3c8, 0xe8e8e8, 0xc96f5a, 0x9db98a];
const PANTS = [0x2e4a6b, 0x333333, 0x5a4a3a, 0x4a5a6b];
// Things Solmar residents say out loud: greetings, complaints, panic.
const IDLE_BARKS = ['Nice day!', 'Hey, Mara!', 'Traffic again…', 'Go Solmar!', 'What a view!', 'Late for work!'];
const SCARED_BARKS = ['Help!', 'Watch it!', 'Are you crazy?!', 'Somebody call the law!', 'Hey!'];
const ANGRY_BARKS = ['Hey!', 'Watch where you\u2019re going!', 'Rude!', 'My shoes!'];
// Phase 6: tourists — a few visitors who stop at the scenic spots and
// take photos instead of walking the sidewalks all day.
const TOURIST_SPOTS = [
  { x: -40, z: 214, line: 'The bay at sunset…' },
  { x: 40, z: 300, line: 'The causeway!' },
  { x: 120, z: 390, line: 'The lighthouse!' },
  { x: 0, z: 124, line: 'Downtown!' },
];
const TOURIST_BARKS = ['Say cheese!', 'What a view!', 'Photo time!', 'For the album!'];

function buildPedFigure(shirt, pants, scale) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skin = new THREE.MeshLambertMaterial({ color: pick(Math.random, [0xd9a986, 0x8a5a3b, 0xe8b89a, 0x6b4a2a]) });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.8, 0.38), shirtMat);
  torso.position.y = 1.12;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.78;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.28), pantsMat);
  legL.position.set(-0.17, 0.36, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.17;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.22), shirtMat);
  armL.position.set(-0.43, 1.12, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.43;
  group.add(armR);
  group.scale.setScalar(scale);
  return { group, parts: { legL, legR, armL, armR } };
}

/** Spawn `count` pedestrians. Returns { peds, update, nearest, knockDown, place }. */
export function spawnPedestrians(scene, seed, count = 26) {
  const rng = createRng(seed * 104729 + 7);
  const peds = [];
  for (let i = 0; i < count; i++) {
    const spot = randomSidewalkPoint(rng);
    const { group, parts } = buildPedFigure(pick(rng, SHIRTS), pick(rng, PANTS), rand(rng, 0.92, 1.08));
    group.position.set(spot.x, 0, spot.z);
    scene.add(group);
    const target = randomSidewalkPoint(rng);
    peds.push({
      group, parts,
      pos: new THREE.Vector3(spot.x, 0, spot.z),
      target: new THREE.Vector3(target.x, 0, target.z),
      heading: rand(rng, 0, Math.PI * 2),
      walkSpeed: rand(rng, 1.1, 2.1),
      walkPhase: rand(rng, 0, 6),
      fleeTimer: 0,
      downTimer: 0,
      down: false,
      barkTimer: rand(rng, 6, 20), // idle chatter, every few seconds
      barkSprite: null,
      barkLife: 0,
      // Phase 6: the first three residents are tourists — they wander
      // between the scenic spots and stop to take photos there.
      tourist: i < 3,
      photoTimer: rand(rng, 4, 12),
      photoPause: 0,
      // Phase 7: wave timer — counts down while the arm stays raised.
      waveTimer: 0,
    });
  }

  // A floating speech bubble over a pedestrian's head, drawn on a canvas.
  function makeBarkSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 72;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 56, 14);
    ctx.fill();
    ctx.fillStyle = '#1c1f24';
    ctx.font = 'bold 26px Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 42);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(4.4, 1.24, 1);
    return sprite;
  }

  /** Put words over a pedestrian's head for a couple of seconds. */
  function bark(p, text, life = 1.8) {
    if (!p || p.down) return;
    if (p.barkSprite) {
      p.group.remove(p.barkSprite);
      p.barkSprite.material.map.dispose();
      p.barkSprite.material.dispose();
    }
    p.barkSprite = makeBarkSprite(text);
    p.barkSprite.position.y = 2.7;
    p.group.add(p.barkSprite);
    p.barkLife = life;
    p.barkTimer = rand(rng, 8, 22);
  }

  function pickNewTarget(p) {
    const t = randomSidewalkPoint(rng);
    // Prefer a target not too far away so peds stay in their neighbourhood.
    p.target.set(t.x, 0, t.z);
  }

  /**
   * Walk, flee and recover. threats: { playerPos, playerCar, playerInCar,
   *   playerSpeed, trafficCars, policeCars } — any fast car nearby spooks
   *   a pedestrian into a run.
   */
  function update(dt, threats) {
    const cars = [];
    if (threats.playerInCar && threats.playerCar) cars.push({ pos: threats.playerCar.pos, speed: Math.abs(threats.playerCar.speed || 0) });
    for (const w of threats.trafficCars || []) cars.push({ pos: w.car.pos, speed: w.speed || 0 });
    for (const pc of threats.policeCars || []) cars.push({ pos: pc.car.pos, speed: Math.abs(pc.car.speed || 0) });

    for (const p of peds) {
      // Speech bubble lifetime: fade out, then drop the sprite.
      if (p.barkSprite) {
        p.barkLife -= dt;
        p.barkSprite.material.opacity = Math.max(0, Math.min(1, p.barkLife));
        if (p.barkLife <= 0) {
          p.group.remove(p.barkSprite);
          p.barkSprite.material.map.dispose();
          p.barkSprite.material.dispose();
          p.barkSprite = null;
        }
      }
      if (p.down) {
        p.downTimer -= dt;
        if (p.downTimer <= 0) {
          p.down = false;
          p.group.rotation.x = 0;
          p.group.position.y = 0;
          p.fleeTimer = 2.5; // get up and run away
          bark(p, pick(rng, ANGRY_BARKS));
        }
        continue;
      }
      // Gunfire: everyone nearby runs and screams.
      if (threats.gunshotPos && p.fleeTimer <= 0) {
        const gd = Math.hypot(threats.gunshotPos.x - p.pos.x, threats.gunshotPos.z - p.pos.z);
        if (gd < 26) {
          p.fleeTimer = 2.8;
          const away = Math.atan2(p.pos.x - threats.gunshotPos.x, p.pos.z - threats.gunshotPos.z);
          p.target.set(p.pos.x + Math.sin(away) * 30, 0, p.pos.z + Math.cos(away) * 30);
          bark(p, pick(rng, SCARED_BARKS));
        }
      }
      // Idle chatter: a resident pipes up now and then when calm.
      if (p.fleeTimer <= 0) {
        p.barkTimer -= dt;
        if (p.barkTimer <= 0) bark(p, pick(rng, IDLE_BARKS));
      }
      // Phase 7: a wave — when Mara strolls past within 3m on foot, a
      // calm resident raises an arm and says hello instead of walking on.
      if (p.fleeTimer <= 0 && !threats.playerInCar && threats.playerPos) {
        const pd = Math.hypot(threats.playerPos.x - p.pos.x, threats.playerPos.z - p.pos.z);
        if (pd < 3 && p.barkTimer > 5) {
          p.waveTimer = 1.2;
          bark(p, 'Hey, Mara!');
        }
      }
      // Flee: a fast car within 7m sends this ped running away from it.
      if (p.fleeTimer <= 0) {
        for (const c of cars) {
          const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
          if (c.speed > 6 && d < 7) {
            p.fleeTimer = 1.6;
            const away = Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
            p.target.set(p.pos.x + Math.sin(away) * 25, 0, p.pos.z + Math.cos(away) * 25);
            if (rng() < 0.5) bark(p, pick(rng, SCARED_BARKS));
            break;
          }
        }
      }
      if (p.fleeTimer > 0) p.fleeTimer -= dt;
      // Phase 6: tourists stop at the scenic spots and take photos.
      if (p.tourist && p.fleeTimer <= 0) {
        p.photoTimer -= dt;
        if (p.photoPause > 0) {
          p.photoPause -= dt;
          // Stand still, camera arm raised, while the photo happens.
          p.parts.armR.rotation.x = -2.4;
          continue;
        }
        if (p.photoTimer <= 0) {
          let spot = null;
          let bestD = 12;
          for (const s of TOURIST_SPOTS) {
            const d = Math.hypot(s.x - p.pos.x, s.z - p.pos.z);
            if (d < bestD) { bestD = d; spot = s; }
          }
          if (spot) {
            p.photoPause = 3;
            p.photoTimer = rand(rng, 10, 20);
            bark(p, pick(rng, TOURIST_BARKS));
          } else {
            const s = pick(rng, TOURIST_SPOTS);
            p.target.set(s.x + rand(rng, -3, 3), 0, s.z + rand(rng, -3, 3));
            p.photoTimer = rand(rng, 8, 16);
          }
        }
      }
      const dx = p.target.x - p.pos.x;
      const dz = p.target.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2) {
        pickNewTarget(p);
        continue;
      }
      const speed = p.fleeTimer > 0 ? 5.2 : p.walkSpeed * (threats.raining ? 0.75 : 1); // rain: residents hurry, heads down
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - p.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      p.heading += dh * Math.min(1, dt * 8);
      p.pos.x += Math.sin(p.heading) * speed * dt;
      p.pos.z += Math.cos(p.heading) * speed * dt;
      p.pos.x = clamp(p.pos.x, -CITY.bound, CITY.bound);
      p.pos.z = clamp(p.pos.z, -CITY.bound, CITY.bound + 30);
      p.walkPhase += dt * (p.fleeTimer > 0 ? 14 : 8);
      p.group.position.copy(p.pos);
      p.group.rotation.y = p.heading;
      const swing = Math.sin(p.walkPhase) * 0.5;
      p.parts.legL.rotation.x = swing;
      p.parts.legR.rotation.x = -swing;
      p.parts.armL.rotation.x = -swing * 0.8;
      // A waving arm stays raised while the timer runs, over the swing.
      if (p.waveTimer > 0) {
        p.waveTimer -= dt;
        p.parts.armR.rotation.x = -2.6;
      } else {
        p.parts.armR.rotation.x = swing * 0.8;
      }
    }
  }

  /** Nearest pedestrian to a point, within maxDist (0 = none in range). */
  function nearest(pos, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const p of peds) {
      if (p.down) continue;
      const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  /** Knock a pedestrian down for a few seconds (punch or car hit). */
  function knockDown(p) {
    if (!p || p.down) return;
    p.down = true;
    p.downTimer = 2.8;
    p.group.rotation.x = -Math.PI / 2 + 0.15;
    p.group.position.y = 0.35;
  }

  // Stage one pedestrian at an exact spot (used by ?shot= poses).
  function place(i, x, z) {
    const p = peds[i % peds.length];
    p.pos.set(x, 0, z);
    p.target.set(x + 8, 0, z + 4);
    p.down = false;
    p.group.rotation.x = 0;
    p.group.position.copy(p.pos);
    return p;
  }

  return { peds, update, nearest, knockDown, place, bark };
}
