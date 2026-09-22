import { createSignal, onCleanup } from "solid-js"
import { createWordmarkFlowScene, FLOW_BAND } from "./wordmark-flow-scene"
import { WORDMARK_V2_METRICS, WordmarkV2 } from "./wordmark-v2"
import "./wordmark-flow-v2.css"

const ACCENT = "#C79292"
/** The flow never comes closer than this to the clipping edge of the panel. */
const MARGIN = 24
/** Room for sparks and halos that spill over the flow's own bounds. */
const PAD = 12

export function WordmarkFlowV2(props: { class?: string }) {
  let root!: HTMLDivElement
  let canvas!: HTMLCanvasElement
  let frame: number | undefined
  let waves = 0
  const [active, setActive] = createSignal(false)

  const onVisibility = () => {
    if (document.hidden) stop()
  }

  const stop = () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
    document.removeEventListener("visibilitychange", onVisibility)
    setActive(false)
  }

  const play = () => {
    if (active()) return
    const svg = root.querySelector("svg")
    const accent = root.querySelector<SVGTSpanElement>('[data-slot="wordmark-v2-accent"]')
    const ctx = canvas.getContext("2d")
    if (!svg || !accent || !ctx) return
    const box = svg.getBoundingClientRect()
    const scale = box.width / WORDMARK_V2_METRICS.width
    const glyph = WORDMARK_V2_METRICS.cap * scale
    // Streams start at the right edge of the "I", vertically centred on the capitals.
    const origin = {
      x: accent.getBoundingClientRect().right,
      y: box.top + WORDMARK_V2_METRICS.baseline * scale - glyph / 2,
    }
    const reach = Math.min(clipRight(root) - MARGIN - origin.x, 4.5 * glyph)
    if (reach < glyph) return
    const band = FLOW_BAND * glyph
    const width = reach + 2 * PAD
    const height = 2 * band
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const anchor = root.getBoundingClientRect()
    canvas.style.left = `${origin.x - PAD - anchor.left}px`
    canvas.style.top = `${origin.y - band - anchor.top}px`
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const scene = createWordmarkFlowScene({
      origin: { x: PAD, y: band },
      reach,
      glyph,
      seed: ++waves,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      colors: { ink: getComputedStyle(svg).color, accent: ACCENT },
    })
    setActive(true)
    document.addEventListener("visibilitychange", onVisibility)
    let start: number | undefined
    const tick = (now: number) => {
      start ??= now
      const t = (now - start) / 1000
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      scene.draw(ctx, t)
      if (scene.finished(t)) {
        stop()
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
  }

  onCleanup(stop)

  return (
    <div ref={root} data-component="wordmark-flow-v2" data-active={active() ? "" : undefined}>
      <WordmarkV2 class={props.class} onAccentClick={play} />
      <canvas ref={canvas} data-slot="wordmark-flow-v2-canvas" aria-hidden="true" />
    </div>
  )
}

function clipRight(element: HTMLElement): number {
  const parent = element.parentElement
  if (!parent) return document.documentElement.clientWidth
  if (getComputedStyle(parent).overflowX !== "visible") return parent.getBoundingClientRect().right
  return clipRight(parent)
}
