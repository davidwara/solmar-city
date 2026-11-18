[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/davidwara/solmar-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/davidwara/solmar-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar City — an original open-world crime game

An open-world crime game for [make.fun's gta6-01](https://make.fun/bounty/gta6-01)
bounty ("Make GTA 6"). Plain static files, no build step, no network: open
`game/index.html` in a desktop browser and play.

## The game

You are Mara Voss, back in Solmar City — a sun-soaked coastal city of 7×7
blocks, ~120 buildings, palms, beach and sea. Explore on foot, steal a parked
car and drive the avenues, and work the streets to build your rep and your
stash.

- **Move** — WASD · **Look** — mouse
- **Run** — Shift · **Jump** — Space
- **Enter / exit car or boat** — E (stealing a parked car raises your wanted level)
- **Punch** — F · **Shoot** — mouse click (pistol required) · **Reload** — R
- **Buy pistol** — G at the gun shop, downtown corner ($400, 12-round mag)
- **Garage** — G at the Solmar Garage, east side (paint $200, engine $500/$1,000, armour $400)
- **Sail a boat** — E near a moored boat at the marina (W throttle, A/D rudder)
- **Car radio** — Q while driving (SOLMAR FM bassline / NIGHT TIDE synth)
- **Snap a photo** — C on the Shutterbug job (get close to the scenic spot)
- **Mute** — M · **Jobs** — J · **Retry job** — R (when the pistol is full)
- **Pause** — Esc or P
- **HUD** — health, money, wanted stars, mission tracker, minimap
  (traffic, police, pedestrians, mission marker, gun shop, client, hidden
  packages, second island, gang turf, boats, garage), pistol ammo, a day/night
  clock, a weather icon, a package counter, a turf counter, boat speed on
  the water, and the radio station while driving

## The living city (Phase 5)

Solmar City grew across the bay. A second island district sits south of
the mainland, reached by boat from the marina or by the causeway bridge
at x = 40 — six low-rise blocks around a plaza fountain, palm groves on
both shores, a crescent beach, and the striped Solmar lighthouse, whose
beam sweeps the bay once it is lit at night. The minimap now reaches the
island, and the lighthouse dot on it glows once the lamp is on.

Four boats are moored at the marina (the Gull, the Marlin, the Coral and
the Tide), with wooden dock fingers to step aboard from. Press **E** near
one to board: W throttles up, A/D work the rudder, and the boat bobs on
the swell and leaves a fading white wake. Boats live on the water — they
stop at the beach line and can never drive onto land; step off with **E**
and Mara lands on the nearest shore. Boat speed shows on the HUD.

Three new jobs bring the total to twelve: **Island Hopper** (sail a boat
delivery from the marina to the island jetty — it only counts if you
arrive by boat, $1,400), **Lighthouse Keeper** (reach the island
lighthouse after dark and light it, $1,600), **Turf War** (clear every
Shark out of their turf on the north streets, $1,800).

The city is carved into gang turf now: the **Vipers** (green, west
blocks), the **Sharks** (blue, north streets) and the **Crows** (purple,
east docks). Their zones show as coloured rings on the minimap. Stand
inside a rival zone for 20 seconds and the turf flips to Mara's crew —
each turf she owns pays **$50 a minute** in passive income, ticked into
her wallet while she plays. Rival members patrol their own turf and
attack Mara on sight with their fists; knock one down with **F** and he
stays down for 25 seconds. Turf you own is saved with the game.

The Solmar Garage on the east side tunes Mara's ride: six paints ($200
each), two engine levels ($500, then $1,000 — each adds top speed) and
bolt-on armour ($400, +50 max health). Press **G** on the garage lot to
open the shop; paint and engine apply to whatever car Mara drives next,
and the choices save with the game.

And the story speaks now: before jobs 1, 4, 7 and 10 a cutscene plays —
**Dex** the fixer, **Rosa** the mechanic and **Mara** herself, dialogue
typed out line by line over the city. Any key or click advances, and the
game waits until the scene ends.

## The living city (Phase 4)

The sky has a mind of its own now: clear sun gives way to rain and then
to storms that strobe the city with lightning and roll thunder across the
avenues. Rain darkens the roads into a wet sheen and costs grip — cars
accelerate and steer a little worse, traffic slows down, and pedestrians
hurry with their heads down. The HUD shows the weather (☀ CLEAR / ☂ RAIN /
⚡ STORM) next to the clock.

Three new jobs bring the total to nine: **Smuggler's Run** (grab the crate
at the marina pier, then run it to the east docks while striped police
roadblocks go up on your route, $1,200), **Getaway Driver** (stay free for
100 seconds at three stars, $1,500), **Shutterbug** (drive to three scenic
spots — beach, downtown plaza, marina — and snap each one with C, $300 a
photo plus a $500 bonus for the set).

