import {
  documentName,
  documentationPermissions,
  Runner,
  waitForRunner,
  type Format,
} from "@loginom-ai-agent/loginom-host/runner-rpc"
import { usePlugin, type ServerRef } from "@opencode/plugin/gui"
import { createMemo, createResource, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js"
import {
  documentationPrompt,
  formats,
  historyResult,
  type ChatAction,
  type Content,
  type Outcome,
  type Run,
} from "./documentation-run"
import type definition from "./index"

const steps = ["docs.parameters", "docs.access", "docs.execution", "docs.result"] as const
const stages = ["docs.prepare", "docs.extract", "docs.draft", "docs.save"] as const
const contents = ["brief", "detailed", "custom"] as const

export default function Documentation(props: { onChatAction: (action: ChatAction) => void }) {
  const ctx = usePlugin<typeof definition>()
  const Button = ctx.ui.Button
  const [step, setStep] = createSignal(0)
  const [path, setPath] = createSignal("")
  const [selected, setSelected] = createSignal<Format[]>(["pdf"])
  const [content, setContent] = createSignal<Content>("brief")
  const [description, setDescription] = createSignal("")
  const [choice, setChoice] = createSignal<string>()
  const [run, setRun] = createSignal<Run>()
  const [evidence, setEvidence] = createSignal<ReturnType<typeof historyResult>>()
  const [outcome, setOutcome] = createSignal<Outcome>()
  const [checking, setChecking] = createSignal(false)
  const [stopping, setStopping] = createSignal(false)
  const [pickFailed, setPickFailed] = createSignal(false)
  const [openFailed, setOpenFailed] = createSignal(false)
  const cancel = new AbortController()
  onCleanup(() => cancel.abort())

  const server = createMemo(() => {
    const servers = ctx.servers.list().flatMap((id) => ctx.servers.get(id) ?? [])
    if (ctx.desktop) return servers.find((item) => item.builtin)
    const serving = ctx.servers.get(location.origin)
    const local = servers.filter((item) => item.local)
    return serving ?? (local.length === 1 ? local[0] : undefined)
  })
  const [models] = createResource(
    () => server()?.client,
    async (client) => {
      const result = await client.model.list({ types: ["chat"] }, { signal: cancel.signal }).catch(() => undefined)
      return result?.data ?? []
    },
  )
  const model = () => models()?.find((item) => modelKey(item) === choice())
  const canContinue = () =>
    /\.lgp$/i.test(path().trim()) && selected().length > 0 && (content() !== "custom" || !!description().trim())
  const report = () => Array.from(evidence()?.files ?? [])
  const activeStage = () => (!run() ? 0 : (evidence()?.stage ?? 1))

  let admitted = false
  let interrupting: Promise<void> | undefined
  let attempt = 0

  function modelKey(item: { providerID: string; id: string }) {
    return `${item.providerID}/${item.id}`
  }

  function finish(result: Outcome) {
    if (cancel.signal.aborted) return
    setOutcome(result)
    setStep(3)
  }

  async function pick() {
    try {
      setPickFailed(false)
      const [filename] = (await ctx.desktop?.pick({ title: ctx.t("docs.pick"), extensions: ["lgp"] })) ?? []
      if (filename) setPath(filename)
    } catch {
      setPickFailed(true)
    }
  }

  async function start() {
    const target = server()
    const chosen = model()
    if (step() !== 1 || !target || !chosen || !canContinue()) return
    const client = target.client
    const request = { signal: cancel.signal }
    const input = { path: path().trim(), formats: selected(), content: content(), description: description().trim() }
    const current = ++attempt
    admitted = false
    interrupting = undefined
    setRun(undefined)
    setEvidence(undefined)
    setOutcome(undefined)
    setOpenFailed(false)
    setStopping(false)
    setStep(2)
    let started: Run | undefined
    let submitted = false
    try {
      const runner = client.rpc(Runner)
      await waitForRunner(() => runner.ready({}, request), cancel.signal)
      if (stopping()) return finish("stopped")
      const prepared = await runner.prepareDocumentation({ packagePath: input.path }, request)
      if (stopping()) return finish("stopped")
      const session = await client.session.create(
        {
          title: ctx.t("docs.title"),
          agent: "build",
          location: { directory: prepared.directory },
          model: { id: chosen.id, providerID: chosen.providerID },
          permissions: documentationPermissions(prepared.filename, input.formats),
        },
        request,
      )
      started = { ...prepared, server: target.id, sessionID: session.id, formats: input.formats }
      setRun(started)
      const targetOptions = { ...request, location: { directory: prepared.directory } }
      await waitForRunner(() => runner.ready({}, targetOptions), cancel.signal)
      if (stopping()) return finish("stopped")
      submitted = true
      const result = await runner.start(
        {
          sessionID: session.id,
          profile: "package-docs",
          documentationFile: prepared.filename,
          customDocumentation: input.content === "custom",
          text: documentationPrompt(prepared.filename, input.formats, input.content, input.description),
        },
        targetOptions,
      )
      if (!result.granted) return finish("failed")
      admitted = true
      if (stopping()) await stop()
      if (step() !== 2) return
      await observe(target, started, current)
    } catch {
      if (current === attempt) finish(submitted ? "unknown" : stopping() ? "stopped" : "failed")
    }
  }

  async function observe(target: ServerRef, started: Run, current: number) {
    const client = target.client
    const input = { sessionID: started.sessionID }
    const options = { signal: cancel.signal }
    const refresh = async () => historyResult(started, await client.session.context(input, options))
    const progress = setInterval(() => {
      void refresh()
        .then((value) => {
          if (current === attempt && step() === 2) setEvidence(value)
        })
        .catch(() => undefined)
    }, 1500)
    try {
      await client.experimental.session.wait(input, options)
      const value = await refresh()
      if (current !== attempt) return
      setEvidence(value)
      finish(value.outcome)
    } finally {
      clearInterval(progress)
    }
  }

  async function stop() {
    if (step() !== 2) return
    setStopping(true)
    const started = run()
    if (!admitted || !started) return
    const current = attempt
    interrupting ??= (async () => {
      try {
        const target = ctx.servers.get(started.server)
        if (!target) throw new Error("Unavailable")
        await target.client.session.interrupt(
          { sessionID: started.sessionID, resume: false },
          { signal: cancel.signal },
        )
      } catch {
        if (current === attempt && step() === 2) finish("unknown")
      }
    })()
    await interrupting
  }

  async function checkState() {
    const started = run()
    const target = started && ctx.servers.get(started.server)
    if (!started || !target || checking()) return
    setChecking(true)
    const current = ++attempt
    try {
      await observe(target, started, current)
    } catch {
      finish("unknown")
    } finally {
      setChecking(false)
    }
  }

  function conversation(discuss = false) {
    const started = run()
    if (!started) return
    if (discuss)
      props.onChatAction({
        ...started,
        kind: "discuss",
        files: report().map(([format]) => documentName(started.filename, format)),
      })
    ctx.tabs.open({ server: started.server, id: started.sessionID }, { focus: true })
  }

  function openReport(format: Format, file: string) {
    setOpenFailed(false)
    if (ctx.desktop) {
      void ctx.desktop.launch(file).catch(() => setOpenFailed(true))
      return
    }
    const started = run()
    if (!started) return
    props.onChatAction({ ...started, kind: "preview", file: documentName(started.filename, format) })
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
                aria-current={step() === index() ? "step" : undefined}
                class="rounded-md border border-border-weak-base px-2 py-2"
                classList={{ "bg-surface-base-hover font-semibold": step() === index() }}
              >
                {index() + 1}. {ctx.t(label)}
              </li>
            )}
          </For>
        </ol>
        <div class="mt-5 flex flex-col gap-5 rounded-lg border border-border-weak-base p-4 sm:p-5">
          <Switch>
            <Match when={step() === 0}>
              <label class="flex flex-col gap-2">
                {ctx.t("docs.package")}
                <input
                  class="rounded border border-border-base bg-background-base p-2"
                  value={path()}
                  onInput={(event) => setPath(event.currentTarget.value)}
                  placeholder={ctx.t("docs.pathHint")}
                />
              </label>
              <Show when={ctx.desktop}>
                <div>
                  <Button onClick={pick}>{ctx.t("docs.pick")}</Button>
                </div>
              </Show>
              <Show when={pickFailed()}>
                <p role="alert">{ctx.t("docs.pickFailed")}</p>
              </Show>
              <fieldset class="flex flex-wrap gap-4">
                <legend class="mb-2 font-semibold">{ctx.t("docs.format")}</legend>
                <For each={formats}>
                  {(format) => (
                    <label class="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected().includes(format)}
                        onChange={(event) =>
                          setSelected((items) =>
                            event.currentTarget.checked ? [...items, format] : items.filter((item) => item !== format),
                          )
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
                        checked={content() === item}
                        onChange={() => setContent(item)}
                      />
                      {ctx.t(`docs.${item}`)}
                    </label>
                  )}
                </For>
              </fieldset>
              <Show when={content() === "custom"}>
                <label class="flex flex-col gap-2">
                  {ctx.t("docs.customLabel")}
                  <textarea
                    class="rounded border border-border-base bg-background-base p-2"
                    rows="3"
                    value={description()}
                    onInput={(event) => setDescription(event.currentTarget.value)}
                  />
                </label>
              </Show>
            </Match>
            <Match when={step() === 1}>
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
                <p>{ctx.t(content() === "custom" ? "docs.modelCustom" : "docs.modelBody")}</p>
                <label class="mt-2 flex flex-col gap-2">
                  {ctx.t("docs.model")}
                  <select
                    class="rounded border border-border-base bg-background-base p-2"
                    value={choice() ?? ""}
                    onChange={(event) => setChoice(event.currentTarget.value)}
                  >
                    <option value="" disabled>
                      {ctx.t(
                        models.loading ? "docs.modelLoading" : models()?.length ? "docs.chooseModel" : "docs.noModel",
                      )}
                    </option>
                    <For each={models()}>
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
            <Match when={step() === 2}>
              <ol class="flex flex-col gap-2" aria-label={ctx.t("docs.execution")}>
                <For each={stages}>
                  {(label, index) => (
                    <li aria-current={index() === activeStage() ? "step" : undefined}>
                      {index() < activeStage() ? "✓" : `${index() + 1}.`} {ctx.t(label)}
                    </li>
                  )}
                </For>
              </ol>
              <details>
                <summary>{ctx.t("docs.details")}</summary>
                <Show when={run()}>
                  <Button onClick={() => conversation()}>{ctx.t("docs.fullChat")}</Button>
                </Show>
                <p>{ctx.t(stages[activeStage()] ?? "docs.prepare")}</p>
              </details>
              <p aria-live="polite">{ctx.t(stopping() ? "docs.stopping" : "docs.stopHint")}</p>
            </Match>
            <Match when={outcome()}>
              {(result) => (
                <div class="flex flex-col gap-3" role="status">
                  <h2 class="text-16-medium">{ctx.t(`docs.${result()}`)}</h2>
                  <p>{ctx.t(`docs.${result()}Body`)}</p>
                  <h3 class="font-semibold">{ctx.t("docs.checked")}</h3>
                  <Show when={run()}>
                    <p>{ctx.t("docs.copyChecked")}</p>
                  </Show>
                  <Show when={report().length > 0} fallback={<p>{ctx.t("docs.noFiles")}</p>}>
                    <p>{ctx.t("docs.filesChecked")}</p>
                    <ul class="flex flex-col gap-2">
                      <For each={report()}>
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
                    <Show when={openFailed()}>
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
          <Match when={step() === 0}>
            <Button variant="contrast" disabled={!canContinue()} onClick={() => setStep(1)}>
              {ctx.t("docs.next")}
            </Button>
          </Match>
          <Match when={step() === 1}>
            <Button onClick={() => setStep(0)}>{ctx.t("docs.back")}</Button>
            <Button variant="contrast" disabled={!model() || !server()} onClick={start}>
              {ctx.t("docs.start")}
            </Button>
          </Match>
          <Match when={step() === 2}>
            <Button onClick={stop} disabled={stopping()}>
              {ctx.t("docs.stop")}
            </Button>
          </Match>
          <Match when={step() === 3}>
            <Show when={run()}>
              <Button onClick={() => conversation(outcome() === "ready")}>
                {ctx.t(outcome() === "ready" ? "docs.discuss" : "docs.fullChat")}
              </Button>
            </Show>
            <Show
              when={outcome() === "unknown"}
              fallback={<Button onClick={() => setStep(0)}>{ctx.t("docs.again")}</Button>}
            >
              <Button variant="contrast" disabled={checking()} onClick={checkState}>
                {ctx.t(checking() ? "docs.checking" : "docs.checkState")}
              </Button>
            </Show>
          </Match>
        </Switch>
      </footer>
    </section>
  )
}
