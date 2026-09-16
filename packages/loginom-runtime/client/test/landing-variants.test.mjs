import test from 'node:test';
import assert from 'node:assert/strict';
import { mountVariant } from '../../landing/variants/engine.mjs';

function setup({ reduced = false, fine = true, context = 'available', factory, observerError = false, legacyReset = false } = {}) {
  class Element extends EventTarget {
    attributes = new Map();
    listeners = new Map();
    hidden = false;
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name); }
    removeAttribute(name) { this.attributes.delete(name); }
    toggleAttribute(name, value) { if (value) this.setAttribute(name, ''); else this.removeAttribute(name); }
    addEventListener(type, callback, options) {
      super.addEventListener(type, callback, options);
      this.listeners.set(callback, type);
    }
    removeEventListener(type, callback, options) {
      super.removeEventListener(type, callback, options);
      this.listeners.delete(callback);
    }
    click() { this.dispatchEvent(new Event('click')); }
  }
  const frames = [], resets = [], clears = [], transforms = [], calls = [];
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    reset() { resets.push(true); this.globalAlpha = 1; this.globalCompositeOperation = 'source-over'; },
    setTransform(...args) { transforms.push(args); },
    clearRect(...args) { clears.push(args); },
  };
  if (legacyReset) delete ctx.reset;
  let bitmapWidth = 0, bitmapResets = 0;
  const canvas = {
    get width() { return bitmapWidth; },
    set width(value) { bitmapWidth = value; bitmapResets++; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; },
    getContext() { if (context === 'throws') throw new Error('Canvas unavailable'); return context === 'null' ? null : ctx; },
  };
  const root = new Element(), pause = new Element(), replay = new Element(), controls = new Element();
  const doc = new Element(), win = new Element(), motion = new Element(), pointerMedia = new Element();
  controls.hidden = true;
  doc.hidden = false;
  motion.matches = reduced;
  pointerMedia.matches = fine;
  let rect = { width: 800, height: 600, left: 20, top: 10 };
  root.querySelector = selector => ({ canvas, '.flow-controls': controls,
    '[data-flow-pause]': pause, '[data-flow-replay]': replay })[selector];
  root.getBoundingClientRect = () => rect;
  doc.createElement = tag => { calls.push(tag); return { getContext: () => ctx }; };
  const callbacks = new Map();
  let id = 0, intersection, resize, disconnects = 0;
  Object.assign(win, {
    devicePixelRatio: 3,
    matchMedia: query => query.includes('reduced-motion') ? motion : pointerMedia,
    requestAnimationFrame(callback) { callbacks.set(++id, callback); return id; },
    cancelAnimationFrame(handle) { callbacks.delete(handle); },
    ResizeObserver: class {
      constructor(callback) { resize = callback; }
      observe() {}
      disconnect() { disconnects++; }
    },
    IntersectionObserver: class {
      constructor(callback) { intersection = callback; }
      observe() { if (observerError) throw new Error('observer setup failed'); }
      disconnect() { disconnects++; }
    },
  });
  const dispose = mountVariant(factory ?? (() => ({ draw(context, frame) {
    assert.equal(context.globalAlpha, 1, 'context opacity is reset before every scene draw');
    assert.equal(context.globalCompositeOperation, 'source-over');
    frames.push(frame);
    context.globalAlpha = .1;
    context.globalCompositeOperation = 'lighter';
  } })), root, win, doc);
  return {
    root, pause, replay, controls, canvas, ctx, frames, resets, clears, transforms, calls, dispose,
    get pending() { return callbacks.size; },
    get disconnects() { return disconnects; },
    get bitmapResets() { return bitmapResets; },
    get listeners() { return [root, pause, replay, doc, win, motion, pointerMedia].reduce((n, item) => n + item.listeners.size, 0); },
    frame(now) { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(now)); },
    visible(value) { intersection?.([{ target: root, isIntersecting: value }]); },
    hidden(value) { doc.hidden = value; doc.dispatchEvent(new Event('visibilitychange')); },
    reduce(value) { motion.matches = value; motion.dispatchEvent(new Event('change')); },
    fine(value) { pointerMedia.matches = value; pointerMedia.dispatchEvent(new Event('change')); },
    resize(values = {}) { rect = { ...rect, ...values }; resize?.(); },
    point(x, y, pointerType = 'mouse') { root.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: x, clientY: y, pointerType })); },
    leave() { root.dispatchEvent(new Event('pointerleave')); },
    cancel() { root.dispatchEvent(new Event('pointercancel')); },
    blur() { win.dispatchEvent(new Event('blur')); },
  };
}

