import { mountVariant } from './variants/engine.mjs';
import { HERO_STORAGE_KEY, selectNextVariant, variantAfter, persistNextVariant } from './hero-selection.mjs';

const selections = new WeakMap();
const mounts = new WeakMap();
const sceneLoaders = {
  clouds: () => import('./variants/clouds.mjs'),
  glyphs: () => import('./variants/glyphs.mjs'),
  ribbons: () => import('./variants/ribbons.mjs'),
  voids: () => import('./variants/voids.mjs'),
};

function storageFor(win) {
  try { return win.localStorage; } catch { /* SecurityError on access. */ }
}

function selectForDocument(doc, win) {
  if (!selections.has(doc)) {
    const choose = () => selectNextVariant(storageFor(win));
    let selection;
    try {
      // Serialize simultaneous tabs where Web Locks is available. The lock is
      // held only for the synchronous read/write, never during scene loading.
      selection = win.navigator?.locks?.request
        ? win.navigator.locks.request(HERO_STORAGE_KEY, choose)
        : choose();
    } catch { selection = choose(); }
    selections.set(doc, Promise.resolve(selection).catch(choose));
  }
  return selections.get(doc);
}

function enableClickCycle(engine, variant, root, win, doc, loadScene) {
  const next = root.querySelector('[data-flow-next]');
  if (!next || !root.hasAttribute('data-rendered') || !engine.prepareScene || !engine.transitionTo) return engine;
  let current = variant, busy = false, disposed = false;
  let preparation = null, cancelWarmup = null;

  function cancelScheduledWarmup() {
    cancelWarmup?.();
    cancelWarmup = null;
  }

  function prepare(id) {
    if (preparation?.id === id) return preparation.promise;
    const entry = { id };
    entry.promise = Promise.resolve().then(() => loadScene(id)).then(({ createScene, prepareScene }) => {
      if (disposed) return null;
      return engine.prepareScene(prepareScene ?? createScene);
    }).catch(error => {
      if (preparation === entry) preparation = null;
      throw error;
    });
    preparation = entry;
    return entry.promise;
  }

  function scheduleWarmup() {
    if (disposed) return;
    const warm = () => {
      cancelWarmup = null;
      if (!disposed) void prepare(variantAfter(current)).catch(() => {});
    };
    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(warm, { timeout: 1600 });
      cancelWarmup = () => win.cancelIdleCallback(id);
    } else {
      const id = win.setTimeout(warm, 200);
      cancelWarmup = () => win.clearTimeout(id);
    }
  }

  async function advance() {
    // Coalesce rapid taps instead of building a queue of animations.
    if (busy || disposed) return;
    busy = true;
    next.setAttribute('aria-busy', 'true');
    cancelScheduledWarmup();
    const id = variantAfter(current);
    try {
      const prepared = await prepare(id);
      if (!prepared || disposed) return;
      const changed = await engine.transitionTo(prepared);
      if (!changed || disposed) return;
      current = id;
      root.setAttribute('data-variant', id);
      doc.body?.setAttribute('data-variant', id);
      root.querySelector('.data-flow-fallback')?.setAttribute('src', `/variants/${id}-poster.jpg`);
      // A click follows the visible scene even if another tab has advanced.
      // Reloads continue after the most recently completed selection.
      persistNextVariant(storageFor(win), id);
      selections.set(doc, Promise.resolve(id));
    } catch { /* Keep the current flow on import or preparation failure. */ }
    finally {
      preparation = null;
      busy = false;
      next.removeAttribute('aria-busy');
      if (!disposed) scheduleWarmup();
    }
  }

  next.hidden = false;
  root.setAttribute('data-click-cycle', '');
  next.addEventListener('click', advance);
  scheduleWarmup();
  return () => {
    if (disposed) return;
    disposed = true;
    cancelScheduledWarmup();
    preparation = null;
    next.removeEventListener('click', advance);
    next.hidden = true;
    next.removeAttribute('aria-busy');
    root.removeAttribute('data-click-cycle');
    engine();
  };
}

export function mountHeroCycle(root, win = window, doc = document, {
  loadScene = id => sceneLoaders[id](), mountScene = mountVariant,
} = {}) {
  if (!root) return Promise.resolve(() => {});
  if (mounts.has(root)) return mounts.get(root);
  const ready = (async () => {
    const variant = await selectForDocument(doc, win);
    root.setAttribute('data-variant', variant);
    doc.body?.setAttribute('data-variant', variant);
    const poster = root.querySelector('.data-flow-fallback');
    if (poster) poster.setAttribute('src', `/variants/${variant}-poster.jpg`);
    // Select and persist exactly once per document. Pause, replay, resize and
    // a second mount reuse the chosen scene instead of consuming another turn.
    try {
      const { createScene, prepareScene } = await loadScene(variant);
      // The first visit to a heavy scene also keeps the poster and the rest of
      // the page responsive until its geometry is ready.
      const initialScene = prepareScene
        ? await prepareScene({ createCanvas: () => doc.createElement('canvas') }) : null;
      const engine = mountScene(initialScene ? () => initialScene : createScene, root, win, doc);
      return enableClickCycle(engine, variant, root, win, doc, loadScene);
    } catch {
      root.removeAttribute('data-rendered');
      const controls = root.querySelector('.flow-controls');
      if (controls) controls.hidden = true;
      return () => {};
    }
  })();
  mounts.set(root, ready);
  return ready;
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-flow]');
  if (root) void mountHeroCycle(root);
}
