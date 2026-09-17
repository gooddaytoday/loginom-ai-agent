import { type ComponentProps } from "solid-js"

export function WordmarkV2(props: Pick<ComponentProps<"svg">, "class">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 720 129"
      class={props.class}
      data-component="wordmark-v2"
      role="img"
      aria-label="Loginom AI"
    >
      <text
        x="360"
        y="100"
        text-anchor="middle"
        fill="currentColor"
        fill-opacity="0.12"
        font-family="system-ui, sans-serif"
        font-size="100"
        font-weight="600"
      >
        Loginom{" "}
        <tspan fill="#C79292" fill-opacity="0.32">
          AI
        </tspan>
      </text>
    </svg>
  )
}
