import type { SessionMessageInfo, SessionStatus } from "@opencode/client/promise"
import type { Context } from "@opencode/plugin/gui"
import { ToolRenderer } from "@opencode/plugin/gui/builtin"
import { DataProvider } from "@opencode/session-ui/context"
import { timelinePresets } from "@opencode/session-ui/timeline/detail"
import { createReactiveTimelineProjection } from "@opencode/session-ui/timeline/projection"
import { createSessionTimelineRowRenderer } from "@opencode/session-ui/timeline/row"
import { createNextTimelineProjection, createNextTimelineRowRenderer } from "@opencode/session-ui/timeline-next"
import { For } from "solid-js"
import { createStore } from "solid-js/store"
import { createToolRenderers } from "../src/session/timeline/tool-renderers"
import { mountPluginHost } from "./plugin-host.fixture"

const detail = timelinePresets[2].value

const idle: SessionStatus = { type: "idle" }

const messages: SessionMessageInfo[] = [
  { id: "user", type: "user", text: "Проверь данные", time: { created: 1 } },
  {
    id: "assistant",
    type: "assistant",
    agent: "build",
    model: { id: "test-model", providerID: "test" },
    time: { created: 2, completed: 3 },
    content: [
      {
        id: "read",
        type: "tool",
        name: "read",
        time: { created: 2, completed: 3 },
        state: { status: "error", input: { path: "missing.csv" }, error: { type: "error", message: "Missing" } },
      },
      {
        id: "demo",
        type: "tool",
        name: "loginom_demo",
        time: { created: 2, completed: 3 },
        state: { status: "completed", input: { file: "sales.csv" }, content: [{ type: "text", text: "128 строк" }] },
      },
      {
        id: "crash",
        type: "tool",
        name: "loginom_demo",
        time: { created: 2, completed: 3 },
        state: { status: "completed", input: { crash: true }, content: [{ type: "text", text: "Crash" }] },
      },
      {
        id: "failed",
        type: "tool",
        name: "loginom_demo",
        time: { created: 2, completed: 3 },
        state: { status: "error", input: {}, error: { type: "error", message: "Tool call failed" } },
      },
      { type: "text", text: "Проверка завершена." },
    ],
  },
]

export const demoTool: ToolRenderer = {
  tool: "loginom_demo",
  title: "Проверка данных",
  separate: true,
  render(props) {
    if (props.input.crash) throw new Error("Renderer fixture failed")

    return (
      <article class="rounded-lg border border-v2-border-border-base p-3" aria-label={props.title}>
        <strong>{props.title}</strong>
        <p>{props.output}</p>
      </article>
    )
  },
}

export function mountToolRendererHost(next: boolean) {
  const host = mountPluginHost({
    builtins: new Set(["fixture"]),
    View: () => {
      const toolRenderers = createToolRenderers()

      return (
        <DataProvider
          directory="/fixture"
          data={{ session: [], session_status: {}, session_diff: {} }}
          toolRenderers={toolRenderers}
        >
          <Rows next={next} toolSeparate={toolRenderers.separate} />
        </DataProvider>
      )
    },
  })

  const rejected: string[] = []
  host.load((ctx: Context) => {
    for (const tool of ["read", "shell"]) {
      try {
        ctx.add(ToolRenderer, { ...demoTool, tool })
      } catch (error) {
        rejected.push(String(error))
      }
    }

    ctx.add(ToolRenderer, demoTool)
  })

  return { disable: host.disable, rejected: () => rejected }
}

function Rows(props: { next: boolean; toolSeparate: () => ReadonlySet<string> | undefined }) {
  const [open, setOpen] = createStore<Record<string, boolean | undefined>>({})

  const input = {
    sessionMessages: () => messages,
    status: () => idle,
    timelineDetail: () => detail,
    toolSeparate: props.toolSeparate,
  }

  const rendererInput = {
    sessionID: () => "fixture",
    status: () => idle,
    timelineDetail: () => detail,
    presentation: () => undefined,
    disclosure: { value: (key: string) => open[key], set: (key: string, value: boolean) => setOpen(key, value) },
  }

  const projection = props.next
    ? createNextTimelineProjection(input)
    : createReactiveTimelineProjection({ ...input, reasoningMode: () => "compact" })

  const renderer = props.next
    ? createNextTimelineRowRenderer({ ...rendererInput, projection })
    : createSessionTimelineRowRenderer({
        ...rendererInput,
        projection,
        reasoningMode: () => "compact",
        shellToolDefaultOpen: () => false,
        editToolDefaultOpen: () => false,
      })

  return (
    <div aria-label="Tool renderer timeline">
      <For each={projection.rows()}>{(row) => <renderer.Row row={() => row} />}</For>
    </div>
  )
}
