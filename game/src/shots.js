// Screenshot scenes behind ?shot=start|play|chase|mission. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by
// an autopilot that follows its lane toward a waypoint in the city, so the
// frame is what a short game really looks like — and the same seed always gives
// the same frame.
import { STEP, WORLD } from './config.js';
import { clamp, angleDiff, dist } from './utils.js';
import { makeCar } from './vehicles.js';
import { startMission, MISSION_DEFS } from './missions.js';
import { roadAt } from './world.js';

const SAMPLE = STEP;

// A loop around the city centre the driving shots follow, so the car never
// ends up wedged against the beach or the map edge.
const CITY_LOOP = [
  { x: 600, y: 600 },
  { x: 1800, y: 600 },
  { x: 1800, y: 1800 },
  { x: 600, y: 1800 },
];

/** A scripted input object with the same interface as the real one. */
function scriptedInput() {
  return {
    _x: 0, _y: 0, _brake: false,
    axisX() { return this._x; },
    axisY() { return this._y; },
    running() { return false; },
    braking() { return this._brake; },
    mouse() { return { x: 640, y: 300, down: false }; },
    takeClick() { return false; },
    takeActions() { return 0; },
    fake() {},
  };
}

/**
 * Steer a car through the road grid toward a waypoint: stay in the lane,
 * turn at the intersection that leads toward the waypoint, brake for sharp
 * turns and for pedestrians ahead. `state` carries the waypoint index and
 * the stuck detector between calls. Returns { throttle, steer, handbrake }
 * in the same shape the driving code expects.
 */
function autopilotDrive(game, car, speedTarget, state) {
  const world = game.world;

  // Stuck against something: back up for a moment, then carry on.
  if (state.reverseUntil > game.elapsed) {
    return { throttle: -0.7, steer: -state.steerSign, handbrake: false };
  }
  // Barely moving while trying to drive means wedged, not accelerating:
  // the car passes 15 px/s within two steps of pulling away.
  if (Math.hypot(car.vx, car.vy) < 15) {
    state.still += 1;
    if (state.still > 50) {
      state.reverseUntil = game.elapsed + 0.9;
      state.steerSign = game.rng() < 0.5 ? 1 : -1;
      state.still = 0;
    }
  } else state.still = 0;

  // The current waypoint: advance when close, so the car loops the city.
  const wps = state.waypoints;
  let wp = wps[state.wp];
  if (dist(car.x, car.y, wp.x, wp.y) < 160) {
    state.wp = (state.wp + 1) % wps.length;
    wp = wps[state.wp];
  }

  const road = roadAt(world, car.x, car.y);
  let tx, ty;
  if (!road) {
    // Off the roads (sand, grass): head straight for the waypoint to get back.
    tx = wp.x; ty = wp.y;
  } else if (road.axis === 'v') {
    const cx = world.roadsV[road.index] + WORLD.road / 2;
    // The horizontal road nearest the waypoint's row is where we turn.
    let hj = 0, bd = Infinity;
    for (let j = 0; j < 8; j++) {
      const cy = world.roadsH[j] + WORLD.road / 2;
      const d = Math.abs(cy - wp.y);
      if (d < bd) { bd = d; hj = j; }
    }
    const hy = world.roadsH[hj] + WORLD.road / 2;
    const turnDist = hy - car.y;
    if (Math.abs(turnDist) < 110) {
      // At the turning intersection: aim along the horizontal road, in its lane.
      const dirX = wp.x >= car.x ? 1 : -1;
      tx = car.x + dirX * 200;
      ty = hy + dirX * WORLD.lane;
    } else {
      const dirY = turnDist > 0 ? 1 : -1;
      tx = cx - dirY * WORLD.lane;
      ty = car.y + dirY * 200;
    }
  } else {
    const cy = world.roadsH[road.index] + WORLD.road / 2;
    // The vertical road nearest the waypoint's column is where we turn.
    let vi = 0, bd = Infinity;
    for (let i = 0; i < 8; i++) {
      const cx = world.roadsV[i] + WORLD.road / 2;
      const d = Math.abs(cx - wp.x);
      if (d < bd) { bd = d; vi = i; }
    }
    const vx = world.roadsV[vi] + WORLD.road / 2;
    const turnDist = vx - car.x;
    if (Math.abs(turnDist) < 110) {
      // At the turning intersection: aim along the vertical road, in its lane.
      const dirY = wp.y >= car.y ? 1 : -1;
      tx = vx - dirY * WORLD.lane;
      ty = car.y + dirY * 200;
    } else {
      const dirX = turnDist > 0 ? 1 : -1;
      tx = car.x + dirX * 200;
      ty = cy + dirX * WORLD.lane;
    }
  }

  const wantAngle = Math.atan2(ty - car.y, tx - car.x);
  const turn = Math.abs(angleDiff(car.angle, wantAngle));
  const speed = Math.hypot(car.vx, car.vy);
  let throttle = speed < speedTarget ? 0.85 : 0.1;
  // Slow down for the turn instead of slamming into the building opposite:
  // brake hard for a sharp turn, ease off for a gentle one.
  if (turn > 0.7) throttle = 0.1;
  if (turn > 1.0) throttle = -0.6;
  // Do not run over pedestrians: ease off when one is right ahead.
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  for (const ped of game.peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - car.x, dy = ped.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d < 110 && d > 1 && (dx * fx + dy * fy) / d > 0.6) { throttle = Math.min(throttle, 0.1); break; }
  }
  // Do not rear-end the car ahead (traffic stops at red lights too).
  for (const other of game.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x, dy = other.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d < 130 && d > 1 && (dx * fx + dy * fy) / d > 0.55) { throttle = Math.min(throttle, 0.05); break; }
  }
  const steer = clamp(angleDiff(car.angle, wantAngle) * 1.6, -1, 1);
  return { throttle, steer, handbrake: false };
}

