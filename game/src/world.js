// Solmar Bay: a procedural city. Roads on a grid, blocks filled with buildings,
// parks and plazas, a beach and sea to the south, traffic lights on every
// crossing, and the shops, ramps and hideouts the game needs. One seed always
// builds the same city.
import { mulberry32, pick, randRange, clamp, pointInRect } from './utils.js';
import { WORLD, DISTRICTS, STREET_NAMES_V, STREET_NAMES_H } from './config.js';

const BUILDING_COLORS = ['#e8dcc3', '#d9a066', '#c97e5a', '#e6c9a8', '#b5c4b1', '#8fb3b8', '#d8b4a0', '#c4b49a', '#e8e4da', '#a8b8c8'];
const NEON_SIGNS = ['HOTEL', '24H', 'BAR', 'SHOP', 'CINEMA', 'DINER', 'CLUB', 'PIZZA', 'GYM', 'MOTEL'];
const TREE_COLORS = ['#3f7a3a', '#4d8a42', '#5d9a4a', '#35703a'];

/** Build the whole city from a seed. */
export function createWorld(seed) {
  const rng = mulberry32(seed);
  const roadsV = [];
  const roadsH = [];
  for (let i = 0; i < 8; i++) {
    roadsV.push(WORLD.margin + i * (WORLD.block + WORLD.road));
    roadsH.push(WORLD.margin + i * (WORLD.block + WORLD.road));
  }
  const roadEnd = roadsV[7] + WORLD.road; // 2084

  const buildings = [];
  const trees = [];
  const blocks = [];
  const parks = new Set();
  // Pick a few blocks to be parks / plazas, never the bottom beach row.
  while (parks.size < 6) parks.add(Math.floor(rng() * 42));
  const plazaBlocks = new Set([10, 25]);

  for (let by = 0; by < 7; by++) {
    for (let bx = 0; bx < 7; bx++) {
      const x = roadsV[bx] + WORLD.road;
      const y = roadsH[by] + WORLD.road;
      const w = WORLD.block, h = WORLD.block;
      const idx = by * 7 + bx;
      const beachRow = by === 6;
      let kind = 'buildings';
      if (beachRow) kind = 'sand';
      else if (parks.has(idx)) kind = 'park';
      else if (plazaBlocks.has(idx)) kind = 'plaza';
      const block = { x, y, w, h, kind, buildings: [], trees: [] };
      if (kind === 'buildings') {
        // Split the block into 1-4 buildings with sidewalk gaps.
        const split = rng() < 0.45 ? 2 : rng() < 0.7 ? 4 : 1;
        if (split === 1) {
          block.buildings.push(makeBuilding(rng, x + 12, y + 12, w - 24, h - 24, by, bx));
        } else if (split === 2) {
          const vertical = rng() < 0.5;
          if (vertical) {
            block.buildings.push(makeBuilding(rng, x + 12, y + 12, w / 2 - 18, h - 24, by, bx));
            block.buildings.push(makeBuilding(rng, x + w / 2 + 6, y + 12, w / 2 - 18, h - 24, by, bx));
          } else {
            block.buildings.push(makeBuilding(rng, x + 12, y + 12, w - 24, h / 2 - 18, by, bx));
            block.buildings.push(makeBuilding(rng, x + 12, y + h / 2 + 6, w - 24, h / 2 - 18, by, bx));
          }
        } else {
          for (const [ox, oy] of [[12, 12], [w / 2 + 6, 12], [12, h / 2 + 6], [w / 2 + 6, h / 2 + 6]]) {
            block.buildings.push(makeBuilding(rng, x + ox, y + oy, w / 2 - 18, h / 2 - 18, by, bx));
          }
        }
        buildings.push(...block.buildings);
      } else if (kind === 'park') {
        for (let t = 0; t < 14; t++) {
          const tx = x + 16 + rng() * (w - 32), ty = y + 16 + rng() * (h - 32);
          const tree = { x: tx, y: ty, r: 9 + rng() * 7, color: pick(rng, TREE_COLORS) };
          block.trees.push(tree); trees.push(tree);
        }
      } else if (kind === 'sand') {
        for (let t = 0; t < 5; t++) {
          const tx = x + 20 + rng() * (w - 40), ty = y + 20 + rng() * (h - 40);
          const tree = { x: tx, y: ty, r: 10 + rng() * 5, color: '#3f8a4a', palm: true };
          block.trees.push(tree); trees.push(tree);
        }
      }
      blocks.push(block);
    }
  }

  // Traffic lights on every crossing, phase-offset so the city feels alive.
  const lights = [];
  for (let iy = 0; iy < 8; iy++) {
    for (let ix = 0; ix < 8; ix++) {
      lights.push({ x: roadsV[ix] + WORLD.road / 2, y: roadsH[iy] + WORLD.road / 2, offset: (ix + iy) * 1.7 });
    }
  }

  // Hydrants and crates scattered on sidewalks and in alleys.
  const hydrants = [];
  const crates = [];
  for (let i = 0; i < 26; i++) {
    const bx = Math.floor(rng() * 7), by = Math.floor(rng() * 7);
    const x = roadsV[bx] + WORLD.road + 8 + rng() * (WORLD.block - 16);
    const y = roadsH[by] + WORLD.road + 8 + rng() * (WORLD.block - 16);
    if (rng() < 0.5) hydrants.push({ x, y, hit: false });
    else crates.push({ x, y, broken: false });
  }

  // Stunt ramps: one on the beach road, one by the docks, one downtown.
  const ramps = [
    { x: roadsV[3] + WORLD.road / 2, y: roadsH[6] + WORLD.road / 2, angle: -Math.PI / 2 },
    { x: roadsV[0] + WORLD.road / 2, y: roadsH[3] + WORLD.road / 2, angle: 0 },
    { x: roadsV[5] + WORLD.road / 2, y: roadsH[2] + WORLD.road / 2, angle: Math.PI / 2 },
  ];

  // 10 hidden collectible packages in quiet corners.
  const collectibles = [];
  for (let i = 0; i < 10; i++) {
    const bx = Math.floor(rng() * 7), by = Math.floor(rng() * 7);
    collectibles.push({
      x: roadsV[bx] + WORLD.road + 14 + rng() * (WORLD.block - 28),
      y: roadsH[by] + WORLD.road + 14 + rng() * (WORLD.block - 28),
      taken: false, bob: rng() * 6,
    });
  }

  // Shops and story places (door positions on the sidewalk, facing a road).
  const shops = {
    diner: { name: "Rosa's Diner", x: roadsV[1] + WORLD.road / 2, y: roadsH[5] + WORLD.road + 6, kind: 'diner' },
    gun: { name: 'Ironworks Arms', x: roadsV[2] + WORLD.road / 2, y: roadsH[2] + WORLD.road + 6, kind: 'gun' },
    hospital: { name: 'St. Marina General', x: roadsV[4] + WORLD.road / 2, y: roadsH[1] + WORLD.road + 6, kind: 'hospital' },
    paint: { name: 'Chrome & Color', x: roadsV[5] + WORLD.road / 2, y: roadsH[4] + WORLD.road + 6, kind: 'paint' },
    safehouse: { name: 'Safehouse', x: roadsV[1] + WORLD.road / 2, y: roadsH[5] - 6, kind: 'safehouse' },
    race: { name: 'Street Kings Start', x: roadsV[4] + WORLD.road / 2, y: roadsH[3] + WORLD.road / 2, kind: 'race' },
    docks: { name: 'Harbor Docks', x: roadsV[0] + WORLD.road / 2, y: roadsH[4] + WORLD.road / 2, kind: 'docks' },
    marina: { name: 'Marina', x: roadsV[6] + WORLD.road / 2, y: roadsH[6] + WORLD.road / 2, kind: 'marina' },
  };

  return {
    seed, rng, roadsV, roadsH, roadEnd, blocks, buildings, trees, lights,
    hydrants, crates, ramps, collectibles, shops,
    // Runtime rain state (set by the loop).
    rain: 0, rainTimer: 120 + rng() * 120,
    birds: [],
  };
}

