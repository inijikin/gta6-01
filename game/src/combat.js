// Combat: fists, pistol and SMG. Shooting is hitscan with spread, a tracer and
// a muzzle flash; the punch is a short arc in front of the player. Armor eats
// most of a hit before health does. Firing a gun in public is a crime.
import { WEAPONS } from './config.js';
import { clamp, dist } from './utils.js';
import { buildingHit } from './world.js';
import { hurtPed, scarePeds } from './pedestrians.js';
import { damageCar } from './vehicles.js';

/** Try to fire the player's current weapon toward the mouse (world coords). */
export function fireWeapon(game) {
  const p = game.player;
  if (p.fireTimer > 0 || p.reloading > 0 || p.car) return;
  const def = WEAPONS[p.weapon];
  const aim = Math.atan2(game.mouseWorld.y - p.y, game.mouseWorld.x - p.x);
  p.angle = aim;

  if (p.weapon === 'fists') {
    p.fireTimer = def.rate;
    p.punchTimer = 0.18;
    game.audio.punch();
    const hx = p.x + Math.cos(aim) * 30, hy = p.y + Math.sin(aim) * 30;
    let hitSomething = false;
    for (const ped of game.peds) {
      if (ped.state !== 'down' && dist(ped.x, ped.y, hx, hy) < 34) {
        if (hurtPed(game, ped, def.damage, p.x, p.y)) game.crimes.hitPed(game);
        hitSomething = true;
      }
    }
    for (const cop of game.cops) {
      if (dist(cop.x, cop.y, hx, hy) < 34) {
        cop.health -= def.damage;
        if (cop.health <= 0) { game.cops.splice(game.cops.indexOf(cop), 1); game.crimes.assaultCop(game); }
        else game.crimes.assaultCop(game);
        hitSomething = true;
      }
    }
    if (!hitSomething) game.audio.swing();
    return;
  }

  // Gun: need a loaded magazine.
  if (p.mag[p.weapon] <= 0) { startReload(game); return; }
  p.mag[p.weapon] -= 1;
  p.fireTimer = def.rate;
  const spread = (game.rng() - 0.5) * 2 * def.spread;
  const a = aim + spread;
  const hit = traceShot(game, p.x, p.y, a, def.range);
  game.effects.push({ kind: 'tracer', x: p.x, y: p.y, x2: hit.x, y2: hit.y, life: 0.07, max: 0.07 });
  game.effects.push({ kind: 'flash', x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22, life: 0.06, max: 0.06, size: 14 });
  game.audio.shot(p.weapon);
  scarePeds(game, p.x, p.y, 260);
  if (game.elapsed - (game.lastShotCrime || -99) > 4) {
    game.lastShotCrime = game.elapsed;
    game.crimes.shoot(game);
  }
  if (hit.target) {
    if (hit.target.kind === 'ped') {
      if (hurtPed(game, hit.target.ref, def.damage, p.x, p.y)) game.crimes.hitPed(game);
    } else if (hit.target.kind === 'cop') {
      const cop = hit.target.ref;
      cop.health -= def.damage;
      if (cop.health <= 0) { game.cops.splice(game.cops.indexOf(cop), 1); game.crimes.assaultCop(game); }
      else game.crimes.assaultCop(game);
    } else if (hit.target.kind === 'car') {
      if (damageCar(hit.target.ref, def.damage, game.effects) && hit.target.ref.driver === 'police') game.crimes.assaultCop(game);
    }
  }
}

/** Walk a ray and return the first thing it hits (ped, cop, car, wall). */
export function traceShot(game, x, y, angle, range) {
  const step = 8;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  for (let d = step; d <= range; d += step) {
    const px = x + dx * d, py = y + dy * d;
    if (buildingHit(game.world, px, py, 2)) return { x: px, y: py, target: null };
    for (const ped of game.peds) {
      if (ped.state !== 'down' && dist(ped.x, ped.y, px, py) < 13) return { x: px, y: py, target: { kind: 'ped', ref: ped } };
    }
    for (const cop of game.cops) {
      if (dist(cop.x, cop.y, px, py) < 13) return { x: px, y: py, target: { kind: 'cop', ref: cop } };
    }
    for (const car of game.cars) {
      if (car.dead) continue;
      // Rough car test: distance to the car's centre line segment.
      const cx = car.x - px, cy = car.y - py;
      const along = cx * Math.cos(car.angle) + cy * Math.sin(car.angle);
      const across = -cx * Math.sin(car.angle) + cy * Math.cos(car.angle);
      if (Math.abs(along) < car.len / 2 + 4 && Math.abs(across) < car.wid / 2 + 4) return { x: px, y: py, target: { kind: 'car', ref: car } };
    }
  }
  return { x: x + dx * range, y: y + dy * range, target: null };
}

