// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game moves
// between title, controls, play, paused, settings and the end screens.
//
// ?seed=N fixes the city. ?shot=start|play|chase|mission (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot. window.__game exposes the state for
// tests and debugging.
import { STEP, DAY, ECONOMY, WEAPONS } from './config.js';
import { mulberry32, clamp, dist, fmtMoney } from './utils.js';
import { createWorld, districtAt, streetNames, isOnRoad, collideWorld } from './world.js';
import { createInput, ACT_ENTER, ACT_PAUSE, ACT_RELOAD, ACT_WEAPON, ACT_HORN, ACT_MUTE, ACT_CONFIRM } from './input.js';
import { createPlayer, updatePlayerOnFoot, tryEnterCar, exitCar, nearCarDistance } from './player.js';
import { driveCar, forwardSpeed, damageCar, collideCars, nearestCar } from './vehicles.js';
import { maintainTraffic, updateNpcCar, spawnNpcCar } from './traffic.js';
import { maintainPeds, updatePed, scarePeds, hurtPed } from './pedestrians.js';
import { createCrimes, updatePolice, clearWanted } from './police.js';
import { fireWeapon, startReload, updateReload, updatePickups, spawnPickups, damagePlayer, copShot } from './combat.js';
import { startMission, updateMissions, updateDialog, nextMissionStart, MISSION_DEFS } from './missions.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { drawHUD, drawTitle, drawControls, drawPause, drawSettings, drawEnd } from './hud.js';
import { saveGame, loadGame, hasSave, applySave } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');

/** Build a fresh game object. */
function createGame() {
  const world = createWorld(seed);
  const game = {
    seed,
    rng: mulberry32(seed + 77),
    world,
    player: null,
    cars: [],
    peds: [],
    cops: [],
    pickups: [],
    effects: [],
    skids: [],
    crimes: createCrimes(),
    combat: { copShot },
    audio: createAudio(),
    input: createInput(canvas),
    clock: DAY.startHour,
    elapsed: 0,
    time: 0,
    isNight: false,
    screen: 'title',
    menuHover: null,
    menuButtons: [],
    hasSave: hasSave(),
    completedMissions: [],
    mission: null,
    missionDone: null,
    unlocked: { taxi: false, smg: false, armor: false, sport: false, safehouse: false },
    owned: { pistol: false, smg: false },
    toasts: [],
    prompt: null,
    districtBanner: null,
    shake: 0,
    wasted: false,
    busted: false,
    nextMission: null,
    mouseWorld: { x: 0, y: 0 },
    taxiJob: null,
    autoDrive: null,
    lastPoliceSpawn: 0,
    lastCopSpawn: 0,
    lastShotCrime: -99,
    streetPair: '',
  };
  game.player = createPlayer(world);
  game.toast = (text) => { game.toasts.push({ text, life: 3.2 }); if (game.toasts.length > 4) game.toasts.shift(); };
  game.saveGame = () => { if (saveGame(game)) game.toast('Game saved.'); };
  spawnPickups(game);
  // A few parked cars near the start so the player can drive right away.
  for (let i = 0; i < 4; i++) {
    const car = spawnNpcCar(game, true);
    car.driver = 'none';
    car.occupied = false;
    game.cars.push(car);
  }
  return game;
}

const game = createGame();
const renderer = createRenderer(canvas);
window.__game = game;

function announce(message) { status.textContent = message; }

/** Screen-space mouse -> world coords (through the camera). */
function updateMouseWorld() {
  const m = game.input.mouse();
  const cam = renderer.camera;
  game.mouseWorld.x = cam.x + (m.x - renderer.view.w / 2 - cam.sx) / cam.zoom;
  game.mouseWorld.y = cam.y + (m.y - renderer.view.h / 2 - cam.sy) / cam.zoom;
}

