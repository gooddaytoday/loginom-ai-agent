import { createFlowInteraction } from '../flow-interaction.mjs';

// Shared lifecycle and local cursor field; each preview supplies its own scene.
const FRAME_INTERVAL = 1000 / 30;
const APPEARANCE_SECONDS = 2.6;
const TRANSITION_SECONDS = .7;

export function mountVariant(createScene, root = document.querySelector('[data-flow]'), win = window, doc = document) {
  if (!root) return () => {};

  const cleanups = [];
  let canvas, controls, pause, replay, next, ctx, scene, motion, finePointer;
  let width = 0, height = 0, dpr = 1;
  let raf = null, lastTick = null, lastDraw = null, time = 0, entrance = 0;
  let visible = false, paused = false, disposed = false;
  let transition = null;
  let preparedScenes = new WeakMap();
  const preparationAbort = new AbortController();
  const interaction = createFlowInteraction();

  function stop() {
    if (raf !== null) win.cancelAnimationFrame(raf);
    raf = lastTick = lastDraw = null;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    preparationAbort.abort();
    interaction.reset();
    stop();
    finishTransition(false);
    // Discard prepared scenes even when a caller retains their opaque tokens.
    preparedScenes = new WeakMap();
    scene = null;
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    if (controls) controls.hidden = true;
    if (next) {
      next.hidden = true;
      next.removeAttribute('aria-busy');
    }
    root.removeAttribute('data-rendered');
    root.removeAttribute('data-reduced-motion');
    root.removeAttribute('data-click-cycle');
  }

  function listen(target, type, callback, options) {
    target.addEventListener(type, callback, options);
    cleanups.push(() => target.removeEventListener(type, callback, options));
  }

  function canAnimate() {
    return canPresent() && !paused && !motion.matches;
  }

  function canPresent() {
    return !disposed && width > 0 && height > 0 && visible && !doc.hidden;
  }

  function canTick() {
    // A manually paused sculpture remains still, but its crossfade can run.
    return canAnimate() || (transition && canPresent() && !motion.matches);
  }

  function syncControls() {
    controls.hidden = motion.matches;
    root.toggleAttribute('data-reduced-motion', motion.matches);
    pause.setAttribute('aria-pressed', String(paused));
    const label = paused ? 'Продолжить анимацию' : 'Приостановить анимацию';
    pause.setAttribute('aria-label', label);
    pause.title = label;
  }

  function resetContext(targetCanvas, targetContext) {
    // Reset clipping, transforms, compositing and styles even if a scene leaves
    // context state behind. Older Canvas APIs reset through the bitmap width.
    if (typeof targetContext.reset === 'function') targetContext.reset();
    else targetCanvas.width = targetCanvas.width;
    targetContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    targetContext.clearRect(0, 0, width, height);
  }

  function frame(complete = false) {
    const reducedMotion = motion.matches;
    const progress = Math.min(1, entrance / APPEARANCE_SECONDS);
    return {
      width, height,
      time: complete || reducedMotion ? 12 : time,
      progress: complete || reducedMotion ? 1 : 1 - (1 - progress) ** 3,
      interaction: complete || reducedMotion ? null : interaction,
      reducedMotion,
      detail: width < 600 ? .6 : 1,
    };
  }

  function render(targetCanvas, targetContext, targetScene, complete = false) {
    resetContext(targetCanvas, targetContext);
    targetScene.draw(targetContext, frame(complete));
  }

  function surface() {
    const bitmap = doc.createElement('canvas');
    bitmap.width = Math.max(1, Math.round(width * dpr));
    bitmap.height = Math.max(1, Math.round(height * dpr));
    const context = bitmap.getContext('2d', { alpha: true });
    if (!context) throw new Error('Scene preparation requires a Canvas 2D context');
    return { bitmap, context, width, height, dpr };
  }

  function blend(progress) {
    resetContext(canvas, ctx);
    // Interpolate premultiplied colors, including transparent particle edges.
    // A scene can freely set its own opacity/composite mode on the offscreen
    // surface; it cannot override the opacity of the final crossfade.
    ctx.globalAlpha = 1 - progress;
    ctx.drawImage(transition.outgoing.bitmap, 0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = progress;
    ctx.drawImage(transition.incoming.bitmap, 0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function finishTransition(success, present = false) {
    if (!transition) return;
    let paintFailed = false;
    if (present && !disposed) {
      try { blend(1); } catch { success = false; paintFailed = true; }
    }
    const finished = transition;
    transition = null;
    // The next frame draws the current scene directly. Release large temporary
    // bitmaps immediately rather than waiting for a later garbage collection.
    finished.outgoing.bitmap.width = finished.outgoing.bitmap.height = 1;
    finished.incoming.bitmap.width = finished.incoming.bitmap.height = 1;
    finished.resolve(success);
    if (paintFailed) dispose();
  }

  // These methods extend the existing callable disposer without changing its
  // lifecycle contract. Preparation has no visible effects or storage writes.
  // Tokens belong to this engine and are consumed once by transitionTo().
  dispose.prepareScene = nextFactory => {
    if (disposed) return null;
    const nextScene = nextFactory({
      createCanvas: () => doc.createElement('canvas'), signal: preparationAbort.signal,
    });
    // Async factories yield while computing geometry. A late completion must
    // never allocate or paint after this engine has been disposed.
    return typeof nextScene?.then === 'function'
      ? Promise.resolve(nextScene).then(cacheScene)
      : cacheScene(nextScene);
  };

  function cacheScene(nextScene) {
    if (disposed) return null;
    if (typeof nextScene?.draw !== 'function') throw new TypeError('Scene must provide draw()');
    const incoming = surface();
    const release = () => { incoming.bitmap.width = incoming.bitmap.height = 1; };
    const remember = () => {
      if (disposed) { release(); return null; }
      const token = Object.freeze({});
      preparedScenes.set(token, { scene: nextScene, incoming });
      return token;
    };
    try {
      if (nextScene.prepareFrame) {
        resetContext(incoming.bitmap, incoming.context);
        return Promise.resolve(nextScene.prepareFrame(incoming.context, frame(true), {
          signal: preparationAbort.signal,
        })).then(remember, error => { release(); throw error; });
      }
      render(incoming.bitmap, incoming.context, nextScene, true);
      return remember();
    } catch (error) { release(); throw error; }
  }

  dispose.transitionTo = token => {
    const prepared = token && preparedScenes.get(token);
    if (disposed || transition || !prepared) return Promise.resolve(false);
    let { incoming } = prepared;
    let outgoing;
    try {
      if (incoming.width !== width || incoming.height !== height || incoming.dpr !== dpr) {
        incoming = surface();
        render(incoming.bitmap, incoming.context, prepared.scene, true);
      }
      // Snapshot before changing the active scene. The outgoing renderer never
      // runs during the transition, so only one costly particle draw is needed.
      outgoing = surface();
      outgoing.context.drawImage(canvas, 0, 0);
    } catch {
      // Preparation errors propagate from prepareScene; a later unavailable
      // bitmap leaves the current scene untouched and reports an unsuccessful
      // handoff to the controller rather than advancing its stored selection.
      return Promise.resolve(false);
    }
    preparedScenes.delete(token);
    if (incoming !== prepared.incoming) prepared.incoming.bitmap.width = prepared.incoming.bitmap.height = 1;
    scene = prepared.scene;
    time = 12;
    entrance = APPEARANCE_SECONDS;
    interaction.reset();
    stop();
    const completion = new Promise(resolve => {
      transition = { incoming, outgoing, elapsed: 0, resolve };
    });
    try {
      if (!canPresent() || motion.matches) finishTransition(true, true);
      else draw(false);
      schedule();
    } catch { dispose(); }
    return completion;
  };

  function draw(updateIncoming = true) {
    if (disposed || !width || !height) return;
    try {
      if (transition) {
        if (updateIncoming && canAnimate()) render(transition.incoming.bitmap, transition.incoming.context, scene);
        const progress = Math.min(1, transition.elapsed / TRANSITION_SECONDS);
        blend(progress * progress * (3 - 2 * progress));
      } else render(canvas, ctx, scene);
      root.setAttribute('data-rendered', '');
    } catch {
      // An illustration must never interrupt the independent installation UI.
      dispose();
    }
  }

  function tick(now) {
    raf = null;
    if (!canTick()) { stop(); return; }
    const delta = lastTick === null ? 0 : Math.max(0, (now - lastTick) / 1000);
    lastTick = now;
    if (canAnimate()) {
      time += delta;
      entrance += delta;
      interaction.step(delta);
    }
    if (transition) transition.elapsed += delta;
    if (lastDraw === null || now - lastDraw >= FRAME_INTERVAL - .0001) {
      lastDraw = now;
      draw();
      if (transition?.elapsed >= TRANSITION_SECONDS) finishTransition(true);
    }
    schedule();
  }

  function schedule() {
    if (!canTick()) { stop(); return; }
    if (raf === null) raf = win.requestAnimationFrame(tick);
  }

  function resize() {
    if (disposed) return;
    try {
      finishTransition(true);
      const rect = root.getBoundingClientRect();
      width = Math.max(0, rect.width);
      height = Math.max(0, rect.height);
      interaction.resize(width, height);
      dpr = Math.max(1, Math.min(win.devicePixelRatio || 1, 1.5));
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      draw();
      schedule();
    } catch { dispose(); }
  }

  function onPause() {
    if (disposed || motion.matches) return;
    paused = !paused;
    if (!paused) interaction.reset();
    syncControls();
    schedule();
  }

  function onReplay() {
    if (disposed || motion.matches) return;
    finishTransition(true);
    time = entrance = 0;
    interaction.reset();
    paused = false;
    stop();
    syncControls();
    draw();
    schedule();
  }

  function onMotionChange() {
    if (disposed) return;
    finishTransition(true);
    // Avoid replaying the entrance when returning from an already complete still.
    if (!motion.matches) entrance = APPEARANCE_SECONDS;
    interaction.reset();
    syncControls();
    draw();
    schedule();
  }

  function onPointer(event) {
    if (event.pointerType === 'touch' || !finePointer.matches || !canAnimate()) return;
    const rect = root.getBoundingClientRect();
    interaction.move(event.clientX - rect.left, event.clientY - rect.top);
  }

  function onPointerLeave() { interaction.release(); }
  function onPointerCancel() { interaction.reset(); }
  function onVisibilityChange() {
    if (doc.hidden) {
      interaction.reset();
      finishTransition(true, true);
    }
    schedule();
  }
  function onPointerChange() {
    if (!finePointer.matches) interaction.reset();
  }

  try {
    controls = root.querySelector('.flow-controls');
    canvas = root.querySelector('canvas');
    pause = root.querySelector('[data-flow-pause]');
    replay = root.querySelector('[data-flow-replay]');
    next = root.querySelector('[data-flow-next]');
    if (controls) controls.hidden = true;
    root.removeAttribute('data-rendered');
    if (!canvas || !controls || !pause || !replay) { dispose(); return dispose; }
    ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) { dispose(); return dispose; }
    scene = createScene({ createCanvas: () => doc.createElement('canvas') });
    if (typeof scene?.draw !== 'function') { dispose(); return dispose; }
    motion = win.matchMedia('(prefers-reduced-motion: reduce)');
    finePointer = win.matchMedia('(hover: hover) and (pointer: fine)');

    // Buttons provide native Enter/Space activation; no keyboard interception.
    listen(pause, 'click', onPause);
    listen(replay, 'click', onReplay);
    listen(root, 'pointermove', onPointer, { passive: true });
    listen(root, 'pointerleave', onPointerLeave);
    listen(root, 'pointercancel', onPointerCancel);
    listen(win, 'blur', onPointerCancel);
    listen(doc, 'visibilitychange', onVisibilityChange);
    listen(motion, 'change', onMotionChange);
    listen(finePointer, 'change', onPointerChange);

    if (win.ResizeObserver) {
      const observer = new win.ResizeObserver(resize);
      cleanups.push(() => observer.disconnect());
      observer.observe(root);
    } else listen(win, 'resize', resize);

    if (win.IntersectionObserver) {
      const observer = new win.IntersectionObserver(entries => {
        if (disposed) return;
        const entry = entries.find(item => !item.target || item.target === root);
        if (!entry) return;
        visible = entry.isIntersecting;
        if (!visible) {
          interaction.reset();
          finishTransition(true, true);
        }
        schedule();
      }, { threshold: 0 });
      cleanups.push(() => observer.disconnect());
      observer.observe(root);
    } else {
      const checkVisibility = () => {
        if (disposed) return;
        const rect = root.getBoundingClientRect();
        visible = rect.top < win.innerHeight && rect.top + rect.height > 0;
        if (!visible) {
          interaction.reset();
          finishTransition(true, true);
        }
        schedule();
      };
      listen(win, 'scroll', checkVisibility, { passive: true });
      listen(win, 'resize', checkVisibility);
      checkVisibility();
    }
    syncControls();
    resize();
  } catch { dispose(); }

  return dispose;
}
