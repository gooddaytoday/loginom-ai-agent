import { Command, createKeyed, type Plugin } from "@opencode/plugin/gui"
import { showToast } from "@opencode/ui/toast"
import { LoginomWindow, type WindowFeedback } from "./contract"
import type definition from "./index"
import { windowTarget } from "./window-request"

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

  const target = () => windowTarget(session())

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
      enabled: !!ipc() && !!target(),
      async run() {
        const current = target()

        if (!current) return

        const result = await ipc()
          ?.show(current, { signal: ctx.signal })
          .catch((): typeof WindowFeedback.Type => ({ focus: "manual" }))

        const active = target()

        if (
          ctx.signal.aborted ||
          !result ||
          !active ||
          active.sessionID !== current.sessionID ||
          active.location.directory !== current.location.directory ||
          active.location.workspaceID !== current.location.workspaceID
        )
          return

        const messages = []

        if (result.layout) messages.push(ctx.t(`window.${result.layout}`))

        if (result.focus !== "focused") messages.push(ctx.t(`window.${result.focus}`))

        if (messages.length) showToast({ title: ctx.t("window.show"), description: messages.join(" ") })
      },
    }),
  )
}

export default setup
