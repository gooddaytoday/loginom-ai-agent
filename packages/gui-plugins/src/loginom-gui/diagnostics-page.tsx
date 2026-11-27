import { DiagnosticsRpc } from "@loginom-ai-agent/loginom-host/diagnostics-rpc"
import { createKeyed, usePlugin } from "@opencode/plugin/gui"
import { createMemo, createSignal, For, onCleanup, Show, untrack } from "solid-js"
import { reportName, ReportSave } from "./contract"
import { initial, transition, view } from "./diagnostics-machine"
import type definition from "./index"
import { loginomClient } from "./target"

export default function DiagnosticsPage() {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const nativeSave = ctx.use(ReportSave)
  const client = createMemo(() => loginomClient(ctx))
  const saveAvailable = () => !ctx.desktop || nativeSave().status === "active"
  const [state, setState] = createSignal(initial)
  const page = createMemo(() => view(state(), saveAvailable()))
  const requests = new Map<number, AbortController>()

  function dispatch(event: Parameters<typeof transition>[1]) {
    const next = transition(untrack(state), event)
    setState(next.state)
    next.effects.forEach(run)
  }

  const reload = () => dispatch({ type: "target", available: !!client() })
  createKeyed(client, reload, { otherwise: reload })
  onCleanup(() => dispatch({ type: "disposed" }))

  function run(effect: ReturnType<typeof transition>["effects"][number]) {
    if (effect.type === "cancel") {
      requests.forEach((request) => request.abort())
      requests.clear()

      return
    }

    const request = new AbortController()
    requests.set(effect.attempt, request)
    const signal = AbortSignal.any([ctx.signal, request.signal])
    const rpc = untrack(client)?.rpc(DiagnosticsRpc)

    const timeout = AbortSignal.any([
      signal,
      AbortSignal.timeout(effect.type === "status" && effect.check ? 245_000 : 12_000),
    ])

    if (effect.type === "status") {
      void Promise.try(() => rpc?.status({ check: effect.check }, { signal: timeout }))
        .then(
          (status) => dispatch({ type: "status", attempt: effect.attempt, status }),
          () => dispatch({ type: "status", attempt: effect.attempt, status: undefined }),
        )
        .finally(() => requests.delete(effect.attempt))

      return
    }

    void Promise.try(async () => {
      const content = await rpc?.report({}, { signal: timeout })
      signal.throwIfAborted()

      if (!content) throw new Error("REPORT_UNAVAILABLE")

      return save(content, signal)
    })
      .then(
        (path) =>
          dispatch({ type: "report", attempt: effect.attempt, report: path ? { type: "saved", path } : undefined }),
        () => dispatch({ type: "report", attempt: effect.attempt, report: { type: "failed" } }),
      )
      .finally(() => requests.delete(effect.attempt))
  }

  async function save(content: string, signal: AbortSignal) {
    if (ctx.desktop) {
      const native = nativeSave()

      if (native.status !== "active") throw new Error("SAVE_UNAVAILABLE")

      return native.value.write({ title: ctx.t("diagnostics.save"), content }, { signal })
    }

    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url
    link.download = reportName
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)

    return ctx.t("diagnostics.download", { name: reportName })
  }

  function detail(id: ReturnType<typeof page>["rows"][number]["id"]) {
    const item = page().status

    switch (id) {
      case "loginom":
        return item?.address || ctx.t("diagnostics.loginomHint")
      case "model":
        return item?.model ?? ctx.t("diagnostics.modelHint")
      case "help":
        return ctx.t(item?.help ? "diagnostics.helpReady" : "diagnostics.helpHint")
      case "catalog":
        return ctx.t(item?.catalog ? "diagnostics.catalogReady" : "diagnostics.catalogHint")
      case "policy": {
        if (!item) return ctx.t("diagnostics.unknown")

        if (item.policy === "invalid") return ctx.t("diagnostics.policyInvalid", { path: item.policyFile })

        return ctx.t(item.policy === "present" ? "diagnostics.policyPresent" : "diagnostics.policyAbsent")
      }

      case "network": {
        if (!item?.network) return ctx.t("diagnostics.unknown")

        return ctx.t(item.network === "device" ? "diagnostics.device" : "diagnostics.online")
      }

      case "service":
        return ctx.t(item ? "diagnostics.serviceReady" : "diagnostics.serviceHint")
      case "journal":
        return ctx.t("diagnostics.journalHint")
    }
  }

  return (
    <ui.SettingsLayout title={ctx.t("diagnostics.title")} description={ctx.t("diagnostics.description")}>
      <ui.SettingsSection>
        <For each={page().rows}>
          {(row) => (
            <ui.SettingsRow
              title={ctx.t(`diagnostics.${row.id}`)}
              description={<span class="break-all">{detail(row.id)}</span>}
            >
              <div class="flex max-w-40 shrink-0 flex-col items-end gap-1 text-right">
                <Show
                  when={row.ok !== null}
                  fallback={<span class="text-text-weak">{ctx.t("diagnostics.neutral")}</span>}
                >
                  <span class={row.ok ? "text-text-success-base" : "text-text-warning-base"}>
                    {ctx.t(row.ok ? "diagnostics.ok" : page().loading ? "loading" : "diagnostics.attention")}
                  </span>
                </Show>
                <Show when={!page().loading && row.ok === false && row.tab}>
                  {(tab) => (
                    <ui.Button size="small" variant="ghost" onClick={() => ctx.layout.settings(tab())}>
                      {ctx.t("diagnostics.open", { name: ctx.t(`diagnostics.go.${tab()}`) })}
                    </ui.Button>
                  )}
                </Show>
              </div>
            </ui.SettingsRow>
          )}
        </For>
      </ui.SettingsSection>
      <div class="flex flex-col gap-3">
        <Show when={page().problems}>
          {(problems) => (
            <p aria-live="polite">
              {problems().length
                ? ctx.t("diagnostics.summary", {
                    items: problems()
                      .map((row) => ctx.t(`diagnostics.${row.id}`))
                      .join(", "),
                  })
                : ctx.t("diagnostics.allGood")}
            </p>
          )}
        </Show>
        <div class="flex flex-wrap gap-2">
          <ui.Button variant="contrast" disabled={!page().canCheck} onClick={() => dispatch({ type: "check" })}>
            {ctx.t(page().checking ? "checking" : "diagnostics.check")}
          </ui.Button>
          <ui.Button disabled={!page().canSave} onClick={() => dispatch({ type: "save", available: saveAvailable() })}>
            {ctx.t(page().saving ? "saving" : "diagnostics.save")}
          </ui.Button>
        </div>
        <p class="text-text-weak">{ctx.t("diagnostics.privacy")}</p>
        <Show when={ctx.desktop && nativeSave().status === "inactive"}>
          <p role="status">{ctx.t("diagnostics.saveUnavailable")}</p>
        </Show>
        <Show when={page().report}>
          {(saved) => {
            const message = () => {
              const value = saved()

              return value.type === "saved"
                ? ctx.t("diagnostics.saved", { path: value.path })
                : ctx.t("diagnostics.saveFailed")
            }

            return (
              <p role="status" class="break-all">
                {message()}
              </p>
            )
          }}
        </Show>
      </div>
    </ui.SettingsLayout>
  )
}
