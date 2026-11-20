// Keyboard and mouse input. Held keys are read every frame; one-shot presses
// (enter, pause, reload, weapon, horn, mute) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost or double-counted.
import { KEYS } from './config.js';

export const ACT_ENTER = 1;
export const ACT_PAUSE = 2;
export const ACT_RELOAD = 4;
export const ACT_WEAPON = 8;
export const ACT_HORN = 16;
export const ACT_MUTE = 32;
export const ACT_CONFIRM = 64;

const has = (set, codes) => codes.some((c) => set.has(c));

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0, mouseY = 0, mouseDown = false, mouseClicked = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) { event.preventDefault(); return; }
    held.add(event.code);
    if (has(held, KEYS.enter)) actions |= ACT_ENTER;
    if (has(held, KEYS.pause)) actions |= ACT_PAUSE;
    if (has(held, KEYS.reload)) actions |= ACT_RELOAD;
    if (has(held, KEYS.weapon)) actions |= ACT_WEAPON;
    if (has(held, KEYS.horn)) actions |= ACT_HORN;
    if (has(held, KEYS.mute)) actions |= ACT_MUTE;
    if (event.code === 'Enter' || event.code === 'Space') actions |= ACT_CONFIRM;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => { held.clear(); mouseDown = false; });

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) { mouseDown = true; mouseClicked = true; }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** -1/0/1 steering or movement axis from held keys. */
    axisX() { return (has(held, KEYS.right) ? 1 : 0) - (has(held, KEYS.left) ? 1 : 0); },
    axisY() { return (has(held, KEYS.down) ? 1 : 0) - (has(held, KEYS.up) ? 1 : 0); },
    /** True while the run key (Shift) is held. */
    running() { return has(held, KEYS.run); },
    /** True while the handbrake (Space) is held. */
    braking() { return held.has('Space'); },
    /** Mouse position in canvas pixels. */
    mouse() { return { x: mouseX, y: mouseY, down: mouseDown }; },
    /** True once when the left button was pressed since the last call. */
    takeClick() { const c = mouseClicked; mouseClicked = false; return c; },
    /** The one-shot presses since the last call, as ACT_* flags. */
    takeActions() { const a = actions; actions = 0; return a; },
    /** For tests / autopilot: pretend a key is held. */
    fake(code, on) { if (on) held.add(code); else held.delete(code); },
  };
}
