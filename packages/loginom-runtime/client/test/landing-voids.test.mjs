import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { voidDistance, voidIntervalsAtX, segmentAvoidsVoids } from '../../landing/variants/voids-geometry.mjs';
import { FLOW_ROUTES, sampleFlowPoint, sampleDriftPoint, createScene, prepareScene } from '../../landing/variants/voids.mjs';

function paintRecorder() {
  const hash = createHash('sha256');
  let canvases = 0;
  const record = (...args) => hash.update(JSON.stringify(args));
  function context(id) {
    return new Proxy({}, {
      get: (_, name) => (...args) => {
        record(id, name, ...args);
        if (String(name).startsWith('create')) return { addColorStop: (...stops) => record(id, 'stop', ...stops) };
      },
      set: (_, name, value) => { record(id, name, value); return true; },
    });
  }
  return {
    context,
    createCanvas() {
      const id = ++canvases;
      const ctx = context(id);
      return { id, getContext: () => ctx };
    },
    get canvases() { return canvases; },
    finish(scene) {
      for (const time of [12, 18]) scene.draw(context('visible'), {
        width: 1000, height: 700, time, progress: 1, detail: 1, reducedMotion: false,
      });
      return hash.digest('hex');
    },
  };
}

test('incremental preparation yields to other tasks and produces identical cached and animated drawing', async () => {
  const sync = paintRecorder();
  const expected = sync.finish(createScene(sync));
  const incremental = paintRecorder();
  let clock = 0, yields = 0, ticks = 0;
  const heartbeat = setInterval(() => { ticks++; }, 0);
  let scene;
  try {
    scene = await prepareScene({
      createCanvas: incremental.createCanvas,
      now: () => (clock += 2),
      yieldControl: async () => { yields++; await new Promise(resolve => setImmediate(resolve)); },
    });
  } finally { clearInterval(heartbeat); }
  assert.ok(yields > 20, 'geometry is split across many turns, not just deferred once');
  assert.ok(ticks > 1, 'unrelated tasks run before preparation finishes');
  assert.equal(incremental.finish(scene), expected, 'cached body, fibers and moving particles are unchanged');
});

test('incremental preparation stops at cancellation without building the body or resolving a scene', async () => {
  const abort = new AbortController(), recorder = paintRecorder();
  let clock = 0, yields = 0;
  await assert.rejects(prepareScene({
    createCanvas: recorder.createCanvas, signal: abort.signal,
    now: () => (clock += 10),
    yieldControl: async () => { yields++; abort.abort(); },
  }), { name: 'AbortError' });
  assert.equal(yields, 1);
  assert.equal(recorder.canvases, 4, 'only glow sprites existed before cancellation');
  const stopped = new AbortController();
  stopped.abort();
  await assert.rejects(prepareScene({
    signal: stopped.signal, createCanvas() { assert.fail('cancelled work must not start'); },
  }), { name: 'AbortError' });
});

test('incremental first bitmap matches atomic painting while yielding during drawing', async () => {
  const offscreen = paintRecorder();
  const scene = createScene(offscreen);
  const atomic = paintRecorder(), incremental = paintRecorder();
  const frame = { width: 1000, height: 700, time: 12, progress: 1, detail: 1, reducedMotion: false };
  scene.draw(atomic.context('warm'), frame);
  let clock = 0, yields = 0;
  await scene.prepareFrame(incremental.context('warm'), frame, {
    now: () => (clock += 2), yieldControl: async () => { yields++; },
  });
  assert.ok(yields > 20, 'painting also yields rather than blocking after geometry is ready');
  // finish adds identical ordinary frames before hashing both command streams.
  assert.equal(incremental.finish(scene), atomic.finish(scene));
});

test('void strokes contain known points while table cells and chart gaps remain free', () => {
  const inside = [
    [166, 314], [147, 370], // Table row and column.
    [501, 284], [452, 354], [419, 340], // Function endpoints and crossbar.
    [771, 190], [833, 140], // Two different bars.
    [787.5, 541.5], [820, 531.5], // Ascending and descending chart strokes.
  ];
  for (const point of inside) assert.ok(voidDistance(...point) < 0, `stroke contains ${point}`);
  const outside = [[100, 357], [166, 327.5], [510, 351], [787, 185], [848, 150], [800, 560]];
  for (const point of outside) assert.ok(voidDistance(...point) > 0, `free space at ${point}`);
  for (const point of [[166, 307.5], [117.5, 314], [763, 180], [771, 165]]) {
    assert.ok(Math.abs(voidDistance(...point)) < 1e-9, `straight edge or rounded cap at ${point}`);
  }
});

