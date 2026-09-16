import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlowInteraction } from '../../landing/flow-interaction.mjs';
import { createScene as clouds } from '../../landing/variants/clouds.mjs';
import { createScene as glyphs } from '../../landing/variants/glyphs.mjs';
import { createScene as ribbons } from '../../landing/variants/ribbons.mjs';
import { createScene as voids } from '../../landing/variants/voids.mjs';

const length = ({ x, y }) => Math.hypot(x, y);

function field() {
  const interaction = createFlowInteraction();
  interaction.resize(1000, 700);
  return interaction;
}

function advance(interaction, seconds, fps = 60) {
  for (let i = 0; i < Math.round(seconds * fps); i++) interaction.step(1 / fps);
}

function activate(interaction, fps = 60) {
  for (let i = 0; i < fps / 4; i++) {
    interaction.move(390 + i * 40 / fps, 350);
    interaction.step(1 / fps);
  }
}

test('cursor attraction is local, directed toward the cursor and begins without an immediate jump', () => {
  const interaction = field();
  assert.deepEqual(interaction.sample(350, 350), { x: 0, y: 0 });
  interaction.move(400, 350);
  assert.deepEqual(interaction.sample(350, 350), { x: 0, y: 0 }, 'pointer events alone do not move rendered geometry');
  advance(interaction, .1);
  const near = interaction.sample(350, 350);
  assert.ok(near.x > .1 && near.x < 30);
  assert.ok(Math.abs(near.y) < 1e-9);
  const above = interaction.sample(400, 300);
  assert.ok(above.y > .1, 'particles above the cursor move down toward it');
  assert.ok(Math.abs(above.x) < 1e-9);
  assert.deepEqual(interaction.sample(900, 600), { x: 0, y: 0 }, 'the rest of the scene stays still');
});

test('rapid cursor sweeps keep every displacement finite and below thirty CSS pixels', () => {
  const interaction = field();
  for (let tick = 0; tick < 180; tick++) {
    interaction.move(500 + Math.sin(tick * 1.3) * 450, 350 + Math.cos(tick * .7) * 300);
    interaction.step(1 / 60);
    for (const [x, y] of [[0, 0], [200, 200], [500, 350], [750, 450], [1000, 700]]) {
      const offset = interaction.sample(x, y);
      assert.ok(Number.isFinite(offset.x) && Number.isFinite(offset.y));
      assert.ok(length(offset) <= 30 + 1e-8, `bounded displacement at ${x}, ${y}`);
    }
  }
});

test('release eases to the original flow instead of moving the attraction toward the center', () => {
  const interaction = field();
  activate(interaction);
  const active = interaction.sample(350, 350);
  assert.ok(length(active) > .5);
  interaction.release();
  assert.deepEqual(interaction.sample(350, 350), active, 'release begins from the visible deformation');
  interaction.step(1 / 60);
  const first = interaction.sample(350, 350);
  assert.ok(length(first) > 0 && length(first) <= length(active) + .05, 'first recovery step stays continuous');
  assert.ok(length({ x: first.x - active.x, y: first.y - active.y }) < 2, 'one frame cannot snap the stream');
  for (let tick = 0; tick < 180; tick++) {
    interaction.step(1 / 60);
    assert.deepEqual(interaction.sample(600, 450), { x: 0, y: 0 }, 'release creates no new pull at the scene center');
  }
  assert.ok(length(interaction.sample(350, 350)) < .25);
});

test('a stationary cursor releases the flow and reset or resize clears its previous position', () => {
  const interaction = field();
  activate(interaction);
  assert.ok(length(interaction.sample(350, 350)) > .5);
  advance(interaction, 3);
  assert.ok(length(interaction.sample(350, 350)) < .25, 'flow returns even while the cursor remains over it');
  for (const clear of [() => interaction.reset(), () => interaction.resize(600, 400)]) {
    activate(interaction);
    assert.ok(length(interaction.sample(350, 350)) > .5);
    clear();
    assert.deepEqual(interaction.sample(350, 350), { x: 0, y: 0 });
    advance(interaction, 1);
    assert.deepEqual(interaction.sample(350, 350), { x: 0, y: 0 }, 'cleared cursor does not revive by itself');
  }
});

