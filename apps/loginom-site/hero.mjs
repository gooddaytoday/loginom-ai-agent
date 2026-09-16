// A small, local Canvas renderer. No WebGL, media downloads or runtime dependencies.
import { createFlowInteraction } from './flow-interaction.mjs';

const TAU = Math.PI * 2;
const COLORS = ['#e89a73', '#d66d60', '#ffe0b1', '#84bfc0'];

function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Every edge moves left to right. The workflow has two inputs and two outputs,
// with neither a directed cycle nor a return path hidden in the animation.
export const WORKFLOW_NODES = [
  { id: 'sales', label: 'Продажи', position: [-1.95, -.85, 0], color: 3, icon: 'table' },
  { id: 'catalog', label: 'Справочник', position: [-1.95, .85, -.08], color: 3, icon: 'table' },
  { id: 'join', label: 'Объединение', position: [-.6, 0, .08], color: 0, icon: 'join' },
  { id: 'calculate', label: 'Расчёт', position: [.7, 0, .12], color: 1, icon: 'calculate' },
  { id: 'products', label: 'По товарам', position: [2.05, -.85, .1], color: 2, icon: 'chart' },
  { id: 'regions', label: 'По регионам', position: [2.05, .85, -.06], color: 2, icon: 'chart' },
];
export const WORKFLOW_EDGES = [[0, 2], [1, 2], [2, 3], [3, 4], [3, 5]];

export function flowPoint(edge, progress, lane = 0) {
  const [from, to] = edge.map(index => WORKFLOW_NODES[index].position);
  const smooth = progress * progress * (3 - 2 * progress);
  const spread = Math.sin(Math.PI * progress) * .065;
  return [
    from[0] + .29 + (to[0] - from[0] - .58) * progress,
    from[1] + (to[1] - from[1]) * smooth + Math.cos(lane) * spread,
    from[2] + (to[2] - from[2]) * smooth + Math.sin(lane) * spread,
  ];
}

export function workflowProjection(width, height) {
  const scale = Math.min(width * (width < 550 ? .16 : .165), height * .29);
  // The camera is fixed. Hover only bends the nearby flow after projection.
  const rx = .3, ry = -.16, rz = -.24;
  const sx = Math.sin(rx), cx = Math.cos(rx), sy = Math.sin(ry), cy = Math.cos(ry);
  const sz = Math.sin(rz), cz = Math.cos(rz);
  return ([x, y, z]) => {
    const y1 = y * cx - z * sx, z1 = y * sx + z * cx;
    const x1 = x * cy + z1 * sy, z2 = -x * sy + z1 * cy;
    const depth = 5.5 / (5.5 - z2);
    return [width * .485 + (x1 * cz - y1 * sz) * scale * depth,
      height * .48 + (x1 * sz + y1 * cz) * scale * depth, depth, z2, scale];
  };
}

