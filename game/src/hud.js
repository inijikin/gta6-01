// HUD and menus, drawn on the canvas: health/armor/money/wanted/weapon/speed,
// the objective line, toasts, dialogue subtitles, the district banner, and the
// title / pause / settings / wasted / busted screens with clickable buttons.
import { WEAPONS, ECONOMY } from './config.js';
import { fmtClock, fmtMoney, clamp } from './utils.js';
import { drawMinimap } from './minimap.js';
import { objectiveText, dialogLine } from './missions.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Buttons laid out by the last menu draw: [{ id, x, y, w, h }] for hit-testing. */
export function drawHUD(ctx, game, view) {
  const W = view.w, H = view.h;
  const p = game.player;

  // Minimap (bottom-left).
  drawMinimap(ctx, game, W, H);

  // Health + armor bars (top-left).
  bar(ctx, 16, 16, 210, 16, p.health / 100, '#e5534b', 'HEALTH');
  bar(ctx, 16, 38, 210, 10, p.armor / 100, '#7ab8e8', 'ARMOR');
  ctx.fillStyle = '#fff';
  ctx.font = `bold 17px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(fmtMoney(p.money), 16, 72);
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(`Packages ${p.collected}/${ECONOMY.collectibles}   Missions ${game.completedMissions.length}/6`, 16, 92);
  ctx.fillStyle = 'rgba(235,238,242,0.6)';
  ctx.fillText(game.streetPair || '', 16, 112);

  // Wanted stars + clock (top-right).
  const stars = '★'.repeat(p.wanted) + '☆'.repeat(5 - p.wanted);
  ctx.font = `bold 22px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = p.wanted > 0 ? '#ffd94d' : 'rgba(255,255,255,0.4)';
  ctx.fillText(stars, W - 16, 34);
  ctx.font = `15px ${FONT}`;
  ctx.fillStyle = '#fff';
  ctx.fillText(fmtClock(game.clock) + (game.isNight ? '  ☾' : '  ☀'), W - 16, 58);
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(game.audio.stationName() + '  (R: radio)', W - 16, 78);

  // Objective line (top-centre).
  const obj = objectiveText(game);
  if (obj) {
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    const tw = ctx.measureText(obj).width + 28;
    ctx.fillStyle = 'rgba(12,16,24,0.75)';
    ctx.fillRect(W / 2 - tw / 2, 12, tw, 30);
    ctx.fillStyle = '#ffd94d';
    ctx.fillText(obj, W / 2, 33);
    if (game.mission && game.mission.timer > 0) {
      ctx.fillStyle = game.mission.timer < 15 ? '#ff6a5a' : '#fff';
      ctx.fillText(`${Math.ceil(game.mission.timer)}s`, W / 2, 56);
    }
  }

  // Weapon + ammo (bottom-right); speed when driving.
  const def = WEAPONS[p.weapon];
  ctx.textAlign = 'right';
  ctx.font = `bold 17px ${FONT}`;
  ctx.fillStyle = '#fff';
  const ammoText = p.weapon === 'fists' ? def.name : `${def.name}  ${p.reloading > 0 ? 'RELOADING…' : `${p.mag[p.weapon]} / ${p.ammo[p.weapon]}`}`;
  ctx.fillText(ammoText, W - 16, H - 44);
  if (p.car) {
    const kmh = Math.round(Math.abs(p.car.speed) * 0.32);
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillText(`${kmh}`, W - 16, H - 12);
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('km/h', W - 52, H - 12);
    // Car health bar.
    bar(ctx, W - 216, H - 66, 200, 8, p.car.health / p.car.maxHealth, '#f2a33c', '');
  } else {
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('Q: weapon   R: reload   E: enter car', W - 16, H - 12);
  }

  // Context prompt (centre-bottom).
  if (game.prompt) {
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    const tw = ctx.measureText(game.prompt).width + 28;
    ctx.fillStyle = 'rgba(12,16,24,0.8)';
    ctx.fillRect(W / 2 - tw / 2, H - 108, tw, 30);
    ctx.fillStyle = '#fff';
    ctx.fillText(game.prompt, W / 2, H - 88);
  }

  // Toasts (stacked above the prompt).
  ctx.textAlign = 'center';
  ctx.font = `14px ${FONT}`;
  game.toasts.forEach((t, i) => {
    const a = clamp(t.life / 0.5, 0, 1);
    ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`;
    ctx.fillText(t.text, W / 2, H - 140 - i * 22);
  });

  // Dialogue subtitle (bottom-centre).
  const line = dialogLine(game);
  if (line) {
    ctx.font = `16px ${FONT}`;
    const tw = Math.min(W - 120, ctx.measureText(line).width + 32);
    ctx.fillStyle = 'rgba(10,10,14,0.82)';
    ctx.fillRect(W / 2 - tw / 2, H - 196, tw, 34);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(line, W / 2, H - 173);
  }

  // District banner (fades in/out on entry).
  if (game.districtBanner) {
    const b = game.districtBanner;
    const a = b.t < 0.4 ? b.t / 0.4 : b.t > 2.2 ? Math.max(0, (3 - b.t) / 0.8) : 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255,255,255,${0.95 * a})`;
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillText(b.name, W / 2, H * 0.3);
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = `rgba(255,255,255,${0.8 * a})`;
    ctx.fillText(b.desc, W / 2, H * 0.3 + 28);
  }
}

function bar(ctx, x, y, w, h, frac, color, label) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, w * clamp(frac, 0, 1)), h);
  if (label) {
    ctx.fillStyle = '#fff';
    ctx.font = `bold 9px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 4, y + h - 2);
  }
}

/** Shared menu scaffolding: panel + title + buttons, returns button rects. */
function menuBase(ctx, view, title, subtitle, items) {
  const W = view.w, H = view.h;
  ctx.fillStyle = 'rgba(8, 12, 20, 0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94d';
  ctx.font = `bold 54px ${FONT}`;
  ctx.fillText(title, W / 2, H * 0.26);
  if (subtitle) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `18px ${FONT}`;
    ctx.fillText(subtitle, W / 2, H * 0.26 + 34);
  }
  const buttons = [];
  const bw = 340, bh = 46, gap = 14;
  const top = H * 0.42;
  items.forEach((it, i) => {
    const y = top + i * (bh + gap);
    const hover = it.id === items.hover;
    ctx.fillStyle = hover ? '#ffd94d' : 'rgba(255,255,255,0.12)';
    ctx.fillRect(W / 2 - bw / 2, y, bw, bh);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.strokeRect(W / 2 - bw / 2, y, bw, bh);
    ctx.fillStyle = hover ? '#111' : '#fff';
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillText(it.label, W / 2, y + 30);
    buttons.push({ id: it.id, x: W / 2 - bw / 2, y, w: bw, h: bh });
  });
  return buttons;
}

export function drawTitle(ctx, game, view) {
  const items = [
    { label: game.hasSave ? 'Continue' : 'New Game', id: 'start' },
    { label: 'How to Play', id: 'controls' },
    { label: game.audio.musicOn ? 'Music: On' : 'Music: Off', id: 'music' },
  ];
  items.hover = game.menuHover;
  const buttons = menuBase(ctx, view, 'SOLMAR BAY', 'An open-world crime story — drive, earn, survive the bay.', items);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `13px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('WASD drive & walk · E enter car / interact · Mouse aim · Click shoot · Space handbrake · Q weapon · R reload / radio', view.w / 2, view.h - 28);
  ctx.fillText('An original game. Not affiliated with any real city, person or game series.', view.w / 2, view.h - 10);
  game.menuButtons = buttons;
}

