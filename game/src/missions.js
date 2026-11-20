// Missions and story: six jobs across Solmar Bay, told by the people who run
// it. Each mission is a small state machine of steps (go to, pick up, deliver,
// race, eliminate, escape) with intro/outro dialogue, a timer where the job
// demands one, and a cash reward plus an unlock.
import { dist } from './utils.js';
import { makeCar, driveCar } from './vehicles.js';
import { clamp, angleDiff } from './utils.js';

const M = (id, title, giver, start, intro, outro, steps, reward, unlock) => ({ id, title, giver, start, intro, outro, steps, reward, unlock });

export const MISSION_DEFS = [
  M(1, 'First Fare', 'Mama Rosa', 'diner',
    ["Mama Rosa: Jay, welcome to Solmar Bay. My taxi is out front.",
     "Mama Rosa: Take Mrs. Alvarez to the marina. Easy money, no trouble."],
    ["Mrs. Alvarez: Lovely drive, dear. Rosa speaks highly of you."],
    [{ type: 'pickup', at: 'diner', label: 'Pick up Mrs. Alvarez at the diner' },
     { type: 'deliver', at: 'marina', label: 'Drive Mrs. Alvarez to the Marina' }],
    150, 'taxi'),
  M(2, 'Package Run', 'Dex', 'paint',
    ["Dex: Package for the docks. Ninety seconds, Jay.",
     "Dex: Don't dawdle. Don't attract attention."],
    ["Dex: Clean. You're alright, kid."],
    [{ type: 'pickup', at: 'paint', label: 'Collect the package from Dex' },
     { type: 'deliver', at: 'docks', label: 'Deliver the package to the Harbor Docks', timer: 90 }],
    300, 'smg'),
  M(3, 'The Getaway', 'Dex', 'paint',
    ["Dex: I borrowed something from North Hills. Pick me up at the alley.",
     "Dex: Then lose the heat. The safehouse behind Rosa's is clean."],
    ["Dex: Ha! They never had us. You're my driver now, Jay."],
    [{ type: 'pickup', at: 'docks', label: 'Pick up Dex at the alley' },
     { type: 'escape', at: 'safehouse', label: 'Escape to the Safehouse', wanted: 2 }],
    500, 'safehouse'),
  M(4, 'Street Kings', 'Vex', 'race',
    ["Vex: Think you're fast, rookie? Five checkpoints around the bay.",
     "Vex: Beat me and the streets are yours. Lose and walk home."],
    ["Vex: ...Fine. You're fast. The streets are yours, Jay."],
    [{ type: 'race', label: 'Beat Vex through 5 checkpoints' }],
    800, 'sport'),
  M(5, 'Harbor Lights', 'Vera Solano', 'marina',
    ["Vera: Silas Kade talks too much. The docks, tonight.",
     "Vera: Make it quiet. Then come back to the diner."],
    ["Vera: The bay is quieter already. You're worth every cent."],
    [{ type: 'kill', at: 'docks', label: 'Eliminate Silas Kade at the docks' },
     { type: 'goto', at: 'diner', label: 'Return to Rosa\'s Diner' }],
    1200, 'armor'),
  M(6, 'Bay Heist', 'Vera Solano', 'marina',
    ["Vera: The Comet GT in the marina showroom. Take it.",
     "Vera: Bring it to my garage at Chrome & Color. The whole bay will watch."],
    ["Vera: Beautiful. Solmar Bay is ours now, Jay."],
    [{ type: 'steal', at: 'marina', label: 'Steal the Comet GT from the Marina' },
     { type: 'deliver', at: 'paint', label: 'Deliver the Comet GT to the garage', wanted: 3 }],
    2500, 'ending'),
];

/** Race checkpoints: five corners of the bay. */
function raceCheckpoints(world) {
  const v = world.roadsV, h = world.roadsH, r = 32;
  return [
    { x: v[5] + r, y: h[1] + r }, { x: v[1] + r, y: h[1] + r },
    { x: v[1] + r, y: h[5] + r }, { x: v[6] + r, y: h[5] + r },
    { x: v[4] + r, y: h[3] + r },
  ];
}

