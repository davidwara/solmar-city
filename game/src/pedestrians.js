// pedestrians.js — Solmar City residents walking the sidewalks.
//
// Each resident wanders between sidewalk points in their own shirt
// colour, chats idly, and waves when Mara strolls past on foot. They flee
// from fast cars, go down (then get back up and run) when hit or punched,
// panic at gunfire, and the first three are tourists who stop at scenic
// spots to take photos.
import * as THREE from 'three';
import { CITY, randomSidewalkPoint } from './city.js';
import { createRng, rand, pick, clamp } from './utils.js';

const SHIRT_COLORS = [0x2e6fd8, 0xd23b3b, 0x3fae6a, 0xf2c14e, 0x8a5fc0, 0xff7a2a, 0x7fb3c8, 0xe8e8e8, 0xc96f5a, 0x9db98a];
const PANTS_COLORS = [0x2e4a6b, 0x333333, 0x5a4a3a, 0x4a5a6b];
const SKIN_TONES = [0xd9a986, 0x8a5a3b, 0xe8b89a, 0x6b4a2a];
const IDLE_BARKS = ['Nice day!', 'Hey, Mara!', 'Traffic again…', 'Go Solmar!', 'What a view!', 'Late for work!'];
const SCARED_BARKS = ['Help!', 'Watch it!', 'Are you crazy?!', 'Somebody call the law!', 'Hey!'];
const ANGRY_BARKS = ['Hey!', 'Watch where you’re going!', 'Rude!', 'My shoes!'];
const TOURIST_BARKS = ['Say cheese!', 'What a view!', 'Photo time!', 'For the album!'];
const TOURIST_SPOTS = [
  { x: -40, z: 214, line: 'The bay at sunset…' },
  { x: 40, z: 300, line: 'The causeway!' },
  { x: 120, z: 390, line: 'The lighthouse!' },
  { x: 0, z: 124, line: 'Downtown!' },
];

