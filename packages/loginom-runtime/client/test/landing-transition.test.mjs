import test from 'node:test';
import assert from 'node:assert/strict';
import { mountVariant } from '../../landing/variants/engine.mjs';

function setup({ reduced = false } = {}) {
  class Element extends EventTarget {
    attributes = new Map();
    hidden = false;
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key); }
    removeAttribute(key) { this.attributes.delete(key); }
    toggleAttribute(key, enabled) { if (enabled) this.setAttribute(key, ''); else this.removeAttribute(key); }
    click() { this.dispatchEvent(new Event('click')); }
  }
  const bitmaps = [], frames = [], callbacks = new Map();
  let nextId = 0, intersection, resizeObserver, unavailable = false;
  function bitmap() {
    const image = { width: 0, height: 0, color: [0, 0, 0, 0] };
    const context = {
      globalAlpha: 1, globalCompositeOperation: 'source-over',
      reset() { this.globalAlpha = 1; this.globalCompositeOperation = 'source-over'; },
      setTransform() {},
      clearRect() { image.color = [0, 0, 0, 0]; },
      paint(color) { image.color = color; },
      drawImage(source) {
        const incoming = source.color.map(channel => channel * this.globalAlpha);
        const retention = this.globalCompositeOperation === 'lighter' ? 1 : 1 - incoming[3];
        image.color = incoming.map((channel, index) => channel + image.color[index] * retention);
      },
    };
    image.getContext = () => unavailable ? null : context;
    image.context = context;
    bitmaps.push(image);
    return image;
  }
  const canvas = bitmap(), root = new Element(), controls = new Element();
  const pause = new Element(), replay = new Element(), next = new Element(), win = new Element(), doc = new Element();
  const motion = new Element(), fine = new Element();
  motion.matches = reduced;
  fine.matches = true;
  doc.hidden = false;
  let rect = { width: 800, height: 600, left: 0, top: 0 };
  root.querySelector = selector => ({ canvas, '.flow-controls': controls,
    '[data-flow-pause]': pause, '[data-flow-replay]': replay, '[data-flow-next]': next })[selector];
  root.getBoundingClientRect = () => rect;
  doc.createElement = () => bitmap();
  Object.assign(win, {
    devicePixelRatio: 2,
    matchMedia: query => query.includes('reduced-motion') ? motion : fine,
    requestAnimationFrame(callback) { callbacks.set(++nextId, callback); return nextId; },
    cancelAnimationFrame(id) { callbacks.delete(id); },
    ResizeObserver: class {
      constructor(callback) { resizeObserver = callback; }
      observe() {}
      disconnect() {}
    },
    IntersectionObserver: class {
      constructor(callback) { intersection = callback; }
      observe() {}
      disconnect() {}
    },
  });
  const factory = (name, color) => () => ({ draw(context, frame) {
    assert.equal(context.globalAlpha, 1);
    assert.equal(context.globalCompositeOperation, 'source-over');
    context.paint(color);
    frames.push({ name, frame });
    // All real variants change context state; the compositor must isolate it.
    context.globalAlpha = .01;
    context.globalCompositeOperation = 'multiply';
  } });
  const dispose = mountVariant(factory('old', [1, 0, 0, 1]), root, win, doc);
  return {
    dispose, root, controls, pause, replay, next, canvas, bitmaps, frames, factory,
    get pending() { return callbacks.size; },
    frame(now) { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(now)); },
    visible(value) { intersection([{ target: root, isIntersecting: value }]); },
    hidden(value) { doc.hidden = value; doc.dispatchEvent(new Event('visibilitychange')); },
    reduce(value) { motion.matches = value; motion.dispatchEvent(new Event('change')); },
    resize(values) { rect = { ...rect, ...values }; resizeObserver(); },
    unavailable(value) { unavailable = value; },
    prepare(name = 'next', color = [0, 1, 0, 1]) { return dispose.prepareScene(factory(name, color)); },
  };
}

