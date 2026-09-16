import test from 'node:test';
import assert from 'node:assert/strict';
import { HERO_VARIANTS, HERO_STORAGE_KEY, selectNextVariant } from '../../../../apps/loginom-site/hero-selection.mjs';
import { mountHeroCycle } from '../../../../apps/loginom-site/hero-cycle.mjs';

function storageFor(backing = new Map()) {
  const reads = [], writes = [];
  return {
    backing, reads, writes,
    getItem(key) { reads.push(key); return backing.get(key) ?? null; },
    setItem(key, value) { writes.push([key, value]); backing.set(key, value); },
  };
}

function pageFixture({ storage = storageFor(), reduced = false, nextButton = false } = {}) {
  class Element extends EventTarget {
    attributes = new Map();
    hidden = false;
    disabled = false;
    textContent = '';
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    hasAttribute(name) { return this.attributes.has(name); }
    toggleAttribute(name, value) { if (value) this.setAttribute(name, ''); else this.removeAttribute(name); }
    click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
    get dataset() {
      const attribute = key => `data-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
      return new Proxy({}, {
        get: (_, key) => this.getAttribute(attribute(key)) ?? undefined,
        set: (_, key, value) => { this.setAttribute(attribute(key), value); return true; },
      });
    }
  }
  const root = new Element(), body = new Element(), poster = new Element(), description = new Element();
  const controls = new Element(), pause = new Element(), replay = new Element(), canvas = new Element();
  const next = nextButton ? new Element() : null;
  if (next) next.hidden = true;
  const motion = new Element(), pointer = new Element(), doc = new Element(), win = new Element();
  motion.matches = reduced;
  pointer.matches = true;
  controls.hidden = true;
  const context = { reset() {}, setTransform() {}, clearRect() {} };
  canvas.getContext = () => context;
  root.getBoundingClientRect = () => ({ width: 900, height: 630, left: 0, top: 0 });
  root.querySelector = selector => ({
    '.data-flow-fallback': poster, '.sr-only': description, canvas,
    '.flow-controls': controls, '[data-flow-pause]': pause, '[data-flow-replay]': replay,
    '[data-flow-next]': next,
  })[selector] ?? null;
  doc.body = body;
  doc.hidden = false;
  doc.querySelector = selector => selector === '[data-flow]' ? root : null;
  doc.createElement = () => ({ getContext: () => context });
  const pending = new Map(), idle = new Map(), timers = new Map();
  let nextFrame = 0;
  Object.assign(win, {
    localStorage: storage, innerHeight: 720, devicePixelRatio: 1,
    matchMedia: query => query.includes('reduced-motion') ? motion : pointer,
    requestAnimationFrame(callback) { pending.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { pending.delete(id); },
    requestIdleCallback(callback) { idle.set(++nextFrame, callback); return nextFrame; },
    cancelIdleCallback(id) { idle.delete(id); },
    setTimeout(callback) { timers.set(++nextFrame, callback); return nextFrame; },
    clearTimeout(id) { timers.delete(id); },
  });
  return {
    root, body, poster, description, controls, pause, replay, next, canvas, doc, win, storage,
    frame(now) { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(now)); },
    idle() {
      const callbacks = [...idle.values()]; idle.clear();
      callbacks.forEach(callback => callback({ didTimeout: false, timeRemaining: () => 50 }));
    },
    timers() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); },
    get pendingFrames() { return pending.size; },
    get pendingIdle() { return idle.size; },
    get pendingTimers() { return timers.size; },
  };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function sceneModule(id) {
  const createScene = () => ({ id });
  createScene.id = id;
  return { createScene };
}

function clickFixture(options = {}) {
  const p = pageFixture({ ...options, nextButton: true });
  const loaded = [], prepared = [], transitions = [];
  const behavior = {
    load: async id => sceneModule(id),
    prepare: factory => ({ id: factory.id }),
    transition: async () => true,
  };
  let disposed = 0;
  const engine = Object.assign(() => { disposed++; }, {
    prepareScene(factory) {
      const result = behavior.prepare(factory);
      prepared.push(result);
      return result;
    },
    transitionTo(scene) { transitions.push(scene); return behavior.transition(scene); },
  });
  const mountOptions = {
    async loadScene(id) { loaded.push(id); return behavior.load(id); },
    mountScene: () => { p.root.setAttribute('data-rendered', ''); return engine; },
  };
  return {
    ...p, loaded, prepared, transitions, behavior, mountOptions,
    mount: () => mountHeroCycle(p.root, p.win, p.doc, mountOptions),
    get disposed() { return disposed; },
    get pendingIdle() { return p.pendingIdle; },
    get pendingTimers() { return p.pendingTimers; },
  };
}

test('initial scene awaits incremental preparation before mounting its renderer', async () => {
  const p = pageFixture();
  const ready = deferred();
  let mounted = false;
  const scene = { draw() {} };
  const mounting = mountHeroCycle(p.root, p.win, p.doc, {
    loadScene: async () => ({
      createScene() { assert.fail('must not rebuild synchronously'); },
      prepareScene: () => ready.promise,
    }),
    mountScene(factory) {
      assert.equal(factory(), scene);
      mounted = true;
      return () => {};
    },
  });
  await settle();
  assert.equal(mounted, false);
  assert.equal(p.root.hasAttribute('data-rendered'), false);
  assert.equal(p.poster.getAttribute('src'), '/variants/clouds-poster.jpg');
  ready.resolve(scene);
  const dispose = await mounting;
  assert.equal(mounted, true);
  dispose();
});

test('warmup and a click share the incremental factory and wait before advancing storage', async () => {
  const s = clickFixture();
  const ready = deferred();
  let preparations = 0;
  s.behavior.load = async id => id === 'clouds' ? sceneModule(id) : ({
    createScene() { assert.fail('must not use the blocking factory'); },
    prepareScene() { preparations++; return ready.promise; },
  });
  s.behavior.prepare = factory => factory({});
  const dispose = await s.mount();
  s.idle();
  await settle();
  s.next.click();
  await settle();
  assert.equal(preparations, 1);
  assert.equal(s.transitions.length, 0);
  assert.equal(s.storage.backing.get(HERO_STORAGE_KEY), 'glyphs');
  ready.resolve({ id: 'glyphs' });
  await settle();
  assert.equal(s.transitions.length, 1);
  assert.equal(s.root.getAttribute('data-variant'), 'glyphs');
  assert.equal(s.storage.backing.get(HERO_STORAGE_KEY), 'ribbons');
  dispose();
});

test('hero rotation starts with clouds and keeps the agreed four-variant order', () => {
  assert.deepEqual(HERO_VARIANTS, ['clouds', 'glyphs', 'ribbons', 'voids']);
  assert.equal(HERO_STORAGE_KEY, 'loginom-dock.hero.next-variant.v1');
  const storage = storageFor();
  const shown = Array.from({ length: 13 }, () => selectNextVariant(storage));
  assert.deepEqual(shown, [
    'clouds', 'glyphs', 'ribbons', 'voids',
    'clouds', 'glyphs', 'ribbons', 'voids',
    'clouds', 'glyphs', 'ribbons', 'voids', 'clouds',
  ]);
  assert.equal(storage.backing.get(HERO_STORAGE_KEY), 'glyphs');
});

test('the next hero survives new page storage wrappers and touches only its own key', () => {
  const backing = new Map([['unrelated-setting', 'preserve me']]);
  const firstPage = storageFor(backing);
  assert.equal(selectNextVariant(firstPage), 'clouds');
  assert.deepEqual(firstPage.reads, [HERO_STORAGE_KEY]);
  assert.deepEqual(firstPage.writes, [[HERO_STORAGE_KEY, 'glyphs']]);

  const nextPage = storageFor(backing);
  assert.equal(selectNextVariant(nextPage), 'glyphs');
  assert.deepEqual(nextPage.reads, [HERO_STORAGE_KEY]);
  assert.deepEqual(nextPage.writes, [[HERO_STORAGE_KEY, 'ribbons']]);
  assert.deepEqual([...backing], [
    ['unrelated-setting', 'preserve me'], [HERO_STORAGE_KEY, 'ribbons'],
  ]);
});

test('each persisted variant is the next selection, including wraparound after voids', () => {
  for (const [current, next] of [
    ['clouds', 'glyphs'], ['glyphs', 'ribbons'], ['ribbons', 'voids'], ['voids', 'clouds'],
  ]) {
    const storage = storageFor(new Map([[HERO_STORAGE_KEY, current]]));
    assert.equal(selectNextVariant(storage), current);
    assert.deepEqual(storage.writes, [[HERO_STORAGE_KEY, next]]);
  }
});

test('missing or malformed stored IDs restart deterministically and heal the saved next ID', () => {
  for (const value of [null, '', '0', '1', '4', '-1', 'NaN', 'undefined', 'null',
    'clouds ', ' glyphs', 'GLYPHS', 'workflow', '["clouds"]', '{"next":"voids"}', '__proto__']) {
    const storage = storageFor(value === null ? new Map() : new Map([[HERO_STORAGE_KEY, value]]));
    assert.equal(selectNextVariant(storage), 'clouds', `invalid value ${JSON.stringify(value)}`);
    assert.deepEqual(storage.writes, [[HERO_STORAGE_KEY, 'glyphs']]);
  }
});

test('unavailable storage still selects the first scene without throwing', () => {
  assert.equal(selectNextVariant(undefined), 'clouds');
  assert.equal(selectNextVariant(null), 'clouds');
  const writes = [];
  assert.equal(selectNextVariant({
    getItem() { throw new DOMException('Storage is disabled', 'SecurityError'); },
    setItem(key, value) { writes.push([key, value]); },
  }), 'clouds');
  assert.deepEqual(writes, [[HERO_STORAGE_KEY, 'glyphs']]);
  assert.equal(selectNextVariant({
    getItem() { throw new DOMException('Storage is disabled', 'SecurityError'); },
    setItem() { throw new DOMException('Storage is disabled', 'SecurityError'); },
  }), 'clouds');
});

test('a failed persistence write does not discard the valid scene that was read', () => {
  for (const selected of HERO_VARIANTS) {
    const writes = [];
    const result = selectNextVariant({
      getItem(key) { assert.equal(key, HERO_STORAGE_KEY); return selected; },
      setItem(key, value) {
        writes.push([key, value]);
        throw new DOMException('Storage quota reached', 'QuotaExceededError');
      },
    });
    assert.equal(result, selected);
    assert.deepEqual(writes, [[HERO_STORAGE_KEY, HERO_VARIANTS[(HERO_VARIANTS.indexOf(selected) + 1) % 4]]]);
  }
});

test('one page lazily mounts only its selected scene and pause/replay do not advance rotation', async () => {
  const storage = storageFor(new Map([[HERO_STORAGE_KEY, 'ribbons']]));
  const p = pageFixture({ storage });
  const loaded = [], frames = [];
  const loadScene = async id => {
    loaded.push(id);
    assert.equal(p.poster.getAttribute('src'), '/variants/ribbons-poster.jpg', 'fallback changes before module loading');
    return { createScene: () => ({ draw: (_, frame) => frames.push(frame) }) };
  };
  const ready = mountHeroCycle(p.root, p.win, p.doc, { loadScene });
  const repeated = mountHeroCycle(p.root, p.win, p.doc, { loadScene });
  assert.equal(ready, repeated, 'concurrent bootstrap shares its pending mount');
  const dispose = await ready;
  assert.deepEqual(loaded, ['ribbons']);
  assert.equal(p.root.getAttribute('data-variant'), 'ribbons');
  assert.equal(p.body.getAttribute('data-variant'), 'ribbons');
  assert.equal(p.root.getAttribute('data-rendered'), '');
  assert.equal(p.controls.hidden, false);
  p.frame(0);
  p.frame(1000);
  assert.equal(frames.at(-1).time, 1);
  p.pause.click();
  assert.equal(p.pause.getAttribute('aria-pressed'), 'true');
  assert.equal(p.pendingFrames, 0);
  p.replay.click();
  assert.equal(p.pause.getAttribute('aria-pressed'), 'false');
  assert.equal(frames.at(-1).time, 0);
  assert.equal(p.pendingFrames, 1);
  assert.equal(await mountHeroCycle(p.root, p.win, p.doc, { loadScene }), dispose);
  assert.deepEqual(storage.reads, [HERO_STORAGE_KEY]);
  assert.deepEqual(storage.writes, [[HERO_STORAGE_KEY, 'voids']]);
  assert.deepEqual(loaded, ['ribbons']);
  dispose();
  assert.equal(p.pendingFrames, 0);
});

test('multiple roots in one document reuse selection; a new document takes the next scene', async () => {
  const storage = storageFor(), first = pageFixture({ storage }), replacement = pageFixture({ storage });
  const loaded = [];
  const options = {
    loadScene: async id => { loaded.push(id); return { createScene() {} }; },
    mountScene: () => () => {},
  };
  await mountHeroCycle(first.root, first.win, first.doc, options);
  await mountHeroCycle(replacement.root, first.win, first.doc, options);
  assert.deepEqual(loaded, ['clouds', 'clouds']);
  assert.equal(replacement.root.getAttribute('data-variant'), 'clouds');
  assert.deepEqual(storage.writes, [[HERO_STORAGE_KEY, 'glyphs']]);
  const reloaded = pageFixture({ storage });
  await mountHeroCycle(reloaded.root, reloaded.win, reloaded.doc, options);
  assert.deepEqual(loaded, ['clouds', 'clouds', 'glyphs']);
  assert.deepEqual(storage.writes, [[HERO_STORAGE_KEY, 'glyphs'], [HERO_STORAGE_KEY, 'ribbons']]);
});

test('a rejected scene import keeps its chosen poster and does not consume a second turn', async () => {
  const p = pageFixture({ storage: storageFor(new Map([[HERO_STORAGE_KEY, 'voids']])) });
  let imports = 0, mounts = 0;
  p.controls.hidden = false;
  p.root.setAttribute('data-rendered', '');
  const options = {
    loadScene: async id => {
      imports++;
      assert.equal(id, 'voids');
      assert.equal(p.poster.getAttribute('src'), '/variants/voids-poster.jpg');
      throw new Error('Scene download failed');
    },
    mountScene() { mounts++; },
  };
  const dispose = await mountHeroCycle(p.root, p.win, p.doc, options);
  assert.equal(typeof dispose, 'function');
  dispose();
  await mountHeroCycle(p.root, p.win, p.doc, options);
  assert.equal(imports, 1);
  assert.equal(mounts, 0);
  assert.equal(p.controls.hidden, true);
  assert.equal(p.root.hasAttribute('data-rendered'), false);
  assert.equal(p.poster.getAttribute('src'), '/variants/voids-poster.jpg');
  assert.deepEqual(p.storage.writes, [[HERO_STORAGE_KEY, 'clouds']]);
});

test('scene startup failures also preserve the selected fallback', async () => {
  const p = pageFixture({ storage: storageFor(new Map([[HERO_STORAGE_KEY, 'glyphs']])) });
  const dispose = await mountHeroCycle(p.root, p.win, p.doc, {
    loadScene: async () => ({ createScene() {} }),
    mountScene() { throw new Error('Canvas cannot initialize'); },
  });
  assert.equal(typeof dispose, 'function');
  assert.equal(p.poster.getAttribute('src'), '/variants/glyphs-poster.jpg');
  assert.equal(p.controls.hidden, true);
  assert.equal(p.root.hasAttribute('data-rendered'), false);
  assert.deepEqual(p.storage.writes, [[HERO_STORAGE_KEY, 'ribbons']]);
});

test('missing hero root leaves storage untouched and inaccessible localStorage still renders', async () => {
  const p = pageFixture();
  let loads = 0;
  const options = {
    loadScene: async id => { loads++; assert.equal(id, 'clouds'); return { createScene() {} }; },
    mountScene: () => () => {},
  };
  const absent = await mountHeroCycle(null, p.win, p.doc, options);
  assert.equal(typeof absent, 'function');
  assert.equal(loads, 0);
  assert.deepEqual(p.storage.reads, []);
  assert.deepEqual(p.storage.writes, []);
  Object.defineProperty(p.win, 'localStorage', { get() { throw new DOMException('Denied', 'SecurityError'); } });
  await mountHeroCycle(p.root, p.win, p.doc, options);
  assert.equal(loads, 1);
  assert.equal(p.poster.getAttribute('src'), '/variants/clouds-poster.jpg');
});

test('storage selection is locked across documents but module loading happens after lock release', async () => {
  const storage = storageFor(), pages = [pageFixture({ storage }), pageFixture({ storage })];
  const requested = [], loaded = [];
  let locked = false, tail = Promise.resolve();
  const locks = { request(name, choose) {
    requested.push(name);
    const result = tail.then(() => {
      locked = true;
      try { return choose(); } finally { locked = false; }
    });
    tail = result;
    return result;
  } };
  for (const p of pages) p.win.navigator = { locks };
  const options = {
    loadScene: async id => {
      assert.equal(locked, false, 'lazy download must not hold the inter-tab storage lock');
      loaded.push(id);
      return { createScene() {} };
    },
    mountScene: () => () => {},
  };
  await Promise.all(pages.map(p => mountHeroCycle(p.root, p.win, p.doc, options)));
  assert.deepEqual(requested, [HERO_STORAGE_KEY, HERO_STORAGE_KEY]);
  assert.deepEqual(loaded, ['clouds', 'glyphs']);
  assert.deepEqual(storage.writes, [[HERO_STORAGE_KEY, 'glyphs'], [HERO_STORAGE_KEY, 'ribbons']]);
});

test('unavailable Web Locks falls back to one deterministic selection', async () => {
  for (const request of [() => { throw new Error('Locks denied'); }, () => Promise.reject(new Error('Locks denied'))]) {
    const p = pageFixture();
    p.win.navigator = { locks: { request } };
    await mountHeroCycle(p.root, p.win, p.doc, {
      loadScene: async id => { assert.equal(id, 'clouds'); return { createScene() {} }; },
      mountScene: () => () => {},
    });
    assert.deepEqual(p.storage.writes, [[HERO_STORAGE_KEY, 'glyphs']]);
  }
});

test('click switching warms only the following scene during idle time and leaves storage alone', async () => {
  const p = clickFixture();
  const dispose = await p.mount();
  assert.equal(p.next.hidden, false);
  assert.deepEqual(p.loaded, ['clouds'], 'mount does not synchronously warm all four scenes');
  assert.equal(p.prepared.length, 0);
  p.idle();
  await settle();
  assert.deepEqual(p.loaded, ['clouds', 'glyphs']);
  assert.deepEqual(p.prepared.map(scene => scene.id), ['glyphs']);
  assert.equal(p.transitions.length, 0);
  assert.equal(p.root.getAttribute('data-variant'), 'clouds');
  assert.deepEqual(p.storage.writes, [[HERO_STORAGE_KEY, 'glyphs']]);
  p.pause.click();
  p.replay.click();
  await settle();
  assert.equal(p.transitions.length, 0, 'animation controls are separate from scene selection');
  assert.deepEqual(p.storage.writes, [[HERO_STORAGE_KEY, 'glyphs']]);
  dispose();
});

test('clicks reuse the warmed scene, commit after the fade, wrap in order, and persist for reload', async () => {
  const p = clickFixture();
  const dispose = await p.mount();
  p.idle();
  await settle();
  const fade = deferred();
  p.behavior.transition = () => fade.promise;
  p.next.click();
  await settle();
  assert.equal(p.transitions.length, 1);
  assert.equal(p.transitions[0], p.prepared[0], 'the engine receives its prewarmed instance');
  assert.equal(p.root.getAttribute('data-variant'), 'clouds');
  assert.deepEqual(p.storage.writes, [[HERO_STORAGE_KEY, 'glyphs']], 'a pending fade must not advance reload order');
  fade.resolve(true);
  await settle();
  assert.equal(p.root.getAttribute('data-variant'), 'glyphs');
  assert.equal(p.body.getAttribute('data-variant'), 'glyphs');
  assert.equal(p.poster.getAttribute('src'), '/variants/glyphs-poster.jpg');
  assert.equal(p.storage.backing.get(HERO_STORAGE_KEY), 'ribbons');
  p.behavior.transition = async () => true;
  for (const id of ['ribbons', 'voids', 'clouds']) {
    p.idle();
    await settle();
    p.next.click();
    await settle();
    assert.equal(p.root.getAttribute('data-variant'), id);
  }
  assert.deepEqual(p.transitions.map(scene => scene.id), ['glyphs', 'ribbons', 'voids', 'clouds']);
  assert.deepEqual(p.storage.writes.map(([, id]) => id), ['glyphs', 'ribbons', 'voids', 'clouds', 'glyphs']);
  dispose();
  const reloaded = clickFixture({ storage: storageFor(p.storage.backing) });
  const stopReloaded = await reloaded.mount();
  assert.equal(reloaded.root.getAttribute('data-variant'), 'glyphs');
  assert.equal(reloaded.storage.backing.get(HERO_STORAGE_KEY), 'ribbons');
  stopReloaded();
});

test('new roots in the same document reuse the last successfully clicked scene', async () => {
  const p = clickFixture();
  const dispose = await p.mount();
  p.next.click();
  await settle();
  assert.equal(p.root.getAttribute('data-variant'), 'glyphs');
  const replacement = pageFixture();
  const ids = [];
  await mountHeroCycle(replacement.root, p.win, p.doc, {
    loadScene: async id => { ids.push(id); return sceneModule(id); },
    mountScene: () => () => {},
  });
  assert.deepEqual(ids, ['glyphs']);
  assert.deepEqual(p.storage.writes.map(([, id]) => id), ['glyphs', 'ribbons']);
  dispose();
});

test('rapid clicks during an unfinished import or fade consume exactly one scene', async () => {
  const p = clickFixture();
  const dispose = await p.mount();
  const download = deferred(), fade = deferred();
  p.behavior.load = id => id === 'glyphs' ? download.promise : Promise.resolve(sceneModule(id));
  p.behavior.transition = () => fade.promise;
  p.next.click();
  p.next.dispatchEvent(new Event('click'));
  p.next.dispatchEvent(new Event('click'));
  p.idle();
  await settle();
  assert.deepEqual(p.loaded, ['clouds', 'glyphs']);
  assert.equal(p.transitions.length, 0);
  download.resolve(sceneModule('glyphs'));
  await settle();
  assert.equal(p.transitions.length, 1);
  p.next.dispatchEvent(new Event('click'));
  await settle();
  assert.equal(p.transitions.length, 1);
  fade.resolve(true);
  await settle();
  assert.equal(p.root.getAttribute('data-variant'), 'glyphs');
  assert.deepEqual(p.storage.writes.map(([, id]) => id), ['glyphs', 'ribbons']);
  dispose();
});

test('failed preloading retains the current scene and a click can retry successfully', async () => {
  const p = clickFixture();
  const dispose = await p.mount();
  p.behavior.load = async () => { throw new Error('Offline'); };
  p.idle();
  await settle();
  assert.equal(p.root.getAttribute('data-variant'), 'clouds');
  assert.deepEqual(p.storage.writes.map(([, id]) => id), ['glyphs']);
  assert.equal(p.transitions.length, 0);
  p.behavior.load = async id => sceneModule(id);
  p.next.click();
  await settle();
  assert.equal(p.root.getAttribute('data-variant'), 'glyphs');
  assert.deepEqual(p.loaded, ['clouds', 'glyphs', 'glyphs']);
  assert.deepEqual(p.storage.writes.map(([, id]) => id), ['glyphs', 'ribbons']);
  dispose();
});

test('preparation and transition failures do not advance order and leave the control retryable', async t => {
  for (const failure of ['prepare', 'reject-transition', 'cancel-transition']) {
    await t.test(failure, async () => {
      const p = clickFixture();
      const dispose = await p.mount();
      if (failure === 'prepare') p.behavior.prepare = () => { throw new Error('Canvas unavailable'); };
      else p.behavior.transition = failure === 'reject-transition'
        ? async () => { throw new Error('Draw failed'); }
        : async () => false;
      p.next.click();
      await settle();
      assert.equal(p.root.getAttribute('data-variant'), 'clouds');
      assert.equal(p.poster.getAttribute('src'), '/variants/clouds-poster.jpg');
      assert.deepEqual(p.storage.writes.map(([, id]) => id), ['glyphs']);
      p.behavior.prepare = factory => ({ id: factory.id });
      p.behavior.transition = async () => true;
      p.next.click();
      await settle();
      assert.equal(p.root.getAttribute('data-variant'), 'glyphs');
      assert.equal(p.storage.backing.get(HERO_STORAGE_KEY), 'ribbons');
      dispose();
    });
  }
});

test('storage denial still allows the local click cycle to advance and wrap', async () => {
  const p = clickFixture();
  Object.defineProperty(p.win, 'localStorage', { get() { throw new DOMException('Denied', 'SecurityError'); } });
  const dispose = await p.mount();
  for (const id of ['glyphs', 'ribbons', 'voids', 'clouds', 'glyphs']) {
    p.next.click();
    await settle();
    assert.equal(p.root.getAttribute('data-variant'), id);
  }
  assert.deepEqual(p.storage.reads, []);
  assert.deepEqual(p.storage.writes, []);
  dispose();
});

test('disposing cancels scheduled warming and removes click selection', async () => {
  const p = clickFixture();
  const dispose = await p.mount();
  assert.ok(p.pendingIdle + p.pendingTimers > 0, 'warming is deferred until idle');
  dispose();
  dispose();
  assert.equal(p.disposed, 1, 'engine cleanup is idempotent');
  assert.equal(p.pendingIdle + p.pendingTimers, 0);
  p.idle();
  p.timers();
  p.next.dispatchEvent(new Event('click'));
  await settle();
  assert.deepEqual(p.loaded, ['clouds']);
  assert.equal(p.transitions.length, 0);
  assert.deepEqual(p.storage.writes.map(([, id]) => id), ['glyphs']);
});

test('disposing during a next-scene download prevents late preparation, switching, and persistence', async () => {
  const p = clickFixture();
  const dispose = await p.mount();
  const download = deferred();
  p.behavior.load = () => download.promise;
  p.next.click();
  await settle();
  dispose();
  download.resolve(sceneModule('glyphs'));
  await settle();
  assert.equal(p.prepared.length, 0);
  assert.equal(p.transitions.length, 0);
  assert.equal(p.root.getAttribute('data-variant'), 'clouds');
  assert.deepEqual(p.storage.writes.map(([, id]) => id), ['glyphs']);
  assert.equal(p.disposed, 1);
});

test('disposing during a fade prevents a late completion from changing selection or storage', async () => {
  const p = clickFixture();
  const dispose = await p.mount();
  const fade = deferred();
  p.behavior.transition = () => fade.promise;
  p.next.click();
  await settle();
  assert.equal(p.transitions.length, 1);
  dispose();
  fade.resolve(true);
  await settle();
  assert.equal(p.root.getAttribute('data-variant'), 'clouds');
  assert.deepEqual(p.storage.writes.map(([, id]) => id), ['glyphs']);
  assert.equal(p.pendingIdle + p.pendingTimers, 0);
  assert.equal(p.disposed, 1);
});

test('the click surface stays hidden without transition support or a successfully rendered frame', async () => {
  for (const failure of ['missing-methods', 'not-rendered']) {
    const p = pageFixture({ nextButton: true });
    const engine = () => {};
    if (failure === 'missing-methods') p.root.setAttribute('data-rendered', '');
    else Object.assign(engine, {
      prepareScene() { assert.fail('failed initial renderer must not prepare another scene'); },
      transitionTo() { assert.fail('failed initial renderer must not transition'); },
    });
    const dispose = await mountHeroCycle(p.root, p.win, p.doc, {
      loadScene: async id => sceneModule(id),
      mountScene: () => engine,
    });
    assert.equal(p.next.hidden, true, failure);
    p.next.click();
    p.idle();
    await settle();
    assert.deepEqual(p.storage.writes.map(([, id]) => id), ['glyphs']);
    dispose();
  }
});

test('next-scene warming falls back to a cancelable timer when idle callbacks are unavailable', async () => {
  const p = clickFixture();
  delete p.win.requestIdleCallback;
  delete p.win.cancelIdleCallback;
  const dispose = await p.mount();
  assert.ok(p.pendingTimers > 0);
  assert.deepEqual(p.loaded, ['clouds']);
  p.timers();
  await settle();
  assert.deepEqual(p.loaded, ['clouds', 'glyphs']);
  assert.equal(p.transitions.length, 0);
  dispose();
});
