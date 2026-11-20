// Small math / random helpers shared by every module. No dependencies.

/** Deterministic RNG (mulberry32) so a seed always builds the same city. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Shortest signed turn from angle a to angle b (radians). */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const angleLerp = (a, b, t) => a + angleDiff(a, b) * clamp(t, 0, 1);
export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

/** Push a circle (x, y, r) out of an axis-aligned rect; returns true when it hit. */
export function circleRectResolve(c, r) {
  const cx = clamp(c.x, r.x, r.x + r.w);
  const cy = clamp(c.y, r.y, r.y + r.h);
  const dx = c.x - cx, dy = c.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= c.r * c.r) return false;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    const push = (c.r - d) / d;
    c.x += dx * push; c.y += dy * push;
    return true;
  }
  // Centre inside the rect: push out along the smallest penetration axis.
  const pl = c.x - r.x, pr = r.x + r.w - c.x, pt = c.y - r.y, pb = r.y + r.h - c.y;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) c.x = r.x - c.r; else if (m === pr) c.x = r.x + r.w + c.r;
  else if (m === pt) c.y = r.y - c.r; else c.y = r.y + r.h + c.r;
  return true;
}

export const rectsOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const pointInRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** Format a game clock hour (0-24) as "09:20". */
export function fmtClock(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export const fmtMoney = (n) => `$${Math.floor(n).toLocaleString('en-US')}`;

/** Pick a random item from an array with an rng function. */
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
/** Random float in [lo, hi). */
export const randRange = (rng, lo, hi) => lo + rng() * (hi - lo);