test('preparation warms a complete scene at capped pixel dimensions without touching the visible image', () => {
  const s = setup();
  s.visible(true);
  s.frame(0);
  const image = [...s.canvas.color], pending = s.pending;
  const token = s.prepare();
  assert.ok(token);
  assert.deepEqual(s.canvas.color, image);
  assert.equal(s.pending, pending);
  assert.equal(s.bitmaps.at(-1).width, 1200);
  assert.equal(s.bitmaps.at(-1).height, 900);
  const warm = s.frames.at(-1);
  assert.equal(warm.name, 'next');
  assert.equal(warm.frame.time, 12);
  assert.equal(warm.frame.progress, 1);
  assert.equal(warm.frame.interaction, null);
  s.frame(34);
  assert.equal(s.frames.at(-1).name, 'old');
  s.dispose();
});

test('preparation failures propagate and preserve the active scene and animation loop', () => {
  const s = setup();
  s.visible(true);
  assert.throws(() => s.dispose.prepareScene(() => { throw new Error('factory failed'); }), /factory failed/);
  assert.throws(() => s.dispose.prepareScene(() => ({})), /draw/);
  assert.throws(() => s.dispose.prepareScene(() => ({ draw() { throw new Error('warm failed'); } })), /warm failed/);
  s.unavailable(true);
  assert.throws(() => s.prepare(), /Canvas 2D/);
  s.unavailable(false);
  assert.deepEqual(s.canvas.color, [1, 0, 0, 1]);
  s.frame(0);
  s.frame(34);
  assert.equal(s.frames.at(-1).name, 'old');
  assert.equal(s.pending, 1);
  s.dispose();
});

test('async preparation keeps the current renderer running and uses the latest viewport', async () => {
  const s = setup();
  s.visible(true);
  let ready;
  const preparing = s.dispose.prepareScene(() => new Promise(resolve => { ready = resolve; }));
  s.frame(0);
  s.frame(34);
  assert.equal(s.frames.at(-1).name, 'old');
  assert.equal(s.pending, 1);
  s.resize({ width: 400, height: 300 });
  ready(s.factory('async', [0, 1, 0, 1])());
  const token = await preparing;
  assert.equal(s.bitmaps.at(-1).width, 600);
  assert.equal(s.frames.at(-1).frame.detail, .6);
  s.reduce(true);
  assert.equal(await s.dispose.transitionTo(token), true);
  assert.deepEqual(s.canvas.color, [0, 1, 0, 1]);
  s.dispose();
});

test('disposal aborts async preparation and ignores a factory that resolves after cancellation', async () => {
  const s = setup();
  let ready, signal;
  const preparing = s.dispose.prepareScene(options => {
    signal = options.signal;
    return new Promise(resolve => { ready = resolve; });
  });
  s.dispose();
  assert.equal(signal.aborted, true);
  const allocations = s.bitmaps.length;
  ready({ draw() { assert.fail('a late scene must not draw'); } });
  assert.equal(await preparing, null);
  assert.equal(s.bitmaps.length, allocations);
  assert.equal(s.pending, 0);
});

test('async preparation rejection preserves the current scene and allows retry', async () => {
  const s = setup();
  s.visible(true);
  await assert.rejects(s.dispose.prepareScene(async () => { throw new Error('async failure'); }), /async failure/);
  s.frame(0);
  assert.equal(s.frames.at(-1).name, 'old');
  assert.equal(s.pending, 1);
  assert.ok(await s.dispose.prepareScene(async () => s.factory('retry', [0, 1, 0, 1])()));
  s.dispose();
});

test('incremental bitmap preparation stays invisible until complete and releases cancelled surfaces', async () => {
  for (const cancel of [false, true]) {
    const s = setup({ reduced: true });
    let finish, signal;
    const preparing = s.dispose.prepareScene(() => ({
      draw() { assert.fail('warmup must use incremental painting'); },
      prepareFrame(context, frame, options) {
        signal = options.signal;
        assert.equal(frame.progress, 1);
        context.paint([0, 1, 0, 1]);
        return new Promise(resolve => { finish = resolve; });
      },
    }));
    assert.deepEqual(s.canvas.color, [1, 0, 0, 1], 'partial bitmap is never presented');
    if (cancel) s.dispose();
    finish();
    const token = await preparing;
    if (cancel) {
      assert.equal(signal.aborted, true);
      assert.equal(token, null);
      assert.equal(s.bitmaps.at(-1).width, 1);
    } else {
      assert.equal(await s.dispose.transitionTo(token), true);
      assert.deepEqual(s.canvas.color, [0, 1, 0, 1]);
      s.dispose();
    }
  }
});

