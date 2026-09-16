import { type ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => (
  <svg
    data-component="logo-mark"
    class={props.class}
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Loginom AI Agent"
  >
    <rect width="40" height="40" rx="10" fill="#A23938" />
    <path d="M11 11h9c8 0 12 4 12 9s-4 9-12 9h-9M12 11v18m0-9h11" stroke="#fff" stroke-width="3" />
    <circle cx="12" cy="11" r="3" fill="#E7D2D5" />
    <circle cx="12" cy="29" r="3" fill="#E7D2D5" />
    <circle cx="24" cy="20" r="3" fill="#E7D2D5" />
  </svg>
)

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => (
  <svg
    ref={props.ref}
    data-component="logo-splash"
    class={props.class}
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Loginom AI Agent"
  >
    <rect width="40" height="40" rx="10" fill="#A23938" />
    <path d="M11 11h9c8 0 12 4 12 9s-4 9-12 9h-9M12 11v18m0-9h11" stroke="#fff" stroke-width="3" />
    <circle cx="12" cy="11" r="3" fill="#E7D2D5" />
    <circle cx="12" cy="29" r="3" fill="#E7D2D5" />
    <circle cx="24" cy="20" r="3" fill="#E7D2D5" />
  </svg>
)

export const Logo = (props: { class?: string }) => (
  <svg class={props.class} viewBox="0 0 288 42" xmlns="http://www.w3.org/2000/svg" aria-label="Loginom AI Agent">
    <text x="0" y="31" fill="var(--icon-base)" font-family="system-ui, sans-serif" font-size="30" font-weight="600">
      Loginom AI Agent
    </text>
  </svg>
)