function makeBuilding(rng, x, y, w, h, by, bx) {
  const downtown = by >= 1 && by <= 3 && bx >= 2 && bx <= 4;
  const height = downtown ? 40 + rng() * 70 : 18 + rng() * 42;
  return {
    x, y, w, h, height,
    color: pick(rng, BUILDING_COLORS),
    neon: rng() < (downtown ? 0.45 : 0.18),
    sign: rng() < 0.3 ? pick(rng, NEON_SIGNS) : '',
    roof: rng(),
  };
}

/** Which road (if any) a point is on: { axis: 'v'|'h', index, centre } or null. */
export function roadAt(world, x, y) {
  for (let i = 0; i < 8; i++) {
    const cx = world.roadsV[i] + WORLD.road / 2;
    if (Math.abs(x - cx) <= WORLD.road / 2 && y >= WORLD.margin - 4 && y <= world.roadEnd + 4) return { axis: 'v', index: i, centre: cx };
  }
  for (let i = 0; i < 8; i++) {
    const cy = world.roadsH[i] + WORLD.road / 2;
    if (Math.abs(y - cy) <= WORLD.road / 2 && x >= WORLD.margin - 4 && x <= world.roadEnd + 4) return { axis: 'h', index: i, centre: cy };
  }
  return null;
}

