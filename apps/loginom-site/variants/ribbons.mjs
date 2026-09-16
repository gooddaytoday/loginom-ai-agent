// Continuous, open light ribbons: the transformation is the workflow itself.
const TAU = Math.PI * 2;
const smooth = (a, b, value) => {
  const p = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return p * p * (3 - 2 * p);
};

export function createScene({ createCanvas }) {
  let seed = 31871;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const colors = ['#a5cbcb', '#da8e7e', '#f5b18c', '#ffe2b5'];
  const glow = colors.map(color => {
    const canvas = createCanvas();
    canvas.width = canvas.height = 48;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(24, 24, 0, 24, 24, 24);
    gradient.addColorStop(0, '#fff9e8');
    gradient.addColorStop(.055, '#fff0da');
    gradient.addColorStop(.16, `${color}bb`);
    gradient.addColorStop(.4, `${color}28`);
    gradient.addColorStop(1, `${color}00`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 48, 48);
    return canvas;
  });
  const particles = Array.from({ length: 6200 }, (_, i) => ({
    phase: random(), lane: random() * 2 - 1, route: i % 3,
    size: .5 + random() * 1.2, light: random(), depth: random() * 2 - 1,
    scatter: [random() * 6 - 3, random() * 4 - 2, random() * 2 - 1],
  }));
  const motes = Array.from({ length: 95 }, () => [random(), random(), random()]);

  function ribbon(p, lane, route, time, depth = 0) {
    const sources = [-1.1, .1, 1.08], targets = [-1.13, .1, 1.02];
    const merge = smooth(.02, .45, p), split = smooth(.57, .99, p);
    const center = sources[route] * (1 - merge) + targets[route] * split;
    const throat = Math.sin(Math.PI * p) ** 4;
    const twist = -.3 + smooth(.1, .72, p) * 4.6 + route * .55 + Math.sin(time * .16) * .12;
    const taper = Math.sin(Math.PI * p) ** .3;
    const span = (.24 + .48 * throat + split * .16) * lane * taper;
    return [
      (p - .5) * 4.8,
      center + span * Math.cos(twist) + .1 * Math.sin(p * TAU + route) * throat,
      span * Math.sin(twist) + (route - 1) * .09 + depth * .027,
    ];
  }

  return {
    draw(ctx, { width, height, time, progress, interaction, reducedMotion, detail }) {
      const scale = Math.min(width * .167, height * .31);
      const rx = .48, ry = -.12, rz = -.2;
      const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
      const cz = Math.cos(rz), sz = Math.sin(rz);
      const project = ([x, y, z]) => {
        const yy = y * cx - z * sx, zz = y * sx + z * cx;
        const xx = x * cy + zz * sy, depth = 5.5 / (5.5 + x * sy - zz * cy);
        let screenX = width * .5 + (xx * cz - yy * sz) * scale * depth;
        let screenY = height * .5 + (xx * sz + yy * cz) * scale * depth;
        if (!reducedMotion && interaction) {
          const displacement = interaction.sample(screenX, screenY);
          screenX += displacement.x;
          screenY += displacement.y;
        }
        return [screenX, screenY, depth];
      };
      const atmosphere = ctx.createRadialGradient(width * .53, height * .5, 0, width * .53, height * .5, width * .5);
      atmosphere.addColorStop(0, '#b5694315');
      atmosphere.addColorStop(.5, '#70362809');
      atmosphere.addColorStop(1, '#70362800');
      ctx.fillStyle = atmosphere;
      ctx.fillRect(0, 0, width, height);
      for (const [x, y, light] of motes) {
        ctx.fillStyle = '#e6c9b3';
        ctx.globalAlpha = .05 + light * .12;
        ctx.fillRect(x * width, y * height, .65, .65);
      }
      ctx.globalCompositeOperation = 'lighter';

      // Open sheets of light. Fine veins reveal the folds without a frame or node.
      for (let route = 0; route < 3; route++) {
        const start = project(ribbon(0, 0, route, time));
        const end = project(ribbon(1, 0, route, time));
        const tint = route === 0 ? '#d9c8ad' : route === 1 ? '#d99583' : '#f0c296';
        const veinColor = ctx.createLinearGradient(start[0], start[1], end[0], end[1]);
        veinColor.addColorStop(0, `${tint}00`);
        veinColor.addColorStop(.12, `${tint}99`);
        veinColor.addColorStop(.42, tint);
        veinColor.addColorStop(.82, `${tint}dd`);
        veinColor.addColorStop(1, `${tint}00`);
        for (let vein = 0; vein < 26; vein++) {
          const lane = vein / 25 * 2 - 1;
          ctx.beginPath();
          for (let step = 0; step <= 100; step++) {
            const p = step / 100;
            const [x, y] = project(ribbon(p, lane, route, time));
            if (!step) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          const sheen = .19 + .16 * (Math.sin(lane * 4 + route + time * .15) ** 2);
          ctx.globalAlpha = progress * sheen;
          ctx.lineWidth = vein % 7 ? .45 : .7;
          ctx.strokeStyle = veinColor;
          ctx.stroke();
        }
      }

      const count = Math.floor(particles.length * detail);
      for (let i = 0; i < count; i++) {
        const particle = particles[i];
        const p = (particle.phase + time * (.055 + particle.light * .028)) % 1;
        const xyz = ribbon(p, particle.lane, particle.route, time, particle.depth);
        const assembled = xyz.map((v, axis) => v * progress + particle.scatter[axis] * (1 - progress));
        const [x, y, depth] = project(assembled);
        const edgeFade = Math.min(1, p * 13, (1 - p) * 13);
        const wave = .82 + .18 * Math.sin(p * 18 - time * 1.35 + particle.route);
        const focus = .67 + .33 * (1 - Math.abs(particle.lane));
        const bright = edgeFade * focus * (.56 + particle.light * .44) * wave;
        const color = p < .23 && particle.route === 0 ? 0 : p < .52 ? 1 : particle.light > .62 ? 3 : 2;
        ctx.globalAlpha = bright;
        ctx.fillStyle = colors[color];
        const size = particle.size * depth;
        ctx.fillRect(x, y, size, size);
        if (particle.light > .984) {
          const glowSize = (13 + particle.size * 14) * depth;
          ctx.globalAlpha = Math.min(1, bright * 1.4);
          ctx.drawImage(glow[color], x - glowSize / 2, y - glowSize / 2, glowSize, glowSize);
        }
      }

      // A few readable light packets traverse complete channels, never backwards.
      for (let route = 0; route < 3; route++) {
        for (let packet = 0; packet < 2; packet++) {
          const p = (time * .105 + route * .19 + packet * .5) % 1;
          const head = project(ribbon(p, .13, route, time));
          const tail = project(ribbon(Math.max(0, p - .03), .13, route, time));
          const fade = Math.min(1, p * 12, (1 - p) * 12) * progress;
          ctx.globalAlpha = fade * .9;
          ctx.strokeStyle = '#ffeacb';
          ctx.lineWidth = .85;
          ctx.beginPath(); ctx.moveTo(head[0], head[1]); ctx.lineTo(tail[0], tail[1]); ctx.stroke();
          ctx.drawImage(glow[3], head[0] - 13, head[1] - 13, 26, 26);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },
  };
}
