// Скопления данных — a continuous, volumetric sculpture made only from particles.
// All particles travel in +X. Branch recycling happens beyond a faded endpoint.
// The host owns the canvas lifecycle, pixel ratio, clearing and motion controls.
const TAU = Math.PI * 2;
const COUNT = 6400;
const PALETTE = ['#b66451', '#df8067', '#eda681', '#f8cba3', '#fff0d7', '#8abfc5'];
const OPACITY = [.13, .32, .58, .88];

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function smooth(value) {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}

function bell(x, center, width) {
  return Math.exp(-(((x - center) / width) ** 2));
}

function sprite(createCanvas, color) {
  const canvas = createCanvas();
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, `${color}cc`);
  gradient.addColorStop(.09, `${color}70`);
  gradient.addColorStop(.3, `${color}20`);
  gradient.addColorStop(1, `${color}00`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return canvas;
}

// A cumulative density map slows the current inside its broadest folds. The
// strictly increasing map preserves forward motion without stationary spheres.
function densityMap() {
  const size = 512;
  const cdf = new Float32Array(size + 1);
  for (let i = 1; i <= size; i++) {
    const x = i / size;
    cdf[i] = cdf[i - 1] + .65 + .7 * bell(x, .18, .14)
      + 2.9 * bell(x, .54, .2) + 1.1 * bell(x, .39, .065)
      + .85 * bell(x, .68, .08) + .4 * bell(x, .84, .12);
  }
  const total = cdf[size];
  const inverse = new Float32Array(size + 1);
  let source = 1;
  for (let i = 0; i <= size; i++) {
    const target = i / size * total;
    while (source < size && cdf[source] < target) source++;
    inverse[i] = (source - 1 + (target - cdf[source - 1])
      / (cdf[source] - cdf[source - 1])) / size;
  }
  return inverse;
}

