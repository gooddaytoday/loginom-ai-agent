import test from 'node:test';
import assert from 'node:assert/strict';
import { mountDataFlow, WORKFLOW_NODES, WORKFLOW_EDGES, flowPoint, workflowProjection } from '../../../../apps/loginom-site/hero.mjs';

function scene({ reduced = false, contextAvailable = true } = {}) {
  class Element extends EventTarget {
    attributes = new Map();
    hidden = false;
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    toggleAttribute(name, value) { if (value) this.setAttribute(name, ''); else this.removeAttribute(name); }
    getAttribute(name) { return this.attributes.get(name); }
    click() { this.dispatchEvent(new Event('click')); }
  }
  let draws = 0, points = [], labels = [], rectangles = [];
  const context = new Proxy({}, { get: (_, name) => name === 'createRadialGradient'
    ? () => ({ addColorStop() {} })
    : (...args) => {
      if (name === 'clearRect') { draws++; points = []; labels = []; rectangles = []; }
      else if (name === 'fillRect' && args[2] < 5 && args[3] < 5) {
        points.push(args.slice(0, 2));
        rectangles.push(args);
      } else if (name === 'fillText') labels.push(args);
    }, set: () => true });
  const canvas = { getContext: () => contextAvailable ? context : null };
  const pause = new Element(), replay = new Element(), controls = new Element();
  controls.hidden = true;
  const root = new Element();
  root.querySelector = selector => ({ canvas, '.flow-controls': controls,
    '[data-flow-pause]': pause, '[data-flow-replay]': replay })[selector];
  root.getBoundingClientRect = () => ({ width: 800, height: 600, top: 0, left: 0 });
  const motion = new EventTarget();
  motion.matches = reduced;
  const pointerMedia = new EventTarget();
  pointerMedia.matches = true;
  const doc = new EventTarget();
  doc.hidden = false;
  doc.createElement = () => ({ getContext: () => context });
  const callbacks = new Map();
  let nextId = 0, intersection, resize;
  const win = Object.assign(new EventTarget(), {
    devicePixelRatio: 3,
    matchMedia: query => query.includes('reduced-motion') ? motion : pointerMedia,
    requestAnimationFrame: callback => { callbacks.set(++nextId, callback); return nextId; },
    cancelAnimationFrame: id => callbacks.delete(id),
    ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} disconnect() {} },
    IntersectionObserver: class { constructor(callback) { intersection = callback; } observe() {} disconnect() {} },
  });
  const dispose = mountDataFlow(root, win, doc);
  return { root, pause, replay, controls, canvas, dispose,
    get pending() { return callbacks.size; }, get draws() { return draws; },
    get points() { return points; },
    get labels() { return labels; },
    get rectangles() { return rectangles; },
    frame(now) { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(now)); },
    visible(value) { intersection([{ isIntersecting: value }]); },
    hidden(value) { doc.hidden = value; doc.dispatchEvent(new Event('visibilitychange')); },
    reduce(value) { motion.matches = value; motion.dispatchEvent(new Event('change')); },
    resize() { resize(); },
    point(x, y, pointerType = 'mouse') { root.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: x, clientY: y, pointerType })); },
  };
}

test('hero pauses outside the viewport and in hidden tabs, then resumes one animation loop', () => {
  const s = scene();
  assert.equal(s.pending, 0);
  s.visible(true);
  assert.equal(s.pending, 1);
  s.frame(0);
  s.hidden(true);
  assert.equal(s.pending, 0);
  const draws = s.draws;
  s.frame(10000);
  assert.equal(s.draws, draws);
  s.hidden(false);
  s.visible(true);
  assert.equal(s.pending, 1);
  s.visible(false);
  assert.equal(s.pending, 0);
  s.dispose();
});

test('hero honors reduced motion on load and when the system preference changes', () => {
  const s = scene({ reduced: true });
  s.visible(true);
  assert.equal(s.pending, 0);
  assert.equal(s.controls.hidden, true);
  assert.ok(s.root.attributes.has('data-rendered'), 'the static canvas scene is rendered');
  s.reduce(false);
  assert.equal(s.controls.hidden, false);
  assert.equal(s.pending, 1);
  s.frame(0);
  s.reduce(true);
  assert.equal(s.pending, 0);
  assert.equal(s.controls.hidden, true);
  s.dispose();
});

test('manual pause survives visibility changes; replay resumes; disposal removes event handlers', () => {
  const s = scene();
  s.visible(true);
  s.pause.click();
  assert.equal(s.pause.getAttribute('aria-pressed'), 'true');
  assert.equal(s.pending, 0);
  s.visible(false);
  s.visible(true);
  s.hidden(true);
  s.hidden(false);
  assert.equal(s.pending, 0);
  s.replay.click();
  assert.equal(s.pause.getAttribute('aria-pressed'), 'false');
  assert.equal(s.pending, 1);
  s.dispose();
  assert.equal(s.pending, 0);
  const draws = s.draws;
  s.replay.click();
  s.reduce(true);
  s.hidden(true);
  assert.equal(s.draws, draws);
  assert.equal(s.pending, 0);
});