test('variant time advances only during visible animation and resumes one loop without catching up', () => {
  const s = setup();
  assert.equal(s.pending, 0);
  s.visible(true);
  s.visible(true);
  assert.equal(s.pending, 1);
  s.frame(0);
  s.frame(1000);
  assert.equal(s.frames.at(-1).time, 1);
  s.hidden(true);
  assert.equal(s.pending, 0);
  s.frame(10000);
  s.hidden(false);
  s.frame(20000);
  assert.equal(s.frames.at(-1).time, 1);
  s.visible(false);
  assert.equal(s.pending, 0);
  s.visible(true);
  s.frame(40000);
  s.frame(40100);
  assert.ok(Math.abs(s.frames.at(-1).time - 1.1) < 1e-9);
  s.dispose();
});

test('native pause and replay clicks preserve manual intent across visibility and motion changes', () => {
  const s = setup();
  s.visible(true);
  s.frame(0);
  s.frame(1000);
  s.pause.click();
  assert.equal(s.pause.getAttribute('aria-pressed'), 'true');
  assert.equal(s.pause.getAttribute('aria-label'), 'Продолжить анимацию');
  s.visible(false);
  s.visible(true);
  s.hidden(true);
  s.hidden(false);
  s.reduce(true);
  s.reduce(false);
  assert.equal(s.pending, 0);
  s.replay.click();
  assert.equal(s.pending, 1);
  assert.equal(s.pause.getAttribute('aria-pressed'), 'false');
  assert.equal(s.pause.getAttribute('aria-label'), 'Приостановить анимацию');
  assert.equal(s.frames.at(-1).time, 0);
  assert.equal(s.frames.at(-1).progress, 0);
  assert.equal([...s.pause.listeners.values()].includes('keydown'), false, 'native keyboard activation is not duplicated');
  s.dispose();
});

test('reduced motion renders a complete still with no RAF and follows preference changes', () => {
  const s = setup({ reduced: true });
  s.visible(true);
  assert.equal(s.pending, 0);
  assert.equal(s.controls.hidden, true);
  assert.equal(s.frames.at(-1).time, 12);
  assert.equal(s.frames.at(-1).progress, 1);
  assert.equal(s.frames.at(-1).interaction, null);
  assert.equal(s.root.getAttribute('data-rendered'), '');
  s.reduce(false);
  assert.equal(s.controls.hidden, false);
  assert.equal(s.pending, 1);
  assert.equal(s.frames.at(-1).progress, 1);
  s.reduce(true);
  assert.equal(s.pending, 0);
  s.dispose();
});

test('variant caps DPR and animation at 30fps, eases entrance and lowers detail on narrow canvases', () => {
  const s = setup();
  assert.equal(s.canvas.width, 1200);
  assert.equal(s.canvas.height, 900);
  assert.deepEqual(s.transforms.at(-1), [1.5, 0, 0, 1.5, 0, 0]);
  s.visible(true);
  s.frame(0);
  const draws = s.frames.length;
  s.frame(16);
  s.frame(33);
  assert.equal(s.frames.length, draws);
  s.frame(34);
  assert.equal(s.frames.length, draws + 1);
  s.frame(1300);
  assert.ok(Math.abs(s.frames.at(-1).progress - .875) < 1e-9);
  s.frame(2600);
  assert.equal(s.frames.at(-1).progress, 1);
  s.resize({ width: 599 });
  assert.equal(s.frames.at(-1).detail, .6);
  assert.equal(s.pending, 1);
  assert.equal(s.resets.length, s.frames.length);
  assert.equal(s.clears.length, s.frames.length);
  s.resize({ width: 600 });
  assert.equal(s.frames.at(-1).detail, 1);
  s.dispose();
});

const displacement = (s, x = 350, y = 300) => {
  const point = s.frames.at(-1).interaction?.sample(x, y) ?? { x: 0, y: 0 };
  return Math.hypot(point.x, point.y);
};

function excite(s, start = 0, pointerType = 'mouse') {
  for (let i = 1; i <= 8; i++) {
    // Client coordinates include the element's left/top offset (20, 10).
    s.point(412 + i, 310, pointerType);
    s.frame(start + i * 34);
  }
}

test('fine mouse and pen movement attracts nearby particles in element coordinates; touch cannot activate it', () => {
  for (const pointerType of ['mouse', 'pen', 'touch']) {
    const s = setup();
    s.visible(true);
    s.frame(0);
    excite(s, 0, pointerType);
    const offset = s.frames.at(-1).interaction.sample(350, 300);
    if (pointerType === 'touch') assert.deepEqual(offset, { x: 0, y: 0 });
    else {
      assert.ok(offset.x > .5, `${pointerType} attracts toward the cursor`);
      assert.ok(Math.abs(offset.y) < .01, 'client position is converted to element coordinates');
      assert.deepEqual(s.frames.at(-1).interaction.sample(20, 20), { x: 0, y: 0 }, 'remote scene does not rotate');
    }
    s.dispose();
  }
  const s = setup({ fine: false });
  s.visible(true);
  s.frame(0);
  excite(s);
  assert.equal(displacement(s), 0, 'coarse pointer preference disables attraction');
  s.fine(true);
  excite(s, 272);
  assert.ok(displacement(s) > .5);
  s.fine(false);
  assert.equal(displacement(s), 0, 'losing fine-pointer support clears the field');
  s.dispose();
});