/** Start reloading the current weapon (uses the ammo reserve). */
export function startReload(game) {
  const p = game.player;
  const def = WEAPONS[p.weapon];
  if (p.weapon === 'fists' || p.reloading > 0) return;
  if (p.ammo[p.weapon] <= 0 || p.mag[p.weapon] === def.mag) return;
  p.reloading = def.reload;
  game.audio.reload();
}

/** Finish a reload when its timer runs out (called by the loop). */
export function updateReload(game, dt) {
  const p = game.player;
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) {
      const def = WEAPONS[p.weapon];
      const need = def.mag - p.mag[p.weapon];
      const take = Math.min(need, p.ammo[p.weapon]);
      p.mag[p.weapon] += take;
      p.ammo[p.weapon] -= take;
      p.reloading = 0;
    }
  }
  if (p.fireTimer > 0) p.fireTimer -= dt;
  if (p.punchTimer > 0) p.punchTimer -= dt;
}

/** A cop fires at the player (inaccurate, so the player can dodge). */
export function copShot(game, cop) {
  const p = game.player;
  const a = Math.atan2(p.y - cop.y, p.x - cop.x) + (game.rng() - 0.5) * 0.35;
  const hitX = cop.x + Math.cos(a) * 300, hitY = cop.y + Math.sin(a) * 300;
  game.effects.push({ kind: 'tracer', x: cop.x, y: cop.y, x2: hitX, y2: hitY, life: 0.07, max: 0.07 });
  game.audio.shot('pistol');
  if (game.rng() < 0.45) damagePlayer(game, 7);
}

/** Damage the player: armor absorbs 70% first. */
export function damagePlayer(game, amount) {
  const p = game.player;
  if (p.invulnerable > 0 || p.dead) return;
  let rest = amount;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, amount * 0.7);
    p.armor -= absorbed;
    rest = amount - absorbed;
  }
  p.health -= rest;
  p.invulnerable = 0.35;
  game.audio.hurt();
  if (p.health <= 0) {
    p.health = 0;
    p.dead = true;
    game.wasted = true;
  }
}

/** Pickups: health, armor, ammo, money. Spawned at shops and around town. */
export function spawnPickups(game) {
  const w = game.world;
  const defs = [
    { kind: 'health', x: w.shops.hospital.x, y: w.shops.hospital.y + 30 },
    { kind: 'armor', x: w.shops.gun.x, y: w.shops.gun.y + 30 },
    { kind: 'ammo', x: w.shops.gun.x + 40, y: w.shops.gun.y + 30 },
    { kind: 'health', x: w.shops.diner.x, y: w.shops.diner.y + 30 },
  ];
  for (const d of defs) game.pickups.push({ ...d, amount: d.kind === 'ammo' ? 48 : d.kind === 'health' ? 50 : d.kind === 'armor' ? 50 : 0, taken: false, bob: 0 });
  for (let i = 0; i < 6; i++) {
    const pt = { x: 120 + game.rng() * 2100, y: 120 + game.rng() * 1900 };
    game.pickups.push({ kind: i % 3 === 0 ? 'ammo' : i % 3 === 1 ? 'health' : 'armor', x: pt.x, y: pt.y, amount: 40, taken: false, bob: game.rng() * 6 });
  }
}

/** Collect pickups the player walks over. */
export function updatePickups(game, dt) {
  const p = game.player;
  for (const pk of game.pickups) {
    if (pk.taken) continue;
    pk.bob += dt;
    if (dist(p.x, p.y, pk.x, pk.y) < 30) {
      pk.taken = true;
      game.audio.pickup();
      if (pk.kind === 'health') { p.health = Math.min(100, p.health + pk.amount); game.toast(`Health +${pk.amount}`); }
      if (pk.kind === 'armor') { p.armor = Math.min(100, p.armor + pk.amount); game.toast(`Armor +${pk.amount}`); }
      if (pk.kind === 'ammo') {
        p.ammo.pistol += pk.amount; p.ammo.smg += pk.amount;
        game.toast(`Ammo +${pk.amount}`);
      }
    }
  }
}
