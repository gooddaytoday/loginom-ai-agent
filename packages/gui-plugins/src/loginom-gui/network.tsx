import { Definition } from "@loginom-ai-agent/loginom-host/network-settings-rpc"
import { createKeyed, usePlugin } from "@opencode/plugin/gui"
import { TextField } from "@opencode/ui/text-field"
import { createMemo, createSignal, onCleanup, Show, untrack } from "solid-js"
import type definition from "./index"
import { initial, transition, type Command, type State } from "./network/machine"

export default function NetworkPage() {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const [state, setState] = createSignal<State>(initial)

  const target = createMemo(() => {
    const servers = ctx.servers.list().flatMap((id) => ctx.servers.get(id) ?? [])
    const local = servers.filter((server) => server.local)

    const server = ctx.desktop
      ? servers.find((server) => server.builtin)
      : (ctx.servers.get(location.origin) ?? (local.length === 1 ? local[0] : undefined))

    return server?.connected ? { server, client: server.client } : undefined
  })

  const form = () => {
    const value = state()

    return value.type === "ready" || value.type === "saving" || value.type === "reconciling" ? value : undefined
  }

  const port = () => form()?.status.port

  const portDescription = () => {
    const current = port()?.current

    return current === undefined ? ctx.t("network.port.unavailable") : ctx.t("network.port.current", { port: current })
  }

  const proxy = () => form()?.status.proxy

  const issue = () => {
    const value = state()

    return value.type === "ready" ? value.issue : undefined
  }

  const reconciling = () => state().type === "reconciling"
  const busy = () => state().type === "saving" || reconciling()
  let controller: AbortController | undefined

  function dispatch(event: Parameters<typeof transition>[1]) {
    const next = transition(untrack(state), event)
    setState(next.state)

    if (next.command) void run(next.command)
  }

  async function run(command: Command) {
    controller?.abort()

    if (command.type === "cancel") return
    controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, ctx.signal, AbortSignal.timeout(12_000)])
    const selected = untrack(target)

    const directory =
      selected?.server.data.location.default().directory ||
      (await selected?.client.location.get({}, { signal }).catch(() => undefined))?.directory

    const options = directory ? { location: { directory }, signal } : undefined
    const rpc = selected?.client.rpc(Definition)

    switch (command.type) {
      case "status": {
        const status = options && (await rpc?.status({}, options).catch(() => undefined))
        dispatch({ type: "loaded", attempt: command.attempt, status })
        break
      }

      case "save": {
        const result = options && (await rpc?.savePort({ port: command.port }, options).catch(() => undefined))
        dispatch({ type: "saved", attempt: command.attempt, result })
        break
      }
    }
  }

  const reload = () => dispatch({ type: "target", available: !!target() })
  createKeyed(target, reload, { otherwise: reload })
  onCleanup(() => dispatch({ type: "dispose" }))

  return (
    <ui.SettingsLayout title={ctx.t("network.title")} description={ctx.t("network.description")}>
      <Show
        when={form()}
        fallback={
          <div class="flex items-center gap-3" role="status">
            {ctx.t(state().type === "loading" ? "network.loading" : "network.unavailable")}
            <Show when={state().type === "unavailable" && target()}>
              <ui.Button onClick={reload}>{ctx.t("network.retry")}</ui.Button>
            </Show>
          </div>
        }
      >
        <ui.SettingsSection>
          <ui.SettingsRow
            id="network-proxy"
            title={ctx.t("network.proxy")}
            description={ctx.t(`network.proxy.${proxy()?.source ?? "unavailable"}`)}
          >
            <Show when={proxy()?.hosts.length}>
              <span class="loginom-network-proxy">{proxy()?.hosts.join(", ")}</span>
            </Show>
          </ui.SettingsRow>
          <ui.SettingsRow id="network-port" title={ctx.t("network.port")} description={portDescription()}>
            <Show when={port()?.editable}>
              <form
                class="loginom-network-port"
                onSubmit={(event) => {
                  event.preventDefault()
                  dispatch({ type: "save" })
                }}
              >
                <div class="loginom-network-port-field">
                  <TextField
                    type="text"
                    inputmode="numeric"
                    label={ctx.t("network.port.next")}
                    hideLabel
                    validationState={issue() && issue() !== "unconfirmed" ? "invalid" : "valid"}
                    aria-describedby="loginom-network-port-message"
                    value={form()?.draft ?? ""}
                    disabled={busy()}
                    onChange={(draft) => dispatch({ type: "edit", draft })}
                  />
                </div>
                <ui.Button
                  type="submit"
                  variant="contrast"
                  disabled={busy() || form()?.draft === String(port()?.saved)}
                >
                  {ctx.t("save")}
                </ui.Button>
              </form>
            </Show>
          </ui.SettingsRow>
        </ui.SettingsSection>
        <Show when={port()?.editable && port()}>
          {(status) => (
            <div id="loginom-network-port-message" class="text-11-regular text-v2-text-text-muted">
              <p role="status">
                {ctx.t(
                  reconciling()
                    ? "network.port.reconciling"
                    : status().fallback === status().saved
                      ? "network.port.fallback"
                      : status().saved === status().current
                        ? "network.port.restart"
                        : "network.port.pending",
                  {
                    port: status().saved,
                    current: status().current,
                  },
                )}
              </p>
              <Show when={issue()}>
                {(error) => <p role="alert">{ctx.t(`network.port.error.${error()}`, { maximum: status().maximum })}</p>}
              </Show>
            </div>
          )}
        </Show>
      </Show>
    </ui.SettingsLayout>
  )
}
