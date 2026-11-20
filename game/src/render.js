// Drawing only: the city, its cars and people, the effects and the night.
// The camera follows the player with a lookahead, zooms out as speed rises and
// shakes on impacts. Nothing here changes game state.
import { WORLD } from './config.js';
import { clamp, lerp } from './utils.js';
import { lightState } from './world.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Sun angle (radians) from the game clock: east at dawn, west at dusk. */
function sunAngle(hour) {
  return ((hour - 6) / 12) * Math.PI;
}
/** 0 by day, up to 0.55 in the deep night. */
export function darkness(hour) {
  if (hour >= 7 && hour < 18) return 0;
  if (hour >= 18 && hour < 19) return (hour - 18) * 0.3;
  if (hour >= 6 && hour < 7) return (7 - hour) * 0.3;
  if (hour >= 19 || hour < 5) return 0.55;
  return (hour < 6 ? (6 - hour) * 0.25 + 0.3 : 0.3);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { w: 1280, h: 800, dpr: 1 };
  const camera = { x: 1200, y: 1200, zoom: 1, shake: 0, sx: 0, sy: 0 };

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    view.dpr = dpr;
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    canvas.style.width = `${view.w}px`;
    canvas.style.height = `${view.h}px`;
  }
  window.addEventListener('resize', resize);
  resize();

  /** Smooth follow with a lookahead, zoom-out with speed, shake decay. */
  function updateCamera(game, dt) {
    const p = game.player;
    const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
    const vx = p.car ? p.car.vx : p.vx, vy = p.car ? p.car.vy : p.vy;
    const speed = Math.hypot(vx, vy);
    const tx = px + vx * 0.28, ty = py + vy * 0.28;
    const k = Math.min(1, 4.2 * dt);
    camera.x = lerp(camera.x, tx, k);
    camera.y = lerp(camera.y, ty, k);
    const targetZoom = clamp(1.06 - speed / 2600, 0.74, 1.06);
    camera.zoom = lerp(camera.zoom, targetZoom, Math.min(1, 2.2 * dt));
    if (game.shake > 0) {
      game.shake = Math.max(0, game.shake - dt * 2.2);
      camera.sx = (Math.random() - 0.5) * game.shake * 14;
      camera.sy = (Math.random() - 0.5) * game.shake * 14;
    } else { camera.sx = 0; camera.sy = 0; }
  }

  function worldToScreen(x, y) {
    return {
      x: (x - camera.x) * camera.zoom + view.w / 2 + camera.sx,
      y: (y - camera.y) * camera.zoom + view.h / 2 + camera.sy,
    };
  }

  function drawCar(car, game) {
    // Inside draw()'s camera transform, so the car's world position is used
    // directly (worldToScreen would apply the camera twice).
    const s = { x: car.x, y: car.y };
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(car.angle);
    const z = camera.zoom;
    const L = car.len * z, Wd = car.wid * z;
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-L / 2 + 3, -Wd / 2 + 3, L, Wd);
    // Body.
    ctx.fillStyle = car.dead ? '#2a2a2a' : car.color;
    roundRect(-L / 2, -Wd / 2, L, Wd, 6 * z);
    ctx.fill();
    // Roof + windshield.
    ctx.fillStyle = car.dead ? '#1a1a1a' : shade(car.color, -28);
    roundRect(-L * 0.22, -Wd * 0.36, L * 0.4, Wd * 0.72, 4 * z);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,220,240,0.85)';
    ctx.fillRect(L * 0.2, -Wd * 0.36, L * 0.1, Wd * 0.72);
    ctx.fillRect(-L * 0.34, -Wd * 0.36, L * 0.08, Wd * 0.72);
    // Taxi sign / police light bar.
    if (car.type === 'taxi') {
      ctx.fillStyle = '#111';
      ctx.fillRect(-L * 0.06, -Wd * 0.2, L * 0.12, Wd * 0.4);
      ctx.fillStyle = '#ffd94d';
      ctx.font = `bold ${Math.max(7, 8 * z)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3 * z);
    }
    if (car.type === 'police') {
      const flash = Math.floor(game.elapsed * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#e5534b' : '#3d7ad9';
      ctx.fillRect(-L * 0.05, -Wd / 2, L * 0.1, Wd);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(7, 8 * z)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, -Wd * 0.18);
    }
    if (car.type === 'truck') {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(-L / 2 + 4, -Wd / 2 + 3, L * 0.5, Wd - 6);
    }
    // Headlight cones at night.
    if (game.isNight && !car.dead) {
      ctx.restore();
      ctx.save();
      const g = ctx.createRadialGradient(s.x + Math.cos(car.angle) * L * 0.7, s.y + Math.sin(car.angle) * L * 0.7, 4, s.x + Math.cos(car.angle) * L * 0.7, s.y + Math.sin(car.angle) * L * 0.7, 130 * z);
      g.addColorStop(0, 'rgba(255,240,180,0.20)');
      g.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x + Math.cos(car.angle) * L * 0.7, s.y + Math.sin(car.angle) * L * 0.7, 130 * z, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPerson(x, y, angle, shirt, pants, skin, phase, z, down) {
    // World coords: draw() already holds the camera transform.
    const s = { x, y };
    ctx.save();
    ctx.translate(s.x, s.y);
    if (down) ctx.rotate(Math.PI / 2);
    else ctx.rotate(angle + Math.PI / 2);
    const bob = down ? 0 : Math.sin(phase) * 2.5 * z;
    // Legs (two dots stepping).
    ctx.fillStyle = pants;
    ctx.beginPath(); ctx.arc(-4 * z, bob, 3.4 * z, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4 * z, -bob, 3.4 * z, 0, Math.PI * 2); ctx.fill();
    // Body.
    ctx.fillStyle = shirt;
    ctx.beginPath(); ctx.arc(0, 0, 7.5 * z, 0, Math.PI * 2); ctx.fill();
    // Head.
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0, -9 * z, 4.6 * z, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function draw(game) {
    const world = game.world;
    const p = game.player;
    const z = camera.zoom;
    const hour = game.clock;
    const dark = darkness(hour);
    const sunA = sunAngle(hour);
    const shX = Math.cos(sunA) * 0.5, shY = Math.sin(sunA) * 0.5;

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    // Base ground (grass).
    ctx.fillStyle = '#4a7a44';
    ctx.fillRect(0, 0, view.w, view.h);

    const vx0 = camera.x - view.w / 2 / z - 80, vy0 = camera.y - view.h / 2 / z - 80;
    const vx1 = camera.x + view.w / 2 / z + 80, vy1 = camera.y + view.h / 2 / z + 80;
    const inView = (x, y, m = 100) => x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m;

    ctx.save();
    ctx.translate(view.w / 2 + camera.sx, view.h / 2 + camera.sy);
    ctx.scale(z, z);
    ctx.translate(-camera.x, -camera.y);

    // Beach sand + sea.
    ctx.fillStyle = '#d9c48a';
    ctx.fillRect(0, WORLD.sandY, WORLD.size, WORLD.seaY - WORLD.sandY);
    ctx.fillStyle = '#2a6ea8';
    ctx.fillRect(0, WORLD.seaY, WORLD.size, WORLD.size - WORLD.seaY);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 24; i++) {
      const wx = ((i * 173 + game.elapsed * 22) % WORLD.size);
      ctx.fillRect(wx, WORLD.seaY + 6 + ((i * 37) % 130), 46, 2);
    }

    // Blocks: sidewalk grey, parks green, plazas paved.
    for (const b of world.blocks) {
      if (!inView(b.x + b.w / 2, b.y + b.h / 2, 200)) continue;
      ctx.fillStyle = b.kind === 'park' ? '#3f7a3a' : b.kind === 'sand' ? '#d9c48a' : b.kind === 'plaza' ? '#9a938a' : '#8a8580';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      if (b.kind === 'park') {
        ctx.fillStyle = '#356b31';
        ctx.fillRect(b.x + 20, b.y + 20, b.w - 40, b.h - 40);
      }
    }

    // Roads + centre dashes + crosswalks.
    ctx.fillStyle = '#3c4048';
    for (const rx of world.roadsV) ctx.fillRect(rx, WORLD.margin - 10, WORLD.road, world.roadEnd - WORLD.margin + 10);
    for (const ry of world.roadsH) ctx.fillRect(WORLD.margin - 10, ry, world.roadEnd - WORLD.margin + 10, WORLD.road);
    ctx.fillStyle = '#d8d8d8';
    for (const rx of world.roadsV) {
      const cx = rx + WORLD.road / 2;
      for (let y = WORLD.margin; y < world.roadEnd; y += 44) ctx.fillRect(cx - 2, y, 4, 22);
    }
    for (const ry of world.roadsH) {
      const cy = ry + WORLD.road / 2;
      for (let x = WORLD.margin; x < world.roadEnd; x += 44) ctx.fillRect(x, cy - 2, 22, 4);
    }
    // Crosswalks at crossings.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const l of world.lights) {
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(l.x - 26 + i * 11, l.y - WORLD.road / 2 + 4, 6, 12);
        ctx.fillRect(l.x - 26 + i * 11, l.y + WORLD.road / 2 - 16, 6, 12);
      }
    }

    // Buildings: shadow, body, roof details, windows, neon signs.
    for (const b of world.buildings) {
      if (!inView(b.x + b.w / 2, b.y + b.h / 2, 120)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(b.x + shX * b.height * 0.45, b.y + shY * b.height * 0.45, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(b.x, b.y, b.w, 8);
      // Windows.
      ctx.fillStyle = game.isNight ? 'rgba(255,220,120,0.85)' : 'rgba(60,80,110,0.55)';
      const cols = Math.max(1, Math.floor(b.w / 26)), rows = Math.max(1, Math.floor(b.h / 26));
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        if (((i * 7 + j * 3 + Math.floor(b.roof * 10)) % 4) === 0) continue;
        ctx.fillRect(b.x + 8 + i * 26, b.y + 8 + j * 26, 12, 12);
      }
      // Neon sign.
      if (b.neon && b.sign) {
        ctx.fillStyle = game.isNight ? '#ff5a7a' : '#c94f6a';
        ctx.font = `bold ${Math.max(10, b.w / 7)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(b.sign, b.x + b.w / 2, b.y + b.h / 2 + 4);
      }
    }

    // Trees (round canopies; palms on the beach).
    for (const t of world.trees) {
      if (!inView(t.x, t.y, 40)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.arc(t.x + 3, t.y + 4, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = t.color;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
      if (t.palm) {
        ctx.strokeStyle = '#2f6b2f';
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x + Math.cos(a) * (t.r + 6), t.y + Math.sin(a) * (t.r + 6)); ctx.stroke();
        }
      }
    }

    // Traffic lights.
    for (const l of world.lights) {
      if (!inView(l.x, l.y, 60)) continue;
      const state = lightState(l, game.elapsed);
      ctx.fillStyle = '#222';
      ctx.fillRect(l.x - 4, l.y - WORLD.road / 2 - 2, 8, 18);
      ctx.fillStyle = state === 'v' ? '#37d67a' : state === 'vy' ? '#ffd94d' : '#e5534b';
      ctx.beginPath(); ctx.arc(l.x, l.y - WORLD.road / 2 + 6, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = state === 'h' ? '#37d67a' : state === 'hy' ? '#ffd94d' : '#e5534b';
      ctx.beginPath(); ctx.arc(l.x, l.y - WORLD.road / 2 + 12, 3, 0, Math.PI * 2); ctx.fill();
    }

    // Hydrants (spray when hit), crates, ramps, collectibles.
    for (const hyd of world.hydrants) {
      if (!inView(hyd.x, hyd.y, 40)) continue;
      ctx.fillStyle = '#c9402e';
      ctx.fillRect(hyd.x - 4, hyd.y - 5, 8, 10);
      if (hyd.hit) {
        ctx.fillStyle = 'rgba(160,210,255,0.7)';
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
          const d = 14 + Math.random() * 26;
          ctx.beginPath(); ctx.arc(hyd.x + Math.cos(a) * d, hyd.y + Math.sin(a) * d, 2.5, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    for (const c of world.crates) {
      if (c.broken || !inView(c.x, c.y, 40)) continue;
      ctx.fillStyle = '#a8763e';
      ctx.fillRect(c.x - 7, c.y - 7, 14, 14);
      ctx.strokeStyle = '#7a5a2e';
      ctx.strokeRect(c.x - 7, c.y - 7, 14, 14);
    }
    for (const r of world.ramps) {
      if (!inView(r.x, r.y, 60)) continue;
      ctx.save();
      ctx.translate(r.x, r.y); ctx.rotate(r.angle);
      ctx.fillStyle = '#e8b73a';
      ctx.beginPath(); ctx.moveTo(-22, 12); ctx.lineTo(22, 12); ctx.lineTo(14, -12); ctx.lineTo(-14, -12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('JUMP', 0, 4);
      ctx.restore();
    }
    for (const c of world.collectibles) {
      if (c.taken || !inView(c.x, c.y, 60)) continue;
      const bob = Math.sin(game.elapsed * 3 + c.bob) * 3;
      ctx.fillStyle = 'rgba(255,217,77,0.35)';
      ctx.beginPath(); ctx.arc(c.x, c.y + bob, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd94d';
      ctx.fillRect(c.x - 6, c.y + bob - 6, 12, 12);
      ctx.fillStyle = '#8a6d00';
      ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('$', c.x, c.y + bob + 3);
    }

    // Shop markers (small signs with the shop's initial).
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'center';
    for (const key of Object.keys(world.shops)) {
      const s = world.shops[key];
      if (!inView(s.x, s.y, 80)) continue;
      ctx.fillStyle = 'rgba(12,16,24,0.75)';
      ctx.fillRect(s.x - 34, s.y - 24, 68, 16);
      ctx.fillStyle = '#9fd8ff';
      ctx.fillText(s.name.toUpperCase().slice(0, 12), s.x, s.y - 12);
    }

    // Skid marks (fade slowly).
    ctx.strokeStyle = 'rgba(20,20,20,0.5)';
    ctx.lineWidth = 5;
    for (const s of game.skids) {
      ctx.globalAlpha = clamp(s.life / 4, 0, 0.55);
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Cars (police first so the player's car draws on top).
    const sorted = [...game.cars].sort((a, b) => (a.driver === 'player' ? 1 : 0) - (b.driver === 'player' ? 1 : 0));
    for (const car of sorted) if (inView(car.x, car.y, 80)) drawCar(car, game);

    // Pedestrians, cops, the player on foot.
    for (const ped of game.peds) {
      if (!inView(ped.x, ped.y, 40)) continue;
      drawPerson(ped.x, ped.y, ped.angle, ped.shirt, ped.pants, ped.skin, ped.phase, z, ped.state === 'down');
    }
    for (const cop of game.cops) {
      if (!inView(cop.x, cop.y, 40)) continue;
      drawPerson(cop.x, cop.y, cop.angle, '#1d3a5f', '#1d3a5f', '#e8b88a', cop.phase, z, false);
      // Cop cap.
      const s = { x: cop.x, y: cop.y };
      ctx.fillStyle = '#12263f';
      ctx.beginPath(); ctx.arc(s.x, s.y - 9 * z, 5 * z, 0, Math.PI * 2); ctx.fill();
    }
    if (!p.car) {
      const pp = game.player;
      drawPerson(pp.x, pp.y, pp.angle, '#e8e4da', '#2b3a4a', '#e8b88a', pp.walkPhase, z, false);
      // Punch arc flash.
      if (pp.punchTimer > 0) {
        const s = { x: pp.x, y: pp.y };
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(s.x, s.y, 26 * z, pp.angle - 0.7, pp.angle + 0.7); ctx.stroke();
      }
      // Aim line when a gun is out.
      if (pp.weapon !== 'fists') {
        const s = { x: pp.x, y: pp.y };
        const m = { x: game.mouseWorld.x, y: game.mouseWorld.y };
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(m.x, m.y); ctx.stroke();
        ctx.fillStyle = '#ffd94d';
        ctx.beginPath(); ctx.arc(m.x, m.y, 4, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Pickups.
    for (const pk of game.pickups) {
      if (pk.taken || !inView(pk.x, pk.y, 50)) continue;
      const bob = Math.sin(pk.bob * 3) * 3;
      ctx.fillStyle = pk.kind === 'health' ? '#ff6a6a' : pk.kind === 'armor' ? '#7ab8e8' : '#ffd94d';
      ctx.beginPath(); ctx.arc(pk.x, pk.y + bob, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText(pk.kind === 'health' ? '+' : pk.kind === 'armor' ? 'A' : '•', pk.x, pk.y + bob + 4);
    }

    // Effects: smoke, fire, tracers, flashes, dust, spray, explosion rings.
    for (const e of game.effects) {
      const s = { x: e.x, y: e.y };
      const a = clamp(e.life / e.max, 0, 1);
      if (e.kind === 'smoke') {
        ctx.fillStyle = `rgba(90,90,90,${0.5 * a})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, e.size * (1.6 - a * 0.6), 0, Math.PI * 2); ctx.fill();
      } else if (e.kind === 'fire') {
        ctx.fillStyle = `rgba(255,${120 + Math.floor(100 * a)},40,${a})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, e.size * a, 0, Math.PI * 2); ctx.fill();
      } else if (e.kind === 'boom') {
        ctx.strokeStyle = `rgba(255,180,60,${a})`;
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(s.x, s.y, e.size * (1.4 - a), 0, Math.PI * 2); ctx.stroke();
      } else if (e.kind === 'tracer') {
        const s2 = { x: e.x2, y: e.y2 };
        ctx.strokeStyle = `rgba(255,240,160,${a})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
      } else if (e.kind === 'flash') {
        ctx.fillStyle = `rgba(255,240,160,${a})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, e.size * a, 0, Math.PI * 2); ctx.fill();
      } else if (e.kind === 'dust') {
        ctx.fillStyle = `rgba(200,190,160,${0.4 * a})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, e.size * (1.5 - a * 0.5), 0, Math.PI * 2); ctx.fill();
      }
    }

    // Birds.
    ctx.strokeStyle = 'rgba(30,30,30,0.8)';
    ctx.lineWidth = 2;
    for (const b of world.birds) {
      const s = { x: b.x, y: b.y };
      const flap = Math.sin(game.elapsed * 10 + b.x) * 3;
      ctx.beginPath();
      ctx.moveTo(s.x - 6, s.y + flap); ctx.lineTo(s.x, s.y); ctx.lineTo(s.x + 6, s.y + flap);
      ctx.stroke();
    }

    ctx.restore();

    // Rain streaks (screen space, so they fall past the camera).
    if (world.rain > 0) {
      ctx.strokeStyle = 'rgba(180,200,230,0.35)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 90; i++) {
        const rx = ((i * 137 + game.elapsed * 900) % (view.w + 40)) - 20;
        const ry = ((i * 211 + game.elapsed * 1400) % (view.h + 40)) - 20;
        ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 4, ry + 14); ctx.stroke();
      }
    }

    // Night darkness + lamp glow (screen space, after the world).
    if (dark > 0.02) {
      ctx.fillStyle = `rgba(8, 10, 30, ${dark})`;
      ctx.fillRect(0, 0, view.w, view.h);
      // Warm pools of light around street lamps and the player.
      const ps = worldToScreen(p.car ? p.car.x : p.x, p.car ? p.car.y : p.y);
      const g = ctx.createRadialGradient(ps.x, ps.y, 10, ps.x, ps.y, 260 * z);
      g.addColorStop(0, 'rgba(255,220,140,0.16)');
      g.addColorStop(1, 'rgba(255,220,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  return { resize, view, camera, updateCamera, draw, worldToScreen };
}

/** Darken a hex colour by `amt` (for roofs and shading). */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amt, 0, 255);
  const g = clamp(((n >> 8) & 0xff) + amt, 0, 255);
  const b = clamp((n & 0xff) + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}