/** One fixed step of the whole simulation. */
function stepGame(g, dt) {
  g.elapsed += dt;
  g.time = g.elapsed;
  g.clock += dt / DAY.secondsPerHour;
  if (g.clock >= 24) g.clock -= 24;
  g.isNight = g.clock >= DAY.nightStart || g.clock < DAY.nightEnd;

  // Rain comes and goes; birds cross the sky.
  const w = g.world;
  w.rainTimer -= dt;
  if (w.rainTimer <= 0) {
    w.rain = w.rain > 0 ? 0 : 1;
    w.rainTimer = w.rain > 0 ? 25 + g.rng() * 25 : 120 + g.rng() * 180;
    if (w.rain > 0) g.toast('Light rain over the bay.');
  }
  if (g.rng() < dt * 0.05 && w.birds.length < 5) {
    w.birds.push({ x: g.player.x - 700 + g.rng() * 300, y: g.player.y - 400 + g.rng() * 500, vx: 60 + g.rng() * 40, vy: (g.rng() - 0.5) * 20 });
  }
  for (let i = w.birds.length - 1; i >= 0; i--) {
    const b = w.birds[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x > g.player.x + 800) w.birds.splice(i, 1);
  }

  // District banner + street label.
  const d = districtAt(g.player.x, g.player.y);
  if (d && (!g.player.district || g.player.district.name !== d.name)) {
    g.player.district = d;
    g.districtBanner = { name: d.name, desc: d.desc, t: 0 };
    g.audio.click();
  }
  if (g.districtBanner) {
    g.districtBanner.t += dt;
    if (g.districtBanner.t > 3) g.districtBanner = null;
  }
  const streets = streetNames(w, g.player.x, g.player.y);
  g.streetPair = `${streets.v} × ${streets.h}`;

  // --- Player (only while actually playing; the title backdrop is ambient) ---
  const interactive = g.screen === 'play';
  const p = g.player;
  if (interactive && !p.dead && !g.wasted && !g.busted) {
    if (p.car) {
      const car = p.car;
      let drive;
      if (g.autoDrive) drive = g.autoDrive;
      else {
        const input = g.input;
        drive = {
          throttle: input.axisY() < 0 ? 1 : input.axisY() > 0 ? -1 : 0,
          steer: input.axisX(),
          handbrake: input.braking(),
        };
      }
      const before = Math.hypot(car.vx, car.vy);
      const impact = driveCar(w, car, drive, dt, g.effects);
      const after = Math.hypot(car.vx, car.vy);
      // The player's position rides with the car: missions, shops, police and
      // the district banner all measure from the player.
      p.x = car.x; p.y = car.y;
      if (impact > 120) {
        g.shake = Math.min(1, impact / 300);
        g.audio.explosion();
        scarePeds(g, car.x, car.y, 200);
      }
      // Skid marks + dust while drifting or speeding off-road.
      if (car.drift > 60 && after > 60) {
        const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
        g.skids.push({ x1: car.x - fx * 16 - fy * 9, y1: car.y - fy * 16 + fx * 9, x2: car.x - fx * 22 - fy * 9, y2: car.y - fy * 22 + fx * 9, life: 5 });
        g.skids.push({ x1: car.x - fx * 16 + fy * 9, y1: car.y - fy * 16 - fx * 9, x2: car.x - fx * 22 + fy * 9, y2: car.y - fy * 22 - fx * 9, life: 5 });
        if (g.skids.length > 320) g.skids.splice(0, g.skids.length - 320);
      }
      if (after > 200 && !isOnRoad(w, car.x, car.y)) {
        g.effects.push({ kind: 'dust', x: car.x - Math.cos(car.angle) * 20, y: car.y - Math.sin(car.angle) * 20, vx: 0, vy: 0, life: 0.6, max: 0.6, size: 6 });
      }
      // Ramps: speed over one launches a stunt jump.
      for (const r of w.ramps) {
        if (!r.used && dist(car.x, car.y, r.x, r.y) < 34 && after > 200) {
          r.used = true;
          car.airborne = true;
          car.airTime = 0.9;
          p.money += 25;
          g.toast('STUNT JUMP +$25');
          g.audio.checkpoint();
          setTimeout(() => { r.used = false; }, 5000);
        }
      }
      if (car.airborne) {
        car.airTime -= dt;
        if (car.airTime <= 0) car.airborne = false;
      }
      // The car died under the player: eject, hurt.
      if (car.dead) {
        exitCar(g);
        damagePlayer(g, 40);
        g.shake = 1;
      }
      g.audio.engine(after, drive.throttle);
    } else {
      updatePlayerOnFoot(g, dt);
      g.audio.engine(0, 0);
    }
  }

  // Car vs car.
  for (let i = 0; i < g.cars.length; i++) {
    for (let j = i + 1; j < g.cars.length; j++) {
      collideCars(g.cars[i], g.cars[j], g.effects);
    }
  }
  // Player's car vs pedestrians (a crime) and vs hydrants / crates.
  const pc = p.car;
  if (interactive && pc) {
    for (const ped of g.peds) {
      if (ped.state !== 'down' && dist(ped.x, ped.y, pc.x, pc.y) < 26 && Math.hypot(pc.vx, pc.vy) > 60) {
        if (hurtPed(g, ped, 100, pc.x, pc.y)) g.crimes.hitPed(g);
        g.shake = Math.min(1, g.shake + 0.4);
        g.audio.punch();
      }
    }
  }
  for (const hyd of w.hydrants) {
    if (!hyd.hit && interactive) {
      const hitBy = (pc && dist(hyd.x, hyd.y, pc.x, pc.y) < 26) || dist(hyd.x, hyd.y, p.x, p.y) < 20;
      if (hitBy) { hyd.hit = true; g.audio.explosion(); g.toast('You smashed a hydrant!'); }
    }
  }
  for (const c of w.crates) {
    if (interactive && !c.broken && ((pc && dist(c.x, c.y, pc.x, pc.y) < 28) || dist(c.x, c.y, p.x, p.y) < 20)) {
      c.broken = true;
      g.effects.push({ kind: 'dust', x: c.x, y: c.y, vx: 0, vy: 0, life: 0.5, max: 0.5, size: 10 });
    }
  }
  // Collectibles.
  for (const c of w.collectibles) {
    if (interactive && !c.taken && dist(p.x, p.y, c.x, c.y) < 30) {
      c.taken = true;
      p.collected += 1;
      p.money += ECONOMY.collectibleValue;
      g.toast(`Hidden package found! +$${ECONOMY.collectibleValue} (${p.collected}/${ECONOMY.collectibles})`);
      g.audio.pickup();
    }
  }

  // Traffic, pedestrians, police, missions, combat.
  maintainTraffic(g, dt);
  for (const car of [...g.cars]) if (car.driver === 'npc') updateNpcCar(g, car, dt);
  maintainPeds(g);
  for (const ped of g.peds) updatePed(g, ped, dt);
  updatePolice(g, dt);
  if (interactive) {
    updateMissions(g, dt);
    updateDialog(g, dt);
  }
  updateReload(g, dt);
  updatePickups(g, dt);

  // Shooting: hold to fire automatics, click for semi-automatics.
  if (interactive && !p.car && !p.dead) {
    const def = WEAPONS[p.weapon];
    if (def.auto) { if (g.input.mouse().down) fireWeapon(g); }
    else if (g.input.takeClick()) fireWeapon(g);
  }

  // Taxi jobs (unlocked after mission 1): fares while driving a taxi.
  if (interactive) updateTaxi(g, dt);

  // Mission start marker / shop prompts.
  g.prompt = null;
  g.nextMission = nextMissionStart(g);
  if (interactive && !g.mission && g.nextMission && dist(p.x, p.y, g.nextMission.x, g.nextMission.y) < 80) {
    g.prompt = `Press E — ${g.nextMission.def.title} (${g.nextMission.def.giver})`;
    g.nearMission = g.nextMission.def;
  } else g.nearMission = null;
  if (interactive && !g.prompt) {
    const shop = nearestShop(g, 56);
    if (shop) {
      g.nearShop = shop;
      g.prompt = shopPrompt(g, shop);
    } else g.nearShop = null;
  }

  // Effects: move, age, and explosions hurt once.
  for (let i = g.effects.length - 1; i >= 0; i--) {
    const e = g.effects[i];
    e.life -= dt;
    e.x += (e.vx || 0) * dt;
    e.y += (e.vy || 0) * dt;
    if (e.kind === 'boom' && !e.applied) {
      e.applied = true;
      g.audio.explosion();
      g.shake = 1;
      for (const car of g.cars) if (dist(car.x, car.y, e.x, e.y) < 130) damageCar(car, 60, g.effects);
      for (const ped of g.peds) if (dist(ped.x, ped.y, e.x, e.y) < 120) hurtPed(g, ped, 100, e.x, e.y);
      if (dist(p.x, p.y, e.x, e.y) < 110) damagePlayer(g, 45);
      scarePeds(g, e.x, e.y, 320);
    }
    if (e.life <= 0) g.effects.splice(i, 1);
  }
  for (let i = g.skids.length - 1; i >= 0; i--) {
    g.skids[i].life -= dt;
    if (g.skids[i].life <= 0) g.skids.splice(i, 1);
  }
  for (let i = g.toasts.length - 1; i >= 0; i--) {
    g.toasts[i].life -= dt;
    if (g.toasts[i].life <= 0) g.toasts.splice(i, 1);
  }

  // Wasted / busted transitions.
  if (interactive && p.dead && !g.wasted) { g.wasted = true; }
  if (interactive && (g.wasted || g.busted)) {
    g.screen = 'end';
    g.endKind = g.busted ? 'busted' : 'wasted';
  }
}

