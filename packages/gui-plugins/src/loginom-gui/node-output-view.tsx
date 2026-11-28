import { Button } from "@opencode/ui/button"
import { Tabs } from "@opencode/ui/tabs"
import { usePlugin } from "@opencode/plugin/gui"
import type { ToolRendererProps } from "@opencode/plugin/gui/builtin"
import { Option } from "effect"
import { createSignal, createUniqueId, For, onCleanup, Show } from "solid-js"
import type definition from "./index"
import { requestSample, type SampleState } from "./node-output/machine"
import {
  decodeOutputSample,
  deliveredRows,
  type NodeOutput,
  type OutputPort,
  type OutputRows,
  type OutputSample,
} from "./node-output"

export function NodeOutputPort(props: {
  output: NodeOutput
  port: OutputPort
  call: ToolRendererProps["call"]
  detailed: boolean
  open: boolean
  onToggle: () => void
}) {
  const ctx = usePlugin<typeof definition>()
  const contentID = createUniqueId()
  const columns = () => props.port.details?.columns ?? props.port.preview?.schema
  const rowCount = () => props.port.rowCount

  const rowsRead = () =>
    props.output.reads.find(
      (read) => read.portGuid === props.port.guid && read.port === props.port.index && read.rowCount === rowCount(),
    )?.rowsRead

  const delivered = () => deliveredRows(props.port, rowsRead())
  const seen = () => delivered()?.length ?? rowsRead()

  const title = () =>
    ctx.t("output.count", {
      rows: ctx.plural("output.rows", rowCount()),
      columns: ctx.plural("output.columns", props.port.columnCount),
    })

  let dialog: ReturnType<typeof ctx.dialogs.open> | undefined
  onCleanup(() => dialog?.close())

  return (
    <div class="min-w-0 ps-7 leading-5">
      <Show when={props.detailed} fallback={<span>{ctx.plural("output.rows", rowCount())}</span>}>
        <button
          type="button"
          class="rounded text-start text-v2-text-text-base underline underline-offset-2"
          aria-expanded={props.open}
          aria-controls={contentID}
          onClick={props.onToggle}
        >
          {title()}
        </button>
        <Show when={props.open}>
          <div id={contentID} class="mt-1 flex min-w-0 flex-col items-start gap-2">
            <p class="text-v2-text-text-faint">
              {ctx.t("output.receipt")}
              <Show when={seen() !== undefined && (seen() ?? 0) < rowCount()}>
                {" · "}
                {ctx.t("output.agentSeen", { seen: seen() ?? 0, total: rowCount() })}
              </Show>
            </p>
            <Show when={delivered()} fallback={<p>{ctx.t("output.noDelivery")}</p>}>
              {(rows) => (
                <OutputTable
                  label={ctx.t("output.agentTable")}
                  headers={columns()?.map((column) => column.label || column.name) ?? []}
                  rows={displayRows(rows())}
                />
              )}
            </Show>
            <Button
              size="small"
              variant="ghost"
              onClick={() => {
                const session = ctx.sessions.current()
                const call = props.call
                const output = props.output
                const port = props.port
                dialog = ctx.dialogs.open(() => (
                  <OutputDialog
                    port={port}
                    output={output}
                    delivered={delivered()}
                    seen={seen()}
                    load={async (signal) => {
                      if (!session || !call) return

                      const reply = await session.server.client.rpc.call(
                        {
                          rpcID: "loginom.node-output",
                          method: "sample",
                          location: session.location,
                          input: {
                            sessionID: session.id,
                            messageID: call.messageID,
                            toolCallID: call.toolCallID,
                            port: port.index,
                          },
                        },
                        { signal },
                      )

                      return Option.getOrUndefined(decodeOutputSample(reply.output))
                    }}
                  />
                ))
              }}
            >
              {ctx.t("output.expand")}
            </Button>
          </div>
        </Show>
      </Show>
    </div>
  )
}

