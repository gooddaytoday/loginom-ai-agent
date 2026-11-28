import { Command, createKeyed, type Plugin } from "@opencode/plugin/gui"
import { showToast } from "@opencode/ui/toast"
import { LoginomWindow, type WindowFeedback } from "./contract"
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
  ctx.add(
    Command,
    (): Command => ({
      id: "show-window",
      title: ctx.t("window.show"),
      section: "session",
      enabled: !!ipc() && session()?.pending === false,
      async run() {
        const current = session()

        if (!current || current.pending) return

        const result = await ipc()
          ?.show(current.id, { signal: ctx.signal })
          .catch((): typeof WindowFeedback.Type => ({ focus: "manual" }))

        if (ctx.signal.aborted || session()?.id !== current.id || !result) return
        const messages = []

        if (result.layout) messages.push(ctx.t(`window.${result.layout}`))

        if (result.focus !== "focused") messages.push(ctx.t(`window.${result.focus}`))

        if (messages.length) showToast({ title: ctx.t("window.show"), description: messages.join(" ") })
      },
    }),
  )
}

export default setup