export function drawControls(ctx, game, view) {
  const lines = [
    ['WASD / Arrows', 'Walk & drive (steer while driving)'],
    ['Shift', 'Run on foot'],
    ['E', 'Enter / exit car · interact · start mission'],
    ['Space', 'Handbrake / drift'],
    ['Mouse + Click', 'Aim · shoot / punch'],
    ['Q', 'Switch weapon'],
    ['R', 'Reload (on foot) · next radio station (in car)'],
    ['H', 'Horn'],
    ['Esc', 'Pause'],
    ['M', 'Mute'],
  ];
  const W = view.w, H = view.h;
  ctx.fillStyle = 'rgba(8, 12, 20, 0.8)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94d';
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillText('HOW TO PLAY', W / 2, 90);
  ctx.font = `16px ${FONT}`;
  lines.forEach((l, i) => {
    const y = 140 + i * 34;
    ctx.fillStyle = '#ffd94d';
    ctx.textAlign = 'right';
    ctx.fillText(l[0], W / 2 - 20, y);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(l[1], W / 2 + 20, y);
  });
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('Press Esc or Enter to go back.', W / 2, H - 40);
}

export function drawPause(ctx, game, view) {
  const items = [
    { label: 'Resume', id: 'resume' },
    { label: 'Save Game', id: 'save' },
    { label: game.audio.musicOn ? 'Music: On' : 'Music: Off', id: 'music' },
    { label: 'Quit to Title', id: 'quit' },
  ];
  items.hover = game.menuHover;
  game.menuButtons = menuBase(ctx, view, 'PAUSED', `${fmtMoney(game.player.money)}  ·  Missions ${game.completedMissions.length}/6  ·  Packages ${game.player.collected}/10`, items);
}

export function drawSettings(ctx, game, view) {
  const items = [
    { label: `Volume: ${Math.round(game.audio.volume * 100)}%  (← → to change)`, id: 'volume' },
    { label: game.audio.musicOn ? 'Music: On' : 'Music: Off', id: 'music' },
    { label: 'Back', id: 'back' },
  ];
  items.hover = game.menuHover;
  game.menuButtons = menuBase(ctx, view, 'SETTINGS', '', items);
}

export function drawEnd(ctx, game, view, kind) {
  const title = kind === 'busted' ? 'BUSTED' : 'WASTED';
  const sub = kind === 'busted'
    ? 'The Solmar Bay police took you in. Bail cost you $200.'
    : 'You flatlined on the streets of Solmar Bay. The hospital patched you up — $200.';
  const items = [
    { label: 'Keep Playing', id: 'respawn' },
    { label: 'Quit to Title', id: 'quit' },
  ];
  items.hover = game.menuHover;
  game.menuButtons = menuBase(ctx, view, title, sub, items);
}
