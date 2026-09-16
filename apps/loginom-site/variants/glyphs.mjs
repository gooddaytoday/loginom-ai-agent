// Four fleeting signs condense inside one continuous, right-moving material.
// The host owns the canvas, sizing, entrance, pointer, motion and animation clock.
const TAU = Math.PI * 2;
const COLORS = ['#efa277', '#ed806f', '#ffe0b1', '#84cbcd', '#bf7968'];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
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
    q * q * q * points[0][0] + 3 * q * q * t * points[1][0]
      + 3 * q * t * t * points[2][0] + t * t * t * points[3][0],
    q * q * q * points[0][1] + 3 * q * q * t * points[1][1]
      + 3 * q * t * t * points[2][1] + t * t * t * points[3][1],
  ];
}

function line(a, b, steps = 38) {
  return Array.from({ length: steps }, (_, i) => [
    mix(a[0], b[0], i / (steps - 1)), mix(a[1], b[1], i / (steps - 1)),
  ]);
}

function bezier(points, steps = 90) {
  return Array.from({ length: steps }, (_, i) => curve(points, i / (steps - 1)));
}

const SIGNS = [
  {
    x: 167, y: 357, color: 3, weight: 1.65,
    // The two internal dividers establish a table without an enclosing card.
    paths: [
      line([-43, -43], [48, -43]), line([-54, -15], [48, -15]),
      line([-54, 13], [48, 13]), line([-54, 41], [32, 41]),
      line([-20, -43], [-20, 41]), line([17, -43], [17, 41]),
    ],
  },
  {
    x: 461, y: 351, color: 0, weight: 2.35,
    paths: [
      bezier([[40, -67], [7, -96], [-4, -34], [-9, 3]]),
      bezier([[-9, 3], [-14, 52], [-24, 86], [-48, 61]]),
      bezier([[-42, -11], [-16, -10], [12, -12], [31, -16]], 65),
    ],
  },
  {
    x: 818, y: 166, color: 0, weight: 2.9,
    paths: [
      line([-47, 38], [-47, 7]), line([-16, 38], [-16, -13]),
      line([15, 38], [15, -37]), line([46, 38], [46, -66]),
    ],
  },
  {
    x: 829, y: 527, color: 1, weight: 1.95,
    paths: [
      line([-59, 32], [-24, -3]), line([-24, -3], [6, 12]),
      line([6, 12], [50, -40]),
    ],
  },
];

const STREAMS = [
  { points: [[8, 594], [85, 487], [74, 363], [236, 353]], width: 22, color: 3, count: 420, alpha: .25, input: true },
  { points: [[4, 172], [60, 225], [89, 352], [235, 354]], width: 20, color: 4, count: 380, alpha: .21, input: true },
  // These surfaces overlap broadly through the signs: there are no node ports
  // and no pinched ribbon endpoints at the table, function or either result.
  { points: [[42, 376], [186, 320], [309, 391], [548, 347]], width: 69, color: 0, count: 860, alpha: .83 },
  { points: [[352, 354], [563, 369], [689, 155], [1025, 131]], width: 76, color: 0, count: 1120, alpha: .84 },
  { points: [[352, 357], [559, 338], [718, 657], [1030, 468]], width: 69, color: 1, count: 880, alpha: .76 },
];

function ribbon(route, u, lane, time, phase = 0) {
  const [x, y] = curve(route.points, u);
  const envelope = Math.sin(Math.PI * u);
  // A broad folded sheet retains its body as it passes through each sign.
  // Only the very distant entrance and exit fade, via their paint gradient.
  const fold = Math.cos(u * 5.2 - time * .28 + lane * 1.7);
  const base = route.input ? .15 : .58;
  const spread = route.width * (base + (1 - base) * Math.pow(envelope, .68));
  return [x, y + lane * spread * (.78 + .22 * fold)
    + Math.sin(u * 7.7 - time * .37 + lane * 2.2) * envelope * route.width * .13
    + Math.sin(u * 11 - time * .36 + phase) * envelope * 2.5];
}