test('crossfade interpolates both images without a blank frame and animates only the incoming scene', async () => {
  const s = setup();
  s.visible(true);
  s.frame(0);
  const token = s.prepare();
  const outgoingDraws = s.frames.filter(item => item.name === 'old').length;
  const done = s.dispose.transitionTo(token);
  assert.deepEqual(s.canvas.color, [1, 0, 0, 1], 'the first fade frame exactly preserves the previous image');
  assert.equal(s.pending, 1);
  s.frame(100);
  s.frame(450);
  assert.deepEqual(s.canvas.color, [.5, .5, 0, 1], 'equal weights preserve brightness even when renderers change opacity');
  assert.ok(s.frames.at(-1).frame.time > 12);
  assert.equal(s.frames.at(-1).frame.progress, 1);
  s.frame(800);
  assert.equal(await done, true);
  assert.deepEqual(s.canvas.color, [0, 1, 0, 1]);
  assert.equal(s.frames.filter(item => item.name === 'old').length, outgoingDraws);
  assert.ok(s.bitmaps.slice(1).every(image => image.width === 1 && image.height === 1), 'temporary transition bitmaps released');
  assert.equal(await s.dispose.transitionTo(token), false, 'tokens cannot be consumed twice');
  s.frame(834);
  assert.equal(s.frames.at(-1).name, 'next');
  assert.equal(s.pending, 1);
  s.dispose();
});

test('paused particles remain frozen through a fade and resume only when explicitly unpaused', async () => {
  const s = setup();
  s.visible(true);
  s.pause.click();
  const token = s.prepare();
  const warmDraws = s.frames.length;
  const done = s.dispose.transitionTo(token);
  assert.equal(s.pause.getAttribute('aria-pressed'), 'true');
  assert.equal(s.pending, 1, 'the fade itself can run while particle simulation is paused');
  s.frame(0);
  s.frame(350);
  assert.deepEqual(s.canvas.color, [.5, .5, 0, 1]);
  assert.equal(s.frames.length, warmDraws, 'crossfade reuses the warmed still');
  s.frame(700);
  assert.equal(await done, true);
  assert.equal(s.pending, 0);
  assert.equal(s.pause.getAttribute('aria-pressed'), 'true');
  s.pause.click();
  s.frame(1000);
  assert.equal(s.frames.at(-1).name, 'next');
  assert.equal(s.frames.at(-1).frame.time, 12);
  s.dispose();
});

test('reduced motion switches a complete still immediately without scheduling animation', async () => {
  const s = setup({ reduced: true });
  s.visible(true);
  assert.equal(await s.dispose.transitionTo(s.prepare()), true);
  assert.deepEqual(s.canvas.color, [0, 1, 0, 1]);
  assert.equal(s.pending, 0);
  assert.equal(s.controls.hidden, true);
  assert.equal(s.frames.at(-1).frame.reducedMotion, true);
  s.reduce(false);
  s.frame(0);
  assert.equal(s.frames.at(-1).frame.progress, 1);
  s.dispose();
});

test('a resize after prewarming refreshes caches for the current width and detail', async () => {
  const s = setup();
  s.visible(true);
  const token = s.prepare();
  s.resize({ width: 450, height: 500 });
  const done = s.dispose.transitionTo(token);
  const warm = s.frames.at(-1).frame;
  assert.equal(warm.width, 450);
  assert.equal(warm.height, 500);
  assert.equal(warm.detail, .6);
  assert.equal(warm.progress, 1);
  assert.equal(warm.time, 12);
  s.frame(0);
  s.frame(700);
  assert.equal(await done, true);
  s.dispose();
});

