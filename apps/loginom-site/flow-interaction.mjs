// A small, temporary bend in the current, expressed in CSS pixels. Scenes keep
// their own base trajectories; the offset can never accumulate on a particle.
const REST = Object.freeze({ x: 0, y: 0 });

export function createFlowInteraction() {
  let width = 0, height = 0, radius = 160;
  let targetX = 0, targetY = 0, x = 0, y = 0;
  let dragX = 0, dragY = 0, strength = 0, idle = 0;
  let active = false, initialized = false;

  function reset() {
    targetX = targetY = x = y = dragX = dragY = strength = idle = 0;
    active = initialized = false;
  }

  function resize(nextWidth, nextHeight) {
    width = Math.max(0, nextWidth);
    height = Math.max(0, nextHeight);
    radius = Math.max(96, Math.min(200, Math.min(width, height) * .3));
    reset();
  }

  function move(nextX, nextY) {
    if (!width || !height || !Number.isFinite(nextX) || !Number.isFinite(nextY)) return;
    if (nextX < 0 || nextY < 0 || nextX > width || nextY > height) { release(); return; }
    if (active && nextX === targetX && nextY === targetY) return;
    // A new hover starts at its actual location, never at the canvas centre.
    if (!initialized || Math.hypot(nextX - targetX, nextY - targetY) > radius * 1.5) {
      x = nextX;
      y = nextY;
      strength = dragX = dragY = 0;
      initialized = true;
    }
    targetX = nextX;
    targetY = nextY;
    active = true;
    idle = 0;
  }

  function release() { active = false; }

  function step(delta) {
    if (!initialized || !Number.isFinite(delta) || delta <= 0) return;
    // Small substeps make response and recovery consistent at 30/60/120 Hz,
    // including a delayed frame. No animation clock or timer lives here.
    let remaining = Math.min(delta, 4);
    while (remaining > 1e-8) {
      const dt = Math.min(remaining, 1 / 120);
      remaining -= dt;
      idle += dt;
      const follow = 1 - Math.exp(-dt * 14);
      const lagX = targetX - x, lagY = targetY - y;
      x += lagX * follow;
      y += lagY * follow;
      const lag = Math.hypot(lagX, lagY);
      const drag = lag > 0 ? Math.min(8, lag * .16) / lag : 0;
      dragX += (lagX * drag - dragX) * follow;
      dragY += (lagY * drag - dragY) * follow;
      // A stationary mouse releases the current too: nothing remains pinned.
      const targetStrength = active ? Math.exp(-Math.max(0, idle - .08) / .3) : 0;
      strength += (targetStrength - strength) * (1 - Math.exp(-dt * (targetStrength > strength ? 12 : 6)));
    }
    if (strength < .0001 && (!active || idle > 2)) strength = 0;
  }

  function sample(px, py) {
    if (!strength) return REST;
    const dx = x - px, dy = y - py;
    const distanceSquared = (dx * dx + dy * dy) / (radius * radius);
    if (distanceSquared >= 1) return REST;
    // Compact, smooth falloff: distant branches and the camera stay still.
    const weight = (1 - distanceSquared) ** 3 * strength;
    const offsetX = (dx * .46 + dragX) * weight;
    const offsetY = (dy * .46 + dragY) * weight;
    const length = Math.hypot(offsetX, offsetY);
    const bound = length > 28 ? 28 / length : 1;
    return { x: offsetX * bound, y: offsetY * bound };
  }

  return { resize, move, step, release, reset, sample };
}
