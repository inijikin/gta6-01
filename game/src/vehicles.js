// Cars: factory, driving physics and damage. The model is arcade but physical:
// forward speed with engine/brake/reverse, steering that bites less at speed,
// a lateral velocity that grip bleeds away (handbrake loosens it, so the car
// drifts), and impact damage with smoke and fire.
import { CAR_TYPES } from './config.js';
import { clamp, lerp, dist } from './utils.js';
import { collideWorld } from './world.js';

let nextId = 1;

/** Make a car of a type at a position, facing `angle` (radians, 0 = east). */
export function makeCar(type, x, y, angle, driver = 'none', rng = null) {
  const def = CAR_TYPES[type];
  const color = rng ? def.colors[Math.floor(rng() * def.colors.length)] : def.colors[0];
  return {
    id: nextId++, type, name: def.name, x, y, angle,
    vx: 0, vy: 0, speed: 0, steer: 0,
    health: def.health, maxHealth: def.health,
    color, driver, len: def.len, wid: def.wid,
    smoke: 0, fire: 0, dead: false, wreck: false,
    honk: 0, drift: 0, air: 0, airTime: 0,
  };
}

/** Forward speed along the car's heading (signed: + forward, - reverse). */
export function forwardSpeed(car) {
  return car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
}
/** Lateral speed across the heading (how much the car is sliding). */
export function lateralSpeed(car) {
  return -car.vx * Math.sin(car.angle) + car.vy * Math.cos(car.angle);
}

/**
 * Drive a car for one step. `drive` is { throttle: -1..1, steer: -1..1,
 * handbrake: bool }. Returns the impact speed when the car hit something.
 */
export function driveCar(world, car, drive, dt, effects) {
  const def = CAR_TYPES[car.type];
  if (car.dead) return 0;
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  let vf = forwardSpeed(car);
  let vl = lateralSpeed(car);

  // Engine / brake / reverse.
  if (drive.throttle > 0) vf += def.accel * drive.throttle * dt;
  else if (drive.throttle < 0) {
    if (vf > 8) vf -= def.brake * dt; // braking
    else vf -= def.accel * 0.55 * dt; // reversing
  }
  // Drag and rolling resistance; stronger on sand.
  const onSand = world && car.y > 2084;
  vf -= vf * (onSand ? 0.9 : 0.28) * dt;
  if (Math.abs(vf) < 2 && drive.throttle === 0) vf = 0;
  vf = clamp(vf, -def.reverse, def.top);

  // Steering: full bite at parking speed, tamed at top speed.
  const steerMax = def.steer;
  const steerTarget = drive.steer * steerMax * (0.35 + 0.65 * Math.min(1, Math.abs(vf) / 200)) / (1 + Math.abs(vf) / 520);
  car.steer = lerp(car.steer, steerTarget, Math.min(1, 10 * dt));
  car.angle += car.steer * Math.sign(vf || 1) * dt;

  // Grip bleeds the slide away; the handbrake loosens it (drift).
  const grip = def.grip * (drive.handbrake ? 0.22 : 1) * (world && world.rain > 0 ? 0.85 : 1);
  vl *= Math.exp(-grip * dt);
  if (drive.handbrake) vf *= Math.exp(-1.4 * dt);
  car.drift = Math.abs(vl);

  car.vx = fx * vf - fy * vl;
  car.vy = fy * vf + fx * vl;
  const px = car.x, py = car.y;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // Collide with buildings and the world edge; lose speed on impact.
  // Skipped while airborne: a stunt jump flies over the wall.
  const c = { x: car.x, y: car.y, r: car.len * 0.42 };
  let impact = 0;
  if (!car.airborne && collideWorld(world, c, car.len * 0.42)) {
    const nx = c.x - px, ny = c.y - py;
    impact = Math.abs(car.vx * nx + car.vy * ny) / Math.max(1, Math.hypot(nx, ny) + 0.001);
    car.x = c.x; car.y = c.y;
    // Kill the velocity into the wall, keep the slide along it.
    const hitSpeed = Math.hypot(car.vx, car.vy);
    car.vx *= 0.35; car.vy *= 0.35;
    if (hitSpeed > 90) damageCar(car, hitSpeed * 0.09, effects);
  }
  car.speed = Math.hypot(car.vx, car.vy);

  // Damage smoke / fire.
  if (car.health < 45 && car.health > 0) {
    car.smoke += dt;
    if (effects && car.smoke > 0.09) {
      car.smoke = 0;
      effects.push({ kind: 'smoke', x: car.x - fx * car.len * 0.4, y: car.y - fy * car.len * 0.4, vx: 0, vy: -18, life: 1.1, max: 1.1, size: 7 });
    }
  }
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    if (effects) {
      effects.push({ kind: 'boom', x: car.x, y: car.y, vx: 0, vy: 0, life: 0.7, max: 0.7, size: 60 });
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 180;
        effects.push({ kind: 'fire', x: car.x, y: car.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.5, max: 1, size: 6 });
      }
    }
  }
  return impact;
}

/** Damage a car; returns true when it just died. */
export function damageCar(car, amount, effects) {
  if (car.dead) return false;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.dead = true;
    if (effects) {
      effects.push({ kind: 'boom', x: car.x, y: car.y, vx: 0, vy: 0, life: 0.7, max: 0.7, size: 60 });
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 180;
        effects.push({ kind: 'fire', x: car.x, y: car.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.5, max: 1, size: 6 });
      }
    }
    return true;
  }
  return false;
}

/** The nearest car to a point within `radius`, or null. */
export function nearestCar(cars, x, y, radius) {
  let best = null, bd = radius * radius;
  for (const car of cars) {
    if (car.dead) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

/** Push two overlapping cars apart and trade a little speed (soft collision). */
export function collideCars(a, b, effects) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = (a.len + b.len) * 0.38;
  if (d >= min || d < 0.001) return;
  const push = (min - d) / 2;
  const nx = dx / d, ny = dy / d;
  a.x -= nx * push; a.y -= ny * push;
  b.x += nx * push; b.y += ny * push;
  const rel = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
  if (rel > 70) {
    a.vx -= nx * rel * 0.3; a.vy -= ny * rel * 0.3;
    b.vx += nx * rel * 0.3; b.vy += ny * rel * 0.3;
    damageCar(a, rel * 0.05, effects);
    damageCar(b, rel * 0.05, effects);
  }
}
