import { documentName, type Format } from "@loginom-ai-agent/loginom-host/runner-rpc"
import { createLatest, usePlugin } from "@opencode/plugin/gui"
import { createMemo, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js"
import { formats, type ChatAction } from "./documentation-run"
import { documentationDriver } from "./documentation-driver"
import { initial, view, type State } from "./documentation-machine"
import type definition from "./index"

const steps = ["docs.parameters", "docs.access", "docs.execution", "docs.result"] as const

const stages = ["docs.prepare", "docs.extract", "docs.draft", "docs.save"] as const

const contents = ["brief", "detailed", "custom"] as const

export default function Documentation(props: { onChatAction: (action: ChatAction) => void }) {
  const ctx = usePlugin<typeof definition>()
  const Button = ctx.ui.Button
  const [state, write] = createSignal<State>(initial)
  const wizard = createMemo(() => view(state()))
  const { dispatch, start, stop, check, dispose } = documentationDriver(state, write)
  onCleanup(dispose)

  const server = createMemo(() => {
    const servers = ctx.servers.list().flatMap((id) => ctx.servers.get(id) ?? [])

    if (ctx.desktop) return servers.find((item) => item.builtin)

    const serving = ctx.servers.get(location.origin)
    const local = servers.filter((item) => item.local)

    return serving ?? (local.length === 1 ? local[0] : undefined)
  })

  const models = createLatest(
    () => wizard().step === 1 && server(),
    async (target, signal) => {
      const result = await target.client.model.list(
        { types: ["chat"] },
        { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) },
      )

      return { serverID: target.id, entries: result.data ?? [] }
    },
  )

  const options = () =>
    models.latest?.serverID === server()?.id && !models.loading && !models.error ? models.latest?.entries : undefined

  const model = () => options()?.find((item) => modelKey(item) === wizard().form.model)

  function modelKey(item: { providerID: string; id: string }) {
    return `${item.providerID}/${item.id}`
  }

  async function pick() {
    const previous = state()
    dispatch({ type: "pick" })

    if (state() === previous) return

    try {
      const [filename] = (await ctx.desktop?.pick({ title: ctx.t("docs.pick"), extensions: ["lgp"] })) ?? []
      dispatch({ type: "picked", path: filename })
    } catch {
      dispatch({ type: "picked", error: true })
    }
  }

  function conversation(discuss = false) {
    const run = wizard().run

    if (!run) return

    if (discuss) {
      props.onChatAction({
        ...run,
        kind: "discuss",
        files: wizard().files.map(([format]) => documentName(run.filename, format)),
      })
    }

    ctx.tabs.open({ server: run.server, id: run.sessionID }, { focus: true })
  }

  async function openReport(format: Format, file: string) {
    const current = state()

    if (current.kind !== "result" || !current.run) return

    dispatch({ type: "open", attempt: current.attempt })

    if (ctx.desktop) {
      await ctx.desktop.launch(file).catch(() => dispatch({ type: "open", attempt: current.attempt, error: true }))

      return
    }

    props.onChatAction({ ...current.run, kind: "preview", file: documentName(current.run.filename, format) })
    conversation()
  }

  return (
    <section class="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col text-text-base">
      <div class="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-8">
        <h1 class="text-20-medium text-text-strong">{ctx.t("docs.title")}</h1>
        <p class="mt-2 text-text-weak">{ctx.t("docs.intro")}</p>
        <ol class="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={ctx.t("docs.steps")}>
          <For each={steps}>
            {(label, index) => (
              <li
                aria-current={wizard().step === index() ? "step" : undefined}
                class="rounded-md border border-border-weak-base px-2 py-2"
                classList={{ "bg-surface-base-hover font-semibold": wizard().step === index() }}
              >
                {index() + 1}. {ctx.t(label)}
              </li>
            )}
          </For>
        </ol>
        <div class="mt-5 flex flex-col gap-5 rounded-lg border border-border-weak-base p-4 sm:p-5">
          <Switch>
            <Match when={wizard().step === 0}>
              <label class="flex flex-col gap-2">
                {ctx.t("docs.package")}
                <input
                  class="rounded border border-border-base bg-background-base p-2"
                  value={wizard().form.path}
                  onInput={(event) => dispatch({ type: "edit", form: { path: event.currentTarget.value } })}
                  placeholder={ctx.t("docs.pathHint")}
                />
              </label>
              <Show when={ctx.desktop}>
                <div>
                  <Button onClick={pick}>{ctx.t("docs.pick")}</Button>
                </div>
              </Show>
              <Show when={wizard().pickFailed}>
                <p role="alert">{ctx.t("docs.pickFailed")}</p>
              </Show>
              <fieldset class="flex flex-wrap gap-4">
                <legend class="mb-2 font-semibold">{ctx.t("docs.format")}</legend>
                <For each={formats}>
                  {(format) => (
                    <label class="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={wizard().form.formats.includes(format)}
                        onChange={(event) =>
                          dispatch({
                            type: "edit",
                            form: {
                              formats: event.currentTarget.checked
                                ? [...wizard().form.formats, format]
                                : wizard().form.formats.filter((item) => item !== format),
                            },
                          })
                        }
                      />
                      {ctx.t(`docs.${format}`)}
                    </label>
                  )}
                </For>
              </fieldset>
              <fieldset class="flex flex-wrap gap-4">
                <legend class="mb-2 font-semibold">{ctx.t("docs.content")}</legend>
                <For each={contents}>
                  {(item) => (
                    <label class="flex items-center gap-2">
                      <input
                        type="radio"
                        name="documentation-content"
                        checked={wizard().form.content === item}
                        onChange={() => dispatch({ type: "edit", form: { content: item } })}
                      />
                      {ctx.t(`docs.${item}`)}
                    </label>
                  )}
                </For>
              </fieldset>
              <Show when={wizard().form.content === "custom"}>
                <label class="flex flex-col gap-2">
                  {ctx.t("docs.customLabel")}
                  <textarea
                    class="rounded border border-border-base bg-background-base p-2"
                    rows="3"
                    value={wizard().form.description}
                    onInput={(event) => dispatch({ type: "edit", form: { description: event.currentTarget.value } })}
                  />
                </label>
              </Show>
            </Match>
            <Match when={wizard().step === 1}>
              <p>{ctx.t("docs.oneRun")}</p>
              <div class="rounded-md bg-surface-base-hover p-3">
                <h2 class="font-semibold">{ctx.t("docs.app")}</h2>
                <p>{ctx.t("docs.appBody")}</p>
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <div class="rounded-md border border-border-weak-base p-3">
                  <h2 class="font-semibold">{ctx.t("docs.can")}</h2>
                  <p>{ctx.t("docs.canBody")}</p>
                </div>
                <div class="rounded-md border border-border-weak-base p-3">
                  <h2 class="font-semibold">{ctx.t("docs.cannot")}</h2>
                  <p>{ctx.t("docs.cannotBody")}</p>
                </div>
              </div>
              <div class="rounded-md border border-border-warning-base p-3">
                <h2 class="font-semibold">{ctx.t("docs.modelSees")}</h2>
                <p>{ctx.t(wizard().form.content === "custom" ? "docs.modelCustom" : "docs.modelBody")}</p>
                <label class="mt-2 flex flex-col gap-2">
                  {ctx.t("docs.model")}
                  <select
                    class="rounded border border-border-base bg-background-base p-2"
                    value={wizard().form.model}
                    onChange={(event) => dispatch({ type: "edit", form: { model: event.currentTarget.value } })}
                  >
                    <option value="" disabled>
                      {ctx.t(
                        models.loading ? "docs.modelLoading" : options()?.length ? "docs.chooseModel" : "docs.noModel",
                      )}
                    </option>
                    <For each={options()}>
                      {(item) => (
                        <option value={modelKey(item)}>
                          {item.name} · {item.providerID}
                        </option>
                      )}
                    </For>
                  </select>
                </label>
                <p class="mt-2">{ctx.t("docs.modelLocation")}</p>
              </div>
            </Match>
            <Match when={wizard().step === 2}>
              <ol class="flex flex-col gap-2" aria-label={ctx.t("docs.execution")}>
                <For each={stages}>
                  {(label, index) => (
                    <li aria-current={index() === wizard().stage ? "step" : undefined}>
                      {index() < wizard().stage ? "✓" : `${index() + 1}.`} {ctx.t(label)}
                    </li>
                  )}
                </For>
              </ol>
              <details>
                <summary>{ctx.t("docs.details")}</summary>
                <Show when={wizard().run}>
                  <Button onClick={() => conversation()}>{ctx.t("docs.fullChat")}</Button>
                </Show>
                <p>{ctx.t(stages[wizard().stage] ?? "docs.prepare")}</p>
              </details>
              <p aria-live="polite">{ctx.t(wizard().stopping ? "docs.stopping" : "docs.stopHint")}</p>
            </Match>
            <Match when={wizard().outcome}>
              {(result) => (
                <div class="flex flex-col gap-3" role="status">
                  <h2 class="text-16-medium">{ctx.t(`docs.${result()}`)}</h2>
                  <p>
                    {ctx.t(result() === "stopped" && !wizard().run ? "docs.stoppedBeforeRun" : `docs.${result()}Body`)}
                  </p>
                  <h3 class="font-semibold">{ctx.t("docs.checked")}</h3>
                  <Show when={wizard().run}>
                    <p>{ctx.t("docs.copyChecked")}</p>
                  </Show>
                  <Show when={wizard().files.length > 0} fallback={<p>{ctx.t("docs.noFiles")}</p>}>
                    <p>{ctx.t(wizard().form.content === "custom" ? "docs.customChecked" : "docs.filesChecked")}</p>
                    <ul class="flex flex-col gap-2">
                      <For each={wizard().files}>
                        {([format, file]) => (
                          <li class="break-all rounded-md border border-border-weak-base p-2">
                            <div>
                              {ctx.t(`docs.${format}`)} · {file}
                            </div>
                            <Button onClick={() => openReport(format, file)}>{ctx.t("docs.open")}</Button>
                          </li>
                        )}
                      </For>
                    </ul>
                    <Show when={wizard().openFailed}>
                      <p role="alert">{ctx.t("docs.openFailed")}</p>
                    </Show>
                  </Show>
                </div>
              )}
            </Match>
          </Switch>
        </div>
      </div>
      <footer class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border-weak-base bg-background-base px-4 py-3 sm:px-8">
        <Switch>
          <Match when={wizard().step === 0}>
            <Button variant="contrast" disabled={!wizard().canContinue} onClick={() => dispatch({ type: "next" })}>
              {ctx.t("docs.next")}
            </Button>
          </Match>
          <Match when={wizard().step === 1}>
            <Button onClick={() => dispatch({ type: "back" })}>{ctx.t("docs.back")}</Button>
            <Button
              variant="contrast"
              disabled={!model() || !server()}
              onClick={() => {
                const target = server()
                const chosen = model()

                if (target && chosen) void start(target, chosen, ctx.t("docs.title"))
              }}
            >
              {ctx.t("docs.start")}
            </Button>
          </Match>
          <Match when={wizard().step === 2}>
            <Button onClick={() => stop((id) => ctx.servers.get(id))} disabled={wizard().stopping}>
              {ctx.t("docs.stop")}
            </Button>
          </Match>
          <Match when={wizard().step === 3}>
            <Show when={wizard().run}>
              <Button onClick={() => conversation(wizard().outcome === "ready")}>
                {ctx.t(wizard().outcome === "ready" ? "docs.discuss" : "docs.fullChat")}
              </Button>
            </Show>
            <Show
              when={wizard().outcome === "unknown"}
              fallback={<Button onClick={() => dispatch({ type: "again" })}>{ctx.t("docs.again")}</Button>}
            >
              <Button
                variant="contrast"
                disabled={wizard().checking || !wizard().run}
                onClick={() => check((id) => ctx.servers.get(id))}
              >
                {ctx.t(wizard().checking ? "docs.checking" : "docs.checkState")}
              </Button>
            </Show>
          </Match>
        </Switch>
      </footer>
    </section>
  )
}