test('pointerleave releases locally and settles without attracting particles toward the canvas center', () => {
  const s = setup();
  s.visible(true);
  s.frame(0);
  excite(s);
  const before = displacement(s);
  assert.ok(before > .5);
  s.leave();
  assert.equal(displacement(s), before, 'leave does not snap the particles');
  for (let i = 1; i <= 90; i++) s.frame(272 + i * 34);
  assert.ok(displacement(s) < .25, 'the stream recovers after release');
  assert.deepEqual(s.frames.at(-1).interaction.sample(20, 20), { x: 0, y: 0 });
  s.dispose();
});

test('pause freezes the local deformation and pointer input cannot start another animation loop', () => {
  const s = setup();
  s.visible(true);
  s.frame(0);
  excite(s);
  const before = displacement(s), count = s.frames.length;
  s.pause.click();
  assert.equal(s.pending, 0);
  s.point(770, 550);
  s.frame(10000);
  assert.equal(s.pending, 0);
  assert.equal(s.frames.length, count);
  assert.equal(displacement(s), before, 'paused geometry remains unchanged');
  s.pause.click();
  assert.equal(s.pending, 1);
  s.frame(11000);
  assert.equal(displacement(s), 0, 'resuming starts without a stale cursor');
  assert.equal(s.frames.at(-1).time, .272, 'resuming does not catch up paused time');
  s.dispose();
});

test('cancel, blur, hidden tab, offscreen, replay, resize and reduced motion clear stale attraction', () => {
  for (const [name, clear] of [
    ['cancel', s => s.cancel()], ['blur', s => s.blur()],
    ['hidden tab', s => s.hidden(true)], ['offscreen', s => s.visible(false)],
    ['replay', s => s.replay.click()], ['resize', s => s.resize({ width: 900 })],
    ['reduced motion', s => s.reduce(true)],
  ]) {
    const s = setup();
    s.visible(true);
    s.frame(0);
    excite(s);
    assert.ok(displacement(s) > .5, `${name}: field was active before reset`);
    clear(s);
    assert.equal(displacement(s), 0, `${name}: no stale displacement remains`);
    if (name === 'reduced motion') assert.equal(s.frames.at(-1).interaction, null);
    s.dispose();
  }
});

test('disposal removes all subscriptions, cancels animation and ignores queued observer deliveries', () => {
  const s = setup();
  s.visible(true);
  assert.ok(s.listeners > 0);
  s.dispose();
  s.dispose();
  assert.equal(s.listeners, 0);
  assert.equal(s.disconnects, 2);
  assert.equal(s.pending, 0);
  assert.equal(s.controls.hidden, true);
  const count = s.frames.length;
  s.resize();
  s.visible(true);
  s.replay.click();
  s.pause.click();
  s.reduce(true);
  s.hidden(false);
  s.frame(10000);
  assert.equal(s.frames.length, count);
  assert.equal(s.pending, 0);
});

test('setup and draw errors preserve fallback without scheduling or leaking handlers', () => {
  for (const options of [
    { context: 'null' }, { context: 'throws' },
    { factory: () => { throw new Error('scene setup failed'); } },
    { factory: () => ({}) },
    { factory: () => ({ draw() { throw new Error('scene draw failed'); } }) },
    { observerError: true },
  ]) {
    const s = setup(options);
    assert.equal(s.root.getAttribute('data-rendered'), undefined);
    assert.equal(s.controls.hidden, true);
    assert.equal(s.pending, 0);
    assert.equal(s.listeners, 0);
    s.dispose();
  }
  assert.doesNotThrow(() => mountVariant(() => {}, null, {}, {}));
});

test('a later renderer failure restores fallback and cancels the active loop', () => {
  let draws = 0;
  const s = setup({ factory: () => ({ draw() { if (++draws > 1) throw new Error('failed after setup'); } }) });
  assert.equal(s.root.getAttribute('data-rendered'), '');
  s.visible(true);
  s.frame(0);
  assert.equal(s.root.getAttribute('data-rendered'), undefined);
  assert.equal(s.controls.hidden, true);
  assert.equal(s.pending, 0);
  assert.equal(s.listeners, 0);
  assert.equal(s.disconnects, 2);
});

test('scene canvas factory uses the injected document, and older Canvas state resets via bitmap width', () => {
  let sprite;
  const s = setup({ factory: ({ createCanvas }) => {
    sprite = createCanvas();
    return { draw() {} };
  } });
  assert.ok(sprite);
  assert.deepEqual(s.calls, ['canvas']);
  s.dispose();
  const legacy = setup({ legacyReset: true });
  legacy.visible(true);
  legacy.frame(0);
  legacy.frame(34);
  assert.equal(legacy.frames.length, 3);
  assert.ok(legacy.bitmapResets >= legacy.frames.length);
  legacy.dispose();
});