test('hidden, offscreen, zero-size and reduced-motion changes settle a pending fade and leave no RAF', async () => {
  for (const settle of [s => s.hidden(true), s => s.visible(false), s => s.resize({ width: 0 }), s => s.reduce(true)]) {
    const s = setup();
    s.visible(true);
    const done = s.dispose.transitionTo(s.prepare());
    s.frame(0);
    s.frame(200);
    settle(s);
    assert.equal(await done, true);
    assert.equal(s.pending, 0);
    s.visible(true);
    s.hidden(false);
    s.resize({ width: 800 });
    s.reduce(false);
    assert.equal(s.pending, 1);
    s.frame(10000);
    assert.equal(s.frames.at(-1).name, 'next');
    assert.ok(s.frames.at(-1).frame.time < 13, 'resuming does not catch up hidden time');
    s.dispose();
  }
});

test('switching while already hidden or offscreen takes effect without starting a frame loop', async () => {
  for (const makeHidden of [s => s.visible(false), s => { s.visible(true); s.hidden(true); }]) {
    const s = setup();
    makeHidden(s);
    assert.equal(await s.dispose.transitionTo(s.prepare()), true);
    assert.deepEqual(s.canvas.color, [0, 1, 0, 1]);
    assert.equal(s.pending, 0);
    s.dispose();
  }
});

test('a concurrent transition is rejected without consuming its token or starting duplicate frame loops', async () => {
  const s = setup();
  s.visible(true);
  const first = s.prepare('next'), second = s.prepare('third', [0, 0, 1, 1]);
  const firstDone = s.dispose.transitionTo(first);
  assert.equal(await s.dispose.transitionTo(second), false);
  assert.equal(s.pending, 1);
  s.frame(0);
  s.frame(700);
  assert.equal(await firstDone, true);
  const secondDone = s.dispose.transitionTo(second);
  s.frame(800);
  s.frame(1500);
  assert.equal(await secondDone, true);
  assert.deepEqual(s.canvas.color, [0, 0, 1, 1]);
  s.dispose();
});

test('snapshot failure preserves the old renderer and leaves the prepared token available for retry', async () => {
  const s = setup();
  s.visible(true);
  const token = s.prepare();
  s.unavailable(true);
  assert.equal(await s.dispose.transitionTo(token), false);
  assert.deepEqual(s.canvas.color, [1, 0, 0, 1]);
  s.frame(0);
  assert.equal(s.frames.at(-1).name, 'old');
  s.unavailable(false);
  const done = s.dispose.transitionTo(token);
  s.frame(100);
  s.frame(800);
  assert.equal(await done, true);
  s.dispose();
});

test('disposal resolves a pending transition unsuccessfully and prevents all subsequent work', async () => {
  const s = setup();
  s.visible(true);
  const token = s.prepare();
  const done = s.dispose.transitionTo(token);
  s.frame(0);
  s.frame(200);
  s.dispose();
  assert.equal(await done, false);
  assert.equal(s.pending, 0);
  assert.equal(s.controls.hidden, true);
  assert.equal(s.next.hidden, true);
  assert.equal(s.root.getAttribute('data-rendered'), undefined);
  const draws = s.frames.length;
  assert.equal(s.prepare(), null);
  assert.equal(await s.dispose.transitionTo(token), false);
  assert.equal(await s.dispose.transitionTo({}), false);
  s.frame(1000);
  s.visible(true);
  s.resize({ width: 400 });
  s.pause.click();
  assert.equal(s.pending, 0);
  assert.equal(s.frames.length, draws);
});

test('an incoming draw failure ends the transition and hides the clickable control', async () => {
  const s = setup();
  s.visible(true);
  let draws = 0;
  const token = s.dispose.prepareScene(() => ({ draw() {
    if (++draws > 1) throw new Error('runtime rendering failed');
  } }));
  const done = s.dispose.transitionTo(token);
  s.frame(0);
  assert.equal(await done, false);
  assert.equal(s.pending, 0);
  assert.equal(s.next.hidden, true);
  assert.equal(s.root.getAttribute('data-rendered'), undefined);
  assert.equal(s.prepare(), null);
});

test('a bitmap failure while settling hidden content resolves and disposes without a dangling transition', async () => {
  const s = setup();
  s.visible(true);
  const done = s.dispose.transitionTo(s.prepare());
  s.canvas.context.drawImage = () => { throw new Error('lost canvas'); };
  s.hidden(true);
  assert.equal(await done, false);
  assert.equal(s.pending, 0);
  assert.equal(s.next.hidden, true);
  assert.equal(s.prepare(), null);
});
