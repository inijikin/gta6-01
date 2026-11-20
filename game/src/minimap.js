// Live minimap: the whole city shrunk into a corner box, with the player's
// arrow, the mission blip, police blips and a north marker. Drawn onto the
// main canvas each frame.
import { WORLD } from './config.js';
import { missionTarget } from './missions.js';

const SIZE = 188;
const MARGIN = 14;

/** Draw the minimap at the bottom-left of the canvas. */
export function drawMinimap(ctx, game, canvasW, canvasH) {
  const scale = SIZE / WORLD.size;
  const x0 = MARGIN, y0 = canvasH - SIZE - MARGIN;
  const px = (x) => x0 + x * scale;
  const py = (y) => y0 + y * scale;

  ctx.save();
  // Frame.
  ctx.fillStyle = 'rgba(12, 16, 24, 0.82)';
  ctx.fillRect(x0 - 3, y0 - 3, SIZE + 6, SIZE + 6);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 - 3, y0 - 3, SIZE + 6, SIZE + 6);
  ctx.beginPath();
  ctx.rect(x0, y0, SIZE, SIZE);
  ctx.clip();

  // Land, beach and sea.
  ctx.fillStyle = '#3d5a3a';
  ctx.fillRect(x0, y0, SIZE, SIZE);
  ctx.fillStyle = '#d9c48a';
  ctx.fillRect(x0, py(WORLD.sandY), SIZE, SIZE - py(WORLD.sandY) + y0);
  ctx.fillStyle = '#2a6ea8';
  ctx.fillRect(x0, py(WORLD.seaY), SIZE, SIZE - py(WORLD.seaY) + y0);

  // Roads.
  ctx.strokeStyle = '#5a5f6a';
  ctx.lineWidth = Math.max(2, WORLD.road * scale);
  for (const rx of game.world.roadsV) {
    ctx.beginPath();
    ctx.moveTo(px(rx + WORLD.road / 2), y0);
    ctx.lineTo(px(rx + WORLD.road / 2), y0 + SIZE);
    ctx.stroke();
  }
  for (const ry of game.world.roadsH) {
    ctx.beginPath();
    ctx.moveTo(x0, py(ry + WORLD.road / 2));
    ctx.lineTo(x0 + SIZE, py(ry + WORLD.road / 2));
    ctx.stroke();
  }

  // Parks.
  ctx.fillStyle = '#2f6b2f';
  for (const b of game.world.blocks) {
    if (b.kind === 'park') ctx.fillRect(px(b.x), py(b.y), b.w * scale, b.h * scale);
  }

  // Collectibles not yet taken (tiny gold dots).
  ctx.fillStyle = '#ffd94d';
  for (const c of game.world.collectibles) {
    if (!c.taken) ctx.fillRect(px(c.x) - 1.5, py(c.y) - 1.5, 3, 3);
  }

  // Mission blip: pulsing gold diamond.
  const target = missionTarget(game);
  const pulse = 3.5 + Math.sin(game.elapsed * 5) * 1.2;
  if (target) {
    ctx.fillStyle = '#ffd94d';
    ctx.beginPath();
    ctx.moveTo(px(target.x), py(target.y) - pulse);
    ctx.lineTo(px(target.x) + pulse, py(target.y));
    ctx.lineTo(px(target.x), py(target.y) + pulse);
    ctx.lineTo(px(target.x) - pulse, py(target.y));
    ctx.closePath();
    ctx.fill();
  } else {
    const next = game.nextMission;
    if (next) {
      ctx.fillStyle = '#ffd94d';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('M', px(next.x), py(next.y) + 4);
    }
  }
  // Taxi fare: a small cyan diamond.
  if (game.taxiJob) {
    const t = game.taxiJob;
    ctx.fillStyle = '#6ee7f5';
    ctx.beginPath();
    ctx.moveTo(px(t.x), py(t.y) - 3.5);
    ctx.lineTo(px(t.x) + 3.5, py(t.y));
    ctx.lineTo(px(t.x), py(t.y) + 3.5);
    ctx.lineTo(px(t.x) - 3.5, py(t.y));
    ctx.closePath();
    ctx.fill();
  }

  // Police blips: flashing blue/red.
  const flash = Math.floor(game.elapsed * 4) % 2 === 0;
  ctx.fillStyle = flash ? '#3d7ad9' : '#e5534b';
  for (const car of game.cars) {
    if (car.driver === 'police' && !car.dead) {
      ctx.beginPath(); ctx.arc(px(car.x), py(car.y), 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  for (const cop of game.cops) {
    ctx.beginPath(); ctx.arc(px(cop.x), py(cop.y), 2, 0, Math.PI * 2); ctx.fill();
  }

  // Player arrow (rotated to the heading).
  const p = game.player;
  const cx = px(p.car ? p.car.x : p.x), cy = py(p.car ? p.car.y : p.y);
  const a = p.car ? p.car.angle : p.angle;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(8, 0); ctx.lineTo(-6, -5); ctx.lineTo(-3, 0); ctx.lineTo(-6, 5);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();

  // North marker.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', x0 + SIZE - 10, y0 + 14);
  ctx.restore();
}