/** Start a mission: set up its steps, spawn what it needs, play the intro. */
export function startMission(game, def) {
  const world = game.world;
  const cur = { def, step: 0, timer: 0, data: {}, dialog: [...def.intro], dialogIdx: 0, dialogTimer: 0 };
  const step0 = def.steps[0];
  if (step0.timer) cur.timer = step0.timer;
  if (def.id === 1) {
    // A taxi waits at the diner for the first fare.
    const taxi = makeCar('taxi', world.shops.diner.x, world.shops.diner.y + 70, -Math.PI / 2, 'none', game.rng);
    taxi.occupied = false;
    game.cars.push(taxi);
  }
  if (def.id === 4) {
    cur.data.checkpoints = raceCheckpoints(world);
    cur.data.cp = 0;
    const s = world.shops.race;
    const rival = makeCar('sport', s.x + 40, s.y, 0, 'rival', game.rng);
    rival.occupied = true;
    rival.raceCp = 0;
    game.cars.push(rival);
    cur.data.rival = rival;
  }
  if (def.id === 5) {
    const d = world.shops.docks;
    cur.data.target = { x: d.x + 60, y: d.y + 40, health: 120, angle: 0 };
    game.peds.push({ id: 9001, x: d.x + 60, y: d.y + 40, angle: 0, speed: 0, shirt: '#111', pants: '#111', skin: '#c98a5a', state: 'walk', tx: d.x + 60, ty: d.y + 40, wait: 999, fleeX: 0, fleeY: 0, fleeTimer: 0, downTimer: 0, phase: 0, health: 120, target: true });
  }
  if (def.id === 6) {
    const m = world.shops.marina;
    const gt = makeCar('sport', m.x, m.y + 60, Math.PI / 2, 'none', game.rng);
    gt.occupied = false;
    game.cars.push(gt);
    cur.data.gt = gt;
  }
  game.mission = cur;
  game.audio.mission();
}

/** The current objective text for the HUD (or null). */
export function objectiveText(game) {
  const cur = game.mission;
  if (!cur) return null;
  const step = cur.def.steps[cur.step];
  if (!step) return null;
  return `${cur.def.title}: ${step.label}`;
}

/** Where the mission blip points right now (world coords) or null. */
export function missionTarget(game) {
  const cur = game.mission;
  if (!cur) return null;
  const step = cur.def.steps[cur.step];
  if (!step) return null;
  if (step.type === 'race') {
    const cp = cur.data.checkpoints[cur.data.cp];
    return cp ? { x: cp.x, y: cp.y, kind: 'race' } : null;
  }
  if (step.type === 'kill' && cur.data.target) return { x: cur.data.target.x, y: cur.data.target.y, kind: 'kill' };
  const shop = game.world.shops[step.at];
  return shop ? { x: shop.x, y: shop.y, kind: 'mission' } : null;
}

/** The next mission the player can start (its start marker), or null. */
export function nextMissionStart(game) {
  const done = game.completedMissions;
  const def = MISSION_DEFS.find((d) => !done.includes(d.id));
  if (!def) return null;
  const shop = game.world.shops[def.start];
  return { def, x: shop.x, y: shop.y };
}

/** Advance dialogue lines (auto-advance every 3.5s). */
export function updateDialog(game, dt) {
  const cur = game.mission;
  if (!cur || cur.dialogIdx >= cur.dialog.length) return;
  cur.dialogTimer += dt;
  if (cur.dialogTimer > 3.5) { cur.dialogTimer = 0; cur.dialogIdx += 1; }
}

/** Current dialogue line to show as a subtitle, or null. */
export function dialogLine(game) {
  const cur = game.mission;
  if (!cur || cur.dialogIdx >= cur.dialog.length) return null;
  return cur.dialog[cur.dialogIdx];
}

function stepPos(game, step) {
  if (step.type === 'race' || step.type === 'kill') return null;
  const shop = game.world.shops[step.at];
  return shop ? { x: shop.x, y: shop.y } : null;
}

