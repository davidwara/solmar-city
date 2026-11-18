// ?shot= poses: stage a real, playable scene for each screenshot.
// Each pose positions the player / car / police / traffic / pedestrians,
// sets the camera and the time of day, and hides the menus, so the frame
// is exactly what a short game looks like. Nothing here fakes a system —
// every pose only uses systems that exist in the build (Phase 2: traffic,
// pedestrians, police pursuit and missions all run live in the shot;
// Phase 3: the pistol, the night cycle, traffic lights and ped barks;
// Phase 4: the mission shot runs the Smuggler's Run in the rain, and the
// night shot runs a storm with lightning).
// Phase 5: the mission shot is now the Island Hopper — Mara sailing the
// bay toward the second island and its lighthouse — and the night shot
// lights the lighthouse beam over the storm.
// Poses set the hour through the day/night system, so the HUD clock always
// agrees with the sky in the frame.

// Phase 6: two new poses — 'fish' (Mara fishing off the east pier at
// golden hour, Biscuit at her heel) and 'race' (Mara lined up at the
// garage flag for the Harbour Sprint) — and the chase pose runs at three
// stars now, so the patrol cars' ram run shows in the frame.
export const SHOT_NAMES = ['drive', 'street', 'vista', 'menu', 'chase', 'mission', 'night', 'fish', 'race'];

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
    ctx.daynight.setHours(10);
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
    ctx.daynight.setHours(12);
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
    ctx.daynight.setHours(18.5);
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
    // Three stars, three patrol cars on Mara's tail — the Phase 6 ram run:
    // at full heat the patrol cars stop creeping and go straight for her
    // bumper. Golden late-afternoon light, traffic ahead.
    ctx.daynight.setHours(17.5);
    missions.startMission(1); // Hot Delivery — the job that starts wanted
    car.pos.set(3.5, 0, -30);
    car.heading = 0;
    car.speed = 6; // rolling slowly: the patrol cars close in on her bumper
    car.driven = true;
    ctx.enterCar(car);
    police.setWanted(3, player.pos);
    police.place(0, 0, -40, 0);
    police.place(1, 7, -46, 0);
    police.place(2, -3.5, -43, 0); // third car, close behind so all three read in frame at capture
    traffic.place(0, 3.5, 30, 'ns', 1, 11);
    traffic.place(1, -3.5, -110, 'ns', -1, 10);
    peds.place(0, 12, -10);
    peds.place(1, -12, 10);
    // Side-elevation of the avenue: Mara's car rolls past with both patrol
    // cars closing in behind it in the same lane. A fixed camera is robust
    // here because the car crosses the frame, not away from it, whatever
    // the headless frame rate is.
    ctx.setCamera(26, 11, 10, 0, 2, -38);
    ctx.setState('playing');
    return 'fixed';
  }
  if (name === 'mission') {
    // Job 10, Island Hopper, at midday: Mara sailing the bay in the
    // Marlin, the second island and its striped lighthouse rising ahead,
    // the causeway bridge to the right, wake trailing behind the boat.
    ctx.daynight.setHours(10);
    missions.startMission(9);
    const boat = ctx.boats.boats[1];
    boat.pos.set(-40, 0, 296);
    boat.heading = 0.25;
    boat.speed = 13;
    boat.driven = true;
    ctx.enterBoat(boat);
    peds.place(0, 24, 326);
    peds.place(1, 56, 340);
    peds.place(2, -20, 352);
    traffic.place(0, 3.5, 30, 'ns', 1, 11);
    // High over-the-shoulder from behind the boat: bay, island, lighthouse.
    ctx.setCamera(-52, 16, 252, 30, 8, 380);
    ctx.setState('playing');
    return 'fixed';
  }
  if (name === 'night') {
    // Solmar in a storm: lamps glowing along the beachfront, the moon up,
    // lightning strobing the sky, rain falling, Mara's car at the
    // beachfront intersection, downtown towers behind, traffic cruising
    // with headlights through the night.
    ctx.daynight.setHours(22);
    ctx.weather.setMode('storm');
    ctx.weather.flashNow();
    ctx.island.lightOn(); // the lighthouse beam sweeps the stormy bay
    missions.startMission(3); // Night Run — the job that starts after dark
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
  if (name === 'fish') {
    // Golden hour on the east pier: Mara's line is cast, the bobber rides
    // the swell off the pier tip, Biscuit waits at her heel, and the bay
    // turns copper behind them. The fishing side-hustle, live in frame.
    ctx.daynight.setHours(17.5);
    missions.startMission(0);
    player.pos.set(100, 0, 232);
    player.heading = 0; // facing the water (south, +z, off the pier tip)
    ctx.exitCar(true);
    ctx.fishing.cast(player.pos);
    if (ctx.pets && ctx.pets.dog) ctx.pets.dog.position.set(95, 0, 228);
    peds.place(0, 84, 214);
    peds.place(1, 116, 210);
    traffic.place(0, 62, 186, 'ew', 1, 10);
    // Low from the beach, looking south-east along the pier into the bay.
    ctx.setCamera(84, 5, 216, 100, 1, 252);
    ctx.setState('playing');
    return 'fixed';
  }
  if (name === 'race') {
    // Lined up at the chequered flag by the Solmar Garage: the Harbour
    // Sprint countdown is running, the first gate glows green up the
    // avenue ahead, and the spoiler is already bolted on.
    ctx.daynight.setHours(10);
    missions.startMission(0);
    car.pos.set(124, 0, 200);
    car.heading = Math.PI; // facing north, up the avenue to gate one
    car.speed = 0;
    car.driven = true;
    ctx.enterCar(car);
    ctx.races.start(0, car);
    traffic.place(0, 62, 186, 'ew', 1, 10);
    peds.place(0, 110, 186);
    peds.place(1, 138, 210);
    // Behind the car, over its roof, up the avenue toward the first gate.
    ctx.setCamera(124, 7, 224, 124, 2, 150);
    ctx.setState('playing');
    return 'fixed';
  }
  // menu: sunset over the city behind the start screen.
  ctx.daynight.setHours(18);
  missions.startMission(0);
  player.pos.set(0, 0, 120);
  ctx.exitCar(true);
  ctx.setCamera(40, 26, 60, 0, 12, 0);
  ctx.setState('menu');
  return 'fixed';
}
