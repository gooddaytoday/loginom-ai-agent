import { VOID_SIGNS, voidIntervalsAtX, voidDistance, segmentAvoidsVoids } from './voids-geometry.mjs';

// The main current bends around the signs. A sparse layer of drifting grains
// passes through their softened, translucent negative space.
const TAU = Math.PI * 2;
const COLORS = ['#eda47f', '#e68b80', '#ffd6ab', '#82b9bd'];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mix = (a, b, t) => a + (b - a) * t;

function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function curve(points, t) {
  const q = 1 - t;
  return [
    q * q * q * points[0][0] + 3 * q * q * t * points[1][0] + 3 * q * t * t * points[2][0] + t * t * t * points[3][0],
    q * q * q * points[0][1] + 3 * q * q * t * points[1][1] + 3 * q * t * t * points[2][1] + t * t * t * points[3][1],
  ];
}

export const FLOW_ROUTES = [
  { points: [[8, 594], [85, 487], [74, 363], [236, 353]], width: 20, color: 3, count: 360, alpha: .31, signs: [], input: true },
  { points: [[4, 172], [60, 225], [89, 352], [235, 354]], width: 18, color: 1, count: 330, alpha: .26, signs: [], input: true },
  { points: [[34, 376], [186, 320], [309, 391], [557, 347]], width: 56, color: 0, count: 1550, alpha: .92, signs: [0, 1] },
  { points: [[338, 354], [563, 369], [689, 155], [1035, 131]], width: 61, color: 0, count: 1770, alpha: .84, signs: [1, 2] },
  { points: [[338, 357], [559, 338], [718, 657], [1040, 468]], width: 56, color: 1, count: 1610, alpha: .82, signs: [1, 3] },
];

const signBounds = VOID_SIGNS.map(sign => {
  const ys = sign.paths.flat().map(point => point[1]);
  return { x: sign.x, low: Math.min(...ys) - sign.radius, high: Math.max(...ys) + sign.radius };
});
const intervalCache = new Map();

function blockedAt(x) {
  const key = Math.round(x * 2);
  if (!intervalCache.has(key)) {
    // The additional clearance covers rounding, particle radius and the width
    // of a silk fiber. It also leaves a softly feathered edge around each void.
    intervalCache.set(key, voidIntervalsAtX(key / 2, 3.4));
  }
  return intervalCache.get(key);
}

function sectionAt(route, u) {
  const [x, baseY] = curve(route.points, u);
  const envelope = Math.max(0, Math.sin(Math.PI * u));
  const center = baseY + Math.sin(u * 7.2) * envelope * 3.5;
  let width = route.width * (.59 + .41 * Math.pow(envelope, .65));
  let presence = 0;
  for (const index of route.signs) {
    const sign = signBounds[index];
    const weight = Math.exp(-(((x - sign.x) / 83) ** 2));
    const required = Math.max(Math.abs(sign.low - center), Math.abs(sign.high - center)) + 34;
    width += Math.max(0, required - width) * weight;
    presence = Math.max(presence, weight);
  }
  const top = center - width, bottom = center + width;
  const intervals = [];
  let cursor = top;
  for (const [low, high] of blockedAt(x)) {
    if (high <= top || low >= bottom) continue;
    if (low > cursor) intervals.push([cursor, Math.min(low, bottom)]);
    cursor = Math.max(cursor, high);
    if (cursor >= bottom) break;
  }
  if (cursor < bottom) intervals.push([cursor, bottom]);
  const length = intervals.reduce((sum, [low, high]) => sum + high - low, 0);
  return { x, center, width, top, bottom, intervals, length, presence };
}

function pointInSection(section, lane) {
  let distance = clamp((lane + 1) / 2, .00001, .99999) * section.length;
  for (const [low, high] of section.intervals) {
    if (distance <= high - low) return [section.x, low + distance];
    distance -= high - low;
  }
  // Only very narrow atmospheric inputs can be wholly occluded by a stroke.
  // Their particles slide outside its last boundary instead of entering it.
  const blocked = blockedAt(section.x);
  return [section.x, blocked.length ? blocked[blocked.length - 1][1] + 1 : section.bottom];
}

