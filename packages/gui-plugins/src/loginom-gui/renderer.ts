import { Command, type Plugin } from "@opencode/plugin/gui"
import { showToast } from "@opencode/ui/toast"
import { createEffect } from "solid-js"
import { LoginomWindow } from "./contract"
import type definition from "./index"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  if (!ctx.desktop) return
  const live = ctx.use(LoginomWindow)
  const ipc = () => {
    const current = live()
    if (current.status === "active") return current.value
  }
  const session = () => {
    const current = ctx.sessions.current()
    return current?.server.builtin ? current : undefined
  }
  createEffect(() => {
    const current = session()
    void ipc()?.track(!current ? null : current.pending ? false : current.id).catch(() => undefined)
  })
  ctx.add(Command, (): Command => ({
    id: "show-window",
    title: ctx.t("show"),
    section: "session",
    enabled: !!ipc() && session()?.pending === false,
    async run() {
      const current = session()
      if (!current || current.pending) return
      const result = await ipc()?.show(current.id).catch(() => "manual" as const)
      if (session()?.id !== current.id || !result || result === "focused") return
      showToast({ title: ctx.t("show"), description: ctx.t(result) })
    },
  }))
}

export default setup
