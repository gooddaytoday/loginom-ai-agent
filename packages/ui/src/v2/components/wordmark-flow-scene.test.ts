import { describe, expect, test } from "bun:test"
import {
  FLOW_ALPHA,
  FLOW_BAND,
  buildFlowGraph,
  createWordmarkFlowScene,
  random,
  type FlowContext,
} from "./wordmark-flow-scene"

const origin = { x: 12, y: 84 }
const reach = 300
const glyph = 70
const colors = { ink: "rgb(20, 20, 20)", accent: "#C79292" }
const scene = (seed: number, reducedMotion = false) =>
  createWordmarkFlowScene({ origin, reach, glyph, seed, reducedMotion, colors })
const steps = (from: number, to: number, step: number) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step)

type Call = { op: "fillRect" | "fill" | "stroke"; alpha: number; lineWidth: number; args: number[] }

function fakeContext() {
  const calls: Call[] = []
  const path: number[] = []
  const ctx = {
    globalAlpha: 1,
    fillStyle: "" as string | CanvasGradient | CanvasPattern,
    strokeStyle: "" as string | CanvasGradient | CanvasPattern,
    lineWidth: 1,
    lineCap: "butt" as CanvasLineCap,
    beginPath() {
      path.length = 0
    },
    moveTo(x: number, y: number) {
      path.push(x, y)
    },
    lineTo(x: number, y: number) {
      path.push(x, y)
    },
    arc(x: number, y: number) {
      path.push(x, y)
    },
    stroke() {
      calls.push({ op: "stroke", alpha: this.globalAlpha, lineWidth: this.lineWidth, args: [...path] })
    },
    fill() {
      calls.push({ op: "fill", alpha: this.globalAlpha, lineWidth: this.lineWidth, args: [...path] })
    },
    fillRect(x: number, y: number, width: number, height: number) {
      calls.push({ op: "fillRect", alpha: this.globalAlpha, lineWidth: this.lineWidth, args: [x, y, width, height] })
    },
    createLinearGradient() {
      return { addColorStop() {} } as unknown as CanvasGradient
    },
    createRadialGradient() {
      return { addColorStop() {} } as unknown as CanvasGradient
    },
  } satisfies FlowContext
  return { ctx, calls }
}

describe("random", () => {
  test("is deterministic and stays within [0, 1)", () => {
    const a = random(7)
    const b = random(7)
    const values = Array.from({ length: 1000 }, () => a())
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
    expect(Array.from({ length: 1000 }, () => b())).toEqual(values)
  })

  test("consecutive wave numbers do not open with neighbouring values", () => {
    const first = [1, 2, 3, 4].map((seed) => random(seed)())
    const gaps = first.slice(1).map((value, i) => Math.abs(value - first[i]))
    expect(Math.min(...gaps)).toBeGreaterThan(0.01)
  })
})

describe("buildFlowGraph", () => {
  const graphs = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => buildFlowGraph({ origin, reach, glyph, rng: random(seed) }))

  test("starts at the letter and grows through three tiers", () => {
    graphs.forEach((graph) => {
      expect(graph.nodes[0]).toEqual({ x: origin.x, y: origin.y, tier: 0 })
      expect(graph.nodes.filter((node) => node.tier === 1)).toHaveLength(2)
      expect(graph.nodes.filter((node) => node.tier === 2)).toHaveLength(3)
      expect([3, 4]).toContain(graph.nodes.filter((node) => node.tier === 3).length)
    })
  })

  test("every edge points strictly to the right, so the graph has no cycles", () => {
    graphs.forEach((graph) => {
      graph.edges.forEach((edge) => {
        expect(graph.nodes[edge.to].x).toBeGreaterThan(graph.nodes[edge.from].x)
        expect(graph.nodes[edge.to].tier).toBe(graph.nodes[edge.from].tier + 1)
      })
    })
  })

  test("every non-terminal node keeps the data moving and terminals sit at reach", () => {
    graphs.forEach((graph) => {
      graph.nodes.forEach((node, index) => {
        if (node.tier === 3) {
          expect(node.x).toBe(origin.x + reach)
          expect(graph.outgoing[index]).toHaveLength(0)
          return
        }
        expect(graph.outgoing[index].length).toBeGreaterThan(0)
      })
      const incoming = graph.nodes.map((_, index) => graph.edges.filter((edge) => edge.to === index).length)
      incoming.slice(1).forEach((count) => expect(count).toBeGreaterThan(0))
    })
  })

  test("keeps nodes inside the vertical band and within reach", () => {
    graphs.forEach((graph) => {
      graph.nodes.forEach((node) => {
        expect(Math.abs(node.y - origin.y)).toBeLessThanOrEqual(0.6 * glyph)
        expect(node.x).toBeGreaterThanOrEqual(origin.x)
        expect(node.x).toBeLessThanOrEqual(origin.x + reach)
      })
    })
  })

  test("has no duplicate edges", () => {
    graphs.forEach((graph) => {
      const keys = graph.edges.map((edge) => `${edge.from}>${edge.to}`)
      expect(new Set(keys).size).toBe(keys.length)
    })
  })
})

