import { usePlugin } from "@opencode/plugin/gui"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { createMemo, createSignal, For, onCleanup, Show, type Accessor } from "solid-js"
import { linkKey, workflowAt } from "./compare-schemas"
import type { Node, Port } from "./contract"
import { buildDiagram, cardHeight, cardWidth, componentKey, nativePortKey, type Diagram } from "./graph"
import type definition from "./index"
import { createPackageChangeActions, PackageChangeActions } from "./package-change-actions"
import { nodeRows, type ChangesWithSchema } from "./package-changes-data"
import { FactsTable } from "./facts-table"
import type en from "./i18n/en"
import type { Event, Request, State } from "./machine"

type Translate = (key: keyof typeof en, args?: Record<string, string | number>) => string

type Ready = Extract<State, { status: "ready" }>

function nodeLabel(node: Node, translate: Translate) {
  if (node.boundary_role === "input") return translate("submodelInput")

  if (node.boundary_role === "output") return translate("submodelOutput")

  return node.label || componentLabel(node, translate)
}

function componentLabel(node: Node, translate: Translate) {
  const key = componentKey(node)

  return key ? translate(key) : node.type || translate("node")
}

function portLabel(node: Node, port: Port, translate: Translate) {
  const key = nativePortKey(node, port)

  if (port.name && !/^(Input|Output)_Data(Tree)?-\d+$/.test(port.name)) return port.name

  return key ? translate(key) : translate("port", { number: port.index + 1 })
}

const relations = [
  ["frtEqual", "="],
  ["frtNotEqual", "≠"],
  ["frtGreater", ">"],
  ["frtGreaterOrEqual", "≥"],
  ["frtLess", "<"],
  ["frtLessOrEqual", "≤"],
] as const

const unaryOperations = [
  ["frtIsTrue", "true"],
  ["frtIsFalse", "false"],
  ["frtIsNull", "emptyValue"],
  ["frtIsNotNull", "nonEmptyValue"],
] as const

const aggregates = [
  ["gdSum", "sum"],
  ["gdAvg", "average"],
  ["gdCount", "count"],
] as const

function settings(node: Node, translate: Translate) {
  const conditions = node.filter_conditions
    ?.map((condition, index) => {
      const operation = unaryOperations.find(([code]) => code === condition.relation)?.[1]

      return [
        index ? translate(condition.join === "ctOr" ? "or" : "and") : undefined,
        condition.field,
        operation
          ? translate(operation)
          : (relations.find(([code]) => code === condition.relation)?.[1] ?? condition.relation),
        condition.value,
      ]
        .filter((part) => part != null && part !== "")
        .join(" ")
    })
    .join(" ")

  const groups = node.grouping_fields
    ?.filter((field) => field.role === "group")
    .map((field) => field.field)
    .join(", ")

  const measures = node.grouping_fields
    ?.filter((field) => field.role === "measure")
    .map((field) => {
      const functions = field.functions
        ?.match(/\w+/g)
        ?.map((name) => {
          const key = aggregates.find(([code]) => code === name)?.[1]

          return key ? translate(key) : name
        })
        .join(", ")

      return functions ? `${field.field} · ${functions}` : field.field
    })
    .join("; ")

  let separator = node.text_import?.column_separator

  if (separator === "\t") separator = translate("tab")
  else if (separator === " ") separator = translate("space")

  return [
    { label: translate("condition"), value: conditions || undefined },
    { label: translate("keys"), value: groups || undefined },
    { label: translate("measures"), value: measures || undefined },
    { label: translate("file"), value: node.text_import?.file_or_url },
    { label: translate("separator"), value: separator },
  ].filter((setting) => setting.value !== undefined)
}

function NodeDetails(props: { diagram: Diagram; index: number; t: Translate }) {
  const entry = () => props.diagram.nodes.find((item) => "index" in item && item.index === props.index)

  return (
    <Show when={entry()} keyed>
      {(current) => (
        <>
          <p class="loginom-schema-muted">{props.t("node")}</p>
          <h3>{nodeLabel(current.node, props.t)}</h3>
          <p class="loginom-schema-muted">{componentLabel(current.node, props.t)}</p>
          <dl class="loginom-schema-facts">
            <For each={settings(current.node, props.t)}>
              {(setting) => (
                <div>
                  <dt>{setting.label}</dt>
                  <dd>{setting.value}</dd>
                </div>
              )}
            </For>
            <For each={[...current.inputs, ...current.outputs]}>
              {(item) => {
                const output = item.port.direction === "output"

                const connected = props.diagram.links.flatMap((link) => {
                  const here = output ? link.source : link.target
                  const there = output ? link.target : link.source

                  return here.port === item ? [`«${nodeLabel(there.entry.node, props.t)}»`] : []
                })

                return (
                  <div>
                    <dt>
                      {props.t(item.port.direction)} «{portLabel(current.node, item.port, props.t)}»
                    </dt>
                    <dd>
                      {connected.length ? `${output ? "→" : "←"} ${connected.join(", ")}` : props.t("disconnected")}
                    </dd>
                  </div>
                )
              }}
            </For>
          </dl>
        </>
      )}
    </Show>
  )
}