test('vertical sections preserve table gaps, merge overlapping strokes and expand with clearance', () => {
  assert.deepEqual(voidIntervalsAtX(166), [
    [307.5, 320.5], [335.5, 348.5], [363.5, 376.5], [391.5, 404.5],
  ]);
  assert.deepEqual(voidIntervalsAtX(147), [[307.5, 404.5]], 'a column joins all four rows');
  assert.deepEqual(voidIntervalsAtX(166, 2), [
    [305.5, 322.5], [333.5, 350.5], [361.5, 378.5], [389.5, 406.5],
  ]);
  assert.deepEqual(voidIntervalsAtX(166, 8), [[299.5, 412.5]], 'clearance closes the narrow gaps');
  assert.deepEqual(voidIntervalsAtX(100), []);
  assert.deepEqual(voidIntervalsAtX(166, -4), voidIntervalsAtX(166), 'negative padding cannot erode a void');

  // Curved and diagonal sections also have real boundaries, ordered gaps and
  // occupied midpoints; no capsule-intersection formula is duplicated here.
  for (const x of [450, 490, 771, 802, 835, 850]) {
    const intervals = voidIntervalsAtX(x);
    assert.ok(intervals.length > 0);
    for (let i = 0; i < intervals.length; i++) {
      const [low, high] = intervals[i];
      assert.ok(low <= high);
      assert.ok(Math.abs(voidDistance(x, low)) < 1e-7);
      assert.ok(Math.abs(voidDistance(x, high)) < 1e-7);
      assert.ok(voidDistance(x, (low + high) / 2) <= 1e-7);
      if (i > 0) {
        assert.ok(intervals[i - 1][1] < low);
        assert.ok(voidDistance(x, (intervals[i - 1][1] + low) / 2) > 0);
      }
    }
  }
});

test('segments reject crossings, collinear overlap and tangency even when both endpoints are free', () => {
  const blocked = [
    [[166, 300], [166, 330]], // Across a horizontal table stroke.
    [[750, 190], [790, 190]], // Across a vertical bar.
    [[100, 314], [230, 314]], // Collinear with an entire table row.
    [[761, 165], [781, 165]], // Touches only the rounded bar cap.
    [[155, 307.5], [175, 307.5]], // Touches the straight capsule boundary.
  ];
  for (const [a, b] of blocked) {
    assert.equal(segmentAvoidsVoids(a, b), false, `blocked segment ${a} → ${b}`);
    assert.equal(segmentAvoidsVoids(b, a), false, 'classification is independent of direction');
  }
  assert.ok(voidDistance(761, 165) > 0 && voidDistance(781, 165) > 0, 'tangent segment endpoints are outside');
  assert.equal(segmentAvoidsVoids([155, 327.5], [175, 327.5]), true, 'a segment can travel inside a table cell');
  assert.equal(segmentAvoidsVoids([750, 164.9], [790, 164.9]), true, 'a segment just beyond a rounded cap stays free');
});

test('segment clearance includes exact contact and handles zero-length particles', () => {
  const a = [155, 302], b = [175, 302];
  assert.equal(segmentAvoidsVoids(a, b, 5.49), true);
  assert.equal(segmentAvoidsVoids(a, b, 5.5), false, 'exact clearance contact is excluded');
  assert.equal(segmentAvoidsVoids(a, b, 6), false);
  assert.equal(segmentAvoidsVoids(a, b, -10), true);
  assert.equal(segmentAvoidsVoids([166, 314], [166, 314]), false, 'point inside a stroke');
  assert.equal(segmentAvoidsVoids([166, 307.5], [166, 307.5]), false, 'point on a boundary');
  assert.equal(segmentAvoidsVoids([166, 327.5], [166, 327.5]), true, 'point inside a free cell');
  assert.equal(segmentAvoidsVoids([166, 302], [166, 302], 5.5), false, 'particle clearance also excludes contact');
});

