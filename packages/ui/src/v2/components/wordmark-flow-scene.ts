export type FlowPoint = { x: number; y: number }
export type FlowNode = FlowPoint & { tier: number }
export type FlowEdge = { from: number; to: number }
export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[]; outgoing: number[][] }

export type FlowContext = Pick<
  CanvasRenderingContext2D,
  | "globalAlpha"
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "lineCap"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "stroke"
  | "fill"
  | "arc"
  | "fillRect"
  | "createLinearGradient"
  | "createRadialGradient"
>

export type FlowSceneOptions = {
  /** Where streams leave the letter, in canvas CSS pixels. */
  origin: FlowPoint
  /** Horizontal distance the flow may travel before it dissolves. */
  reach: number
  /** Cap height of the wordmark glyphs; every vertical measure scales with it. */
  glyph: number
  seed: number
  reducedMotion: boolean
  colors: { ink: string; accent: string }
}

export type FlowSample = FlowPoint & {
  id: number
  alpha: number
  size: number
  spark: boolean
  accent: boolean
  tail?: FlowPoint
}

/** Upper bounds for `globalAlpha`, so the flow stays quiet on light and dark themes. */
export const FLOW_ALPHA = { star: 0.55, thread: 0.1, node: 0.42, halo: 0.11 }
/** Half-height of the drawn band, in glyph heights. */
export const FLOW_BAND = 1.2

const TAU = Math.PI * 2
/** Tier depth along `reach`; the last tier is where particles dissolve and is never drawn. */
const TIERS = [0.35, 0.7, 1]
const EMISSION = 1.1
const TRAVEL = 1.6
const FADE = 0.7
const STILL_HOLD = 1.2
const STILL_FADE = 0.8

export function createWordmarkFlowScene(options: FlowSceneOptions) {
  const rng = random(options.seed)
  const graph = buildFlowGraph({ origin: options.origin, reach: options.reach, glyph: options.glyph, rng })
  const particles = Array.from({ length: Math.round(Math.min(200, Math.max(90, options.reach * 0.55))) }, () =>
    createParticle(graph, options.reach, rng),
  )
  const still = options.reducedMotion
  const base = options.reach / TRAVEL
  const fade = still ? STILL_FADE : FADE
  // Animated waves end once the slowest particle emitted last has dissolved; the still frame just holds and fades.
  const duration = still ? STILL_HOLD + STILL_FADE : EMISSION + options.reach / (0.8 * base) + FADE
  const envelope = (t: number) => clamp((duration - t) / fade)
  const front = (t: number) => (still ? Infinity : options.origin.x + 1.2 * base * t)
  const back = (t: number) => (still ? -Infinity : options.origin.x + 0.8 * base * (t - EMISSION))

  const sample = (t: number): FlowSample[] => {
    const env = envelope(t)
    if (env <= 0) return []
    return particles.flatMap((particle, id) => {
      const progress = still ? particle.phase : (particle.speed * (t - particle.birth)) / options.reach
      if (progress < 0 || progress >= 1) return []
      const x = options.origin.x + progress * options.reach
      const point = locate(graph, options.glyph, particle, x)
      // Stars grow in over the first 6% of the path and dissolve across the last quarter; ink stars stay lighter
      // than accent ones so the swarm never reads as dark grit on a light theme.
      const fade = Math.min(1, progress / 0.06, (1 - progress) / 0.25) * (particle.accent ? 1 : 0.6)
      return [
        {
          ...point,
          id,
          alpha: fade * (0.45 + 0.55 * particle.light) * FLOW_ALPHA.star * env,
          size: particle.size,
          spark: particle.spark,
          accent: particle.accent,
          tail: particle.spark
            ? locate(graph, options.glyph, particle, Math.max(options.origin.x, x - 0.035 * options.reach))
            : undefined,
        },
      ]
    })
  }

  const draw = (ctx: FlowContext, t: number) => {
    const env = envelope(t)
    if (env <= 0) return
    // Threads trail the first stars by a little, so the graph is revealed by the data rather than ahead of it.
    drawThreads(ctx, graph, options.colors.ink, front(t) - 0.08 * options.reach, back(t), env)
    drawNodes(ctx, graph, options.glyph, options.colors.accent, front(t), back(t), env)
    drawStars(ctx, sample(t), options.colors)
  }

  return { duration, graph, sample, draw, finished: (t: number) => t >= duration }
}