function OutputDialog(props: {
  port: OutputPort
  output: NodeOutput
  delivered: OutputRows | undefined
  seen: number | undefined
  load: (signal: AbortSignal) => Promise<OutputSample | undefined>
}) {
  const ctx = usePlugin<typeof definition>()
  const port = props.port
  const target = Math.min(100, port.rowCount)
  const historical = (props.delivered ?? []).slice(0, target)
  const columns = port.details?.columns ?? port.preview?.schema
  const [sample, setSample] = createSignal<SampleState>({ kind: "historical" })

  if (historical.length < target && columns) onCleanup(requestSample({ load: props.load, update: setSample }))

  const rows = () => {
    const state = sample()

    return state.kind === "fresh" && state.rows.length >= historical.length ? state.rows.slice(0, target) : historical
  }

  return (
    <ctx.ui.Dialog title={props.output.node?.label || ctx.t("output.title")} size="large">
      <Tabs variant="pill" defaultValue="sample" class="min-w-0 max-w-full">
        <Tabs.List aria-label={ctx.t("output.title")}>
          <Tabs.Trigger value="sample">{ctx.t("output.sample")}</Tabs.Trigger>
          <Tabs.Trigger value="columns">{ctx.t("output.fields")}</Tabs.Trigger>
          <Tabs.Trigger value="source">{ctx.t("output.source")}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="sample" class="min-w-0 pt-3">
          <p class="mb-2 text-v2-text-text-muted" role="status">
            {ctx.t("output.shown", { shown: rows().length, total: port.rowCount })}
            <Show when={props.seen !== undefined && props.seen < port.rowCount}>
              {" "}
              {ctx.t("output.agentSeen", { seen: props.seen ?? 0, total: port.rowCount })}.
            </Show>
            <Show
              when={sample().kind === "loading"}
              fallback={
                <Show when={rows().length < target}>
                  {" "}
                  {sample().kind === "timeout"
                    ? ctx.t("output.sampleTimeout")
                    : ctx.t("output.sampleLimited", { target })}
                </Show>
              }
            >
              {" "}
              {ctx.t("output.loading")}
            </Show>
          </p>
          <Show when={columns} fallback={<p>{ctx.t("output.noColumns")}</p>}>
            {(fields) => (
              <OutputTable
                label={ctx.t("output.sampleTable")}
                headers={fields().map((column) => column.label || column.name)}
                rows={displayRows(rows())}
              />
            )}
          </Show>
        </Tabs.Content>
        <Tabs.Content value="columns" class="min-w-0 pt-3">
          <Show when={columns} fallback={<p>{ctx.t("output.noColumns")}</p>}>
            {(fields) => (
              <OutputTable
                label={ctx.t("output.columnTable")}
                headers={[ctx.t("output.column"), ctx.t("output.type")]}
                rows={fields().map((column) => [column.label || column.name, column.type])}
              />
            )}
          </Show>
        </Tabs.Content>
        <Tabs.Content value="source" class="min-w-0 pt-3">
          <dl class="grid gap-1 break-words">
            <dt class="font-semibold">{ctx.t("output.node")}</dt>
            <dd class="mb-2">{props.output.node?.label || props.output.node?.guid || "—"}</dd>
            <dt class="font-semibold">{ctx.t("output.configuration")}</dt>
            <dd class="mb-2">
              <Show when={props.output.configuration !== undefined} fallback={ctx.t("output.noConfiguration")}>
                <pre class="whitespace-pre-wrap break-all">{JSON.stringify(props.output.configuration, null, 2)}</pre>
              </Show>
            </dd>
            <dt class="font-semibold">{ctx.t("output.port")}</dt>
            <dd>{props.port.index + 1}</dd>
          </dl>
        </Tabs.Content>
      </Tabs>
    </ctx.ui.Dialog>
  )
}

function displayRows(rows: OutputRows) {
  return rows.map((row) =>
    row.map((cell) => {
      if (cell.is_null) return null
      const type = cell.cell_type ?? cell.type
      const decimal = type === "integer" || type === "real" ? cell.decimal : undefined
      const value = cell.non_finite ?? decimal ?? cell.value ?? cell.display_text

      return value === undefined ? null : String(value)
    }),
  )
}

function OutputTable(props: {
  label: string
  headers: readonly string[]
  rows: readonly (readonly (string | null)[])[]
}) {
  const ctx = usePlugin<typeof definition>()
  const [feedback, setFeedback] = createSignal<"copied" | "copyFailed">()
  const controller = new AbortController()
  onCleanup(() => controller.abort())

  const copy = async () => {
    const field = (value: string | null) =>
      value === null ? "" : /[\t\n\r"]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value

    const text = [props.headers, ...props.rows].map((row) => row.map(field).join("\t")).join("\n")

    const result = await ctx.system.copy(text).then(
      () => "copied" as const,
      () => "copyFailed" as const,
    )

    if (!controller.signal.aborted) setFeedback(result)
  }

  return (
    <Show when={props.rows.length > 0} fallback={<p>{ctx.t("output.empty")}</p>}>
      <div class="grid w-full min-w-0 gap-1.5">
        <div
          class="max-h-64 min-w-0 overflow-auto rounded-md border border-v2-border-border-base"
          role="region"
          aria-label={props.label}
          tabindex={0}
          data-scrollable
        >
          <table
            class="w-max min-w-full border-separate border-spacing-0 whitespace-nowrap text-start text-13-regular tabular-nums"
            aria-label={props.label}
          >
            <thead class="sticky top-0 bg-v2-background-bg-base text-v2-text-text-base">
              <tr>
                <For each={props.headers}>
                  {(header) => (
                    <th scope="col" class="px-2.5 py-1.5 text-start">
                      {header}
                    </th>
                  )}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={props.rows}>
                {(row) => (
                  <tr>
                    <For each={row}>
                      {(value) => <td class="border-t border-v2-border-border-base px-2.5 py-1.5">{value ?? "—"}</td>}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Button size="small" variant="ghost" onClick={() => void copy()}>
            {ctx.t("output.copy")}
          </Button>
          <span role="status">{feedback() ? ctx.t(`output.${feedback()}`) : ""}</span>
        </div>
      </div>
    </Show>
  )
}
