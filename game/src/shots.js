// ?shot= poses: stage a real, playable scene for each screenshot.
// Each pose positions the player / car / police / traffic / pedestrians,
// sets the camera and the time of day, and hides the menus, so the frame
// is exactly what a short game looks like. Nothing here fakes a system —
// every pose only uses systems that exist in the build (Phase 2: traffic,
// pedestrians, police pursuit and missions all run live in the shot).
import { setTimeOfDay } from './city.js';

export const SHOT_NAMES = ['drive', 'street', 'vista', 'menu', 'chase', 'mission'];

/**
 * Stage a pose. ctx: { scene, city, player, cars, traffic, peds, police,
 * missions, setCamera, setState, enterCar, exitCar }.
 * Returns the camera mode the pose wants: 'chase' | 'orbit' | 'fixed'.
 */
export function stageShot(name, ctx) {
  const { player, cars, traffic, peds, police, missions } = ctx;
  const car = cars[0];
  if (name === 'drive') {
    // Mara driving downtown, towers ahead, traffic on the avenue, a
    // pedestrian on the sidewalk, HUD + minimap + job tracker live.
    setTimeOfDay(ctx.scene, ctx.city, 0);
    missions.startMission(0);
    car.pos.set(3.5, 0, -60);
    car.heading = 0;
    car.speed = 14;
    car.driven = true;
    ctx.enterCar(car);
    traffic.place(0, 3.5, -10, 'ns', 1, 11);
    traffic.place(1, -3.5, -100, 'ns', -1, 10);
    peds.place(0, 12, -40);
    peds.place(1, -12, -75);
    ctx.setCamera(0, 7.5, -13, 0, 2, 0);
    ctx.setState('playing');
    return 'chase';
  }
  if (name === 'street') {
    // On foot on the main avenue, midday sun, a parked car ahead and
    // pedestrians walking the sidewalk.
    setTimeOfDay(ctx.scene, ctx.city, 0);
    missions.startMission(0);
    player.pos.set(2, 0, -30);
    player.heading = 0;
    ctx.exitCar(true);
    const near = cars[0];
    near.pos.set(3.5, 0, -16);
    near.heading = 0;
    // Parked cars only sync their mesh in updateCar, so place it by hand.
    near.group.position.set(3.5, 0, -16);
    near.group.rotation.y = 0;
    peds.place(0, 12, -22);
    peds.place(1, -12, -48);
    peds.place(2, 12, -58);
    traffic.place(0, -3.5, -90, 'ns', -1, 10);
    ctx.setCamera(2, 4.5, -44, 2, 1.6, -30);
    ctx.setState('playing');
    return 'fixed';
  }
  if (name === 'vista') {
    // Golden-hour vista from the beach: car at the beachfront intersection,
    // downtown towers rising behind it, sea at the camera's back, traffic
    // cruising the beachfront road.
    setTimeOfDay(ctx.scene, ctx.city, 1);
    missions.startMission(0);
    car.pos.set(0, 0, 186);
    car.heading = Math.PI;
    car.speed = 0;
    car.driven = true;
    ctx.enterCar(car);
    traffic.place(0, 62, 186, 'ew', 1, 10);
    traffic.place(1, -62, 186, 'ew', -1, 10);
    peds.place(0, 10, 196);
    peds.place(1, -8, 200);
    ctx.setCamera(8, 9, 212, -2, 2, 140);
    ctx.setState('playing');
    return 'fixed';
  }
  if (name === 'chase') {
    // Two stars, two patrol cars on Mara's tail, traffic ahead, golden
    // late-afternoon light: the wanted system in action.
    setTimeOfDay(ctx.scene, ctx.city, 0.55);
    missions.startMission(1); // Hot Delivery — the job that starts wanted
    car.pos.set(3.5, 0, -30);
    car.heading = 0;
    car.speed = 16;
    car.driven = true;
    ctx.enterCar(car);
    police.setWanted(2, player.pos);
    police.place(0, 0, -58, 0);
    police.place(1, 7, -70, 0);
    traffic.place(0, 3.5, 30, 'ns', 1, 11);
    traffic.place(1, -3.5, -110, 'ns', -1, 10);
    peds.place(0, 12, -10);
    peds.place(1, -12, 10);
    ctx.setCamera(14, 6.5, -58, 0, 2, -30);
    ctx.setState('playing');
    return 'fixed';
  }
  if (name === 'mission') {
    // Job 1 at the marina: Mara on foot at the pier, the gold mission
    // beacon over the package, boats in the water, a pedestrian and a
    // cruising car on the beachfront behind her.
    setTimeOfDay(ctx.scene, ctx.city, 0.75);
    missions.startMission(0);
    player.pos.set(-138, 0, 206);
    player.heading = Math.PI * 0.92;
    ctx.exitCar(true);
    const near = cars[4];
    near.pos.set(-124, 0, 186);
    near.heading = Math.PI / 2;
    near.group.position.set(-124, 0, 186);
    near.group.rotation.y = Math.PI / 2;
    traffic.place(0, -62, 186, 'ew', 1, 10);
    peds.place(0, -132, 198);
    peds.place(1, -146, 214);
    ctx.setCamera(-118, 5.5, 188, -148, 3, 222);
    ctx.setState('playing');
    return 'fixed';
  }
  // menu: sunset over the city behind the start screen.
  setTimeOfDay(ctx.scene, ctx.city, 0.85);
  missions.startMission(0);
  player.pos.set(0, 0, 120);
  ctx.exitCar(true);
  ctx.setCamera(40, 26, 60, 0, 12, 0);
  ctx.setState('menu');
  return 'fixed';
}