export function createScene({ createCanvas }) {
  const rng = seededRandom(9201607);
  const glows = PALETTE.map(color => sprite(createCanvas, color));
  const density = densityMap();
  const particles = Array.from({ length: COUNT }, (_, index) => {
    const angle = rng() * TAU;
    const radius = Math.min(1.75, Math.sqrt(-Math.log(Math.max(.0001, rng()))) * .61);
    return {
      phase: rng(),
      speed: .028 + rng() * .014,
      route: index % 4,
      family: index % 10,
      angle,
      radius,
      seed: rng() * TAU,
      size: .58 + rng() ** 2 * 1.17,
      light: rng(),
      color: rng(),
      scatterX: (rng() - .5) * 760,
      scatterY: (rng() - .5) * 510,
      scatterZ: (rng() - .5) * 210,
    };
  });
  const dust = Array.from({ length: 100 }, () => ({
    x: (rng() - .5) * 790,
    y: (rng() - .5) * 530,
    alpha: .035 + rng() * .12,
    radius: .35 + rng() * .4,
  }));
  // Reused frame buffers keep allocation and garbage collection out of animation.
  const pointsX = new Float32Array(COUNT);
  const pointsY = new Float32Array(COUNT);
  const sourceX = new Float32Array(COUNT);
  const sourceY = new Float32Array(COUNT);
  const pointsR = new Float32Array(COUNT);
  const pointsA = new Float32Array(COUNT);
  const pointsU = new Float32Array(COUNT);
  const pointsCore = new Float32Array(COUNT);
  const next = new Int32Array(COUNT);
  const heads = new Int32Array(PALETTE.length * OPACITY.length);
  const gleams = new Int32Array(COUNT);

  function draw(ctx, frame) {
    const { width, height, reducedMotion } = frame;
    if (!(width > 0 && height > 0)) return;
    const time = reducedMotion ? 11 : (frame.time || 0);
    const progress = reducedMotion ? 1 : Math.max(0, Math.min(1, frame.progress ?? 1));
    const detail = Math.max(.56, Math.min(1, frame.detail ?? 1));
    const count = Math.floor(COUNT * detail);
    const scale = Math.min(width / 820, height / 620);
    const centerX = width * .51;
    const centerY = height * .49;
    const interaction = reducedMotion ? null : frame.interaction;
    const yaw = -.1;
    const pitch = .24;
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const sp = Math.sin(pitch), cp = Math.cos(pitch);
    const globalFade = .15 + progress * .85;
    const dotScale = Math.max(.64, scale);
    heads.fill(-1);
    let gleamCount = 0;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#d9b6a2';
    for (let i = 0; i < dust.length * detail; i++) {
      const p = dust[i];
      ctx.globalAlpha = p.alpha * globalFade;
      ctx.beginPath();
      ctx.arc(centerX + p.x * scale, centerY + p.y * scale, p.radius * dotScale, 0, TAU);
      ctx.fill();
    }

    // Overlapping, elongated light beds follow the folds. They support the
    // point texture without giving the cloud a spherical or bounded silhouette.
    ctx.globalCompositeOperation = 'lighter';
    const haze = [
      [-211, -121, 235, 170, 5, .14],
      [-175, 86, 250, 150, 1, .18],
      [-29, -15, 385, 180, 1, .42],
      [-53, -44, 190, 85, 2, .38],
      [47, 0, 220, 85, 3, .32],
      [119, -29, 167, 69, 2, .26],
      [238, -115, 235, 150, 3, .16],
      [245, 68, 228, 145, 0, .18],
    ];
    for (const [x, y, wide, tall, color, alpha] of haze) {
      if (!glows[color]) continue;
      const w = wide * scale, h = tall * scale;
      ctx.globalAlpha = alpha * progress;
      ctx.drawImage(glows[color], centerX + x * scale - w / 2,
        centerY + y * scale - h / 2, w, h);
    }

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const phase = (p.phase + time * p.speed) % 1;
      const sample = phase * 512;
      const low = Math.floor(sample);
      const u = density[low] + (density[Math.min(512, low + 1)] - density[low]) * (sample - low);
      const incoming = p.route < 2 ? -1.15 : .9;
      const outgoing = p.route % 2 === 0 ? -1.17 : .67;
      const merge = 1 - smooth((u - .08) / .43);
      const split = smooth((u - .58) / .38);
      const backbone = -11 * Math.sin(u * Math.PI) - 16 * Math.sin(u * TAU);
      // The wide current gently twists through depth while its silhouette stays
      // asymmetric. Every cross section is a filled cloud, never a ring or tube.
      const radius = 19 + 30 * bell(u, .17, .17) + 57 * bell(u, .55, .23)
        + 18 * bell(u, .86, .13);
      const focus = bell(u, .53, .255);
      const core = p.family < 5 ? focus : 0;
      const angle = p.angle + u * 4.3 + Math.sin(time * .14 + p.seed) * .11;
      const fiber = 1 + .13 * Math.sin(u * 15 + p.seed) + .1 * Math.cos(u * 23 + p.angle);
      const radial = p.radius * radius * fiber * (1 - core * .65);
      const curveY = incoming * 114 * merge + outgoing * 112 * split + backbone;
      const curveZ = incoming * 15 * merge + outgoing * 20 * split + Math.sin(u * Math.PI) * 20;
      // Two uneven, densely folded layers lie inside a larger dim current.
      // Their overlapping elongated concentrations supply the sculpture's core;
      // the darker grains outside keep its edges feathered and dimensional.
      const fold = -35 * bell(u, .405, .105) + 27 * bell(u, .59, .095)
        - 18 * bell(u, .715, .08);
      const foldY = p.family < 3 ? fold - core * 11
        : p.family < 5 ? -fold * .43 + core * 26 : 0;
      const targetX = (u - .5) * 692;
      const targetY = curveY + Math.cos(angle) * radial + foldY;
      const targetZ = curveZ + Math.sin(angle) * radial * .87 + core * 22;
      const x = p.scatterX + (targetX - p.scatterX) * progress;
      const y = p.scatterY + (targetY - p.scatterY) * progress;
      const z = p.scatterZ + (targetZ - p.scatterZ) * progress;
      const cameraY = y * cp - z * sp;
      const cameraZ = y * sp + z * cp;
      const cameraX = x * cy + cameraZ * sy;
      const depth = 1 + (-x * sy + cameraZ * cy) / 1100;
      const screenX = centerX + cameraX * scale;
      // A slight upward slant opens the negative space around the sculpture.
      const screenY = centerY + (cameraY - x * .07) * scale;
      sourceX[i] = screenX;
      sourceY[i] = screenY;
      const displacement = interaction?.sample(screenX, screenY);
      pointsX[i] = screenX + (displacement?.x ?? 0);
      pointsY[i] = screenY + (displacement?.y ?? 0);
      pointsR[i] = p.size * depth * dotScale * (1 + core * .36);
      pointsU[i] = u;
      pointsCore[i] = core;

      const endpoint = smooth(u / .065) * smooth((1 - u) / .075);
      const surface = Math.max(.17, Math.min(1, .66 + targetZ / 150));
      const pulsePosition = (time * .115 + p.route * .027) % 1;
      const pulse = bell(u, pulsePosition, .06) * .3;
      const shimmer = .9 + .1 * Math.sin(time * .82 + p.seed);
      const bodyLight = p.family < 5 ? .35 + core * .57 : .2;
      const alpha = Math.min(.98, endpoint * (bodyLight + p.light * .44 + pulse)
        * surface * shimmer * globalFade);
      pointsA[i] = alpha;
      let color = p.color < .08 && u < .43 ? 5
        : p.color > .965 ? 4
          : p.color > .76 || (p.radius < .22 && p.color > .38) ? 3
            : p.color > .37 ? 2 : p.color > .14 ? 1 : 0;
      // Give the incoming upper arm a cool mineral edge; copper remains dominant.
      if (incoming < 0 && u < .3 && p.radius > .7 && p.color < .4) color = 5;
      if (core > .48) color = p.color > .86 ? 4 : p.color > .19 ? 3 : 2;
      const opacity = alpha < .21 ? 0 : alpha < .44 ? 1 : alpha < .69 ? 2 : 3;
      const bucket = color * OPACITY.length + opacity;
      next[i] = heads[bucket];
      heads[bucket] = i;
      if (p.light > (core > .4 ? .949 : .98) && endpoint > .5) gleams[gleamCount++] = i;
    }

    // Batching the small round grains yields 24 fills for the complete point
    // cloud, instead of thousands of individual Canvas state changes.
    for (let bucket = 0; bucket < heads.length; bucket++) {
      ctx.fillStyle = PALETTE[Math.floor(bucket / OPACITY.length)];
      ctx.globalAlpha = OPACITY[bucket % OPACITY.length];
      ctx.beginPath();
      for (let i = heads[bucket]; i !== -1; i = next[i]) {
        const x = pointsX[i], y = pointsY[i], radius = pointsR[i];
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, TAU);
      }
      ctx.fill();
    }

    // Sparse, softly luminous grains carry the direction. Tails are open strokes
    // along +X, and vanish at the ends along with their particles.
    ctx.lineCap = 'round';
    for (let j = 0; j < gleamCount; j++) {
      const i = gleams[j];
      const p = particles[i];
      const x = pointsX[i], y = pointsY[i];
      const alpha = pointsA[i];
      const u = pointsU[i];
      const incoming = p.route < 2 ? -1.15 : .9;
      const outgoing = p.route % 2 === 0 ? -1.17 : .67;
      const mergeT = Math.max(0, Math.min(1, (u - .08) / .43));
      const splitT = Math.max(0, Math.min(1, (u - .58) / .38));
      const slope = (-incoming * 114 * 6 * mergeT * (1 - mergeT) / .43
        + outgoing * 112 * 6 * splitT * (1 - splitT) / .38
        - 11 * Math.PI * Math.cos(u * Math.PI)
        - 16 * TAU * Math.cos(u * TAU)) / 692 - .07;
      const length = (3.5 + p.light * 4) * scale * progress;
      let tailX = sourceX[i] - length;
      let tailY = sourceY[i] - length * slope;
      if (interaction) {
        const displacement = interaction.sample(tailX, tailY);
        tailX += displacement.x;
        tailY += displacement.y;
      }
      ctx.globalAlpha = alpha * .43;
      ctx.strokeStyle = p.color < .08 && u < .4 ? PALETTE[5] : PALETTE[3];
      ctx.lineWidth = .6 * dotScale;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(x, y);
      ctx.stroke();
      if ((j % 3 === 0 || pointsCore[i] > .4) && glows[3]) {
        const flare = p.light > .995;
        const size = (flare ? 30 + p.size * 11 : 11 + p.size * 7) * dotScale;
        ctx.globalAlpha = alpha * (flare ? .75 : .39);
        ctx.drawImage(glows[3], x - size / 2, y - size / 2, size, size);
      }
      ctx.globalAlpha = alpha * .85;
      ctx.fillStyle = PALETTE[4];
      ctx.beginPath();
      ctx.arc(x, y, pointsR[i] * .65, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  return { draw };
}
