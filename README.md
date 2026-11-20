# Solmar Bay

[![Make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Make.fun rank](https://make.fun/badge/gta6-01/inijikin/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Make.fun reward](https://make.fun/badge/gta6-01/inijikin/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

A 2D top-down open-world crime game that runs entirely in your desktop browser — no network, no downloads, no install. You are **Jay Marlow**, fresh out of the Marina Beach docks, trying to make a name in **Solmar Bay**: a coastal city of seven districts, from the neon of Downtown to the quiet houses of North Hills.

Drive anything you can get into, take jobs from the people who run the bay, and stay ahead of the Solmar Bay police — or at least ahead of the paint shop.

## What is in the game

- **A living city**: procedural streets with lane markings, sidewalks and crosswalks, traffic lights that stop real traffic, day/night cycle with headlights, street lamps and neon signs, rain, birds, and buildings that cast shadows following the sun.
- **On foot and behind the wheel**: smooth acceleration, running, five kinds of car (sedan, taxi, police, truck, sport) with different handling, handbrake drift with skid marks, collisions, damage, smoke and fire — and you can steal any NPC's car.
- **Wanted system**: 1–5 stars for stealing, hitting pedestrians, shooting, or attacking the police. Patrol cars and foot cops chase, ram and try to bust you. Hide, outrun them, or repaint the car.
- **Combat**: fists, a P9 pistol and a Vex SMG with ammo, mouse aim, muzzle flash, reload, and health + armor pickups.
- **Six story missions**: taxi fares, a package run, a police getaway, a street race against rival Vex, a harbor hit on Silas Kade, and the Bay Heist — with dialogue, rewards and unlocks (taxi work, the SMG, a safehouse, a sport car, armor).
- **Side activities**: taxi fares, hidden packages around the city, stunt jumps, a gun shop, a hospital, a paint shop and a safehouse.
- **Sound and radio**: engine hum that follows your speed, sirens, gunfire and footsteps, plus three original procedural radio stations (Bay FM, Neon Nights, Street Beat) — switch with R.
- **HUD and save**: live minimap with mission and police blips, health/armor, money, wanted stars, weapon and ammo, speed, game clock and objectives. Autosave after every mission, manual save from the pause menu.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move / drive (W accelerate, S brake/reverse) |
| Shift | Run |
| E | Enter/exit car, talk, interact |
| Space | Handbrake / drift |
| Mouse | Aim, click to shoot |
| Q | Switch weapon |
| R | Reload (on foot) / change radio station (driving) |
| H | Horn |
| M | Mute |
| Esc | Pause |

## Run it

```bash
node serve.ts
# open http://localhost:8080
```

Or open `game/index.html` directly — everything is static files, and the game makes zero network requests.

## Build the hand-in

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

That copies `game/` and `screenshots/` into `out/` and writes `out/dossier.json`.

## License

MIT — see `LICENSE`.