// A small pure sampling API for independent geometry checks. Time transports
// particles along this field; it never moves or closes the negative shapes.
export function sampleFlowPoint(routeIndex, u, lane) {
  const route = typeof routeIndex === 'number' ? FLOW_ROUTES[routeIndex] : routeIndex;
  return pointInSection(sectionAt(route, clamp(u, 0, 1)), clamp(lane, -1, 1));
}

// Fine airborne grains follow the broad current without being excluded from
// a sign. Their continuous paths make the negative forms feel permeable.
export function sampleDriftPoint(routeIndex, u, lane, time = 0) {
  const route = typeof routeIndex === 'number' ? FLOW_ROUTES[routeIndex] : routeIndex;
  const position = clamp(u, 0, 1);
  const section = sectionAt(route, position);
  const spread = clamp(lane, -1, 1);
  return [section.x, section.center + spread * section.width * .85
    + Math.sin(position * 8.4 - time * .36 + spread * 3) * 5];
}

function trace(ctx, points, start = 0, end = points.length - 1, bend = null, clearances = null) {
  let previous = null, previousRaw = null;
  for (let i = start; i <= end; i++) {
    const raw = points[i];
    if (!raw) { previous = previousRaw = null; continue; }
    const point = bend ? bend(raw, clearances[i]) : raw;
    // The endpoints alone cannot protect a curved/diagonal negative stroke.
    // Recheck only segments touched by the cursor; cached rest geometry is safe.
    const crossed = previous && (point !== raw || previous !== previousRaw)
      && !segmentAvoidsVoids(previous, point, .6);
    if (!previous || crossed) ctx.moveTo(point[0], point[1]);
    else ctx.lineTo(point[0], point[1]);
    previous = point;
    previousRaw = raw;
  }
}

function anticipateFiber(raw, sections, lanes) {
  const displacements = raw.map((point, i) => point[1] - sections[i].center - lanes[i] * sections[i].width);
  return raw.map((point, i) => {
    let above = 0, below = 0;
    // Propagating a displacement, rather than averaging positions across a
    // hole, lets each strand turn before it reaches a tall negative stroke.
    for (let j = Math.max(0, i - 34); j <= Math.min(raw.length - 1, i + 34); j++) {
      const distance = Math.abs(raw[j][0] - point[0]);
      if (distance >= 46) continue;
      const falloff = Math.cos(distance / 46 * Math.PI / 2) ** 2;
      const deviation = displacements[j] * falloff;
      above = Math.min(above, deviation);
      below = Math.max(below, deviation);
    }
    const original = displacements[i];
    const displacement = original < -.2 ? above : original > .2 ? below : -above > below ? above : below;
    let y = sections[i].center + lanes[i] * sections[i].width + displacement;
    for (const [low, high] of blockedAt(point[0])) {
      if (y >= low && y <= high) y = displacement < 0 ? low - .01 : high + .01;
    }
    return [point[0], y];
  });
}

function makeGlow(createCanvas, color) {
  const canvas = createCanvas();
  canvas.width = canvas.height = 48;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
  gradient.addColorStop(0, '#ffe7ca');
  gradient.addColorStop(.11, color);
  gradient.addColorStop(.30, `${color}48`);
  gradient.addColorStop(1, `${color}00`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 48, 48);
  return canvas;
}

// Both paths consume the same deterministic construction, so incremental
// preparation changes scheduling without changing geometry or random seeds.
export function createScene(options) {
  return completeSteps(buildScene(options));
}

function completeSteps(steps) {
  let step;
  do { step = steps.next(); } while (!step.done);
  return step.value;
}

export function prepareScene(options) {
  return runPreparation(buildScene(options), options);
}

