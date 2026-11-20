// Solmar Bay — tuning and content constants for the open-world game.
// Everything here is original: the city, its districts, vehicles and weapons
// belong to this game only. No real-world or third-party names are used.

// The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate.
export const STEP = 1 / 60;

export const WORLD = {
  size: 2400, // world is size x size pixels
  margin: 60, // outer edge before the first road
  road: 64, // road width (two lanes + markings)
  block: 216, // city block size between roads
  lane: 16, // lane centre offset from a road centre line
  seaY: 2240, // below this line is the sea
  sandY: 2084, // below this line is sand (beach)
};

// Districts: name, bounds and flavour. Shown when the player enters one.
export const DISTRICTS = [
  { name: 'Old Harbor', x: 0, y: 1500, w: 800, h: 900, desc: 'Cranes, warehouses and the smell of salt.' },
  { name: 'Marina Beach', x: 800, y: 1900, w: 1600, h: 500, desc: 'Sun, sand and the boardwalk crowd.' },
  { name: 'Downtown', x: 700, y: 600, w: 1000, h: 900, desc: 'Glass towers and neon that never sleeps.' },
  { name: 'Market Row', x: 1700, y: 600, w: 700, h: 900, desc: 'Stalls, spice and shouting vendors.' },
  { name: 'Palm Court', x: 700, y: 0, w: 1000, h: 600, desc: 'Quiet avenues under the palms.' },
  { name: 'North Hills', x: 1700, y: 0, w: 700, h: 600, desc: 'Houses with a view of the whole bay.' },
  { name: 'The Docks', x: 0, y: 600, w: 700, h: 900, desc: 'Containers stacked like toy bricks.' },
];

// Street names for the road signs (shown near the player).
export const STREET_NAMES_V = ['Harbor Ave', 'Coral St', 'Palm Blvd', 'Marina Rd', 'Sunset Way', 'Gull St', 'Bayview Dr', 'Anchor Ln'];
export const STREET_NAMES_H = ['First St', 'Second St', 'Third St', 'Fourth St', 'Fifth St', 'Sixth St', 'Seventh St', 'Eighth St'];

// Player on-foot tuning: smooth accel / decel, no teleporting.
export const PLAYER = {
  radius: 13,
  walkAccel: 1500,
  walkMax: 150,
  runMax: 260,
  friction: 1400,
  turnRate: 14,
  healthMax: 100,
  armorMax: 100,
};

// Car types: handling differs per type (accel, top speed, grip, steering).
export const CAR_TYPES = {
  sedan: { name: 'Sedan', accel: 420, top: 380, reverse: 130, brake: 700, grip: 6.5, steer: 2.6, health: 100, len: 46, wid: 22, colors: ['#c94f42', '#4a7fb5', '#c9a13b', '#7a8a99', '#5e8a5a'] },
  taxi: { name: 'Taxi', accel: 400, top: 360, reverse: 130, brake: 700, grip: 6.5, steer: 2.6, health: 100, len: 46, wid: 22, colors: ['#e8b73a'] },
  police: { name: 'Patrol', accel: 520, top: 430, reverse: 140, brake: 800, grip: 7.5, steer: 2.9, health: 140, len: 48, wid: 23, colors: ['#2b3a4a'] },
  truck: { name: 'Truck', accel: 260, top: 260, reverse: 100, brake: 500, grip: 5.0, steer: 2.0, health: 220, len: 62, wid: 26, colors: ['#8a6f4d', '#5d7a5a', '#7a7a7a'] },
  sport: { name: 'Comet GT', accel: 640, top: 520, reverse: 160, brake: 850, grip: 8.5, steer: 3.1, health: 90, len: 46, wid: 22, colors: ['#d21f3c', '#1f6fd2', '#f2f2f2'] },
};

// Weapons: fists, pistol, SMG. Original names, no licensed brands.
export const WEAPONS = {
  fists: { name: 'Fists', damage: 14, range: 46, rate: 0.38, mag: Infinity, reload: 0, spread: 0, auto: false, price: 0 },
  pistol: { name: 'P9 Pistol', damage: 26, range: 430, rate: 0.22, mag: 12, reload: 1.1, spread: 0.02, auto: false, price: 300 },
  smg: { name: 'Vex SMG', damage: 13, range: 380, rate: 0.085, mag: 32, reload: 1.5, spread: 0.05, auto: true, price: 800 },
};

export const WANTED = {
  maxStars: 5,
  decayDelay: 18, // seconds with no crime and no cop nearby before stars fall
  decayStep: 14, // seconds per lost star
  bustRange: 30, // foot cop must be this close to bust the player
  bustTime: 1.0, // seconds held in range before the bust lands
};

// Economy / pickups.
export const ECONOMY = {
  startMoney: 250,
  taxiFare: 120,
  collectibleValue: 500,
  paintCost: 200,
  healCost: 100,
  armorCost: 200,
  ammoCost: 50,
  collectibles: 10,
};

// Day cycle: 1 game hour per 100 real seconds; night is 19:00-06:00.
export const DAY = { secondsPerHour: 100, nightStart: 19, nightEnd: 6, startHour: 9.2 };

// Key bindings (also listed on the title screen and in settings).
export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  enter: ['KeyE'],
  brake: ['Space'],
  weapon: ['KeyQ'],
  reload: ['KeyR'],
  horn: ['KeyH'],
  pause: ['Escape'],
  mute: ['KeyM'],
  interact: ['KeyE'],
};
