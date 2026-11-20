// The player on foot: smooth acceleration and deceleration, running with Shift,
// turning toward the direction of travel, a walk-cycle bob, and getting in and
// out of cars. All movement is velocity-based — nothing teleports.
import { PLAYER, WORLD } from './config.js';
import { clamp, angleLerp, dist } from './utils.js';
import { collideWorld, isInSea } from './world.js';
import { nearestCar } from './vehicles.js';

/** Fresh player state, standing by Rosa's Diner. */
export function createPlayer(world) {
  const d = world.shops.diner;
  return {
    x: d.x, y: d.y + 40, angle: -Math.PI / 2,
    vx: 0, vy: 0, speed: 0,
    health: PLAYER.healthMax, armor: 0,
    money: 250,
    weapon: 'fists',
    ammo: { pistol: 24, smg: 0 },
    mag: { pistol: 12, smg: 0 },
    reloading: 0, fireTimer: 0, punchTimer: 0,
    car: null, walkPhase: 0, stepping: 0,
    wanted: 0, heat: 0, lastCrime: -999,
    invulnerable: 0, dead: false, busted: false,
    district: null, collected: 0,
  };
}

/** Update the player on foot for one step. Returns events as flags. */
export function updatePlayerOnFoot(game, dt) {
  const p = game.player;
  const input = game.input;
  const ax = input.axisX(), ay = input.axisY();
  const max = input.running() ? PLAYER.runMax : PLAYER.walkMax;
  // Accelerate toward the wanted direction; friction when no input.
  if (ax !== 0 || ay !== 0) {
    const len = Math.hypot(ax, ay);
    p.vx += (ax / len) * PLAYER.walkAccel * dt;
    p.vy += (ay / len) * PLAYER.walkAccel * dt;
  } else {
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 0) {
      const f = Math.max(0, sp - PLAYER.friction * dt);
      p.vx *= f / sp; p.vy *= f / sp;
    }
  }
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > max) { p.vx *= max / sp; p.vy *= max / sp; }
  p.speed = Math.hypot(p.vx, p.vy);
  if (p.speed > 12) {
    p.angle = angleLerp(p.angle, Math.atan2(p.vy, p.vx), Math.min(1, PLAYER.turnRate * dt));
    p.walkPhase += p.speed * dt * 0.055;
    p.stepping += dt;
    if (p.stepping > (input.running() ? 0.26 : 0.38)) {
      p.stepping = 0;
      game.audio.step(p.speed > 200);
    }
  }
  const px = p.x, py = p.y;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  // Buildings, the world edge and the sea block walking.
  const c = { x: p.x, y: p.y, r: PLAYER.radius };
  if (collideWorld(game.world, c, PLAYER.radius)) { p.x = c.x; p.y = c.y; p.vx *= 0.4; p.vy *= 0.4; }
  if (isInSea(game.world, p.x, p.y)) { p.x = px; p.y = py; p.vx = 0; p.vy = 0; }
  if (p.invulnerable > 0) p.invulnerable -= dt;
  return 0;
}

/** Try to get into the nearest car (E). Returns the car or null. */
export function tryEnterCar(game) {
  const p = game.player;
  const car = nearestCar(game.cars, p.x, p.y, 70);
  if (!car) return null;
  p.car = car;
  car.driver = 'player';
  p.x = car.x; p.y = car.y;
  // Stealing a car someone drives is a crime (unless it is a parked empty car).
  if (car.occupied) {
    game.crimes.steal(game, car);
    car.occupied = false;
  }
  game.audio.door();
  return car;
}

/** Step out of the car (E) at the side of the road. */
export function exitCar(game) {
  const p = game.player;
  const car = p.car;
  if (!car) return;
  const sx = -Math.sin(car.angle), sy = Math.cos(car.angle);
  p.x = car.x + sx * 34; p.y = car.y + sy * 34;
  p.angle = car.angle;
  p.vx = 0; p.vy = 0;
  car.driver = 'npc';
  p.car = null;
  game.audio.door();
}

/** Distance from the player to the nearest car (for the "press E" prompt). */
export function nearCarDistance(game) {
  const car = nearestCar(game.cars, game.player.x, game.player.y, 70);
  return car ? dist(game.player.x, game.player.y, car.x, car.y) : Infinity;
}
