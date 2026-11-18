// ?shot= poses: stage a real, playable scene for each screenshot.
// Each pose positions the player / car, sets the camera and the time of day,
// and hides the menus, so the frame is exactly what a short game looks like.
// Nothing here fakes a system — every pose only uses Phase 1 systems.
import { setTimeOfDay } from './city.js';

export const SHOT_NAMES = ['drive', 'street', 'vista', 'menu'];

/**
 * Stage a pose. ctx: { scene, city, player, cars, setCamera, setState, showMenu }.
 * Returns the camera mode the pose wants: 'chase' | 'orbit' | 'fixed'.
 */
export function stageShot(name, ctx) {
  const { player, cars } = ctx;
  const car = cars[0];
  if (name === 'drive') {
    // Mara driving downtown, towers ahead, HUD + minimap live.
    setTimeOfDay(ctx.scene, ctx.city, 0);
    car.pos.set(3.5, 0, -60);
    car.heading = 0;
    car.speed = 14;
    car.driven = true;
    ctx.enterCar(car);
    ctx.setCamera(0, 7.5, -13, 0, 2, 0);
    ctx.setState('playing');
    return 'chase';
  }
  if (name === 'street') {
    // On foot on the main avenue, midday sun, a parked car ahead.
    setTimeOfDay(ctx.scene, ctx.city, 0);
    player.pos.set(2, 0, -30);
    player.heading = 0;
    ctx.exitCar(true);
    const near = cars[0];
    near.pos.set(3.5, 0, -16);
    near.heading = 0;
    // Parked cars only sync their mesh in updateCar, so place it by hand.
    near.group.position.set(3.5, 0, -16);
    near.group.rotation.y = 0;
    ctx.setCamera(2, 4.5, -44, 2, 1.6, -30);
    ctx.setState('playing');
    return 'fixed';
  }
  if (name === 'vista') {
    // Golden-hour vista from the beach: car at the beachfront intersection,
    // downtown towers rising behind it, sea at the camera's back.
    setTimeOfDay(ctx.scene, ctx.city, 1);
    car.pos.set(0, 0, 186);
    car.heading = Math.PI;
    car.speed = 0;
    car.driven = true;
    ctx.enterCar(car);
    ctx.setCamera(8, 9, 212, -2, 2, 140);
    ctx.setState('playing');
    return 'fixed';
  }
  // menu: sunset over the city behind the start screen.
  setTimeOfDay(ctx.scene, ctx.city, 0.85);
  player.pos.set(0, 0, 120);
  ctx.exitCar(true);
  ctx.setCamera(40, 26, 60, 0, 12, 0);
  ctx.setState('menu');
  return 'fixed';
}