/** Taxi fares: a passenger flags the taxi down, pays on delivery. */
function updateTaxi(g, dt) {
  if (!g.unlocked.taxi) return;
  const p = g.player;
  if (!g.taxiJob) {
    if (p.car && p.car.type === 'taxi' && !g.mission) {
      // A fare appears nearby every so often.
      if (g.rng() < dt * 0.25) {
        const pt = { x: 120 + g.rng() * 2000, y: 120 + g.rng() * 1800 };
        g.taxiJob = { phase: 'pickup', x: pt.x, y: pt.y, fare: ECONOMY.taxiFare };
        g.toast('Taxi fare nearby — pick them up!');
      }
    }
    return;
  }
  const job = g.taxiJob;
  if (job.phase === 'pickup' && dist(p.x, p.y, job.x, job.y) < 46) {
    job.phase = 'deliver';
    job.x = 120 + g.rng() * 2000;
    job.y = 120 + g.rng() * 1800;
    g.toast('Passenger aboard — drive to the marker.');
  } else if (job.phase === 'deliver' && dist(p.x, p.y, job.x, job.y) < 46) {
    p.money += job.fare;
    g.toast(`Fare complete! +$${job.fare}`);
    g.audio.pickup();
    g.taxiJob = null;
  }
}

/** Nearest shop door within `radius` (player on foot or in a car). */
function nearestShop(g, radius) {
  const p = g.player;
  let best = null, bd = radius;
  for (const key of Object.keys(g.world.shops)) {
    const s = g.world.shops[key];
    const d = dist(p.x, p.y, s.x, s.y);
    if (d < bd) { bd = d; best = { ...s, key }; }
  }
  return best;
}