/** Wrap an angle to [-PI, PI] without importing the angle helpers. */
function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function spawnPedestrians(scene, seed, count = 26) {
  const rng = createRng(seed * 104729 + 7);

  /** Rounded speech-bubble texture; the font shrinks to fit long lines. */
  function bubbleTexture(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 72;
    const g = canvas.getContext('2d');
    const r = 14;
    g.beginPath();
    g.moveTo(r, 0);
    g.lineTo(256 - r, 0);
    g.arcTo(256, 0, 256, r, r);
    g.lineTo(256, 72 - r);
    g.arcTo(256, 72, 256 - r, 72, r);
    g.lineTo(r, 72);
    g.arcTo(0, 72, 0, 72 - r, r);
    g.lineTo(0, r);
    g.arcTo(0, 0, r, 0, r);
    g.closePath();
    g.fillStyle = 'rgba(255, 253, 245, 0.96)';
    g.fill();
    let size = 26;
    g.font = `bold ${size}px Verdana`;
    while (size > 14 && g.measureText(text).width > 232) {
      size -= 2;
      g.font = `bold ${size}px Verdana`;
    }
    g.fillStyle = '#222222';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 38);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Put a speech bubble over a ped's head (replaces any old one). */
  function bark(p, text, life = 1.8) {
    if (!p || p.down) return;
    if (p.barkSprite) {
      p.group.remove(p.barkSprite);
      p.barkSprite.material.map.dispose();
      p.barkSprite.material.dispose();
      p.barkSprite = null;
    }
    const mat = new THREE.SpriteMaterial({ map: bubbleTexture(text), transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4.4, 1.24, 1);
    sprite.position.set(0, 2.7, 0);
    p.group.add(sprite);
    p.barkSprite = sprite;
    p.barkLife = life;
    p.barkTotal = life;
    p.barkTimer = rand(rng, 8, 22);
  }

  function disposeBubble(p) {
    if (!p.barkSprite) return;
    p.group.remove(p.barkSprite);
    p.barkSprite.material.map.dispose();
    p.barkSprite.material.dispose();
    p.barkSprite = null;
  }

  /** Run away from a point: pick a target far in the opposite direction. */
  function fleeFrom(p, fromX, fromZ, dist, duration) {
    let dx = p.pos.x - fromX;
    let dz = p.pos.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    p.target.set(p.pos.x + dx * dist, 0, p.pos.z + dz * dist);
    p.fleeTimer = duration;
  }

  /** One resident: boxy figure, random colours, random pace and scale. */
  function buildPed(i) {
    const shirtMat = new THREE.MeshLambertMaterial({ color: pick(rng, SHIRT_COLORS) });
    const pantsMat = new THREE.MeshLambertMaterial({ color: pick(rng, PANTS_COLORS) });
    const skinMat = new THREE.MeshLambertMaterial({ color: pick(rng, SKIN_TONES) });
    const group = new THREE.Group();
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      group.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(0.66, 0.8, 0.38), shirtMat, 0, 1.12, 0);
    add(new THREE.SphereGeometry(0.24, 12, 10), skinMat, 0, 1.78, 0);
    const legL = add(new THREE.BoxGeometry(0.24, 0.72, 0.28), pantsMat, -0.17, 0.36, 0);
    const legR = add(new THREE.BoxGeometry(0.24, 0.72, 0.28), pantsMat, 0.17, 0.36, 0);
    const armL = add(new THREE.BoxGeometry(0.18, 0.62, 0.22), shirtMat, -0.43, 1.12, 0);
    const armR = add(new THREE.BoxGeometry(0.18, 0.62, 0.22), shirtMat, 0.43, 1.12, 0);
    group.scale.setScalar(rand(rng, 0.92, 1.08));

    const spot = randomSidewalkPoint(rng);
    const dest = randomSidewalkPoint(rng);
    const ped = {
      group,
      parts: { legL, legR, armL, armR },
      pos: new THREE.Vector3(spot.x, 0, spot.z),
      target: new THREE.Vector3(dest.x, 0, dest.z),
      heading: rand(rng, 0, Math.PI * 2),
      walkSpeed: rand(rng, 1.1, 2.1),
      walkPhase: rand(rng, 0, 6),
      fleeTimer: 0,
      downTimer: 0,
      down: false,
      barkTimer: rand(rng, 6, 20),
      barkSprite: null,
      barkLife: 0,
      barkTotal: 1,
      tourist: i < 3,
      photoTimer: rand(rng, 4, 12),
      photoPause: 0,
      waveTimer: 0,
    };
    group.position.copy(ped.pos);
    group.rotation.y = ped.heading;
    scene.add(group);
    return ped;
  }

  const peds = [];
  for (let i = 0; i < count; i++) peds.push(buildPed(i));

  function update(dt, threats) {
    const playerPos = threats.playerPos;

    // Every car that can scare a ped, with its speed attached.
    const cars = [];
    if (threats.playerInCar && threats.playerCar) {
      cars.push({ x: threats.playerCar.pos.x, z: threats.playerCar.pos.z, speed: Math.abs(threats.playerCar.speed) });
    }
    for (const t of threats.trafficCars || []) {
      const c = t.car || t;
      cars.push({ x: c.pos.x, z: c.pos.z, speed: Math.abs(t.speed ?? c.speed ?? 0) });
    }
    for (const u of threats.policeCars || []) {
      const c = u.car || u;
      cars.push({ x: c.pos.x, z: c.pos.z, speed: Math.abs(u.speed ?? c.speed ?? 0) });
    }

    for (const p of peds) {
      // 1. Speech-bubble lifetime: fade, then remove and dispose.
      if (p.barkSprite) {
        p.barkLife -= dt;
        if (p.barkLife <= 0) disposeBubble(p);
        else p.barkSprite.material.opacity = clamp(p.barkLife / (p.barkTotal || 1), 0, 1);
      }

      // 2. Down: count down, then stand up, flee, and complain.
      if (p.down) {
        p.downTimer -= dt;
        if (p.downTimer <= 0) {
          p.down = false;
          p.group.rotation.x = 0;
          p.group.position.y = 0;
          fleeFrom(p, playerPos ? playerPos.x : p.pos.x, playerPos ? playerPos.z : p.pos.z, 25, 2.5);
          bark(p, pick(rng, ANGRY_BARKS));
        }
        continue;
      }

      // 3. Gunfire nearby: run 30m away from the shot.
      if (threats.gunshotPos && p.fleeTimer <= 0) {
        const d = Math.hypot(p.pos.x - threats.gunshotPos.x, p.pos.z - threats.gunshotPos.z);
        if (d < 26) {
          fleeFrom(p, threats.gunshotPos.x, threats.gunshotPos.z, 30, 2.8);
          bark(p, pick(rng, SCARED_BARKS));
        }
      }

      const calm = p.fleeTimer <= 0;

      // 4. Idle chatter while calm.
      if (calm) {
        p.barkTimer -= dt;
        if (p.barkTimer <= 0) bark(p, pick(rng, IDLE_BARKS));
      }

      // 5. Wave when Mara strolls past on foot.
      if (calm && !threats.playerInCar && playerPos) {
        const d = Math.hypot(p.pos.x - playerPos.x, p.pos.z - playerPos.z);
        if (d < 3 && p.barkTimer > 5) {
          p.waveTimer = 1.2;
          bark(p, 'Hey, Mara!');
        }
      }

      // 6. Flee from any fast car that gets too close.
      if (calm) {
        for (const c of cars) {
          if (c.speed <= 6) continue;
          const d = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
          if (d < 7) {
            fleeFrom(p, c.x, c.z, 25, 1.6);
            if (rng() < 0.5) bark(p, pick(rng, SCARED_BARKS));
            break;
          }
        }
      }

      // 7. Count the flee timer down.
      if (p.fleeTimer > 0) p.fleeTimer -= dt;

      // 8. Tourists: pause at scenic spots for a photo, or walk to one.
      let paused = false;
      if (p.tourist && p.fleeTimer <= 0) {
        if (p.photoPause > 0) {
          p.photoPause -= dt;
          paused = true;
        } else {
          p.photoTimer -= dt;
          if (p.photoTimer <= 0) {
            let spot = null;
            for (const s of TOURIST_SPOTS) {
              if (Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < 12) { spot = s; break; }
            }
            if (spot) {
              p.photoPause = 3;
              p.photoTimer = rand(rng, 10, 20);
              bark(p, pick(rng, TOURIST_BARKS));
              paused = true;
            } else {
              const s = pick(rng, TOURIST_SPOTS);
              p.target.set(s.x + rand(rng, -3, 3), 0, s.z + rand(rng, -3, 3));
              p.photoTimer = rand(rng, 8, 16);
            }
          }
        }
      }

      // 9. Walk toward the target (or stand still for a photo).
      if (!paused) {
        const toTarget = Math.hypot(p.target.x - p.pos.x, p.target.z - p.pos.z);
        if (toTarget < 1.2) {
          // New sidewalk target, preferring one nearby so peds stay local.
          let best = null;
          let bestD = Infinity;
          for (let k = 0; k < 4; k++) {
            const cand = randomSidewalkPoint(rng);
            const d = Math.hypot(cand.x - p.pos.x, cand.z - p.pos.z);
            if (d < bestD) { bestD = d; best = cand; }
            if (d < 60) break;
          }
          p.target.set(best.x, 0, best.z);
        } else {
          const fleeingNow = p.fleeTimer > 0;
          const speed = (fleeingNow ? 5.2 : p.walkSpeed) * (threats.raining ? 0.75 : 1);
          const wantHeading = Math.atan2(p.target.x - p.pos.x, p.target.z - p.pos.z);
          p.heading += clamp(wrapPi(wantHeading - p.heading), -dt * 8, dt * 8);
          p.pos.x += Math.sin(p.heading) * speed * dt;
          p.pos.z += Math.cos(p.heading) * speed * dt;
          p.pos.x = clamp(p.pos.x, -CITY.bound, CITY.bound);
          p.pos.z = clamp(p.pos.z, -CITY.bound, CITY.bound + 30);
          p.walkPhase += dt * (fleeingNow ? 14 : 8);
        }
      }
      p.group.position.copy(p.pos);
      p.group.rotation.y = p.heading;

      // Limb swing; the right arm waves, or holds the camera up for a photo.
      const swing = paused ? 0 : Math.sin(p.walkPhase) * 0.5;
      p.parts.legL.rotation.x = swing;
      p.parts.legR.rotation.x = -swing;
      p.parts.armL.rotation.x = -swing * 0.8;
      if (p.waveTimer > 0) {
        p.waveTimer -= dt;
        p.parts.armR.rotation.x = -2.6;
      } else if (paused) {
        p.parts.armR.rotation.x = -2.4;
      } else {
        p.parts.armR.rotation.x = swing * 0.8;
      }
    }
  }

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

  function knockDown(p) {
    if (!p || p.down) return;
    p.down = true;
    p.downTimer = 2.8;
    p.group.rotation.x = -Math.PI / 2 + 0.15;
    p.group.position.y = 0.35;
  }

  /** Stage one ped at an exact spot (screenshot poses). */
  function place(i, x, z) {
    if (peds.length === 0) return null;
    const p = peds[i % peds.length];
    p.pos.set(x, 0, z);
    p.target.set(x + 8, 0, z + 4);
    p.down = false;
    p.downTimer = 0;
    p.group.rotation.x = 0;
    p.group.position.copy(p.pos);
    p.group.rotation.y = p.heading;
    return p;
  }

  return { peds, update, nearest, knockDown, place, bark };
}
