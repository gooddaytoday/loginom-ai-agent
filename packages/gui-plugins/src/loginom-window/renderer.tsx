import { createKeyed, type Plugin } from "@opencode/plugin/gui"
import { BuiltinSlot } from "@opencode/plugin/gui/builtin"
import { Button } from "@opencode/ui/button"
import { showToast } from "@opencode/ui/toast"
import { createSignal, Show } from "solid-js"
import { LoginomWindow } from "./contract"
import type definition from "./index"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  if (!ctx.desktop) return
  const sessions = ctx.sessions

  createKeyed(ctx.use(LoginomWindow), (ipc) => {
    const track = (sessionID: string | null) => {
      void ipc.track(sessionID).catch(() => undefined)
    }
    createKeyed(
      () => {
        const current = sessions.current()
        if (current?.server.builtin && !current.pending) return current.id
      },
      track,
      { otherwise: () => track(null) },
    )
  })

  ctx.add(BuiltinSlot, {
    at: "session.toolbar",
    render: (input) => {
      const [busy, setBusy] = createSignal(false)
      const show = async () => {
        if (busy() || !input.active || !input.session.location) return
        const { id, location, server } = input.session
        setBusy(true)
        const output = await server.client.rpc
          .call({ rpcID: "loginom.window", method: "show", location, input: { sessionID: id } })
          .then(
            (reply) => reply.output,
            () => undefined,
          )
          .finally(() => setBusy(false))
        if (!input.active || input.session.id !== id) return
        const result = output && typeof output === "object" && "kind" in output ? output.kind : undefined
        if (result === "focused") return
        const key = result === "taskbar" || result === "manual" ? result : "unavailable"
        showToast({ title: ctx.t("show"), description: ctx.t(key) })
      }

      return (
        <Show when={input.session.server.builtin && !input.session.pending && input.session.location}>
          <div class="px-4 pb-2">
            <Button size="small" variant="outline" icon="arrow-up-right" disabled={busy()} onClick={() => void show()}>
              {ctx.t("show")}
            </Button>
          </div>
        </Show>
      )
    },
  })
}

export default setup
