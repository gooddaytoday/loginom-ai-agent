import { Show } from "solid-js"

export function ToolGroupRow(props: { summary: string; detail?: string }) {
  return (
    <div data-component="tool-group-row" class="min-w-0 py-1 text-13-regular text-v2-text-text-base">
      <Show when={props.detail} fallback={<span>{props.summary}</span>}>
        {(detail) => (
          <details>
            <summary class="cursor-pointer">{props.summary}</summary>
            <pre class="my-2 max-h-48 overflow-auto whitespace-pre-wrap break-words">{detail()}</pre>
          </details>
        )}
      </Show>
    </div>
  )
}
