import { SettingsPage, type Plugin } from "@opencode/plugin/gui"
import { showToast } from "@opencode/ui/toast"
import { createSignal } from "solid-js"
import { SystemProxy } from "./contract"
import type definition from "./index"

export const registerSystemProxy: Plugin.Setup<typeof definition> = (ctx) => {
  const ui = ctx.ui
  const proxy = ctx.use(SystemProxy)

  const client = () => {
    const live = proxy()

    return live.status === "active" ? live.value : undefined
  }

  const setting = () => client()?.state()

  const [saving, setSaving] = createSignal(false)

  const write = async (enabled: boolean) => {
    const active = client()

    if (!active || saving()) return
    setSaving(true)

    try {
      await active.set(enabled, { signal: ctx.signal })
    } catch {
      if (!ctx.signal.aborted) showToast({ variant: "error", title: ctx.t("proxy.writeFailed") })
    } finally {
      if (!ctx.signal.aborted) setSaving(false)
    }
  }

  ctx.add(SettingsPage, {
    id: "system-proxy",
    page: "general",
    section: "general",
    get title() {
      return ctx.t("proxy.title")
    },
    get entries() {
      return [{ id: "settings-system-proxy", title: ctx.t("proxy.title") }]
    },
    render: () => {
      const description = () => {
        const current = setting()

        if (!current) return ctx.t("proxy.unavailable")

        const base = ctx.t("proxy.description")

        return current.status === "none" ? base : `${base} ${ctx.t(`proxy.${current.status}`)}`
      }

      return (
        <ui.SettingsRow id="settings-system-proxy" title={ctx.t("proxy.title")} description={description()}>
          <ui.Switch
            label={ctx.t("proxy.title")}
            hideLabel
            disabled={!setting() || saving()}
            checked={setting()?.enabled ?? true}
            onChange={write}
          />
        </ui.SettingsRow>
      )
    },
  })
}
