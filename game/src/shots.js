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
export const SHOT_NAMES = ['drive', 'street', 'vista', 'menu', 'chase', 'mission', 'night', 'fish', 'race', 'dawn'];

/**
 * Stage a pose. ctx: { scene, city, player, cars, traffic, peds, police,
 * missions, setCamera, setState, enterCar, exitCar }.
 * Returns the camera mode the pose wants: 'chase' | 'orbit' | 'fixed'.
 */
export function stageShot(name, ctx) {
  const { player, cars, traffic, peds, police, missions } = ctx;
  const car = cars[0];
  /** Begin a pose: set the hour and start the mission. */
  const begin = (hour, mission) => { ctx.daynight.setHours(hour); missions.startMission(mission); };
  /** End a pose: place the camera, set the state, return the camera mode. */
  const done = (mode, state, ...c) => { ctx.setCamera(...c); ctx.setState(state); return mode; };
  /** Put Mara in the car at a spot, rolling at a speed. */
  const driveCar = (x, z, heading, speed) => {
    car.pos.set(x, 0, z);
    car.heading = heading;
    car.speed = Math.max(0, speed);
    car.driven = true;
    ctx.enterCar(car);
  };
  /** Put Mara on foot at a spot, facing a heading. */
  const onFoot = (x, z, heading) => {
    player.pos.set(x, 0, z);
    if (heading !== undefined) player.heading = heading;
    ctx.exitCar(true);
  };
  /** Park a car by hand (parked cars only sync their mesh in updateCar). */
  const parkCar = (c, x, z, heading) => {
    c.pos.set(x, 0, z);
    c.heading = heading;
    c.group.position.set(x, 0, z);
    c.group.rotation.y = heading;
  };
  if (name === 'drive') {
    // Mara driving downtown, towers ahead, traffic on the avenue, a
    // pedestrian on the sidewalk, HUD + minimap + job tracker live.
    begin(10, 0);
    driveCar(3.5, -60, 0, 14);
    traffic.place(0, 3.5, -10, 'ns', 1, 11);
    traffic.place(1, -3.5, -100, 'ns', -1, 10);
    peds.place(0, 12, -40);
    peds.place(1, -12, -75);
    return done('chase', 'playing', 0, 7.5, -13, 0, 2, 0);
  }
  if (name === 'street') {
    // On foot on the main avenue, midday sun, a parked car ahead and
    // pedestrians walking the sidewalk.
    begin(12, 0);
    onFoot(2, -30, 0);
    parkCar(car, 3.5, -16, 0);
    peds.place(0, 12, -22);
    peds.place(1, -12, -48);
    peds.place(2, 12, -58);
    traffic.place(0, -3.5, -90, 'ns', -1, 10);
    return done('fixed', 'playing', 2, 4.5, -44, 2, 1.6, -30);
  }
  if (name === 'vista') {
    // Golden-hour vista from the beach: car at the beachfront intersection,
    // downtown towers rising behind it, sea at the camera's back, traffic
    // cruising the beachfront road.
    begin(18.5, 0);
    driveCar(0, 186, Math.PI, 0);
    traffic.place(0, 62, 186, 'ew', 1, 10);
    traffic.place(1, -62, 186, 'ew', -1, 10);
    peds.place(0, 10, 196);
    peds.place(1, -8, 200);
    return done('fixed', 'playing', 8, 9, 212, -2, 2, 140);
  }
  if (name === 'chase') {
    // Three stars, three patrol cars on Mara's tail — the Phase 6 ram run:
    // at full heat the patrol cars stop creeping and go straight for her
    // bumper. Golden late-afternoon light, traffic ahead.
    begin(17.5, 1); // Hot Delivery — the job that starts wanted
    driveCar(3.5, -30, 0, 6); // rolling slowly: the patrol cars close in on her bumper
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
    return done('fixed', 'playing', 26, 11, 10, 0, 2, -38);
  }
  if (name === 'mission') {
    // Job 10, Island Hopper, at midday: Mara sailing the bay in the
    // Marlin, the second island and its striped lighthouse rising ahead,
    // the causeway bridge to the right, wake trailing behind the boat.
    begin(10, 9);
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
    return done('fixed', 'playing', -52, 16, 252, 30, 8, 380);
  }
  if (name === 'night') {
    // Solmar in a storm: lamps glowing along the beachfront, the moon up,
    // lightning strobing the sky, rain falling, Mara's car at the
    // beachfront intersection, downtown towers behind, traffic cruising
    // with headlights through the night.
    begin(22, 3); // Night Run — the job that starts after dark
    ctx.weather.setMode('storm');
    ctx.weather.flashNow();
    ctx.island.lightOn(); // the lighthouse beam sweeps the stormy bay
    driveCar(0, 186, Math.PI, 0);
    traffic.place(0, 62, 186, 'ew', 1, 10);
    traffic.place(1, -62, 186, 'ew', -1, 10);
    peds.place(0, 10, 196);
    peds.place(1, -8, 200);
    return done('fixed', 'playing', 8, 9, 212, -2, 2, 140);
  }
  if (name === 'fish') {
    // Golden hour on the east pier: Mara's line is cast, the bobber rides
    // the swell off the pier tip, Biscuit waits at her heel, and the bay
    // turns copper behind them. The fishing side-hustle, live in frame.
    begin(17.5, 0);
    onFoot(100, 232, 0); // facing the water (south, +z, off the pier tip)
    ctx.fishing.cast(player.pos);
    if (ctx.pets && ctx.pets.dog) ctx.pets.dog.position.set(95, 0, 228);
    peds.place(0, 84, 214);
    peds.place(1, 116, 210);
    traffic.place(0, 62, 186, 'ew', 1, 10);
    // Low from the beach, looking south-east along the pier into the bay.
    return done('fixed', 'playing', 84, 5, 216, 100, 1, 252);
  }
  if (name === 'race') {
    // Lined up at the chequered flag by the Solmar Garage: the Harbour
    // Sprint countdown is running, the first gate glows green up the
    // avenue ahead, and the spoiler is already bolted on.
    begin(10, 0);
    driveCar(124, 200, Math.PI, 0); // facing north, up the avenue to gate one
    ctx.races.start(0, car);
    traffic.place(0, 62, 186, 'ew', 1, 10);
    peds.place(0, 110, 186);
    peds.place(1, 138, 210);
    // Behind the car, over its roof, up the avenue toward the first gate.
    return done('fixed', 'playing', 124, 7, 224, 124, 2, 150);
  }
  if (name === 'dawn') {
    // Phase 7: sunrise over the marina — Mara on foot at the pier root,
    // the moored boats and the causeway in the first light, a pedestrian
    // already out on the beachfront, the day's first job waiting.
    begin(6.5, 0);
    onFoot(-146, 214, Math.PI); // facing south, out over the bay
    parkCar(car, -62, 186, Math.PI / 2);
    peds.place(0, -120, 200);
    peds.place(1, -100, 214);
    traffic.place(0, 62, 186, 'ew', 1, 10);
    // Low from the beach, looking south-east down the marina and the bay.
    return done('fixed', 'playing', -120, 6, 190, -150, 2, 250);
  }
  // menu: sunset over the city behind the start screen.
  begin(18, 0);
  onFoot(0, 120);
  return done('fixed', 'menu', 40, 26, 60, 0, 12, 0);
}
