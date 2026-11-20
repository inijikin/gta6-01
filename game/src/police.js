// Wanted: crimes raise the heat, stars bring the police, and the police bring
// the chase. Patrol cars ram, foot cops run the player down and bust them, and
// the heat only cools when the player is out of sight and out of trouble.
import { WANTED, WORLD } from './config.js';
import { clamp, angleDiff, dist, pick } from './utils.js';
import { makeCar, driveCar, forwardSpeed, damageCar } from './vehicles.js';
import { randomRoadPoint } from './world.js';
import { scarePeds } from './pedestrians.js';

/** Crime hooks: the game calls these when the player breaks the law. */
export function createCrimes() {
  return {
    steal(game) { addHeat(game, 1, 'You stole a car.'); },
    hitPed(game) { addHeat(game, 1, 'You ran someone over!'); },
    shoot(game) { addHeat(game, 1, 'Shots fired — the police are coming.'); },
    assaultCop(game) { addHeat(game, 2, 'You attacked an officer!'); },
  };
}

function addHeat(game, stars, message) {
  const p = game.player;
  p.wanted = Math.min(WANTED.maxStars, p.wanted + stars);
  p.heat = 1;
  p.lastCrime = game.elapsed;
  if (message) game.toast(message);
  game.audio.sirenBlip();
}

/** Clear the wanted level (paint shop / safehouse). */
export function clearWanted(game, silent = false) {
  game.player.wanted = 0;
  game.player.heat = 0;
  game.policeCars = [];
  for (const car of game.cars) if (car.driver === 'police') car.driver = 'npc';
  game.cops = [];
  if (!silent) game.toast('Wanted level cleared.');
}

/** Desired patrol cars / foot cops for a star count. */
const POLICE_CARS = [0, 1, 2, 2, 3, 4];
const FOOT_COPS = [0, 0, 1, 2, 3, 4];

export function updatePolice(game, dt) {
  const p = game.player;
  // Heat cools: no crime for a while and no cop in sight, stars fall one by one.
  if (p.wanted > 0 && game.elapsed - p.lastCrime > WANTED.decayDelay) {
    const nearCop = game.cops.some((c) => dist(c.x, c.y, p.x, p.y) < 500)
      || game.cars.some((c) => c.driver === 'police' && dist(c.x, c.y, p.x, p.y) < 500);
    if (!nearCop) {
      p.heat -= dt / WANTED.decayStep;
      if (p.heat <= 0) { p.wanted -= 1; p.heat = 1; game.toast(p.wanted > 0 ? `Wanted level down: ${p.wanted} star${p.wanted > 1 ? 's' : ''}.` : 'You lost the cops.'); }
    }
  }

  // Spawn patrol cars up to the wanted level's count.
  const wantCars = POLICE_CARS[p.wanted] || 0;
  const haveCars = game.cars.filter((c) => c.driver === 'police' && !c.dead).length;
  if (haveCars < wantCars && game.elapsed - (game.lastPoliceSpawn || 0) > 2.5) {
    game.lastPoliceSpawn = game.elapsed;
    const pt = randomRoadPoint(game.world, game.rng);
    for (let tries = 0; tries < 5 && dist(pt.x, pt.y, p.x, p.y) < 320; tries++) {
      const q = randomRoadPoint(game.world, game.rng);
      pt.x = q.x; pt.y = q.y;
    }
    const car = makeCar('police', pt.x, pt.y, Math.atan2(p.y - pt.y, p.x - pt.x), 'police', game.rng);
    car.occupied = true;
    game.cars.push(car);
    game.audio.sirenBlip();
  }
  // Despawn patrol cars that fell far behind.
  for (let i = game.cars.length - 1; i >= 0; i--) {
    const car = game.cars[i];
    if (car.driver === 'police' && dist(car.x, car.y, p.x, p.y) > 1200) game.cars.splice(i, 1);
  }

  // Foot cops.
  const wantCops = FOOT_COPS[p.wanted] || 0;
  if (game.cops.length < wantCops && game.elapsed - (game.lastCopSpawn || 0) > 3) {
    game.lastCopSpawn = game.elapsed;
    const a = game.rng() * Math.PI * 2;
    game.cops.push({
      x: p.x + Math.cos(a) * 320, y: p.y + Math.sin(a) * 320,
      angle: 0, speed: 0, health: 60, shootTimer: 1 + game.rng(), bustTimer: 0, phase: 0,
    });
  }
  for (let i = game.cops.length - 1; i >= 0; i--) {
    const cop = game.cops[i];
    if (dist(cop.x, cop.y, p.x, p.y) > 1100) { game.cops.splice(i, 1); continue; }
    updateCop(game, cop, dt);
  }

  // Chase: every patrol car steers at the player (slightly ahead of them).
  for (const car of game.cars) {
    if (car.driver !== 'police' || car.dead) continue;
    const tx = p.x + (p.car ? p.car.vx : p.vx) * 0.35;
    const ty = p.y + (p.car ? p.car.vy : p.vy) * 0.35;
    const wantAngle = Math.atan2(ty - car.y, tx - car.x);
    const steer = clamp(angleDiff(car.angle, wantAngle) * 2.4, -1, 1);
    const speed = forwardSpeed(car);
    const throttle = speed < 420 ? 1 : 0.3;
    driveCar(game.world, car, { throttle, steer, handbrake: false }, dt, game.effects);
    car.stuck = speed < 25 ? (car.stuck || 0) + dt : 0;
    if (car.stuck > 4) {
      // Stuck on a wall: back out and try again from a nearby road.
      const pt = randomRoadPoint(game.world, game.rng);
      car.x = pt.x; car.y = pt.y; car.vx = 0; car.vy = 0; car.stuck = 0;
    }
  }
  game.audio.siren(haveCars > 0 ? 1 : 0);
}

function updateCop(game, cop, dt) {
  const p = game.player;
  const d = dist(cop.x, cop.y, p.x, p.y);
  cop.angle = Math.atan2(p.y - cop.y, p.x - cop.x);
  // Run at the player; slower when close so the bust can land.
  const speed = d > 40 ? 300 : 120;
  cop.x += Math.cos(cop.angle) * speed * dt;
  cop.y += Math.sin(cop.angle) * speed * dt;
  cop.phase += speed * dt * 0.06;
  // Bust: standing next to the player on foot while wanted.
  if (!p.car && p.wanted > 0 && d < WANTED.bustRange && p.speed < 120) {
    cop.bustTimer += dt;
    if (cop.bustTimer > WANTED.bustTime) game.busted = true;
  } else {
    cop.bustTimer = Math.max(0, cop.bustTimer - dt * 2);
  }
  // At 3+ stars a cop shoots (badly) when the player is on foot in range.
  if (p.wanted >= 3 && !p.car && d < 280 && d > 40) {
    cop.shootTimer -= dt;
    if (cop.shootTimer <= 0) {
      cop.shootTimer = 0.9 + game.rng() * 0.7;
      game.combat.copShot(game, cop);
    }
  }
}