test('sampled main flow advances in X and stays outside every glyph across routes and lanes', () => {
  for (let route = 0; route < FLOW_ROUTES.length; route++) {
    for (const lane of [-1, -.8, -.5, -.2, 0, .2, .5, .8, 1]) {
      let previousX = -Infinity;
      for (let step = 0; step <= 400; step++) {
        const point = sampleFlowPoint(route, step / 400, lane);
        assert.ok(point.every(Number.isFinite));
        assert.ok(point[0] > previousX, `route ${route}, lane ${lane} moves forward`);
        assert.ok(voidDistance(...point) >= 3.1, `main flow retains a visible gap at ${point}`);
        previousX = point[0];
      }
    }
  }
});

test('rendered main-flow fibers and particle tails still pass around voids without connecting across gaps', () => {
  const gradient = () => ({ addColorStop() {} });
  const offscreen = new Proxy({ createLinearGradient: gradient, createRadialGradient: gradient }, {
    get: (target, name) => target[name] ?? (() => {}),
  });
  const scene = createScene({ createCanvas: () => ({ getContext: () => offscreen }) });
  let previous = null, segments = 0, starts = 0;
  const ctx = new Proxy({
    lineWidth: 1,
    createLinearGradient: gradient,
    beginPath() { previous = null; },
    moveTo(x, y) { previous = [x, y]; starts++; },
    lineTo(x, y) {
      const next = [x, y];
      assert.ok(previous, 'every drawn segment has a start');
      assert.ok(next[0] >= previous[0], 'visible motion follows the forward flow');
      assert.equal(segmentAvoidsVoids(previous, next, this.lineWidth / 2), true,
        `the whole visible stroke stays clear: ${previous} → ${next}`);
      previous = next;
      segments++;
    },
  }, { get: (target, name) => target[name] ?? (() => {}) });
  scene.draw(ctx, { width: 1000, height: 700, time: 12, progress: 1,
    pointer: { x: 0, y: 0 }, reducedMotion: false, detail: .6 });
  assert.ok(segments > 1000, 'checks actual scene geometry rather than an empty renderer');
  assert.ok(starts > 100, 'independent contours can restart beyond a void');
});

test('sparse drift follows finite forward trajectories that enter and exit the glyph voids', () => {
  let crossedTrajectories = 0;
  for (let route = 0; route < FLOW_ROUTES.length; route++) {
    if (FLOW_ROUTES[route].input) continue;
    for (const time of [0, 12, 36]) {
      for (const lane of [-.9, -.45, 0, .45, .9]) {
        let previousX = -Infinity, entered = false, exited = false;
        for (let step = 0; step <= 400; step++) {
          const point = sampleDriftPoint(route, step / 400, lane, time);
          assert.ok(point.every(Number.isFinite));
          assert.ok(point[0] > previousX, `drift route ${route} moves forward at time ${time}`);
          const distance = voidDistance(...point);
          if (distance < 0) entered = true;
          else if (entered && distance > 0) exited = true;
          previousX = point[0];
        }
        if (entered && exited) crossedTrajectories++;
      }
    }
  }
  assert.ok(crossedTrajectories > 0, 'drift passes through a symbol rather than stopping inside or avoiding it');
});

test('painted particle circles include crossings inside glyphs as a clear minority', () => {
  const gradient = () => ({ addColorStop() {} });
  const offscreen = new Proxy({ createLinearGradient: gradient, createRadialGradient: gradient }, {
    get: (target, name) => target[name] ?? (() => {}),
  });
  const scene = createScene({ createCanvas: () => ({ getContext: () => offscreen }) });
  let pending = null, painted = 0, inside = 0;
  const ctx = new Proxy({
    globalAlpha: 1,
    createLinearGradient: gradient,
    beginPath() { pending = null; },
    arc(x, y, radius) {
      assert.ok([x, y, radius].every(Number.isFinite));
      assert.ok(radius > 0);
      pending = [x, y];
    },
    fill() {
      if (!pending || !(this.globalAlpha > 0)) return;
      painted++;
      if (voidDistance(...pending) < 0) inside++;
      pending = null;
    },
  }, { get: (target, name) => target[name] ?? (() => {}) });
  scene.draw(ctx, { width: 1000, height: 700, time: 12, progress: 1,
    pointer: { x: 0, y: 0 }, reducedMotion: false, detail: 1 });
  assert.ok(painted > 1000, 'measures populated scene output');
  assert.ok(inside > 0, 'some visible particle centers are actually inside the symbols');
  assert.ok(inside / painted < .03, 'crossing particles remain fewer than 3% of painted particle circles');
});