function shopPrompt(g, shop) {
  switch (shop.key) {
    case 'gun': return 'Press E — Ironworks Arms (buy weapons)';
    case 'hospital': return 'Press E — Heal up ($100)';
    case 'paint': return g.player.car ? 'Press E — Repaint ($200, clears wanted)' : 'Chrome & Color — bring a car';
    case 'safehouse': return g.unlocked.safehouse ? 'Press E — Save & rest' : 'Safehouse — locked';
    case 'race': return 'Press E — Street Kings race';
    case 'diner': return "Press E — Rosa's Diner";
    default: return `Press E — ${shop.name}`;
  }
}

/** What E does at a shop. */
function useShop(g, shop) {
  const p = g.player;
  if (shop.key === 'gun') {
    if (!g.owned.pistol && p.money >= WEAPONS.pistol.price) {
      p.money -= WEAPONS.pistol.price;
      g.owned.pistol = true;
      p.ammo.pistol += 24;
      g.toast('Bought the P9 Pistol. Press Q to equip.');
      g.audio.pickup();
    } else if (g.owned.pistol && g.unlocked.smg && !g.owned.smg && p.money >= WEAPONS.smg.price) {
      p.money -= WEAPONS.smg.price;
      g.owned.smg = true;
      p.ammo.smg += 64;
      g.toast('Bought the Vex SMG. Press Q to equip.');
      g.audio.pickup();
    } else if (g.owned.pistol && g.unlocked.armor && p.armor < 100 && p.money >= ECONOMY.armorCost) {
      p.money -= ECONOMY.armorCost;
      p.armor = 100;
      g.toast('Armor fitted. You feel bulletproof.');
      g.audio.pickup();
    } else if (g.owned.pistol && p.money >= ECONOMY.ammoCost) {
      p.money -= ECONOMY.ammoCost;
      p.ammo.pistol += 24; p.ammo.smg += 32;
      g.toast('Ammo restocked.');
      g.audio.pickup();
    } else if (!g.owned.pistol) g.toast(`Need $${WEAPONS.pistol.price} for the P9 Pistol.`);
    else g.toast('Nothing to buy right now.');
  } else if (shop.key === 'hospital') {
    if (p.health >= 100) g.toast('You feel fine already.');
    else if (p.money >= ECONOMY.healCost) {
      p.money -= ECONOMY.healCost;
      p.health = 100;
      g.toast('Patched up. Good as new.');
      g.audio.pickup();
    } else g.toast(`Healing costs $${ECONOMY.healCost}.`);
  } else if (shop.key === 'paint') {
    if (!p.car) { g.toast('Bring a car to repaint.'); return; }
    if (p.money >= ECONOMY.paintCost) {
      p.money -= ECONOMY.paintCost;
      p.car.color = ['#c94f42', '#4a7fb5', '#5e8a5a', '#f2f2f2'][Math.floor(g.rng() * 4)];
      clearWanted(g);
      g.audio.pickup();
    } else g.toast(`A repaint costs $${ECONOMY.paintCost}.`);
  } else if (shop.key === 'safehouse') {
    if (!g.unlocked.safehouse) { g.toast('Locked. Finish the getaway job first.'); return; }
    p.health = 100;
    g.saveGame();
    g.toast('Rested at the safehouse. Game saved.');
  } else if (shop.key === 'race') {
    g.toast('Street Kings race starts at the mission marker.');
  } else if (shop.key === 'diner') {
    if (p.money >= 20 && p.health < 100) {
      p.money -= 20;
      p.health = Math.min(100, p.health + 25);
      g.toast("Rosa's special: +25 health, $20.");
    } else g.toast("Rosa's Diner — best coffee on the bay.");
  }
}

