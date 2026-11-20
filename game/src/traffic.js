// NPC traffic: cars that keep to their lane, obey red lights, queue behind the
// car ahead and turn at crossings. They drive through the same physics as the
// player's car, steered by a small controller that aims at a point up the road.
import { CAR_TYPES } from './config.js';
import { clamp, angleDiff, dist, pick } from './utils.js';
import { makeCar, driveCar, forwardSpeed } from './vehicles.js';
import { roadAt, lightState, randomRoadPoint } from './world.js';
import { WORLD } from './config.js';

const NPC_TYPES = ['sedan', 'sedan', 'sedan', 'taxi', 'truck', 'sedan', 'taxi'];

/** Lane centre for a road: right-hand traffic (southbound on the west side). */
export function laneCentre(world, axis, index, dir) {
  if (axis === 'v') {
    const cx = world.roadsV[index] + WORLD.road / 2;
    return { x: cx - dir * WORLD.lane, y: null };
  }
  const cy = world.roadsH[index] + WORLD.road / 2;
  return { x: null, y: cy + dir * WORLD.lane };
}

/** Spawn one NPC car on a random road near the player. */
export function spawnNpcCar(game, nearPlayer = true) {
  const world = game.world;
  const rng = game.rng;
  const pt = randomRoadPoint(world, rng);
  let x = pt.x, y = pt.y;
  if (nearPlayer) {
    // Try a few times to land within a few blocks of the player.
    for (let tries = 0; tries < 6; tries++) {
      const p2 = randomRoadPoint(world, rng);
      if (dist(p2.x, p2.y, game.player.x, game.player.y) < 800) { x = p2.x; y = p2.y; pt.axis = p2.axis; pt.index = p2.index; break; }
    }
  }
  const type = pick(rng, NPC_TYPES);
  const dir = rng() < 0.5 ? 1 : -1;
  const lane = laneCentre(world, pt.axis, pt.index, dir);
  if (pt.axis === 'v') x = lane.x; else y = lane.y;
  const angle = pt.axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
  const car = makeCar(type, x, y, angle, 'npc', rng);
  car.traffic = {
    axis: pt.axis, index: pt.index, dir,
    targetSpeed: 120 + rng() * 90,
    decidedAt: -1, // intersection key where the last turn was decided
  };
  car.occupied = rng() < 0.85;
  return car;
}

/** Keep the traffic population around the player (about 14 cars). */
export function maintainTraffic(game, dt) {
  const want = 14;
  const p = game.player;
  // Remove far cars.
  for (let i = game.cars.length - 1; i >= 0; i--) {
    const car = game.cars[i];
    if (car.driver === 'npc' && dist(car.x, car.y, p.x, p.y) > 1100) game.cars.splice(i, 1);
  }
  const npcs = game.cars.filter((c) => c.driver === 'npc').length;
  for (let i = npcs; i < want; i++) game.cars.push(spawnNpcCar(game));
}

/** One traffic step for a single NPC car. */
export function updateNpcCar(game, car, dt) {
  const world = game.world;
  const t = car.traffic;
  if (!t || car.dead) return;
  const speed = forwardSpeed(car);

  // Where am I headed: the point 70px ahead along my lane.
  const lane = laneCentre(world, t.axis, t.index, t.dir);
  let tx, ty;
  if (t.axis === 'v') { tx = lane.x; ty = car.y + t.dir * 70; }
  else { tx = car.x + t.dir * 70; ty = lane.y; }

  // Am I near a crossing? Decide to turn or go straight (once per crossing).
  const along = t.axis === 'v' ? car.y : car.x;
  const roads = t.axis === 'v' ? world.roadsH : world.roadsV;
  let nearest = null, nd = Infinity;
  for (let i = 0; i < 8; i++) {
    const c = roads[i] + WORLD.road / 2;
    const d = Math.abs(along - c);
    if (d < nd) { nd = d; nearest = { i, c }; }
  }
  if (nearest && nd < 46) {
    const key = `${t.axis}${nearest.i}`;
    if (t.decidedAt !== key) {
      t.decidedAt = key;
      const roll = game.rng();
      if (roll < 0.28) {
        // Turn: switch axis at this crossing, pick left or right.
        const turnLeft = game.rng() < 0.5;
        const newAxis = t.axis === 'v' ? 'h' : 'v';
        // New direction: turning left from southbound means eastbound, etc.
        let newDir;
        if (t.axis === 'v') newDir = turnLeft ? (t.dir > 0 ? 1 : -1) : (t.dir > 0 ? -1 : 1);
        else newDir = turnLeft ? (t.dir > 0 ? -1 : 1) : (t.dir > 0 ? 1 : -1);
        t.axis = newAxis; t.dir = newDir; t.index = nearest.i;
        const nl = laneCentre(world, t.axis, t.index, t.dir);
        if (t.axis === 'v') tx = nl.x; else ty = nl.y;
      }
    }
  }

  // Red light ahead: stop at the stop line.
  let targetSpeed = t.targetSpeed;
  if (nearest && nd < 120 && nd > 0) {
    const ahead = (t.dir > 0 && along < nearest.c) || (t.dir < 0 && along > nearest.c);
    if (ahead) {
      const cx = t.axis === 'v' ? car.x : nearest.c;
      const cy = t.axis === 'v' ? nearest.c : car.y;
      const real = world.lights.find((l) => Math.abs(l.x - cx) < 40 && Math.abs(l.y - cy) < 40);
      if (real) {
        const state = lightState(real, game.time);
        const myGreen = (t.axis === 'v' && state === 'v') || (t.axis === 'h' && state === 'h');
        if (!myGreen && nd < 96) targetSpeed = 0;
      }
    }
  }

  // Car ahead in my lane: slow down or stop.
  for (const other of game.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x, dy = other.y - car.y;
    const ahead = t.axis === 'v' ? dy * t.dir : dx * t.dir;
    const side = t.axis === 'v' ? Math.abs(dx) : Math.abs(dy);
    if (ahead > 0 && ahead < 58 && side < 26) { targetSpeed = 0; break; }
  }

  // Controller: steer at the aim point, throttle toward the target speed.
  const wantAngle = Math.atan2(ty - car.y, tx - car.x);
  const steer = clamp(angleDiff(car.angle, wantAngle) * 2.2, -1, 1);
  let throttle = 0;
  if (targetSpeed > speed + 4) throttle = 0.7;
  else if (targetSpeed < speed - 4) throttle = -0.8;
  else if (targetSpeed > 0) throttle = 0.15;
  driveCar(world, car, { throttle, steer, handbrake: false }, dt, game.effects);
}
