// Save / load: one localStorage key holds the money, the missions, the
// collectibles, the weapons and where the player stands. Autosave runs after
// every mission; the pause menu saves by hand.
const KEY = 'solmar-bay.save.v1';

/** Serialize the game's progress. */
export function saveGame(game) {
  try {
    const p = game.player;
    const data = {
      money: p.money,
      health: p.health,
      armor: p.armor,
      weapon: p.weapon,
      ammo: p.ammo,
      mag: p.mag,
      completedMissions: game.completedMissions,
      collected: game.world.collectibles.filter((c) => c.taken).length,
      collectedAt: game.world.collectibles.map((c) => (c.taken ? 1 : 0)),
      unlocked: game.unlocked,
      x: p.x, y: p.y,
      clock: game.clock,
    };
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Read the save back (null when there is none or it is corrupt). */
export function loadGame() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

/** True when a save exists. */
export function hasSave() {
  try {
    return window.localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/** Apply a loaded save onto a fresh game object. */
export function applySave(game, data) {
  const p = game.player;
  p.money = data.money ?? p.money;
  p.health = data.health ?? p.health;
  p.armor = data.armor ?? p.armor;
  p.weapon = data.weapon ?? p.weapon;
  p.ammo = { ...p.ammo, ...(data.ammo || {}) };
  p.mag = { ...p.mag, ...(data.mag || {}) };
  game.completedMissions = data.completedMissions || [];
  game.unlocked = { ...game.unlocked, ...(data.unlocked || {}) };
  if (data.collectedAt) {
    game.world.collectibles.forEach((c, i) => { c.taken = data.collectedAt[i] === 1; });
    p.collected = data.collectedAt.reduce((n, v) => n + v, 0);
  }
  if (typeof data.x === 'number' && typeof data.y === 'number') { p.x = data.x; p.y = data.y; }
  if (typeof data.clock === 'number') game.clock = data.clock;
}