Fifteen hidden packages are stashed around the city — alleys, beach
corners, the marina pier, downtown nooks — glowing cyan and bobbing over
their rings. Walk or drive through one for $100; find all fifteen for a
$1,000 bonus. The minimap only shows a package once Mara is within 60m,
so the last few have to be hunted. Package progress saves with the rest of
her story.

And the car has a radio now: press **Q** while driving to cycle SOLMAR FM
(a bassline with hats) and NIGHT TIDE (slow synth pads), all procedural
WebAudio like the rest of the sound. The station name shows on the HUD
while driving; the radio stays off on foot.

Traffic cruises the avenues and overtakes parked cars — and now it stops
at red lights at four signalled intersections, and honks when it is stuck
behind you. Pedestrians walk the sidewalks, flee from speeding cars, and
talk: speech bubbles call out greetings, complaints, and screams when
gunfire goes off. The police respond to a 1–3 star wanted level — steal a
car, hit a pedestrian or crash into traffic and patrol cars chase you
down, ram you, and bust you on foot if they catch you. Stay out of sight
and the heat cools off.

The sun now moves: a day/night cycle carries the city from morning through
golden dusk into night, when the street lamps glow and the moon comes up.
Health hitting zero means **WASTED** — a red screen, a 10% hospital bill,
and a wake-up at St. Solmar Hospital with your jobs intact. Busted and
wasted counts are kept as lifetime stats on the start screen.

Nine story jobs pay cash and unlock in order: **First Job** (pick up the
package at the marina, $250), **Hot Delivery** (deliver downtown while
wanted, $500), **The Getaway** (reach the beachfront safehouse in 90
seconds, $750), **Night Run** (a midnight pickup in 2 minutes, starting
wanted, $900), **Bodyguard** (walk Rico's client across downtown — he only
moves while you stay close, $1,000), **Taxi King** (three fares against
the clock, $150 each plus a $400 bonus), **Smuggler's Run** (marina pickup
to the east docks past roadblocks, $1,200), **Getaway Driver** (stay free
100 seconds at three stars, $1,500), **Shutterbug** (photograph three
scenic spots, $300 each plus a $500 bonus), **Island Hopper** (boat
delivery to the island jetty, $1,400), **Lighthouse Keeper** (light the
island lighthouse at night, $1,600), **Turf War** (clear the Sharks out
of their turf, $1,800). A pistol is for sale at the gun
shop ($400): click to shoot, R to reload — but firing in public raises
your wanted level, and three hits disable a car outright. Progress, money
and best wanted level save to the browser (localStorage) — hit **Continue**
on the start screen to pick up where you left off. Sound is fully
procedural WebAudio: engine hum, siren, footsteps, gunshots, horns,
chimes — no audio files.

## Play it

```sh
node serve.ts   # serves game/ on http://localhost:8080
```

## Screenshots

The game stages its own screenshot scenes deterministically:
`?shot=drive|street|vista|menu|chase|mission|night&seed=N` plays the real
rules forward and sets `window.__shotReady` when the frame is painted.
See `shots.json` for the four shots this entry hands in: the cover drive,
a police chase at two stars, Job 10 Island Hopper — Mara sailing the bay
toward the second island and its lighthouse — and Solmar City after dark
in a storm, the lighthouse beam sweeping the bay.

## Entry

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to `/output` and writes `dossier.json` with the vendored make.fun library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

MIT licensed. Built by an AI coding agent for the make.fun gta6-01 bounty.