function parameterAtX(route, x) {
  let start = 0, end = 1;
  for (let step = 0; step < 15; step++) {
    const middle = (start + end) / 2;
    if (curve(route.points, middle)[0] < x) start = middle;
    else end = middle;
  }
  return (start + end) / 2;
}

function makeSprite(createCanvas, color) {
  const canvas = createCanvas();
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, '#fff6e8');
  glow.addColorStop(.055, '#fff0db');
  glow.addColorStop(.12, color);
  glow.addColorStop(.29, `${color}75`);
  glow.addColorStop(.62, `${color}15`);
  glow.addColorStop(1, `${color}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);
  return canvas;
}

export function createScene({ createCanvas }) {
  const rng = random(742037);
  const sprites = COLORS.map(color => makeSprite(createCanvas, color));
  const streams = STREAMS.map(route => ({
    ...route,
    particles: Array.from({ length: route.count }, () => ({
      u: rng(), lane: (rng() + rng() - 1), phase: rng() * TAU,
      speed: .028 + rng() * .037, light: rng(), size: .5 + rng() * .95,
      color: rng() < .12 ? 2 : rng() < .045 ? 3 : route.color,
      scatterX: rng() * 1000, scatterY: rng() * 700,
    })),
  }));
  const signs = SIGNS.map((sign, signIndex) => ({
    ...sign,
    dust: sign.paths.flatMap(path => path.flatMap((point, index) => {
      const next = path[Math.min(index + 1, path.length - 1)];
      return Array.from({ length: index % 3 ? 2 : 3 }, () => {
        const x = mix(point[0], next[0], rng()) + (rng() + rng() - 1) * sign.weight * 4.1;
        const y = mix(point[1], next[1], rng()) + (rng() + rng() - 1) * sign.weight * 4.1;
        const route = streams[signIndex === 0 ? 2 : signIndex === 1 ? (y < 0 ? 3 : 4) : signIndex + 1];
        const u = parameterAtX(route, sign.x + x);
        return {
          x, y, route, u, offset: sign.y + y - curve(route.points, u)[1],
          glow: rng(), size: .6 + rng() * .95, phase: rng() * TAU,
          scatterX: (rng() - .5) * 380, scatterY: (rng() - .5) * 380,
        };
      });
    })),
  }));
  const stars = Array.from({ length: 310 }, () => ({
    x: rng() * 1000, y: 35 + rng() * 620, phase: rng() * TAU,
    size: .28 + rng() * .82, light: rng(),
  }));

  function dot(ctx, x, y, radius, color, alpha, glow = false) {
    ctx.globalAlpha = clamp(alpha, 0, 1);
    if (glow && sprites[color]) {
      const size = radius * 10;
      ctx.drawImage(sprites[color], x - size / 2, y - size / 2, size, size);
    } else {
      ctx.fillStyle = COLORS[color];
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();
    }
  }

  function draw(ctx, frame) {
    const { width, height } = frame;
    if (!(width > 0 && height > 0)) return;
    const motion = !frame.reducedMotion;
    const time = motion ? frame.time : 12;
    const progress = frame.reducedMotion ? 1 : clamp(frame.progress, 0, 1);
    const scale = Math.min(width / 1000, height / 700) * .96;
    const interaction = motion ? frame.interaction : null;
    // The camera stays fixed. Every visible layer samples the same local
    // displacement in CSS pixels, then returns to the scene's design space.
    const bend = point => {
      if (!interaction) return point;
      const offset = interaction.sample(
        width * .5 + (point[0] - 500) * scale,
        height * .49 + (point[1] - 350) * scale,
      );
      if (!offset.x && !offset.y) return point;
      return [point[0] + offset.x / scale, point[1] + offset.y / scale];
    };
    const detail = frame.detail ?? 1;
    const stride = detail < .8 ? 2 : 1;
    const scatter = (1 - progress) ** 2;
    ctx.save();
    ctx.translate(width * .5, height * .49);
    ctx.scale(scale, scale);
    ctx.translate(-500, -350);

    // Light has no hard perimeter: all atmosphere fades into the page ground.
    const haze = ctx.createRadialGradient(520, 330, 8, 520, 330, 340);
    haze.addColorStop(0, '#ad614317');
    haze.addColorStop(.48, '#8c3d3510');
    haze.addColorStop(1, '#8c3d3500');
    ctx.globalAlpha = progress;
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, 1000, 700);
    ctx.globalCompositeOperation = 'lighter';

    for (const star of stars) {
      const twinkle = .8 + .2 * Math.sin(time * .38 + star.phase);
      dot(ctx, star.x, star.y, star.size, star.light > .96 ? 3 : 4,
        (.05 + star.light * .19) * twinkle * (.35 + progress * .65));
    }

    for (const route of streams) {
      const alpha = progress * route.alpha;
      const steps = detail < .8 ? 40 : 64;
      const gradient = ctx.createLinearGradient(...route.points[0], ...route.points[3]);
      gradient.addColorStop(0, `${COLORS[route.color]}00`);
      gradient.addColorStop(.10, COLORS[route.color]);
      gradient.addColorStop(.36, '#ea947f');
      gradient.addColorStop(.63, '#ffe1b5');
      gradient.addColorStop(.87, COLORS[route.color]);
      gradient.addColorStop(1, `${COLORS[route.color]}00`);

      if (!route.input) {
        // Overlapping transparent laminae create depth between the individual
        // filaments. Their edges follow the same moving folds as the particles.
        for (let sheet = 0; sheet < 10; sheet++) {
          const center = Math.sin(sheet * 2.1 + time * .13) * .28;
          const halfWidth = 1.06 - sheet * .082;
          ctx.beginPath();
          for (let step = 0; step <= steps; step++) {
            const point = bend(ribbon(route, step / steps, center - halfWidth, time));
            if (step === 0) ctx.moveTo(...point); else ctx.lineTo(...point);
          }
          for (let step = steps; step >= 0; step--) {
            ctx.lineTo(...bend(ribbon(route, step / steps, center + halfWidth, time)));
          }
          ctx.closePath();
          ctx.fillStyle = gradient;
          ctx.globalAlpha = alpha * (.007 + sheet * .001);
          ctx.fill();
        }
      }

      // Dense continuous fibers carry the current, while the stars remain fine
      // accents. A few broader fibers add a soft luminous layer below the silk.
      const strandCount = route.input ? 18 : detail < .8 ? 48 : 66;
      for (let strand = 0; strand < strandCount; strand++) {
        const lane = (strand / (strandCount - 1) - .5) * 2.02;
        ctx.beginPath();
        for (let step = 0; step <= steps; step++) {
          const point = bend(ribbon(route, step / steps, lane, time, lane * .6));
          if (step === 0) ctx.moveTo(...point); else ctx.lineTo(...point);
        }
        const depth = Math.max(0, 1 - Math.abs(lane));
        ctx.strokeStyle = strand % 13 === 0 ? '#a8cbca' : gradient;
        ctx.lineWidth = strand % 9 === 0 ? 2.8 : strand % 4 === 0 ? .95 : .55;
        ctx.globalAlpha = alpha * (strand % 9 === 0 ? .024 : .045 + depth * .105);
        ctx.stroke();
      }

      if (!route.input) {
        // Long, faint highlights slide downstream along individual folds.
        for (let highlight = 0; highlight < 13; highlight++) {
          const start = (highlight * .077 + time * .031) % 1;
          const end = Math.min(1, start + .20);
          const lane = Math.sin(highlight * 2.4) * .83;
          ctx.beginPath();
          for (let step = 0; step <= 18; step++) {
            const u = mix(start, end, step / 18);
            const point = bend(ribbon(route, u, lane, time));
            if (step === 0) ctx.moveTo(...point); else ctx.lineTo(...point);
          }
          ctx.strokeStyle = gradient;
          ctx.lineWidth = highlight % 4 === 0 ? 1.2 : .65;
          ctx.globalAlpha = alpha * .20 * Math.sin(start * Math.PI);
          ctx.stroke();
        }
      }
      for (let i = 0; i < route.particles.length; i += stride) {
        const particle = route.particles[i];
        const u = (particle.u + time * particle.speed) % 1;
        const target = ribbon(route, u, particle.lane, time, particle.phase);
        const [x, y] = bend([
          mix(target[0], particle.scatterX, scatter),
          mix(target[1], particle.scatterY, scatter),
        ]);
        const fade = Math.min(1, u * 13, (1 - u) * 13);
        const shimmer = .74 + .26 * Math.sin(time * 1.3 + particle.phase);
        const light = alpha * fade * (.19 + particle.light * .48) * shimmer;
        const isGlow = particle.light > .955;
        dot(ctx, x, y, particle.size * .82, particle.color, light, isGlow);
        if (particle.light > .82 && progress > .9 && !route.input) {
          // Short tapered dashes move with the current and expose its direction.
          const tail = bend(ribbon(route, Math.max(0, u - .020), particle.lane, time, particle.phase));
          ctx.globalAlpha = light * .35;
          ctx.strokeStyle = COLORS[particle.color];
          ctx.lineWidth = .6;
          ctx.beginPath();
          ctx.moveTo(...tail);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      }
    }

    for (let signIndex = 0; signIndex < signs.length; signIndex++) {
      const sign = signs[signIndex];
      // A trace of warm density keeps each operation readable. There is no
      // white core, separate glow, floating motion or isolated optical flare.
      for (const path of sign.paths) {
        ctx.beginPath();
        for (let j = 0; j < path.length; j++) {
          const [x, y] = path[j];
          const wave = Math.sin((sign.x + x) * .013 - time * .37) * 2;
          const point = bend([sign.x + x, sign.y + y + wave]);
          if (j === 0) ctx.moveTo(...point);
          else ctx.lineTo(...point);
        }
        ctx.strokeStyle = COLORS[sign.color];
        ctx.lineWidth = sign.weight * 3.8;
        ctx.lineCap = 'round';
        ctx.globalAlpha = progress * .028;
        ctx.stroke();
      }
      for (let i = 0; i < sign.dust.length; i += stride) {
        const point = sign.dust[i];
        const age = (point.phase / TAU + time * (.021 + point.glow * .006)) % 1;
        const release = Math.pow(clamp((age - .63) / .37, 0, 1), 1.4);
        const u = Math.min(.999, point.u + release * (signIndex < 2 ? .20 : .14));
        const current = ribbon(point.route, u, 0, time);
        const [x, y] = bend([
          mix(current[0], sign.x + point.scatterX, scatter),
          mix(current[1] + point.offset * (1 - release * .44), sign.y + point.scatterY, scatter),
        ]);
        const fade = Math.min(1, age * 15) * (1 - release) ** 1.25;
        const color = point.glow > .78 ? point.route.color : sign.color;
        dot(ctx, x, y, point.size, color,
          progress * (.17 + point.glow * .18) * fade);

        if (i % (48 * stride) === 0) {
          // A few nearly transparent fibers pass through the density and carry
          // a softened echo of its shape into the same downstream surface.
          ctx.beginPath();
          for (let step = 0; step <= 18; step++) {
            const travel = step / 18;
            const flowU = clamp(point.u - .035 + travel * .20, 0, .999);
            const flow = ribbon(point.route, flowU, 0, time);
            const fiberY = flow[1] + point.offset * (1 - travel * .30);
            const position = bend([flow[0], fiberY]);
            if (step === 0) ctx.moveTo(...position); else ctx.lineTo(...position);
          }
          ctx.strokeStyle = COLORS[point.route.color];
          ctx.lineWidth = .65;
          ctx.globalAlpha = progress * .040;
          ctx.stroke();
        }
      }
    }

    // Soft highlights belong to the current itself; none travel backwards.
    for (let i = 2; i < streams.length; i++) {
      const route = streams[i];
      for (let j = 0; j < 2; j++) {
        const u = (time * .043 + i * .27 + j * .49) % 1;
        const [x, y] = bend(ribbon(route, u, j ? -.33 : .21, time));
        const fade = Math.min(1, u * 10, (1 - u) * 10);
        dot(ctx, x, y, 1.25, route.color, progress * fade * .43, true);
      }
    }
    ctx.restore();
  }

  return { draw };
}
