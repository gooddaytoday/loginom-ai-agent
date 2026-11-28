import { SettingsPage, type Plugin } from "@opencode/plugin/gui"
import { showToast } from "@opencode/ui/toast"
import { createSignal } from "solid-js"
import { SystemProxy } from "./contract"
import type definition from "./index"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  if (ctx.app.platform !== "desktop") return
  const ui = ctx.ui
  const proxy = ctx.use(SystemProxy)

  const client = () => {
    const live = proxy()

    return live.status === "active" ? live.value : undefined
  }

  const [saving, setSaving] = createSignal(false)

  const write = async (enabled: boolean) => {
    const active = client()

    if (!active || saving()) return
    setSaving(true)

    try {
      await active.set(enabled)
    } catch {
      showToast({ variant: "error", title: ctx.t("writeFailed") })
    } finally {
      setSaving(false)
    }
  }

  ctx.add(SettingsPage, {
    id: "system-proxy",
    page: "general",
    section: "general",
    get title() {
      return ctx.t("title")
    },
    get entries() {
      return [{ id: "settings-system-proxy", title: ctx.t("title") }]
    },
    render: () => {
      const description = () => {
        const status = client()?.state()?.status

        return status && status !== "none" ? `${ctx.t("description")} ${ctx.t(status)}` : ctx.t("description")
      }

      return (
        <ui.SettingsRow id="settings-system-proxy" title={ctx.t("title")} description={description()}>
          <ui.Switch
            label={ctx.t("title")}
            hideLabel
            disabled={!client()?.state() || saving()}
            checked={client()?.state()?.enabled ?? true}
            onChange={write}
          />
        </ui.SettingsRow>
      )
    },
  })
}

export default setup
