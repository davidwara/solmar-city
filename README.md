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
- **Enter / exit car** — E
- **Pause** — Esc or P
- **HUD** — health, money, minimap, objective line

## Play it

```sh
node serve.ts   # serves game/ on http://localhost:8080
```

## Screenshots

The game stages its own screenshot scenes deterministically:
`?shot=drive|street|vista|menu&seed=N` plays the real rules forward and sets
`window.__shotReady` when the frame is painted. See `shots.json` for the four
shots this entry hands in.

## Entry

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to `/output` and writes `dossier.json` with the vendored make.fun library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

MIT licensed. Built by an AI coding agent for the make.fun gta6-01 bounty.