/** Handle one-shot actions for the current screen. */
function handleActions(g) {
  const actions = g.input.takeActions();
  const p = g.player;
  if (actions & ACT_MUTE) {
    g.audio.ensure();
    g.audio.setMuted(!g.audio.muted);
    g.toast(g.audio.muted ? 'Sound muted.' : 'Sound on.');
  }
  if (g.screen === 'title') {
    if (actions & (ACT_CONFIRM | ACT_ENTER)) activateMenu(g, 'start');
    return;
  }
  if (g.screen === 'controls') {
    if (actions & (ACT_CONFIRM | ACT_ENTER | ACT_PAUSE)) g.screen = 'title';
    return;
  }
  if (g.screen === 'pause') {
    if (actions & ACT_PAUSE) { g.screen = 'play'; announce('Playing.'); }
    return;
  }
  if (g.screen === 'settings') {
    if (actions & ACT_PAUSE) g.screen = 'pause';
    return;
  }
  if (g.screen === 'end') {
    if (actions & (ACT_CONFIRM | ACT_ENTER)) activateMenu(g, 'respawn');
    return;
  }
  if (g.screen !== 'play') return;
  if (actions & ACT_PAUSE) {
    g.screen = 'pause';
    announce('Paused.');
    return;
  }
  if (actions & ACT_ENTER) {
    if (g.nearMission) { startMission(g, g.nearMission); return; }
    // A car right beside the player wins over a shop: E is how you get in.
    if (!p.car && nearCarDistance(g) <= 40) {
      if (tryEnterCar(g)) g.toast(`${p.car.name} — drive!`);
      return;
    }
    if (g.nearShop) { useShop(g, g.nearShop); return; }
    if (p.car) exitCar(g);
    else if (tryEnterCar(g)) g.toast(p.car ? `${p.car.name} — drive!` : '');
    return;
  }
  if (actions & ACT_WEAPON) {
    const owned = ['fists', ...(g.owned.pistol ? ['pistol'] : []), ...(g.owned.smg ? ['smg'] : [])];
    const i = owned.indexOf(p.weapon);
    p.weapon = owned[(i + 1) % owned.length];
    p.reloading = 0;
    g.audio.click();
    g.toast(`Weapon: ${WEAPONS[p.weapon].name}`);
  }
  if (actions & ACT_RELOAD) {
    if (p.car) {
      const name = g.audio.nextStation();
      g.toast(`Radio: ${name}`);
    } else startReload(g);
  }
  if (actions & ACT_HORN && p.car) {
    g.audio.horn();
    scarePeds(g, p.car.x, p.car.y, 120);
  }
}

