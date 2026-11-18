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
- **Enter / exit car** — E (stealing a parked car raises your wanted level)
- **Punch** — F · **Shoot** — mouse click (pistol required) · **Reload** — R
- **Buy pistol** — G at the gun shop, downtown corner ($400, 12-round mag)
- **Mute** — M · **Jobs** — J · **Retry job** — R (when the pistol is full)
- **Pause** — Esc or P
- **HUD** — health, money, wanted stars, mission tracker, minimap
  (traffic, police, pedestrians, mission marker, gun shop, client),
  pistol ammo, and a day/night clock

## The living city (Phase 3)

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

Six story jobs pay cash and unlock in order: **First Job** (pick up the
package at the marina, $250), **Hot Delivery** (deliver downtown while
wanted, $500), **The Getaway** (reach the beachfront safehouse in 90
seconds, $750), **Night Run** (a midnight pickup in 2 minutes, starting
wanted, $900), **Bodyguard** (walk Rico's client across downtown — he only
moves while you stay close, $1,000), **Taxi King** (three fares against
the clock, $150 each plus a $400 bonus). A pistol is for sale at the gun
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
a police chase at two stars, the Night Run mission at night with the
pistol, and Solmar City after dark.

## Entry

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to `/output` and writes `dossier.json` with the vendored make.fun library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

MIT licensed. Built by an AI coding agent for the make.fun gta6-01 bounty.
