import { Page, SettingsPage, type Plugin } from "@opencode/plugin/gui"
import { BasicTool } from "@opencode/session-ui/basic-tool"
import { ToolRegistry } from "@opencode/session-ui/tool-renderer"
import { Button } from "@opencode/ui/button"
import { createSignal, onCleanup } from "solid-js"
import type definition from "./index"
import { preflight, transition } from "./preflight"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  function Preflight() {
    const [state, setState] = createSignal<Parameters<typeof transition>[0]>({ type: "idle" })
    const lifetime = new AbortController()
    onCleanup(() => lifetime.abort())

    const check = async () => {
      const id = ctx.servers.list()[0]

      if (!id || state().type === "checking") return

      setState((previous) => transition(previous, { type: "check" }))

      try {
        const client = ctx.servers.get(id)?.client

        if (!client) throw new Error("Server unavailable")

        const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(5000)])
        const { code } = await client.rpc(preflight).check({ automation: false }, { signal })

        if (!lifetime.signal.aborted) setState((previous) => transition(previous, { type: "returned", code }))
      } catch {
        if (!lifetime.signal.aborted) setState((previous) => transition(previous, { type: "failed" }))
      }
    }

    const result = () => {
      const current = state()

      if (current.type === "idle") return

      if (current.type === "blocked") return ctx.t("blocked", { code: current.code })

      return ctx.t(current.type)
    }

    return (
      <div class="flex flex-col items-start gap-2">
        <Button onClick={() => void check()} disabled={!ctx.servers.list().length || state().type === "checking"}>
          {ctx.t("preflight")}
        </Button>
        <p role="status">{result()}</p>
      </div>
    )
  }

  ctx.add(SettingsPage, {
    id: "loginom",
    icon: "code-lines",
    get title() {
      return ctx.t("title")
    },
    render: () => <Preflight />,
  })

  for (const id of ["packages", "catalog"] as const) {
    ctx.add(Page, {
      id,
      get title() {
        return ctx.t(id)
      },
      nav: {},
      render: () => <h1 class="p-4">{ctx.t(id)}</h1>,
    })
  }

  ToolRegistry.register({
    name: "read",
    title: () => ctx.t("tool"),
    separate: true,
    render: (props) => <BasicTool icon="code-lines" status={props.status} trigger={{ title: ctx.t("tool") }} />,
  })
}

export default setup