/** mulberry32: consecutive wave numbers as seeds still produce unrelated streams. */
export function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    const mixed = Math.imul(state ^ (state >>> 15), state | 1)
    const folded = mixed ^ (mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61))
    return ((folded ^ (folded >>> 14)) >>> 0) / 4294967296
  }
}

export function buildFlowGraph(options: {
  origin: FlowPoint
  reach: number
  glyph: number
  rng: () => number
}): FlowGraph {
  const counts = [2, 3, options.rng() < 0.5 ? 3 : 4]
  const nodes: FlowNode[] = [
    { x: options.origin.x, y: options.origin.y, tier: 0 },
    ...counts.flatMap((count, index) =>
      Array.from({ length: count }, (_, slot): FlowNode => {
        const tier = index + 1
        // Terminal nodes sit exactly at `reach`, so every path dissolves at the same distance.
        const jitter = tier === TIERS.length ? 0 : (options.rng() - 0.5) * 0.08 * options.reach
        const lane = -1 + (2 * slot + 1) / count
        return {
          x: options.origin.x + options.reach * TIERS[index] + jitter,
          y: options.origin.y + options.glyph * (0.6 * lane + (options.rng() - 0.5) * 0.2),
          tier,
        }
      }),
    ),
  ]
  const edges = TIERS.flatMap((_, index) => connectTiers(nodes, index, index + 1, options.rng))
  const outgoing = nodes.map((_, node) => edges.flatMap((edge, id) => (edge.from === node ? [id] : [])))
  return { nodes, edges, outgoing }
}

function connectTiers(nodes: FlowNode[], parentTier: number, childTier: number, rng: () => number): FlowEdge[] {
  const parents = nodes.flatMap((node, index) => (node.tier === parentTier ? [index] : []))
  const children = nodes.flatMap((node, index) => (node.tier === childTier ? [index] : []))
  const byDistance = (from: number, candidates: number[]) =>
    candidates.toSorted((a, b) => Math.abs(nodes[a].y - nodes[from].y) - Math.abs(nodes[b].y - nodes[from].y))
  if (parentTier === 0) return children.map((to) => ({ from: parents[0], to }))
  // Children mostly follow their nearest parent, sometimes the second nearest, so crossings stay gentle;
  // one optional extra edge adds a merge or a split.
  const primary = children.map((to) => {
    const ranked = byDistance(to, parents)
    return { from: rng() < 0.65 ? ranked[0] : ranked[Math.min(1, ranked.length - 1)], to }
  })
  const orphans = parents
    .filter((from) => !primary.some((edge) => edge.from === from))
    .map((from) => ({ from, to: byDistance(from, children)[0] }))
  const source = parents[Math.floor(rng() * parents.length)]
  const extra = { from: source, to: byDistance(source, children)[1] }
  const connected = [...primary, ...orphans]
  const duplicate = connected.some((edge) => edge.from === extra.from && edge.to === extra.to)
  return rng() < 0.6 && !duplicate ? [...connected, extra] : connected
}

type Particle = {
  birth: number
  speed: number
  lane: number
  size: number
  light: number
  spark: boolean
  accent: boolean
  phase: number
  path: number[]
}

function createParticle(graph: FlowGraph, reach: number, rng: () => number): Particle {
  const light = rng()
  const spark = light > 0.92
  return {
    // Dense at the start of the emission window, sparser towards its end.
    birth: EMISSION * rng() ** 1.5,
    speed: (reach / TRAVEL) * (0.8 + 0.4 * rng()),
    lane: rng() * 2 - 1,
    // Whole pixels at DPR 1 keep the smallest stars from dissolving into anti-aliasing.
    size: 1 + 0.9 * rng(),
    light,
    spark,
    // Sparks are always brand-coloured; a dark four-ray cross would read as a crosshair.
    accent: spark || rng() < 0.65,
    phase: rng(),
    path: walk(graph, rng),
  }
}

function walk(graph: FlowGraph, rng: () => number, node = 0): number[] {
  const choices = graph.outgoing[node]
  if (!choices.length) return []
  const id = choices[Math.floor(rng() * choices.length)]
  return [id, ...walk(graph, rng, graph.edges[id].to)]
}