async function runPreparation(steps, options) {
  const {
    signal, now = () => performance.now(),
    yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)),
  } = options;
  let deadline = now() + 6;
  try {
    while (true) {
      signal?.throwIfAborted();
      const step = steps.next();
      if (step.done) {
        // Let input/painting run before the engine renders the first bitmap.
        await yieldControl();
        signal?.throwIfAborted();
        return step.value;
      }
      if (now() >= deadline) {
        await yieldControl();
        deadline = now() + 6;
      }
    }
  } finally { steps.return(); }
}

function* buildScene({ createCanvas }) {
  const rng = random(928517);
  const glows = COLORS.map(color => makeGlow(createCanvas, color));
  const routes = [];
  for (const [routeIndex, route] of FLOW_ROUTES.entries()) {
    const stepCount = route.input ? 170 : 330;
    const sections = [];
    for (let i = 0; i <= stepCount; i++) {
      sections.push(sectionAt(route, i / stepCount));
      if (i % 16 === 0) yield;
    }
    const fiberCount = route.input ? 22 : 94;
    const fibers = [];
    for (let i = 0; i < fiberCount; i++) {
      const lane = (i / (fiberCount - 1) - .5) * 1.98;
      const lanes = sections.map((_, j) => clamp(lane + Math.sin(j / stepCount * 8.5 + lane * 3.1) * .016, -.999, .999));
      const raw = sections.map((section, j) => pointInSection(section, lanes[j]));
      const diverted = route.input ? raw : anticipateFiber(raw, sections, lanes);
      const points = [];
      let previous = null;
      for (let j = 0; j <= stepCount; j++) {
        const point = diverted[j];
        // Across a separatrix there is no connecting segment. This is a break
        // in the flow domain, never a line painted across an empty letter.
        if (previous && (Math.abs(point[1] - previous[1]) > Math.max(6, (point[0] - previous[0]) * 2.4)
          || !segmentAvoidsVoids(previous, point, 1.05))) points.push(null);
        points.push(point);
        previous = point;
      }
      // Static distances keep the interactive path as inexpensive as the
      // original cached fibers, even with hundreds of thousands of samples.
      const clearances = points.map(point => point ? voidDistance(...point) : 0);
      fibers.push({ points, clearances, lane, phase: rng() * TAU, light: rng() });
      yield;
    }
    const particles = Array.from({ length: route.count }, () => ({
      phase: rng(), lane: (rng() + rng() - 1) * .99,
      speed: .022 + rng() * .029, light: rng(), size: .55 + rng() * .87,
      color: rng() < .14 ? 2 : rng() < .025 ? 3 : route.color,
    }));
    routes.push({ ...route, index: routeIndex, sections, fibers, particles });
    yield;
  }

  // The translucent body is also constructed from free sections. No opaque
  // mask, destination-out pass, letter stroke or glyph bitmap exists here.
  const body = createCanvas();
  body.width = 1500;
  body.height = 1050;
  const bodyCtx = body.getContext('2d');
  if (bodyCtx) {
    bodyCtx.scale(1.5, 1.5);
    bodyCtx.globalCompositeOperation = 'lighter';
    for (const route of routes) {
      if (route.input) continue;
      for (let i = 0; i < route.sections.length - 1; i++) {
        const section = route.sections[i];
        const next = route.sections[i + 1];
        const u = i / (route.sections.length - 1);
        const fade = Math.min(1, u * 9, (1 - u) * 9);
        const gradient = bodyCtx.createLinearGradient(0, section.top, 0, section.bottom);
        const color = COLORS[route.color];
        gradient.addColorStop(0, `${color}00`);
        gradient.addColorStop(.18, `${color}55`);
        gradient.addColorStop(.48, color);
        gradient.addColorStop(.77, `${color}75`);
        gradient.addColorStop(1, `${color}00`);
        bodyCtx.fillStyle = gradient;
        bodyCtx.globalAlpha = route.alpha * fade * (.095 + section.presence * .115);
        for (const [low, high] of section.intervals) {
          bodyCtx.fillRect(section.x, low, next.x - section.x + .35, high - low);
        }
        if (i % 16 === 0) yield;
      }
    }
  }

  yield;

  // Feather the cached translucent matter itself. This lets a little light
  // diffuse into the voids without painting solid glyphs or blurring the UI.
  const softBody = createCanvas();
  softBody.width = body.width;
  softBody.height = body.height;
  const softBodyCtx = softBody.getContext('2d');
  if (softBodyCtx && bodyCtx) {
    softBodyCtx.filter = 'blur(10px)';
    softBodyCtx.drawImage(body, 0, 0);
    softBodyCtx.filter = 'none';
  }

  const stars = Array.from({ length: 260 }, () => ({ x: rng() * 1000, y: 40 + rng() * 620, light: rng() }));
  const drifters = routes.filter(route => !route.input).flatMap(route =>
    Array.from({ length: 48 }, () => ({
      route: route.index, phase: rng(), lane: (rng() + rng() - 1) * .9,
      speed: .045 + rng() * .025, size: .8 + rng() * .75,
      light: rng(), color: rng() < .28 ? 2 : route.color,
    })));

  function* drawSteps(ctx, frame) {
    const { width, height } = frame;
    if (!(width > 0 && height > 0)) return;
    const time = frame.reducedMotion ? 12 : frame.time;
    const progress = frame.reducedMotion ? 1 : clamp(frame.progress, 0, 1);
    const scale = Math.min(width / 1000, height / 700) * .96;
    const interaction = frame.reducedMotion ? null : frame.interaction;
    const bend = (point, clearance, free = false) => {
      if (!interaction) return point;
      const offset = interaction.sample(
        width * .5 + (point[0] - 500) * scale,
        height * .49 + (point[1] - 350) * scale,
      );
      if (!offset.x && !offset.y) return point;
      let dx = offset.x / scale * .74, dy = offset.y / scale * .74;
      if (!free) {
        const distance = clearance ?? voidDistance(...point);
        const edge = clamp((distance - 3.1) / 26, 0, 1);
        const feather = edge * edge * (3 - 2 * edge);
        // A distance field is 1-Lipschitz: limiting travel below the available
        // clearance keeps the entire move outside the hole, in any direction.
        const safe = Math.max(0, distance - 2) * .8;
        const weight = Math.min(feather, safe / Math.max(.0001, Math.hypot(dx, dy)));
        dx *= weight;
        dy *= weight;
      }
      return dx || dy ? [point[0] + dx, point[1] + dy] : point;
    };
    const mobile = (frame.detail ?? 1) < .8;
    ctx.save();
    ctx.translate(width * .5, height * .49);
    ctx.scale(scale, scale);
    ctx.translate(-500, -350);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = progress;
    if (bodyCtx) ctx.drawImage(softBodyCtx ? softBody : body, 0, 0, 1000, 700);

    ctx.fillStyle = '#b98d81';
    for (const star of stars) {
      if (voidDistance(star.x, star.y) < 5) continue;
      ctx.globalAlpha = progress * (.05 + star.light * .12);
      ctx.fillRect(star.x, star.y, .45 + star.light * .5, .45 + star.light * .5);
    }

    for (const route of routes) {
      const gradient = ctx.createLinearGradient(...route.points[0], ...route.points[3]);
      gradient.addColorStop(0, `${COLORS[route.color]}00`);
      gradient.addColorStop(.10, COLORS[route.color]);
      gradient.addColorStop(.45, '#e9b098');
      gradient.addColorStop(.67, '#ffdab3');
      gradient.addColorStop(.87, COLORS[route.color]);
      gradient.addColorStop(1, `${COLORS[route.color]}00`);
      for (let i = 0; i < route.fibers.length; i += mobile ? 2 : 1) {
        const fiber = route.fibers[i];
        const shimmer = .87 + .13 * Math.sin(time * .43 + fiber.phase);
        ctx.strokeStyle = i % 19 === 0 ? '#91b7b6' : gradient;
        ctx.globalAlpha = progress * route.alpha * shimmer * (.040 + (1 - Math.abs(fiber.lane)) * .072);
        ctx.lineWidth = i % 8 === 0 ? 1.08 : .60;
        ctx.beginPath();
        trace(ctx, fiber.points, 0, fiber.points.length - 1, interaction ? bend : null, fiber.clearances);
        ctx.stroke();
        if (i % 9 === 0) {
          const start = Math.floor((time * .026 + fiber.light) % 1 * (fiber.points.length - 1));
          const end = Math.min(fiber.points.length - 1, start + 54);
          ctx.globalAlpha *= 1.2;
          ctx.lineWidth = .80;
          ctx.beginPath();
          trace(ctx, fiber.points, start, end, interaction ? bend : null, fiber.clearances);
          ctx.stroke();
        }
        yield;
      }
      for (let i = 0; i < route.particles.length; i += mobile ? 2 : 1) {
        if (i % 64 === 0) yield;
        const particle = route.particles[i];
        const u = (particle.phase + time * particle.speed) % 1;
        const point = bend(sampleFlowPoint(route.index, u, particle.lane));
        const before = bend(sampleFlowPoint(route.index, Math.max(0, u - .004), particle.lane));
        const after = bend(sampleFlowPoint(route.index, Math.min(1, u + .004), particle.lane));
        if (!segmentAvoidsVoids(before, after, 1.6)) continue;
        const fade = Math.min(1, u * 13, (1 - u) * 13);
        const distance = voidDistance(point[0], point[1]);
        // Density fades over a broad, slightly varied fringe instead of
        // gathering along a sharp, uniformly bright cutout boundary.
        const edge = clamp((distance - 2) / (15 + particle.light * 8), 0, 1);
        const feather = .12 + .88 * edge * edge * (3 - 2 * edge);
        ctx.globalAlpha = progress * route.alpha * fade * feather * (.24 + particle.light * .43);
        if (particle.light > .965 && distance > 13 && glows[particle.color]) {
          const size = particle.size * 8;
          ctx.drawImage(glows[particle.color], point[0] - size / 2, point[1] - size / 2, size, size);
        } else {
          ctx.fillStyle = COLORS[particle.color];
          ctx.beginPath();
          ctx.arc(point[0], point[1], particle.size, 0, TAU);
          ctx.fill();
        }
        if (particle.light > .84 && segmentAvoidsVoids(before, point, .6)) {
          ctx.globalAlpha *= .32;
          ctx.strokeStyle = COLORS[particle.color];
          ctx.lineWidth = .5;
          ctx.beginPath();
          ctx.moveTo(before[0], before[1]);
          ctx.lineTo(point[0], point[1]);
          ctx.stroke();
        }
      }
    }
    for (let i = 0; i < drifters.length; i += mobile ? 2 : 1) {
      if (i % 32 === 0) yield;
      const particle = drifters[i];
      const u = (particle.phase + time * particle.speed) % 1;
      const [x, y] = bend(sampleDriftPoint(particle.route, u, particle.lane, time), undefined, true);
      const fade = Math.min(1, u * 12, (1 - u) * 12);
      ctx.globalAlpha = progress * fade * (.38 + particle.light * .37);
      ctx.fillStyle = COLORS[particle.color];
      ctx.beginPath();
      ctx.arc(x, y, particle.size, 0, TAU);
      ctx.fill();
      if (particle.light > .88 && glows[particle.color]) {
        const size = particle.size * 4;
        ctx.globalAlpha *= .35;
        ctx.drawImage(glows[particle.color], x - size / 2, y - size / 2, size, size);
      }
    }
    ctx.restore();
  }
  return {
    draw: (ctx, frame) => completeSteps(drawSteps(ctx, frame)),
    // Only offscreen warmup is incremental. A visible animation frame stays
    // atomic, so users never see a partially painted stream.
    prepareFrame: (ctx, frame, options = {}) => runPreparation(drawSteps(ctx, frame), options),
  };
}