function WorkflowView(props: { state: Ready; dispatch: (event: Event) => void; t: Translate }) {
  const snapshot = () => props.state.snapshot

  const savedSnapshot = () => {
    const current = snapshot()

    if (current.source === "saved") return current
  }

  const path = () => props.state.path
  const workflow = () => path().at(-1)

  const graph = createMemo(() => {
    const current = snapshot()

    return current.source === "window" ? current.workflow : workflow()
  })

  const parent = createMemo(() =>
    path()
      .at(-2)
      ?.nodes.find((node) => node.guid === workflow()?.key.at(-1)),
  )

  const diagram = createMemo(() => {
    const current = graph()

    if (current?.nodes.length) return buildDiagram(current, parent())
  })

  const finding = () => props.state.request.finding
  const marked = (node: Node) => !!node.guid && !node.boundary_role && !!finding()?.nodeGuids.includes(node.guid)

  const selection = () => {
    const index = props.state.selected

    return index !== undefined ? graph()?.nodes[index] : undefined
  }

  const selectedSubmodel = () => {
    const node = selection()

    return node && componentKey(node) === "submodel"
  }

  const nested = () => {
    const guid = selection()?.guid

    if (guid) return workflow()?.submodels.find((model) => model.key.at(-1) === guid)
  }

  const packageName = () => snapshot().package.name || props.t("schema")

  const crumbs = () => {
    const current = snapshot()

    return current.source === "window"
      ? current.workflow.navigation_path
      : path()
          .slice(1)
          .map((model) => model.label)
  }

  const comparison = () => props.state.comparison
  const diff = () => comparison()?.changes.schemaDiff
  const showingChanges = () => comparison()?.mode === "after"
  const changes = createMemo(() => comparison()?.changes)

  const nodeChanges = createMemo(() => {
    const current = changes()

    return new Map(current ? nodeRows(current, props.t).map((row) => [row.guid, row]) : [])
  })

  const changeMark = (node: Node) => {
    if (showingChanges() && node.guid && !node.boundary_role) return nodeChanges().get(node.guid)?.kind
  }

  const selectedChange = () => {
    const guid = selection()?.guid

    if (showingChanges() && guid) return nodeChanges().get(guid)
  }

  const description = (node: Node) => {
    const mark = changeMark(node)

    if (mark) return props.t(`schema.${mark}`)
  }

  const originalEdges = createMemo(
    () => new Set(workflowAt(diff()?.before.workflows ?? [], path())?.links.map(linkKey)),
  )

  const currentEdges = createMemo(() => new Set(workflowAt(diff()?.after.workflows ?? [], path())?.links.map(linkKey)))

  const [overflow, setOverflow] = createSignal(false)
  let details: HTMLDivElement | undefined

  const select = (index: number) => {
    props.dispatch({ type: "select", index })

    if (comparison()) details?.scrollIntoView({ block: "nearest" })
  }

  return (
    <>
      <header class="loginom-schema-section loginom-schema-title">
        <Icon name="branch" size="large" />
        <div>
          <h2>{packageName()}</h2>
          <p class="loginom-schema-muted">{comparison() ? props.t("changes.copy") : props.t(snapshot().source)}</p>
          <Show when={snapshot().source === "window"}>
            <p class="loginom-schema-muted">{props.t("windowScope")}</p>
          </Show>
        </div>
        <Show when={savedSnapshot()}>
          {(saved) => (
            <Show when={saved().workflows.length > 1}>
              <label class="loginom-schema-module">
                {props.t("module")}
                <select
                  value={String(saved().workflows.indexOf(path()[0]))}
                  onChange={(event) => {
                    const module = saved().workflows[Number(event.currentTarget.value)]

                    if (module) props.dispatch({ type: "module", workflow: module })
                  }}
                >
                  <For each={saved().workflows}>
                    {(module, index) => <option value={index()}>{module.label}</option>}
                  </For>
                </select>
              </label>
            </Show>
          )}
        </Show>
        <Show when={comparison()}>
          {(change) => (
            <div class="loginom-schema-toggle" role="group" aria-label={props.t("schema.mode")}>
              <Button
                type="button"
                size="small"
                variant={change().mode === "after" ? "outline" : "ghost"}
                aria-pressed={change().mode === "after"}
                onClick={() => props.dispatch({ type: "mode", mode: "after" })}
              >
                {props.t("schema.withChanges")}
              </Button>
              <Button
                type="button"
                size="small"
                variant={change().mode === "before" ? "outline" : "ghost"}
                aria-pressed={change().mode === "before"}
                onClick={() => props.dispatch({ type: "mode", mode: "before" })}
              >
                {props.t("schema.asBefore")}
              </Button>
            </div>
          )}
        </Show>
      </header>
      <Show when={showingChanges()}>
        <div class="loginom-schema-section loginom-schema-legend">
          <span class="is-added">{props.t("schema.added")}</span>
          <span class="is-changed">{props.t("schema.changed")}</span>
          <span class="is-removed">{props.t("schema.removed")}</span>
          <span class="loginom-schema-link-key is-added">{props.t("schema.linkAdded")}</span>
          <span class="loginom-schema-link-key is-removed">{props.t("schema.linkRemoved")}</span>
        </div>
      </Show>
      <Show when={crumbs().length > 0}>
        <div class="loginom-schema-section loginom-schema-crumbs">
          <span>{[packageName(), ...crumbs()].join(" › ")}</span>
          <Show when={path().length > 1}>
            <Button type="button" variant="neutral" onClick={() => props.dispatch({ type: "leave" })}>
              {props.t("leave")}
            </Button>
          </Show>
        </div>
      </Show>
      <Show when={diagram()} keyed fallback={<p class="loginom-schema-section">{props.t("noNodes")}</p>}>
        {(current) => (
          <>
            <div
              class="loginom-schema-viewport"
              role="region"
              aria-label={props.t(
                comparison() ? (showingChanges() ? "schema.graphAfter" : "schema.graphBefore") : "schema",
              )}
              tabIndex={0}
              ref={(element) => {
                const observer = new ResizeObserver(() => setOverflow(element.scrollWidth > element.clientWidth))
                observer.observe(element)
                onCleanup(() => observer.disconnect())
                queueMicrotask(() => {
                  if (!element.isConnected || !finding()) return
                  const initial = current.nodes.find((node) => "index" in node && node.index === props.state.selected)

                  if (initial && initial.x + cardWidth > element.clientWidth) element.scrollLeft = initial.x - 28

                  if (initial && initial.y + cardHeight > element.clientHeight) element.scrollTop = initial.y - 28
                })
              }}
            >
              <div class="loginom-schema-canvas" style={{ width: `${current.width}px`, height: `${current.height}px` }}>
                <svg data-slot="diagram-links" aria-hidden="true" width={current.width} height={current.height}>
                  <For each={current.links}>
                    {(link) => {
                      const from = link.source.port
                      const to = link.target.port
                      const bend = Math.max(32, Math.min(90, Math.abs(to.x - from.x) / 2))

                      return (
                        <path
                          classList={{
                            "is-added": showingChanges() && !originalEdges().has(linkKey(link.link)),
                            "is-removed": showingChanges() && !currentEdges().has(linkKey(link.link)),
                          }}
                          d={`M${from.x} ${from.y}C${from.x + bend} ${from.y} ${to.x - bend} ${to.y} ${to.x} ${to.y}`}
                        />
                      )
                    }}
                  </For>
                </svg>
                <For each={current.nodes}>
                  {(item) => {
                    const index = "index" in item ? item.index : undefined

                    const model =
                      item.node.guid && workflow()?.submodels.find((child) => child.key.at(-1) === item.node.guid)

                    const title = nodeLabel(item.node, props.t)

                    const content = (
                      <>
                        <Show when={marked(item.node)}>
                          <span class="loginom-schema-mark">{props.t("finding")}</span>
                        </Show>
                        <Show when={changeMark(item.node)}>
                          {(mark) => (
                            <span class={`loginom-schema-mark is-${mark()}`}>{props.t(`schema.${mark()}`)}</span>
                          )}
                        </Show>
                        <Icon name="branch" />
                        <strong>{title}</strong>
                        <Show when={!item.node.boundary_role}>
                          <small>
                            {model
                              ? props.t("submodelCount", { number: model.nodes.length })
                              : componentLabel(item.node, props.t)}
                          </small>
                        </Show>
                        <For each={[...item.inputs, ...item.outputs]}>
                          {(port) => {
                            const connected = current.links.some(
                              (link) => link.source.port === port || link.target.port === port,
                            )

                            return (
                              <span
                                aria-hidden="true"
                                class="loginom-schema-port"
                                classList={{ "is-connected": connected }}
                                title={
                                  portLabel(item.node, port.port, props.t) +
                                  (connected ? "" : ` — ${props.t("disconnected")}`)
                                }
                                style={{ left: `${port.x - item.x}px`, top: `${port.y - item.y}px` }}
                              />
                            )
                          }}
                        </For>
                      </>
                    )

                    const style = {
                      left: `${item.x}px`,
                      top: `${item.y}px`,
                      width: `${cardWidth}px`,
                      height: `${cardHeight}px`,
                    }

                    return index === undefined ? (
                      <div class="loginom-schema-card" style={style}>
                        {content}
                      </div>
                    ) : (
                      <button
                        type="button"
                        class="loginom-schema-card"
                        classList={{
                          "is-marked": marked(item.node),
                          "is-submodel": componentKey(item.node) === "submodel",
                          "is-added": changeMark(item.node) === "added",
                          "is-changed": changeMark(item.node) === "changed",
                          "is-removed": changeMark(item.node) === "removed",
                        }}
                        aria-label={title}
                        aria-description={description(item.node)}
                        aria-pressed={props.state.selected === index}
                        style={style}
                        onClick={() => select(index)}
                      >
                        {content}
                      </button>
                    )
                  }}
                </For>
              </div>
            </div>
            <p class="loginom-schema-section loginom-schema-muted">
              {props.t("legend")} {overflow() && props.t("scroll")}
            </p>
          </>
        )}
      </Show>
      <Show when={finding()}>
        {(current) => (
          <p class="loginom-schema-section loginom-schema-finding">
            <strong>{props.t("agentFinding")}</strong> {current().text}
          </p>
        )}
      </Show>
      <div class="loginom-schema-section" ref={details}>
        <Show
          when={selectedChange()}
          fallback={
            <Show when={selection() && diagram()} fallback={props.t("select")}>
              {(current) => <NodeDetails diagram={current()} index={props.state.selected ?? -1} t={props.t} />}
            </Show>
          }
        >
          {(change) => (
            <>
              <h3>{selection()?.label}</h3>
              <p class="loginom-schema-muted">{props.t("facts.title")}</p>
              <FactsTable facts={change().facts} />
            </>
          )}
        </Show>
        <Show when={nested()}>
          {(model) => (
            <Button
              type="button"
              variant="neutral"
              onClick={() => props.dispatch({ type: "enter", workflow: model() })}
            >
              {props.t("enter")}
            </Button>
          )}
        </Show>
        <Show when={snapshot().source === "window" && selectedSubmodel()}>
          <p class="loginom-schema-muted">{props.t("submodelUnavailable")}</p>
        </Show>
      </div>
    </>
  )
}