/** Menu button activation. */
function activateMenu(g, id) {
  const p = g.player;
  if (id === 'start') {
    g.audio.ensure();
    g.audio.click();
    if (g.hasSave && !g.startedFresh) {
      const data = loadGame();
      if (data) applySave(g, data);
    }
    g.startedFresh = true;
    g.screen = 'play';
    g.nextMission = nextMissionStart(g);
    if (g.nextMission) g.toast(`New job: ${g.nextMission.def.title} — follow the gold M.`);
    announce('Playing. WASD to move, E to enter a car.');
  } else if (id === 'controls') {
    g.screen = 'controls';
  } else if (id === 'music') {
    g.audio.ensure();
    g.audio.musicOn = !g.audio.musicOn;
    g.toast(g.audio.musicOn ? 'Music on.' : 'Music off.');
  } else if (id === 'resume') {
    g.screen = 'play';
  } else if (id === 'save') {
    g.saveGame();
  } else if (id === 'quit') {
    g.screen = 'title';
    g.hasSave = hasSave();
  } else if (id === 'volume') {
    g.audio.setVolume(g.audio.volume >= 1 ? 0.2 : g.audio.volume + 0.2);
  } else if (id === 'back') {
    g.screen = 'pause';
  } else if (id === 'respawn') {
    p.dead = false;
    p.health = 100;
    p.armor = 0;
    p.money = Math.max(0, p.money - 200);
    p.wanted = 0;
    p.car = null;
    const h = g.world.shops.hospital;
    p.x = h.x; p.y = h.y + 40;
    p.vx = 0; p.vy = 0;
    g.wasted = false;
    g.busted = false;
    clearWanted(g, true);
    g.screen = 'play';
    g.toast('Back on the streets. Stay sharp.');
  }
}

/** Mouse hover / click on menu buttons. */
function handleMenuMouse(g) {
  const m = g.input.mouse();
  g.menuHover = null;
  for (const b of g.menuButtons || []) {
    if (m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h) {
      g.menuHover = b.id;
      break;
    }
  }
  if (g.input.takeClick() && g.menuHover) {
    g.audio.ensure();
    activateMenu(g, g.menuHover);
  }
}

/** The live loop. */
function runGame() {
  let accumulator = 0;
  let last = performance.now();
  announce('Solmar Bay. Press Enter or click to start.');

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    updateMouseWorld();
    handleMenuMouse(game);
    handleActions(game);
    if (game.screen === 'play') {
      while (accumulator >= STEP && game.screen === 'play') {
        stepGame(game, STEP);
        accumulator -= STEP;
      }
    } else {
      // The title screen's backdrop stays alive.
      if (game.screen === 'title') {
        while (accumulator >= STEP) {
          stepGame(game, STEP);
          accumulator -= STEP;
          if (game.screen !== 'title') break;
        }
      } else accumulator = 0;
    }
    renderer.updateCamera(game, 1 / 60);
    renderer.draw(game);
    const ctx = canvas.getContext('2d');
    if (game.screen === 'play') drawHUD(ctx, game, renderer.view);
    else if (game.screen === 'title') drawTitle(ctx, game, renderer.view);
    else if (game.screen === 'controls') drawControls(ctx, game, renderer.view);
    else if (game.screen === 'pause') drawPause(ctx, game, renderer.view);
    else if (game.screen === 'settings') drawSettings(ctx, game, renderer.view);
    else if (game.screen === 'end') drawEnd(ctx, game, renderer.view, game.endKind || 'wasted');
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.screen === 'play') {
      game.screen = 'pause';
      announce('Paused.');
    }
  });

  requestAnimationFrame(frame);
}

function runShot(name) {
  const scene = stageShot(name, game, stepGame);
  // The camera eases toward the player a little each call; in a live game it
  // settles over frames, but a shot paints only twice — so settle it here
  // first (the title shot keeps the wide view of the map's centre instead).
  if (scene.screen === 'play') {
    for (let i = 0; i < 240; i++) renderer.updateCamera(game, 1 / 60);
  }
  let painted = 0;
  function paint() {
    renderer.updateCamera(game, 1 / 60);
    renderer.draw(game);
    if (scene.screen === 'play') drawHUD(canvas.getContext('2d'), game, renderer.view);
    else drawTitle(canvas.getContext('2d'), game, renderer.view);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

if (shot) runShot(shot);
else runGame();