function locate(graph: FlowGraph, glyph: number, particle: Particle, x: number): FlowPoint {
  const id =
    particle.path.find((id) => x <= graph.nodes[graph.edges[id].to].x) ?? particle.path[particle.path.length - 1]
  const a = graph.nodes[graph.edges[id].from]
  const b = graph.nodes[graph.edges[id].to]
  const u = clamp((x - a.x) / (b.x - a.x))
  const smooth = u * u * (3 - 2 * u)
  // Streams leave the whole height of the letter and converge on the first node; later edges only breathe mid-way.
  const emit = a.tier === 0 ? 0.35 * (1 - smooth) : 0
  return { x, y: a.y + (b.y - a.y) * smooth + particle.lane * glyph * (emit + 0.07 * Math.sin(Math.PI * u)) }
}

function edgePoint(a: FlowPoint, b: FlowPoint, u: number): FlowPoint {
  const smooth = u * u * (3 - 2 * u)
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * smooth }
}

function drawThreads(ctx: FlowContext, graph: FlowGraph, ink: string, front: number, back: number, env: number) {
  ctx.lineWidth = 0.6
  ctx.lineCap = "round"
  graph.edges.forEach((edge) => {
    const a = graph.nodes[edge.from]
    const b = graph.nodes[edge.to]
    const reveal = clamp((front - a.x) / (b.x - a.x))
    if (reveal <= 0) return
    const passed = clamp((back - a.x) / (b.x - a.x))
    // Threads into the terminal tier dissolve together with the stars instead of ending on a bare point.
    ctx.strokeStyle = b.tier === TIERS.length ? dissolve(ctx, ink, a.x, b.x) : ink
    ctx.globalAlpha = FLOW_ALPHA.thread * reveal * (1 - 0.7 * passed) * env
    ctx.beginPath()
    Array.from({ length: 25 }, (_, i) => edgePoint(a, b, (reveal * i) / 24)).forEach((point, i) =>
      i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
    )
    ctx.stroke()
  })
}

function dissolve(ctx: FlowContext, ink: string, from: number, to: number) {
  const gradient = ctx.createLinearGradient(from, 0, to, 0)
  gradient.addColorStop(0.4, ink)
  gradient.addColorStop(1, "transparent")
  return gradient
}

function drawNodes(
  ctx: FlowContext,
  graph: FlowGraph,
  glyph: number,
  accent: string,
  front: number,
  back: number,
  env: number,
) {
  graph.nodes
    .filter((node) => node.tier > 0 && node.tier < TIERS.length)
    .forEach((node) => {
      const lit = clamp((front - node.x) / (0.4 * glyph))
      if (lit <= 0) return
      const dim = lit * (1 - 0.6 * clamp((back - node.x) / (0.6 * glyph))) * env
      const radius = 0.1 * glyph
      const halo = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius)
      halo.addColorStop(0, accent)
      halo.addColorStop(1, "transparent")
      ctx.globalAlpha = FLOW_ALPHA.halo * dim
      ctx.fillStyle = halo
      ctx.fillRect(node.x - radius, node.y - radius, 2 * radius, 2 * radius)
      ctx.globalAlpha = FLOW_ALPHA.node * dim
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.arc(node.x, node.y, 1.5, 0, TAU)
      ctx.fill()
    })
}

function drawStars(ctx: FlowContext, stars: FlowSample[], colors: FlowSceneOptions["colors"]) {
  ctx.lineWidth = 0.75
  ctx.lineCap = "round"
  stars.forEach((star) => {
    const color = star.accent ? colors.accent : colors.ink
    ctx.fillStyle = color
    ctx.globalAlpha = star.alpha
    if (!star.spark) {
      ctx.fillRect(star.x - star.size / 2, star.y - star.size / 2, star.size, star.size)
      return
    }
    // The brightest few percent are four-ray sparks with a short tail along their own path.
    ctx.fillRect(star.x - 1.6, star.y - 0.35, 3.2, 0.7)
    ctx.fillRect(star.x - 0.35, star.y - 1.6, 0.7, 3.2)
    if (!star.tail) return
    ctx.strokeStyle = color
    ctx.globalAlpha = star.alpha * 0.3
    ctx.beginPath()
    ctx.moveTo(star.x, star.y)
    ctx.lineTo(star.tail.x, star.tail.y)
    ctx.stroke()
  })
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}
