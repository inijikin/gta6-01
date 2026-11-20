// Pedestrians: they walk the sidewalks, wait at crossings, and run when
// something scary happens nearby (a gunshot, a crash, a speeding car). Each
// one has its own shirt, pants, skin tone and walking speed.
import { WORLD } from './config.js';
import { clamp, dist, pick, randRange } from './utils.js';
import { collideWorld, isInSea, isOnRoad } from './world.js';

const SHIRTS = ['#d94f3d', '#3d7ad9', '#e8c53a', '#4fae5a', '#9b5fb8', '#e87ab0', '#f2f2f2', '#333a44', '#e8823a', '#3ab8a8'];
const PANTS = ['#2b3a4a', '#5a4a3a', '#3a3a3a', '#4a5a7a', '#6a6a6a'];
const SKINS = ['#e8b88a', '#c98a5a', '#8a5a3a', '#f0c8a0', '#a06a42'];

let nextId = 1;

/** Make a pedestrian at a sidewalk point. */
export function makePed(game, x, y) {
  const rng = game.rng;
  return {
    id: nextId++, x, y, angle: rng() * Math.PI * 2,
    speed: 26 + rng() * 30,
    shirt: pick(rng, SHIRTS), pants: pick(rng, PANTS), skin: pick(rng, SKINS),
    state: 'walk', // walk | wait | flee | down
    tx: x, ty: y, // current waypoint
    wait: 0, fleeX: 0, fleeY: 0, fleeTimer: 0,
    downTimer: 0, phase: rng() * 6,
    health: 30,
  };
}

/** A random sidewalk point (just off a road, on a block edge). */
export function randomSidewalkPoint(game) {
  const world = game.world;
  const rng = game.rng;
  const bx = Math.floor(rng() * 7), by = Math.floor(rng() * 7);
  const edge = Math.floor(rng() * 4);
  const x0 = world.roadsV[bx] + WORLD.road, y0 = world.roadsH[by] + WORLD.road;
  if (edge === 0) return { x: x0 + 8 + rng() * (WORLD.block - 16), y: y0 + 4 };
  if (edge === 1) return { x: x0 + 8 + rng() * (WORLD.block - 16), y: y0 + WORLD.block - 4 };
  if (edge === 2) return { x: x0 + 4, y: y0 + 8 + rng() * (WORLD.block - 16) };
  return { x: x0 + WORLD.block - 4, y: y0 + 8 + rng() * (WORLD.block - 16) };
}

/** Keep about 18 pedestrians near the player. */
export function maintainPeds(game) {
  const p = game.player;
  for (let i = game.peds.length - 1; i >= 0; i--) {
    if (dist(game.peds[i].x, game.peds[i].y, p.x, p.y) > 1000) game.peds.splice(i, 1);
  }
  while (game.peds.length < 18) {
    for (let tries = 0; tries < 6; tries++) {
      const pt = randomSidewalkPoint(game);
      if (dist(pt.x, pt.y, p.x, p.y) < 750) { game.peds.push(makePed(game, pt.x, pt.y)); break; }
    }
    if (game.peds.length < 18 && game.peds.length > 0) break;
    if (game.peds.length === 0) { const pt = randomSidewalkPoint(game); game.peds.push(makePed(game, pt.x, pt.y)); }
  }
}

/** Scare every pedestrian within `radius` of a point (gunshot, crash, explosion). */
export function scarePeds(game, x, y, radius) {
  for (const ped of game.peds) {
    if (ped.state === 'down') continue;
    const d = dist(ped.x, ped.y, x, y);
    if (d < radius) {
      ped.state = 'flee';
      ped.fleeTimer = 2.5 + game.rng() * 2;
      const a = Math.atan2(ped.y - y, ped.x - x);
      ped.fleeX = ped.x + Math.cos(a) * 220;
      ped.fleeY = ped.y + Math.sin(a) * 220;
    }
  }
}

export function updatePed(game, ped, dt) {
  if (ped.state === 'down') {
    ped.downTimer -= dt;
    if (ped.downTimer <= 0) { ped.state = 'walk'; ped.health = 30; }
    return;
  }
  let speed = ped.speed;
  let tx = ped.tx, ty = ped.ty;
  if (ped.state === 'flee') {
    speed = ped.speed * 3.4;
    tx = ped.fleeX; ty = ped.fleeY;
    ped.fleeTimer -= dt;
    if (ped.fleeTimer <= 0) ped.state = 'walk';
  } else {
    // Reached the waypoint? Pick a new one along the sidewalk.
    if (dist(ped.x, ped.y, tx, ty) < 10 || ped.wait > 0) {
      if (ped.wait > 0) { ped.wait -= dt; return; }
      const pt = randomSidewalkPoint(game);
      ped.tx = pt.x; ped.ty = pt.y;
      // Sometimes wait at a corner like a real person.
      if (game.rng() < 0.12) ped.wait = 1 + game.rng() * 2;
      return;
    }
    // Don't walk into the road when a car is coming fast: wait a beat.
    if (isOnRoad(game.world, tx, ty) && isOnRoad(game.world, ped.x, ped.y) === false) {
      for (const car of game.cars) {
        if (dist(car.x, car.y, ped.x, ped.y) < 90 && Math.hypot(car.vx, car.vy) > 120) { ped.wait = 0.6; return; }
      }
    }
  }
  const a = Math.atan2(ty - ped.y, tx - ped.x);
  ped.angle = a;
  ped.x += Math.cos(a) * speed * dt;
  ped.y += Math.sin(a) * speed * dt;
  ped.phase += speed * dt * 0.09;
  const c = { x: ped.x, y: ped.y, r: 10 };
  if (collideWorld(game.world, c, 10)) { ped.x = c.x; ped.y = c.y; }
  if (isInSea(game.world, ped.x, ped.y)) { ped.x = clamp(ped.x, 80, WORLD.size - 80); ped.y = WORLD.seaY - 14; }
}

/** Knock a pedestrian down (a car hit or a bullet). Returns true when it was a kill. */
export function hurtPed(game, ped, damage, fromX, fromY) {
  ped.health -= damage;
  if (ped.health <= 0) {
    ped.state = 'down';
    ped.downTimer = 999; // stays down; the city forgets slowly
    const a = Math.atan2(ped.y - fromY, ped.x - fromX);
    ped.x += Math.cos(a) * 18; ped.y += Math.sin(a) * 18;
    return true;
  }
  scarePeds(game, ped.x, ped.y, 120);
  ped.state = 'flee';
  ped.fleeTimer = 2;
  ped.fleeX = ped.x + (ped.x - fromX);
  ped.fleeY = ped.y + (ped.y - fromY);
  return false;
}