/** Fresh autopilot state for one shot. */
function autoState(waypoints, wp = 0) {
  return { waypoints, wp, reverseUntil: 0, steerSign: 1, still: 0 };
}

/**
 * Set the game to the named scene and return the screen to draw over it.
 * `step` is the game's fixed-step updater, `fake` the scripted input to use.
 */
export function stageShot(name, game, step) {
  const input = scriptedInput();
  game.input = input;
  game.screen = 'play';

  if (name === 'start') {
    // Title over a living city: let traffic and pedestrians move a while.
    for (let i = 0; i < 5 / SAMPLE; i++) step(game, SAMPLE);
    game.screen = 'title';
    return { screen: 'title' };
  }

  if (name === 'play') {
    spawnPlayerCar(game, 'sedan');
    const auto = autoState(CITY_LOOP, 1);
    for (let i = 0; i < 9 / SAMPLE; i++) {
      const car = game.player.car;
      if (!car) break; // the car was wrecked; the frame still shows the aftermath
      const d = autopilotDrive(game, car, 260, auto);
      input._y = d.throttle > 0 ? -1 : 1;
      input._x = d.steer > 0.15 ? 1 : d.steer < -0.15 ? -1 : 0;
      game.autoDrive = d;
      step(game, SAMPLE);
    }
    return { screen: 'play' };
  }

  if (name === 'chase') {
    spawnPlayerCar(game, 'sport');
    game.player.wanted = 3;
    game.player.lastCrime = game.elapsed;
    game.player.heat = 1;
    const auto = autoState(CITY_LOOP, 2);
    for (let i = 0; i < 7 / SAMPLE; i++) {
      const car = game.player.car;
      if (!car) break; // wrecked in the chase; the frame still tells the story
      const d = autopilotDrive(game, car, 360, auto);
      input._y = d.throttle > 0 ? -1 : 1;
      input._x = d.steer > 0.15 ? 1 : d.steer < -0.15 ? -1 : 0;
      game.autoDrive = d;
      step(game, SAMPLE);
    }
    return { screen: 'play' };
  }

  // mission: the first fare, passenger aboard, heading for the marina.
  const def = MISSION_DEFS[0];
  startMission(game, def);
  // Put the player in the mission taxi at the diner, then collect the fare.
  const taxi = game.cars.find((c) => c.type === 'taxi');
  if (taxi) {
    game.player.x = taxi.x; game.player.y = taxi.y;
    game.player.car = taxi;
    taxi.driver = 'player';
  }
  for (let i = 0; i < 2 / SAMPLE; i++) step(game, SAMPLE);
  const marina = game.world.shops.marina;
  const diner = game.world.shops.diner;
  const auto = autoState([{ x: marina.x, y: marina.y }, { x: diner.x, y: diner.y }], 0);
  for (let i = 0; i < 7 / SAMPLE; i++) {
    const car = game.player.car;
    if (!car) break;
    const d = autopilotDrive(game, car, 260, auto);
    input._y = d.throttle > 0 ? -1 : 1;
    input._x = d.steer > 0.15 ? 1 : d.steer < -0.15 ? -1 : 0;
    game.autoDrive = d;
    step(game, SAMPLE);
  }
  return { screen: 'play' };
}

/** Put the player in a fresh car on a road near the diner. */
function spawnPlayerCar(game, type) {
  const world = game.world;
  const x = world.roadsV[3] + 32 - 16;
  const y = world.roadsH[4] + 32;
  const car = makeCar(type, x, y, Math.PI / 2, 'player', game.rng);
  car.occupied = true;
  game.cars.push(car);
  game.player.car = car;
  game.player.x = x; game.player.y = y;
}
