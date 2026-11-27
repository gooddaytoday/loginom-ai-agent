import type { PackageVariables as Snapshot } from "@loginom-ai-agent/loginom-agent/package-variables"
import { createLatest, usePlugin } from "@opencode/plugin/gui"
import { createMemo, createSignal, For, Match, Show, Switch, type JSX } from "solid-js"
import type definition from "./index"

type Usage = Snapshot["usages"][number]
const columns = ["variables.name", "variables.type", "variables.value", "variables.usedIn"] as const
const row = "grid gap-x-4 gap-y-1 px-2 py-2 @min-[36rem]:grid-cols-[1fr_0.8fr_1fr_1.6fr]"

export function PackageVariables(props: {
  load: (signal: AbortSignal) => Promise<Snapshot | null>
  nodeHref?: (usage: Usage) => string | undefined
}) {
  const ctx = usePlugin<typeof definition>()
  const [open, setOpen] = createSignal(false)
  const data = createLatest(
    () => (open() ? props.load : undefined),
    (load, signal) => load(AbortSignal.any([signal, AbortSignal.timeout(150_000)])),
  )

  return (
    <details
      class="@container mt-4 border-t border-border-weak-base pt-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary class="cursor-pointer text-14-medium">{ctx.t("variables.title")}</summary>
      <Show when={open()}>
        <div class="mt-3 flex min-w-0 flex-col gap-2 text-13-regular">
          <Switch>
            <Match when={data.loading}>
              <p role="status" class="text-text-weak">
                {ctx.t("variables.loading")}
              </p>
            </Match>
            <Match when={data.error || !data.latest}>
              <p class="text-text-weak">{ctx.t("variables.unavailable")}</p>
            </Match>
            <Match when={data.latest}>
              {(snapshot) => <VariablesTable snapshot={snapshot()} nodeHref={props.nodeHref} />}
            </Match>
          </Switch>
        </div>
      </Show>
    </details>
  )
}

function VariablesTable(props: { snapshot: Snapshot; nodeHref?: (usage: Usage) => string | undefined }) {
  const ctx = usePlugin<typeof definition>()
  const defaults = createMemo(() => new Map(props.snapshot.defaults?.map(({ name, value }) => [name, value])))
  const usages = createMemo(() => {
    const byName = new Map<string, Usage[]>()
    for (const usage of props.snapshot.usages) {
      const entries = byName.get(usage.name)
      if (entries) entries.push(usage)
      else byName.set(usage.name, [usage])
    }
    return byName
  })
  const isPartial = () =>
    props.snapshot.definitionsCoverage !== "complete" || props.snapshot.usagesCoverage !== "complete"

  function Cell(cell: { label: (typeof columns)[number]; children: JSX.Element }) {
    return (
      <div role="cell" class="grid min-w-0 grid-cols-[min(8.5rem,42%)_minmax(0,1fr)] gap-2 @min-[36rem]:block">
        <span class="text-text-weak @min-[36rem]:hidden" aria-hidden="true">
          {ctx.t(cell.label)}
        </span>
        <div class="[overflow-wrap:anywhere]">{cell.children}</div>
      </div>
    )
  }

  return (
    <>
      <p class="text-text-weak">
        {ctx.t(props.snapshot.source === "saved" ? "variables.saved" : "variables.window")}
        <Show when={isPartial()}> · {ctx.t("variables.partial")}</Show>
      </p>
      <Show when={props.snapshot.definitions === null}>
        <p class="text-text-weak">{ctx.t("variables.unavailable")}</p>
      </Show>
      <Show when={props.snapshot.definitions?.length === 0 && props.snapshot.definitionsCoverage === "complete"}>
        <p>{ctx.t("variables.empty")}</p>
      </Show>
      <Show when={props.snapshot.definitions?.length}>
        <div role="table" aria-label={ctx.t("variables.title")} class="rounded-lg border border-border-weak-base">
          <div role="row" class={`${row} text-text-weak @max-[36rem]:sr-only`}>
            <For each={columns}>{(key) => <div role="columnheader">{ctx.t(key)}</div>}</For>
          </div>
          <For each={props.snapshot.definitions}>
            {(entry) => (
              <div role="row" class={`${row} border-t border-border-weak-base first:border-t-0`}>
                <Cell label="variables.name">
                  <strong>{entry.name}</strong>
                </Cell>
                <Cell label="variables.type">{entry.type}</Cell>
                <Cell label="variables.value">
                  {defaults().get(entry.name) === ""
                    ? ctx.t("variables.emptyValue")
                    : (defaults().get(entry.name) ?? "—")}
                </Cell>
                <Cell label="variables.usedIn">
                  <For each={usages().get(entry.name)} fallback="—">
                    {(usage) => {
                      const label = () => `${usage.nodeLabel || usage.nodeID} · ${usage.parameter}`
                      return (
                        <div>
                          <Show when={props.nodeHref?.(usage)} fallback={label()}>
                            {(href) => (
                              <a class="underline" href={href()}>
                                {label()}
                              </a>
                            )}
                          </Show>
                        </div>
                      )
                    }}
                  </For>
                </Cell>
              </div>
            )}
          </For>
        </div>
      </Show>
    </>
  )
}