test('the same timed gesture has comparable response and recovery at 30, 60 and 120 Hz', () => {
  const records = [30, 60, 120].map(fps => {
    const interaction = field(), samples = [];
    // Exactly one second of steady motion, with the same endpoint at every rate.
    for (let i = 1; i <= fps; i++) {
      interaction.move(380 + i / fps * 20, 350);
      interaction.step(1 / fps);
    }
    samples.push(interaction.sample(350, 350));
    interaction.release();
    advance(interaction, .5, fps);
    samples.push(interaction.sample(350, 350));
    advance(interaction, 2.5, fps);
    samples.push(interaction.sample(350, 350));
    return samples;
  });
  for (let phase = 0; phase < 3; phase++) {
    const reference = records[2][phase];
    for (const samples of records) {
      assert.ok(Math.hypot(samples[phase].x - reference.x, samples[phase].y - reference.y) < 1,
        `phase ${phase} differs by less than one CSS pixel between frame rates`);
    }
  }
});

// Capture particle centers in CSS coordinates, including the drawing transforms
// used by the 2D signs. Background rectangles and offscreen sprites are omitted.
function recorder() {
  const points = [], stack = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  const position = (x, y) => [matrix[0] * x + matrix[2] * y + matrix[4],
    matrix[1] * x + matrix[3] * y + matrix[5]];
  const gradient = () => ({ addColorStop() {} });
  const context = new Proxy({
    createRadialGradient: gradient, createLinearGradient: gradient,
    save() { stack.push([...matrix]); },
    restore() { matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0]; },
    translate(x, y) {
      matrix[4] += matrix[0] * x + matrix[2] * y;
      matrix[5] += matrix[1] * x + matrix[3] * y;
    },
    scale(x, y) { matrix[0] *= x; matrix[1] *= x; matrix[2] *= y; matrix[3] *= y; },
    rotate(angle) {
      const [a, b, c, d] = matrix, cs = Math.cos(angle), sn = Math.sin(angle);
      matrix[0] = a * cs + c * sn; matrix[1] = b * cs + d * sn;
      matrix[2] = c * cs - a * sn; matrix[3] = d * cs - b * sn;
    },
    setTransform(...values) { matrix = values; },
    arc(x, y, radius) { if (radius < 5) points.push(position(x, y)); },
    fillRect(x, y, w, h) { if (w < 5 && h < 5) points.push(position(x, y)); },
    drawImage(_image, x, y, w, h) {
      if (w < 50 && h < 50) points.push(position(x + w / 2, y + h / 2));
    },
  }, { get: (target, name) => target[name] ?? (() => {}) });
  return { context, points };
}

for (const [name, createScene] of Object.entries({ clouds, glyphs, ribbons, voids })) {
  test(`${name}: actual particles follow the local field while distant geometry remains fixed`, () => {
    const scene = createScene({ createCanvas: () => ({ getContext: () => recorder().context }) });
    const interaction = field();
    for (let i = 0; i < 18; i++) {
      interaction.move(510 + i * .5, 350);
      interaction.step(1 / 60);
    }
    const frame = { width: 1000, height: 700, time: 12, progress: 1, detail: .6,
      reducedMotion: false };
    const render = (extra = {}) => {
      const capture = recorder();
      scene.draw(capture.context, { ...frame, ...extra });
      return capture.points;
    };
    const before = render(), after = render({ interaction });
    assert.ok(before.length > 1000, 'checks actual renderer output');
    assert.equal(after.length, before.length, 'attraction does not add or remove particles');
    let shifted = 0, distant = 0;
    for (let i = 0; i < before.length; i++) {
      const [x, y] = before[i], [nx, ny] = after[i];
      const displacement = Math.hypot(nx - x, ny - y);
      assert.ok(Number.isFinite(nx) && Number.isFinite(ny));
      assert.ok(displacement <= 30.001, 'screen displacement remains subtle');
      if (displacement > .01) shifted++;
      if (Math.hypot(x - 520, y - 350) > 210) {
        distant++;
        assert.ok(displacement < .0001, `distant particle ${i} stays fixed`);
      }
    }
    assert.ok(shifted > 20, 'local particles visibly follow the cursor');
    assert.ok(distant > 100, 'the stationary comparison covers distant parts of the flow');
    assert.deepEqual(render({ reducedMotion: true, interaction }), render({ reducedMotion: true }),
      'reduced-motion scenes ignore interaction');
  });
}