function SchemaChangeActions(props: { changes: ChangesWithSchema; request: Request }) {
  const ctx = usePlugin<typeof definition>()

  const actions = createPackageChangeActions(props.changes, props.request, () =>
    ctx.sessions
      .list()
      .find(
        (session) =>
          session.id === props.request.sessionID &&
          session.server.id === props.request.serverID &&
          !session.pending &&
          session.location?.directory === props.request.directory,
      ),
  )

  return (
    <>
      <p role="status" class="loginom-schema-muted">
        {actions.status()}
      </p>
      <PackageChangeActions actions={actions} />
    </>
  )
}

export default function SchemaPage(props: {
  state: Accessor<State>
  dispatch: (event: Event) => void
  t: Translate
  retry: () => void
  back: () => void
}) {
  const ready = () => {
    const current = props.state()

    if (current.status === "ready") return current
  }

  return (
    <main class="loginom-schema-page">
      <div class="loginom-schema-content">
        <p class="loginom-schema-muted">{props.t("loginom")}</p>
        <h1>
          <Show when={ready()?.comparison} fallback={props.t("packages")}>
            {(change) => props.t("schema.changesTitle", { name: change().changes.packageName })}
          </Show>
        </h1>
        <section class="loginom-schema-frame">
          <Show when={ready()}>
            {(current) => <WorkflowView state={current()} dispatch={props.dispatch} t={props.t} />}
          </Show>
          <Show when={!ready()}>
            <div class="loginom-schema-section" role="status">
              <Show when={props.state().status === "loading"}>{props.t("loading")}</Show>
              <Show when={props.state().status === "empty" || props.state().status === "closed"}>
                {props.t("empty")}
              </Show>
              <Show when={props.state().status === "failed"}>
                <p>{props.t("failed")}</p>
                <Button type="button" variant="neutral" onClick={props.retry}>
                  {props.t("retry")}
                </Button>
              </Show>
            </div>
          </Show>
          <Show when={props.state().status !== "closed"}>
            <footer class="loginom-schema-section loginom-schema-actions">
              <Show when={ready()?.comparison?.changes} keyed>
                {(changes) => {
                  const current = ready()

                  if (current) return <SchemaChangeActions changes={changes} request={current.request} />
                }}
              </Show>
              <Button type="button" variant="neutral" onClick={props.back}>
                {props.t("back")}
              </Button>
            </footer>
          </Show>
        </section>
      </div>
    </main>
  )
}