function completeStep(game) {
  const cur = game.mission;
  cur.step += 1;
  const next = cur.def.steps[cur.step];
  if (next && next.timer) cur.timer = next.timer;
  if (next && next.wanted) { game.player.wanted = Math.max(game.player.wanted, next.wanted); game.player.lastCrime = game.elapsed; }
  if (!next) completeMission(game);
}

function completeMission(game) {
  const cur = game.mission;
  const p = game.player;
  p.money += cur.def.reward;
  game.completedMissions.push(cur.def.id);
  game.toast(`${cur.def.title} complete! +$${cur.def.reward}`);
  game.audio.complete();
  cur.dialog = [...cur.def.outro];
  cur.dialogIdx = 0;
  cur.dialogTimer = 0;
  // Unlocks.
  if (cur.def.unlock === 'smg') game.unlocked.smg = true;
  if (cur.def.unlock === 'armor') game.unlocked.armor = true;
  if (cur.def.unlock === 'sport') game.unlocked.sport = true;
  if (cur.def.unlock === 'safehouse') game.unlocked.safehouse = true;
  if (cur.def.unlock === 'taxi') game.unlocked.taxi = true;
  game.missionDone = cur;
  game.mission = null;
  game.saveGame();
}

function failMission(game, reason) {
  const cur = game.mission;
  game.toast(`Mission failed: ${reason}`);
  game.audio.fail();
  // Clean up mission cars.
  if (cur.data.rival) { const i = game.cars.indexOf(cur.data.rival); if (i >= 0) game.cars.splice(i, 1); }
  if (cur.data.gt && cur.data.gt.driver !== 'player') { const i = game.cars.indexOf(cur.data.gt); if (i >= 0) game.cars.splice(i, 1); }
  game.mission = null;
}

/** One mission step. */
export function updateMissions(game, dt) {
  const cur = game.mission;
  if (!cur) return;
  const p = game.player;
  const step = cur.def.steps[cur.step];
  if (!step) return;
  if (step.timer) {
    cur.timer -= dt;
    if (cur.timer <= 0) { failMission(game, 'Out of time.'); return; }
  }
  const pos = stepPos(game, step);
  if (step.type === 'goto' || step.type === 'deliver' || step.type === 'escape') {
    if (pos && dist(p.x, p.y, pos.x, pos.y) < 70) {
      if (step.type === 'escape' && p.wanted > 0) { /* must arrive clean-ish: allow it, the chase ends here */ }
      completeStep(game);
    }
  } else if (step.type === 'pickup') {
    if (pos && dist(p.x, p.y, pos.x, pos.y) < 70) {
      if (step.wanted) { p.wanted = Math.max(p.wanted, step.wanted); p.lastCrime = game.elapsed; }
      game.toast('Picked up. Go!');
      completeStep(game);
    }
  } else if (step.type === 'steal') {
    if (cur.data.gt && cur.data.gt.driver === 'player') {
      p.wanted = Math.max(p.wanted, 3);
      p.lastCrime = game.elapsed;
      game.toast('The Comet GT is yours. Run!');
      completeStep(game);
    }
  } else if (step.type === 'kill') {
    const t = cur.data.target;
    if (t && t.health <= 0) completeStep(game);
  } else if (step.type === 'race') {
    const cp = cur.data.checkpoints[cur.data.cp];
    if (cp && dist(p.x, p.y, cp.x, cp.y) < 70) {
      cur.data.cp += 1;
      game.audio.checkpoint();
      if (cur.data.cp >= cur.data.checkpoints.length) { completeStep(game); return; }
    }
    // Rival races the same checkpoints.
    const rival = cur.data.rival;
    if (rival && !rival.dead) {
      const rcp = cur.data.checkpoints[rival.raceCp];
      if (rcp) {
        if (dist(rival.x, rival.y, rcp.x, rcp.y) < 70) rival.raceCp += 1;
        const wantAngle = Math.atan2(rcp.y - rival.y, rcp.x - rival.x);
        const steer = clamp(angleDiff(rival.angle, wantAngle) * 2.4, -1, 1);
        driveCar(game.world, rival, { throttle: 1, steer, handbrake: false }, dt, game.effects);
        if (rival.raceCp >= cur.data.checkpoints.length) { failMission(game, 'Vex finished first.'); return; }
      }
    }
  }
}
