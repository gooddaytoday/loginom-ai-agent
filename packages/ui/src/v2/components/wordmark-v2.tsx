import { type ComponentProps } from "solid-js"
import "./wordmark-v2.css"

// Geometry the accent flow relies on: the viewBox, the text baseline and the
// approximate cap height of `system-ui` at font-size 100 (about 0.7em).
export const WORDMARK_V2_METRICS = { width: 720, height: 129, baseline: 100, cap: 70 }

export function WordmarkV2(props: Pick<ComponentProps<"svg">, "class"> & { onAccentClick?: () => void }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${WORDMARK_V2_METRICS.width} ${WORDMARK_V2_METRICS.height}`}
      class={props.class}
      data-component="wordmark-v2"
      role="img"
      aria-label="Loginom AI"
    >
      <text
        x={WORDMARK_V2_METRICS.width / 2}
        y={WORDMARK_V2_METRICS.baseline}
        text-anchor="middle"
        fill="currentColor"
        fill-opacity="0.12"
        font-family="system-ui, sans-serif"
        font-size="100"
        font-weight="600"
      >
        Loginom{" "}
        <tspan
          data-slot="wordmark-v2-accent"
          data-interactive={props.onAccentClick ? "" : undefined}
          fill="#C79292"
          fill-opacity="0.32"
          onClick={props.onAccentClick}
        >
          AI
        </tspan>
      </text>
    </svg>
  )
}