describe("createWordmarkFlowScene", () => {
  test("is deterministic for a seed and differs between seeds", () => {
    expect(scene(3).sample(1.2)).toEqual(scene(3).sample(1.2))
    expect(scene(3).graph).not.toEqual(scene(4).graph)
  })

  test("moves every star to the right along its own path and keeps it inside the band", () => {
    const wave = scene(2)
    const frames = steps(0, wave.duration, 1 / 30).map((t) => wave.sample(t))
    const last = new Map<number, number>()
    frames.forEach((frame) => {
      frame.forEach((star) => {
        expect(star.x).toBeGreaterThanOrEqual(last.get(star.id) ?? origin.x)
        expect(star.x).toBeLessThanOrEqual(origin.x + reach)
        expect(Math.abs(star.y - origin.y)).toBeLessThan(FLOW_BAND * glyph)
        if (star.tail) {
          expect(star.tail.x).toBeLessThanOrEqual(star.x)
          expect(Math.abs(star.tail.y - origin.y)).toBeLessThan(FLOW_BAND * glyph)
        }
        last.set(star.id, star.x)
      })
    })
    expect(Math.max(...frames.map((frame) => frame.length))).toBeGreaterThan(40)
  })

  test("emits from the letter first and lets the swarm leave before the wave ends", () => {
    const wave = scene(5)
    const early = wave.sample(0.05)
    expect(early.length).toBeGreaterThan(0)
    early.forEach((star) => expect(star.x - origin.x).toBeLessThan(0.05 * reach))
    expect(wave.sample(wave.duration - 0.7)).toHaveLength(0)
  })

  test("never exceeds the alpha limits for stars, nodes, halos, tails and threads", () => {
    ;[1, 2, 3].forEach((seed) => {
      const wave = scene(seed)
      const { ctx, calls } = fakeContext()
      steps(0, wave.duration, 0.05).forEach((t) => wave.draw(ctx, t))
      expect(calls.length).toBeGreaterThan(0)
      calls.forEach((call) => {
        expect(call.alpha).toBeLessThanOrEqual(FLOW_ALPHA.star)
        if (call.op === "fill") expect(call.alpha).toBeLessThanOrEqual(FLOW_ALPHA.node)
        if (call.op === "stroke" && call.lineWidth < 0.7) expect(call.alpha).toBeLessThanOrEqual(FLOW_ALPHA.thread)
        if (call.op === "stroke" && call.lineWidth >= 0.7) expect(call.alpha).toBeLessThanOrEqual(FLOW_ALPHA.star * 0.3)
        call.args.forEach((value) => expect(Number.isFinite(value)).toBe(true))
      })
    })
  })

  test("finishes after its duration and draws nothing afterwards", () => {
    const wave = scene(1)
    expect(wave.duration).toBeGreaterThan(3)
    expect(wave.duration).toBeLessThan(4.5)
    expect(wave.finished(wave.duration - 0.01)).toBe(false)
    expect(wave.finished(wave.duration)).toBe(true)
    const { ctx, calls } = fakeContext()
    wave.draw(ctx, wave.duration)
    wave.draw(ctx, wave.duration + 1)
    expect(calls).toHaveLength(0)
  })

  test("reduced motion holds one still composition and only fades it", () => {
    const still = scene(9, true)
    const strip = (t: number) => still.sample(t).map((star) => ({ id: star.id, x: star.x, y: star.y }))
    expect(strip(0.2)).toEqual(strip(1.0))
    expect(strip(0.2).length).toBeGreaterThan(0)
    expect(still.sample(0.2).map((star) => star.alpha)).toEqual(still.sample(1.0).map((star) => star.alpha))
    const late = still.sample(1.6)
    late.forEach((star, i) => expect(star.alpha).toBeLessThan(still.sample(1.0)[i].alpha))
    const first = fakeContext()
    const second = fakeContext()
    still.draw(first.ctx, 0.2)
    still.draw(second.ctx, 1.0)
    expect(first.calls.map((call) => call.args)).toEqual(second.calls.map((call) => call.args))
    expect(still.duration).toBeLessThan(2.5)
  })
})
