// Mara Voss on foot: a third-person controller.
// WASD moves relative to the camera, Shift runs, Space jumps. The player is
// a simple articulated figure (torso, head, legs, arms) built from boxes so
// the game needs no external character model.
// Phase 4: the Shutterbug job is done on foot too — Mara walks up to a
// scenic spot and snaps it with C, so the on-foot controller is the camera
// tripod as much as the getaway legs.
import * as THREE from 'three';
import { clamp, wrapAngle } from './utils.js';
import { isOnCauseway } from './city.js';

const WALK_SPEED = 5;
const RUN_SPEED = 9.5;
const JUMP_SPEED = 7.5;
const GRAVITY = 22;
const RADIUS = 0.6;

export function createPlayer(scene) {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xc23b4e });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2e4a6b });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x2a1a12 });

  /** One mesh, positioned and added — the figure builder's shorthand. */
  const box = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  box(new THREE.BoxGeometry(0.72, 0.85, 0.4), jacket, 0, 1.15, 0);
  box(new THREE.SphereGeometry(0.26, 12, 10), skin, 0, 1.85, 0);
  box(new THREE.SphereGeometry(0.27, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 1.9, 0);
  const legL = box(new THREE.BoxGeometry(0.26, 0.75, 0.3), jeans, -0.19, 0.38, 0);
  const legR = legL.clone();
  legR.position.x = 0.19;
  group.add(legR);
  const armL = box(new THREE.BoxGeometry(0.2, 0.7, 0.24), jacket, -0.48, 1.15, 0);
  const armR = armL.clone();
  armR.position.x = 0.48;
  group.add(armR);
  scene.add(group);

  const player = {
    group,
    pos: new THREE.Vector3(0, 0, -20),
    velY: 0,
    grounded: true,
    heading: 0,
    walkPhase: 0,
    moving: false,
    running: false,
    // Phase 7: sprint stamina — running drains it, walking tops it back
    // up; empty legs mean Mara walks until she catches her breath.
    stamina: 100,
    aiming: false, // pistol raised (Phase 3): right arm points forward
    punchTimer: 0, // counts down while the punch animation plays (combat.js)
  };
  group.position.copy(player.pos);
  player.parts = { legL, legR, armL, armR };
  return player;
}

/** Start Mara's punch animation (called by combat.js when F is pressed). */
export function setPunch(player) {
  player.punchTimer = 0.35;
}

/**
 * Phase 6: turn Mara to face a point — fishing uses it so she faces the
 * water when she casts, instead of casting over her shoulder.
 */
export function faceToward(player, x, z) {
  player.heading = Math.atan2(x - player.pos.x, z - player.pos.z);
  player.group.rotation.y = player.heading;
}

/** Push a circle (x,z,radius) out of every building AABB it overlaps. */
export function resolveCollisions(pos, radius, colliders) {
  for (const c of colliders) {
    const cx = clamp(pos.x, c.minX, c.maxX);
    const cz = clamp(pos.z, c.minZ, c.maxZ);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const pushL = pos.x - c.minX + radius;
        const pushR = c.maxX - pos.x + radius;
        const pushB = pos.z - c.minZ + radius;
        const pushF = c.maxZ - pos.z + radius;
        const m = Math.min(pushL, pushR, pushB, pushF);
        if (m === pushL) pos.x = c.minX - radius;
        else if (m === pushR) pos.x = c.maxX + radius;
        else if (m === pushB) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
}

export function updatePlayer(player, dt, input, cameraYaw, colliders, bound) {
  const fwdX = -Math.sin(cameraYaw);
  const fwdZ = -Math.cos(cameraYaw);
  const rightX = Math.cos(cameraYaw);
  const rightZ = -Math.sin(cameraYaw);
  const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const mx = f * fwdX + s * rightX;
  const mz = f * fwdZ + s * rightZ;
  const len = Math.hypot(mx, mz);
  player.moving = len > 0;
  player.running = player.moving && input.run;
  // Phase 7: stamina — a sprint costs 12 a second, a walk or a stand
  // gives back 8; at zero Mara drops to a walk whether Shift is held.
  if (player.running) {
    player.stamina = Math.max(0, player.stamina - 12 * Math.max(0, dt));
    if (player.stamina <= 0) player.running = false;
  } else {
    player.stamina = Math.min(100, player.stamina + 8 * Math.max(0, dt));
  }
  if (player.moving) {
    const nx = mx / len;
    const nz = mz / len;
    const speed = player.running ? RUN_SPEED : WALK_SPEED;
    player.pos.x += nx * speed * dt;
    player.pos.z += nz * speed * dt;
    const targetHeading = Math.atan2(nx, nz);
    player.heading += wrapAngle(targetHeading - player.heading) * Math.min(1, dt * 12);
    player.walkPhase += dt * (player.running ? 13 : 9);
  }
  // Jump + gravity.
  if (input.jump && player.grounded) {
    player.velY = JUMP_SPEED;
    player.grounded = false;
  }
  if (!player.grounded) {
    player.velY -= GRAVITY * dt;
    player.pos.y += player.velY * dt;
    if (player.pos.y <= 0) {
      player.pos.y = 0;
      player.velY = 0;
      player.grounded = true;
    }
  }
  // The beach line normally stops Mara at z = bound + 40 — except on the
  // causeway, where she may walk dry across to the island (z up to 430).
  // Once past the beach on the causeway line, or already standing on the
  // island itself, the island side stays open so she is never snapped back.
  const onCausewayRoute = isOnCauseway(player.pos.x, player.pos.z)
    || (Math.abs(player.pos.x - 40) <= 5.5 && player.pos.z > bound + 40)
    || (player.pos.z > 305 && player.pos.x >= -80 && player.pos.x <= 160);
  player.pos.x = clamp(player.pos.x, -bound, bound);
  player.pos.z = clamp(player.pos.z, -bound, onCausewayRoute ? 430 : bound + 40);
  resolveCollisions(player.pos, RADIUS, colliders);
  player.group.position.copy(player.pos);
  player.group.rotation.y = player.heading;
  // Walk-cycle swing, overridden by the punch on the right arm.
  const swing = player.moving ? Math.sin(player.walkPhase) * 0.55 : 0;
  player.parts.legL.rotation.x = swing;
  player.parts.legR.rotation.x = -swing;
  player.parts.armL.rotation.x = -swing * 0.8;
  if (player.aiming) {
    // Pistol raised: right arm points where Mara faces, steady.
    player.parts.armR.rotation.x = -1.35;
  } else if (player.punchTimer > 0) {
    player.punchTimer -= dt;
    // Right arm snaps forward, then drops back as the timer runs out.
    player.parts.armR.rotation.x = -1.5 * Math.sin((0.35 - Math.max(0, player.punchTimer)) / 0.35 * Math.PI);
  } else {
    player.parts.armR.rotation.x = swing * 0.8;
  }
}