export function mountDataFlow(root, win = window, doc = document) {
  const canvas = root.querySelector('canvas');
  let ctx;
  try { ctx = canvas.getContext('2d', { alpha: true }); } catch { return () => {}; }
  if (!ctx) return () => {};

  const controls = root.querySelector('.flow-controls');
  const pause = root.querySelector('[data-flow-pause]');
  const replay = root.querySelector('[data-flow-replay]');
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = win.matchMedia('(hover: hover) and (pointer: fine)');
  const rng = random(87231);
  const particles = Array.from({ length: 1800 }, (_, i) => ({
    phase: rng(),
    edge: WORKFLOW_EDGES[i % WORKFLOW_EDGES.length],
    v: rng() * TAU,
    scatter: [rng() * 5 - 2.5, rng() * 5 - 2.5, rng() * 4 - 2],
    size: .6 + rng() * 1.05,
    color: i % 17 === 0 ? 3 : i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0,
    light: rng(),
  }));
  const stars = Array.from({ length: 100 }, () => [rng(), rng(), rng()]);
  const sprites = COLORS.map(color => {
    const sprite = doc.createElement('canvas');
    sprite.width = sprite.height = 48;
    const context = sprite.getContext('2d');
    if (!context) return null;
    const glow = context.createRadialGradient(24, 24, 0, 24, 24, 24);
    glow.addColorStop(0, '#fff5e7');
    glow.addColorStop(.07, color);
    glow.addColorStop(.23, `${color}80`);
    glow.addColorStop(1, `${color}00`);
    context.fillStyle = glow;
    context.fillRect(0, 0, 48, 48);
    return sprite;
  });

  let width = 0, height = 0, dpr = 1;
  let frame = null, lastTime = null, elapsed = 0, entrance = 0;
  let visible = false, paused = false, disposed = false;
  const interaction = createFlowInteraction();

  function syncControls() {
    // Respect the OS preference throughout the visit, including changes while open.
    controls.hidden = motion.matches;
    root.toggleAttribute('data-reduced-motion', motion.matches);
    pause.setAttribute('aria-pressed', String(paused));
    const label = paused ? 'Продолжить анимацию' : 'Приостановить анимацию';
    pause.setAttribute('aria-label', label);
    pause.title = label;
  }

  function draw() {
    if (!width || !height) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const staticScene = motion.matches;
    const t = staticScene ? 8 : elapsed;
    const progress = staticScene ? 1 : Math.min(1, entrance / 3.2);
    const assembled = 1 - (1 - progress) ** 3;
    const project = workflowProjection(width, height);
    const projectFlow = (position, phase) => {
      const point = project(position);
      if (staticScene) return point;
      const offset = interaction.sample(point[0], point[1]);
      // The current stays attached to the stationary input/output ports.
      const end = Math.min(1, phase * 7, (1 - phase) * 7);
      const tether = end * end * (3 - 2 * end);
      point[0] += offset.x * tether;
      point[1] += offset.y * tether;
      return point;
    };
    const scale = project([0, 0, 0])[4];
    const centerX = width * .5, centerY = height * .48;
    ctx.globalCompositeOperation = 'source-over';
    for (const [x, y, light] of stars) {
      ctx.globalAlpha = .08 + light * .25;
      ctx.fillStyle = '#c8b1a7';
      ctx.fillRect(x * width, y * height, light > .9 ? 1.5 : .8, light > .9 ? 1.5 : .8);
    }
    ctx.globalAlpha = 1;
    const halo = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, scale * 1.6);
    halo.addColorStop(0, '#ae4b2512');
    halo.addColorStop(.5, '#9b352210');
    halo.addColorStop(1, '#9b352200');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';

    // Parallel filaments form data channels, ending exactly at the node ports.
    for (const edge of WORKFLOW_EDGES) {
      for (let strand = 0; strand < 16; strand++) {
        ctx.beginPath();
        for (let j = 0; j <= 70; j++) {
          const [x, y] = projectFlow(flowPoint(edge, j / 70, strand / 16 * TAU), j / 70);
          if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = edge[0] < 2 ? '#729d9b' : '#d89970';
        ctx.globalAlpha = assembled * .18;
        ctx.lineWidth = .6;
        ctx.stroke();
      }

    }

    const stride = width < 550 ? 2 : 1;
    for (let i = 0; i < particles.length; i += stride) {
      const p = particles[i];
      const phase = (p.phase + t * (.115 + p.light * .035)) % 1;
      const target = flowPoint(p.edge, phase, p.v);
      const position = target.map((value, axis) => value * assembled + p.scatter[axis] * (1 - assembled));
      const [x, y, depth] = projectFlow(position, phase);
      // Fade at both ends: recycling never draws a backwards jump across an edge.
      const envelope = Math.min(1, phase * 14, (1 - phase) * 14);
      const brightness = envelope * (.45 + p.light * .5);
      const color = p.edge[0] < 2 ? 3 : p.color;
      ctx.globalAlpha = brightness;
      ctx.fillStyle = COLORS[color];
      const size = p.size * depth;
      ctx.fillRect(x, y, size, size);
      if (p.light > .91) {
        const tailPhase = Math.max(0, phase - .035);
        const tailTarget = flowPoint(p.edge, tailPhase, p.v);
        const tail = projectFlow(tailTarget.map((value, axis) => value * assembled + p.scatter[axis] * (1 - assembled)), tailPhase);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tail[0], tail[1]);
        ctx.strokeStyle = COLORS[color];
        ctx.globalAlpha = brightness * .55;
        ctx.lineWidth = .8;
        ctx.stroke();
        const glowSize = (11 + p.size * 9) * depth;
        if (p.light > .975 && sprites[color]) ctx.drawImage(sprites[color], x - glowSize / 2, y - glowSize / 2, glowSize, glowSize);
      }
    }

    for (const edge of WORKFLOW_EDGES) {
      // Arrowheads keep the workflow direction visible even with motion disabled.
      const a = projectFlow(flowPoint(edge, .66), .66), b = projectFlow(flowPoint(edge, .7), .7);
      const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const arrow = Math.max(5, scale * .075);
      ctx.beginPath();
      ctx.moveTo(b[0] - Math.cos(angle - .55) * arrow, b[1] - Math.sin(angle - .55) * arrow);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(b[0] - Math.cos(angle + .55) * arrow, b[1] - Math.sin(angle + .55) * arrow);
      ctx.globalAlpha = assembled * .85;
      ctx.strokeStyle = '#ffe3b7';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#181317';
      ctx.stroke();
      ctx.strokeStyle = '#ffe3b7';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    // Glass-like processing nodes: projected faces, edge particles and lit ports.
    for (let index = 0; index < WORKFLOW_NODES.length; index++) {
      const node = WORKFLOW_NODES[index];
      const reveal = Math.max(0, Math.min(1, progress * 2.4 - (node.position[0] + 2) * .25));
      const at = (x, y, z = .16) => project(node.position.map((value, axis) => value + [x, y, z][axis]));
      const corners = [[-.25, -.25], [.25, -.25], [.25, .25], [-.25, .25]];
      function outline(z) {
        ctx.beginPath();
        corners.forEach(([x, y], i) => {
          const point = at(x, y, z);
          if (i === 0) ctx.moveTo(point[0], point[1]); else ctx.lineTo(point[0], point[1]);
        });
        ctx.closePath();
      }
      const center = at(0, 0), size = scale * center[2];
      const pulse = .75 + .25 * Math.sin(t * 1.4 - index * .8);
      const glowSize = size * 1.35;
      if (sprites[node.color]) {
        ctx.globalAlpha = reveal * .55;
        ctx.drawImage(sprites[node.color], center[0] - glowSize / 2, center[1] - glowSize / 2, glowSize, glowSize);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = reveal;
      outline(-.16);
      ctx.fillStyle = '#19171b';
      ctx.fill();
      ctx.strokeStyle = COLORS[node.color];
      ctx.globalAlpha = reveal * .32;
      ctx.lineWidth = .8;
      ctx.stroke();
      for (const [x, y] of corners) {
        const back = at(x, y, -.16), front = at(x, y);
        ctx.beginPath(); ctx.moveTo(...back.slice(0, 2)); ctx.lineTo(...front.slice(0, 2)); ctx.stroke();
      }
      outline(.16);
      ctx.globalAlpha = reveal;
      ctx.fillStyle = '#201b1ff0';
      ctx.fill();
      ctx.strokeStyle = COLORS[node.color];
      ctx.globalAlpha = reveal * .8;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Small line icons evoke analytical nodes without reproducing the Loginom UI.
      ctx.globalAlpha = reveal;
      ctx.lineWidth = width < 550 ? 1 : 1.4;
      function segment(points) {
        ctx.beginPath();
        points.forEach(([x, y], i) => {
          const point = at(x, y, .18);
          if (i === 0) ctx.moveTo(point[0], point[1]); else ctx.lineTo(point[0], point[1]);
        });
        ctx.stroke();
      }
      if (node.icon === 'table') {
        segment([[-.12, -.12], [.12, -.12], [.12, .12], [-.12, .12], [-.12, -.12]]);
        segment([[-.12, -.035], [.12, -.035]]);
        segment([[-.12, .045], [.12, .045]]);
        segment([[-.035, -.12], [-.035, .12]]);
      } else if (node.icon === 'join') {
        segment([[-.13, -.11], [-.05, -.11], [.06, 0], [.15, 0]]);
        segment([[-.13, .11], [-.05, .11], [.06, 0]]);
      } else if (node.icon === 'calculate') {
        segment([[.12, -.13], [.06, -.15], [.015, -.1], [-.015, .1], [-.06, .15], [-.12, .13]]);
        segment([[-.1, -.025], [.1, -.025]]);
      } else {
        segment([[-.13, -.025], [-.13, .12], [.14, .12]]);
        segment([[-.04, -.085], [-.04, .12]]);
        segment([[.06, -.15], [.06, .12]]);
        segment([[.14, -.04], [.14, .12]]);
      }

      ctx.globalCompositeOperation = 'lighter';
      const incoming = WORKFLOW_EDGES.some(([, to]) => to === index);
      const outgoing = WORKFLOW_EDGES.some(([from]) => from === index);
      for (const direction of [incoming ? -1 : 0, outgoing ? 1 : 0].filter(Boolean)) {
        const [x, y] = at(direction * .285, 0, 0);
        ctx.globalAlpha = reveal * pulse;
        ctx.fillStyle = '#ffe8ca';
        const port = Math.max(2, size * .025);
        ctx.fillRect(x - port / 2, y - port / 2, port, port);
        if (sprites[node.color]) ctx.drawImage(sprites[node.color], x - 12, y - 12, 24, 24);
      }
      // Stationary edge dust adds texture; data packets themselves only move forward.
      for (let dust = 0; dust < 90; dust++) {
        const along = (dust % 23) / 22;
        const side = Math.floor(dust / 23);
        const a = corners[side], b = corners[(side + 1) % 4];
        const [x, y] = at(a[0] + (b[0] - a[0]) * along, a[1] + (b[1] - a[1]) * along);
        ctx.globalAlpha = reveal * (.2 + .45 * (Math.sin(dust * 12.9 + index) ** 2));
        ctx.fillStyle = COLORS[node.color];
        ctx.fillRect(x, y, .8, .8);
      }
      ctx.globalCompositeOperation = 'source-over';
      const label = at(0, .43, 0);
      ctx.globalAlpha = reveal;
      ctx.fillStyle = '#dccbc5';
      ctx.font = `${width < 550 ? 10 : 13}px "Source Sans Pro", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(node.label, label[0], label[1]);
      ctx.globalCompositeOperation = 'lighter';
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    root.setAttribute('data-rendered', '');
  }

  function canAnimate() { return !disposed && visible && !doc.hidden && !paused && !motion.matches; }
  function stop() {
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null;
    lastTime = null;
  }
  function tick(now) {
    frame = null;
    if (!canAnimate()) { lastTime = null; return; }
    // Cap at 30fps on high-refresh displays and never catch up after a hidden tab.
    if (lastTime !== null && now - lastTime < 30) {
      frame = win.requestAnimationFrame(tick);
      return;
    }
    const delta = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, .06);
    lastTime = now;
    elapsed += delta;
    entrance += delta;
    interaction.step(delta);
    draw();
    frame = win.requestAnimationFrame(tick);
  }
  function schedule() {
    if (!canAnimate()) { stop(); return; }
    if (frame === null) frame = win.requestAnimationFrame(tick);
  }
  function resize() {
    const rect = root.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    interaction.resize(width, height);
    dpr = Math.min(win.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    draw();
  }
  function onPause() {
    paused = !paused;
    if (!paused) interaction.reset();
    syncControls();
    schedule();
  }
  function onReplay() {
    elapsed = entrance = 0;
    paused = false;
    interaction.reset();
    syncControls();
    draw();
    schedule();
  }
  function onMotionChange() {
    interaction.reset();
    syncControls();
    if (!motion.matches) entrance = 3.2;
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
  function onPointerChange() { if (!finePointer.matches) interaction.reset(); }
  function onVisibilityChange() {
    if (doc.hidden) interaction.reset();
    schedule();
  }
  const resizeObserver = new win.ResizeObserver(resize);
  const intersectionObserver = new win.IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (!visible) interaction.reset();
    schedule();
  }, { threshold: 0 });

  pause.addEventListener('click', onPause);
  replay.addEventListener('click', onReplay);
  root.addEventListener('pointermove', onPointer, { passive: true });
  root.addEventListener('pointerleave', onPointerLeave);
  root.addEventListener('pointercancel', onPointerCancel);
  win.addEventListener('blur', onPointerCancel);
  doc.addEventListener('visibilitychange', onVisibilityChange);
  motion.addEventListener('change', onMotionChange);
  finePointer.addEventListener('change', onPointerChange);
  resizeObserver.observe(root);
  intersectionObserver.observe(root);
  syncControls();
  resize();

  return () => {
    disposed = true;
    interaction.reset();
    stop();
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    pause.removeEventListener('click', onPause);
    replay.removeEventListener('click', onReplay);
    root.removeEventListener('pointermove', onPointer);
    root.removeEventListener('pointerleave', onPointerLeave);
    root.removeEventListener('pointercancel', onPointerCancel);
    win.removeEventListener('blur', onPointerCancel);
    doc.removeEventListener('visibilitychange', onVisibilityChange);
    motion.removeEventListener('change', onMotionChange);
    finePointer.removeEventListener('change', onPointerChange);
    controls.hidden = true;
  };
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-flow]');
  if (root) {
    // A renderer failure must leave the static illustration and install flow usable.
    try { mountDataFlow(root); } catch { root.removeAttribute('data-rendered'); }
  }
}