test('hero bounds rendering resolution and frame rate without creating duplicate loops on resize', () => {
  const s = scene();
  assert.equal(s.canvas.width, 1200);
  assert.equal(s.canvas.height, 900);
  s.visible(true);
  s.frame(0);
  const draws = s.draws;
  s.frame(16);
  assert.equal(s.draws, draws);
  s.frame(34);
  assert.equal(s.draws, draws + 1);
  s.resize();
  assert.equal(s.pending, 1);
  s.dispose();
});

test('hero keeps its SVG fallback and hides animation controls when Canvas is unavailable', () => {
  const s = scene({ contextAvailable: false });
  assert.equal(s.pending, 0);
  assert.equal(s.controls.hidden, true);
  assert.equal(s.root.attributes.has('data-rendered'), false);
  assert.equal(s.draws, 0);
  s.dispose();
});

test('workflow has two sources, two reachable results and no directed cycles', () => {
  const incoming = WORKFLOW_NODES.map((_, index) => WORKFLOW_EDGES.filter(([, to]) => to === index).length);
  const outgoing = WORKFLOW_NODES.map((_, index) => WORKFLOW_EDGES.filter(([from]) => from === index).length);
  const sources = incoming.flatMap((count, index) => count === 0 ? [index] : []);
  assert.equal(sources.length, 2);
  assert.equal(outgoing.filter(count => count === 0).length, 2);
  const visited = new Set();
  function visit(node, path = new Set()) {
    assert.ok(!path.has(node), 'no cycle or return path');
    visited.add(node);
    for (const [from, to] of WORKFLOW_EDGES) {
      assert.ok(WORKFLOW_NODES[from] && WORKFLOW_NODES[to], 'edge endpoints exist');
      if (from === node) visit(to, new Set([...path, node]));
    }
  }
  sources.forEach(source => visit(source));
  assert.equal(visited.size, WORKFLOW_NODES.length, 'every node belongs to the workflow');
});

test('workflow packets travel forward between ports in the fixed projection', () => {
  for (const edge of WORKFLOW_EDGES) {
    const from = WORKFLOW_NODES[edge[0]].position, to = WORKFLOW_NODES[edge[1]].position;
    assert.ok(Math.abs(flowPoint(edge, 0)[0] - from[0] - .29) < 1e-9);
    assert.ok(Math.abs(flowPoint(edge, 1)[0] - to[0] + .29) < 1e-9);
    for (const [width, height] of [[800, 600], [450, 600], [1400, 800]]) {
      const project = workflowProjection(width, height);
      for (const lane of [0, 1.5, 3, 4.5]) {
        let previous = -Infinity;
        for (let i = 0; i <= 100; i++) {
          const [x] = project(flowPoint(edge, i / 100, lane));
          assert.ok(x > previous, 'screen direction must remain left to right');
          previous = x;
        }
      }
    }
  }
});

test('workflow hover moves nearby stream particles without rotating the distant branches or reacting to touch', () => {
  for (const pointerType of ['mouse', 'touch']) {
    const before = scene(), after = scene();
    for (const s of [before, after]) {
      s.reduce(true);
      s.reduce(false);
      s.visible(true);
      s.frame(0);
    }
    for (let i = 1; i <= 8; i++) {
      after.point(392 + i, 300, pointerType);
      before.frame(i * 34);
      after.frame(i * 34);
    }
    assert.ok(before.points.length > 1000);
    assert.equal(after.points.length, before.points.length);
    assert.equal(before.labels.length, WORKFLOW_NODES.length);
    assert.deepEqual(after.labels, before.labels, 'all node labels retain their positions');
    const project = workflowProjection(800, 600);
    for (const edge of WORKFLOW_EDGES) for (const phase of [0, 1]) {
      const [px, py] = project(flowPoint(edge, phase));
      // The lit square at each workflow endpoint stays anchored even when the
      // adjoining filament is pulled. Match it spatially, without color checks.
      const candidates = before.rectangles.filter(([x, y, w, h]) =>
        w >= 2 && h >= 2 && Math.hypot(x + w / 2 - px, y + h / 2 - py) < 1.5);
      assert.ok(candidates.length > 0, 'endpoint has a rendered port');
      assert.ok(candidates.some(port => after.rectangles.some(rect =>
        rect.every((value, i) => Math.abs(value - port[i]) < 1e-9))), 'rendered port remains fixed');
    }
    let moved = 0, remote = 0;
    for (let i = 0; i < before.points.length; i++) {
      const [x, y] = before.points[i], [nx, ny] = after.points[i];
      const offset = Math.hypot(nx - x, ny - y);
      assert.ok(offset <= 30, 'deformation remains subtle');
      if (offset > .01) moved++;
      if (Math.hypot(x - 400, y - 300) > 200) {
        remote++;
        assert.ok(offset < 1e-9, 'distant geometry has no camera rotation');
      }
    }
    assert.ok(remote > 100);
    if (pointerType === 'mouse') assert.ok(moved > 20, 'nearby particles follow the mouse');
    else assert.equal(moved, 0, 'touch input does not activate desktop hover');
    before.dispose();
    after.dispose();
  }
});
