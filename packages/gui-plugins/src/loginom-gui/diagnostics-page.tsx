import { DiagnosticsRpc, type DiagnosticsStatus } from "@loginom-ai-agent/loginom-host/diagnostics-rpc"
import { createKeyed, usePlugin } from "@opencode/plugin/gui"
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { diagnosticsRows } from "./diagnostics-rows"
import type definition from "./index"
import { reportName, ReportSave } from "./report-save"
import { loginomClient } from "./target"

type Result = { kind: "loading" | "unavailable" } | { kind: "ready"; status: DiagnosticsStatus }

export default function DiagnosticsPage() {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const nativeSave = ctx.use(ReportSave)
  const client = createMemo(() => loginomClient(ctx))
  const [result, setResult] = createSignal<Result>({ kind: "loading" })
  const [checking, setChecking] = createSignal(false)
  const [checked, setChecked] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const [saveResult, setSaveResult] = createSignal<{ kind: "saved"; path: string } | { kind: "failed" }>()

  const status = () => {
    const current = result()

    return current.kind === "ready" ? current.status : undefined
  }

  const rows = () => diagnosticsRows(status())
  const problems = () => rows().filter((row) => !row.ok)
  let pending: AbortController | undefined
  let report: AbortController | undefined

  async function refresh(check: boolean) {
    pending?.abort()
    const request = new AbortController()
    pending = request

    if (!check) setResult({ kind: "loading" })
    setChecked(false)
    setChecking(check)
    const signal = AbortSignal.any([ctx.signal, request.signal, AbortSignal.timeout(check ? 245_000 : 12_000)])

    const response = await client()
      ?.rpc(DiagnosticsRpc)
      .status({ check }, { signal })
      .catch(() => undefined)

    if (request.signal.aborted || ctx.signal.aborted) return
    setResult(response ? { kind: "ready", status: response } : { kind: "unavailable" })
    setChecked(check)
    setChecking(false)
  }

  const reload = () => {
    report?.abort()
    setSaving(false)
    setSaveResult(undefined)
    void refresh(false)
  }

  createKeyed(client, reload, { otherwise: reload })
  onCleanup(() => {
    pending?.abort()
    report?.abort()
  })

  async function save() {
    const native = nativeSave()
    const request = new AbortController()
    report = request
    setSaveResult(undefined)
    setSaving(true)
    const signal = AbortSignal.any([ctx.signal, request.signal])

    try {
      const content = await client()
        ?.rpc(DiagnosticsRpc)
        .report({}, { signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]) })

      signal.throwIfAborted()

      if (!content) throw new Error("REPORT_UNAVAILABLE")

      if (ctx.desktop) {
        if (native.status !== "active") throw new Error("SAVE_UNAVAILABLE")
        const path = await native.value.write({ title: ctx.t("diagnostics.save"), content }, { signal })

        if (path && !signal.aborted) setSaveResult({ kind: "saved", path })
      } else {
        const url = URL.createObjectURL(new Blob([content], { type: "application/json" }))
        const link = document.createElement("a")
        link.href = url
        link.download = reportName
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        setSaveResult({ kind: "saved", path: ctx.t("diagnostics.download", { name: reportName }) })
      }
    } catch {
      if (!signal.aborted) setSaveResult({ kind: "failed" })
    } finally {
      if (!signal.aborted) setSaving(false)
    }
  }

  function detail(id: ReturnType<typeof rows>[number]["id"]) {
    const item = status()

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
        <For each={rows()}>
          {(row) => (
            <ui.SettingsRow
              title={ctx.t(`diagnostics.${row.id}`)}
              description={<span class="break-all">{detail(row.id)}</span>}
            >
              <div class="flex max-w-40 shrink-0 flex-col items-end gap-1 text-right">
                <span class={row.ok ? "text-text-success-base" : "text-text-warning-base"}>
                  {ctx.t(row.ok ? "diagnostics.ok" : result().kind === "loading" ? "loading" : "diagnostics.attention")}
                </span>
                <Show when={result().kind !== "loading" && !row.ok && row.tab}>
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
        <Show when={checked()}>
          <p aria-live="polite">
            {problems().length
              ? ctx.t("diagnostics.summary", {
                  items: problems()
                    .map((row) => ctx.t(`diagnostics.${row.id}`))
                    .join(", "),
                })
              : ctx.t("diagnostics.allGood")}
          </p>
        </Show>
        <div class="flex flex-wrap gap-2">
          <ui.Button variant="contrast" disabled={checking()} onClick={() => void refresh(true)}>
            {ctx.t(checking() ? "checking" : "diagnostics.check")}
          </ui.Button>
          <ui.Button
            disabled={saving() || !status() || (ctx.desktop && nativeSave().status !== "active")}
            onClick={() => void save()}
          >
            {ctx.t(saving() ? "saving" : "diagnostics.save")}
          </ui.Button>
        </div>
        <p class="text-text-weak">{ctx.t("diagnostics.privacy")}</p>
        <Show when={saveResult()}>
          {(saved) => {
            const message = () => {
              const value = saved()

              return value.kind === "saved"
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