/** True when the point is on a drivable road surface. */
export const isOnRoad = (world, x, y) => roadAt(world, x, y) !== null;
/** True when the point is in the sea (not walkable, not drivable). */
export const isInSea = (world, x, y) => y >= WORLD.seaY;
/** True when the point is on the beach sand. */
export const isSand = (world, x, y) => y >= WORLD.sandY && y < WORLD.seaY;

/** Does a circle at (x, y) with radius r hit any building? Returns the building or null. */
export function buildingHit(world, x, y, r) {
  for (const b of world.buildings) {
    const cx = clamp(x, b.x, b.x + b.w), cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy < r * r) return b;
  }
  return null;
}

/** Push a circle out of buildings and the world edge; returns true when it hit something. */
export function collideWorld(world, c, r) {
  let hit = false;
  for (const b of world.buildings) {
    const cx = clamp(c.x, b.x, b.x + b.w), cy = clamp(c.y, b.y, b.y + b.h);
    const dx = c.x - cx, dy = c.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        c.x += (dx / d) * (r - d); c.y += (dy / d) * (r - d);
      } else {
        c.y = b.y - r;
      }
      hit = true;
    }
  }
  if (c.x < WORLD.margin + r) { c.x = WORLD.margin + r; hit = true; }
  if (c.x > WORLD.size - WORLD.margin - r) { c.x = WORLD.size - WORLD.margin - r; hit = true; }
  if (c.y < WORLD.margin + r) { c.y = WORLD.margin + r; hit = true; }
  if (c.y > WORLD.seaY - r) { c.y = WORLD.seaY - r; hit = true; }
  return hit;
}

/** District the point is in (or null when outside every district). */
export function districtAt(x, y) {
  for (const d of DISTRICTS) if (pointInRect(x, y, d)) return d;
  return null;
}

/** Traffic-light state at a crossing: 'v' when vertical roads have green, 'h' when horizontal do. */
export function lightState(light, time) {
  const t = (time + light.offset) % 12;
  if (t < 5) return 'v';
  if (t < 6) return 'vy';
  if (t < 11) return 'h';
  return 'hy';
}

/** The nearest traffic light to a point (used by traffic AI). */
export function nearestLight(world, x, y) {
  let best = null, bd = Infinity;
  for (const l of world.lights) {
    const d = (l.x - x) * (l.x - x) + (l.y - y) * (l.y - y);
    if (d < bd) { bd = d; best = l; }
  }
  return best;
}

/** Street names of the nearest roads, for the sign shown near the player. */
export function streetNames(world, x, y) {
  let v = null, h = null, dv = Infinity, dh = Infinity;
  for (let i = 0; i < 8; i++) {
    const d = Math.abs(x - (world.roadsV[i] + WORLD.road / 2));
    if (d < dv) { dv = d; v = STREET_NAMES_V[i]; }
    const d2 = Math.abs(y - (world.roadsH[i] + WORLD.road / 2));
    if (d2 < dh) { dh = d2; h = STREET_NAMES_H[i]; }
  }
  return { v, h };
}

/** A random point on a road (for spawning traffic). */
export function randomRoadPoint(world, rng) {
  if (rng() < 0.5) {
    const i = Math.floor(rng() * 8);
    return { x: world.roadsV[i] + WORLD.road / 2, y: WORLD.margin + rng() * (world.roadEnd - WORLD.margin), axis: 'v', index: i };
  }
  const i = Math.floor(rng() * 8);
  return { x: WORLD.margin + rng() * (world.roadEnd - WORLD.margin), y: world.roadsH[i] + WORLD.road / 2, axis: 'h', index: i };
}
