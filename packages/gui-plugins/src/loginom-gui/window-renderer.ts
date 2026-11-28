import { Command, createKeyed, type Plugin } from "@opencode/plugin/gui"
import { showToast } from "@opencode/ui/toast"
import { LoginomWindow } from "./contract"
import type definition from "./index"

const PendingSession = Symbol("pending session")

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
  const sessionKey = () => {
    const current = session()
    return current?.pending ? PendingSession : current?.id
  }
  createKeyed(live, (window) => {
    const track = (id: string | false | null) => void window.track(id, { signal: ctx.signal }).catch(() => undefined)
    createKeyed(sessionKey, (id) => track(id === PendingSession ? false : id), { otherwise: () => track(null) })
  })
  ctx.add(Command, (): Command => ({
    id: "show-window",
    title: ctx.t("window.show"),
    section: "session",
    enabled: !!ipc() && session()?.pending === false,
    async run() {
      const current = session()
      if (!current || current.pending) return
      const result = await ipc()?.show(current.id, { signal: ctx.signal }).catch(() => "manual" as const)
      if (ctx.signal.aborted || session()?.id !== current.id || !result || result === "focused") return
      showToast({ title: ctx.t("window.show"), description: ctx.t(`window.${result}`) })
    },
  }))
}

export default setup
