import { Definition, type Mode } from "@loginom-ai-agent/loginom-host/network-settings-rpc"
import { usePlugin } from "@opencode/plugin/gui"
import { builtinContext } from "@opencode/plugin/gui/builtin"
import { RadioGroup, RadioItem } from "@opencode/ui/radio"
import { TextField } from "@opencode/ui/text-field"
import { createMemo, createResource, createSignal, For, onCleanup, Show } from "solid-js"
import type definition from "./index"

const modes = ["online", "device"] as const

export default function NetworkPage() {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const desktop = builtinContext(ctx).desktop
  const controller = new AbortController()
  const signal = AbortSignal.any([controller.signal, ctx.signal])
  onCleanup(() => controller.abort())

  const rpc = createMemo(() => {
    const servers = ctx.servers.list().flatMap((id) => ctx.servers.get(id) ?? [])
    const local = servers.filter((server) => server.local)

    const server = desktop
      ? servers.find((server) => server.builtin)
      : (ctx.servers.get(location.origin) ?? (local.length === 1 ? local[0] : undefined))

    return server?.connected ? server.client.rpc(Definition) : undefined
  })

  const [status, { mutate, refetch }] = createResource(rpc, (client) =>
    client.status({}, { signal }).catch(() => undefined),
  )

  const [proxy] = createResource(() => desktop?.serviceProxy().catch(() => undefined))
  const [pending, setPending] = createSignal(false)
  const [portDraft, setPortDraft] = createSignal<string>()
  const [modeError, setModeError] = createSignal(false)
  const [portError, setPortError] = createSignal<"invalid" | "occupied" | "unavailable">()
  const snapshot = () => (rpc() && !status.loading ? status() : undefined)
  const port = () => snapshot()?.port
  const portText = () => portDraft() ?? String(port()?.saved ?? "")

  async function selectMode(selected: Mode) {
    const client = rpc()

    if (!client || pending() || selected === status()?.mode) return
    setModeError(false)
    setPending(true)
    const result = await client.setMode({ mode: selected }, { signal }).catch(() => undefined)

    if (signal.aborted) return
    setPending(false)

    if (client !== rpc()) return

    if (result) mutate(result)
    else setModeError(true)
  }

  async function savePort() {
    const client = rpc()

    if (!client || pending() || !port()?.editable) return
    const value = Number(portText())

    if (!/^\d+$/.test(portText()) || value < 1 || value > 65_535) {
      setPortError("invalid")

      return
    }

    setPortError(undefined)
    setPending(true)
    const result = await client.savePort({ port: value }, { signal }).catch(() => "unavailable" as const)

    if (signal.aborted) return
    setPending(false)

    if (client !== rpc()) return

    if (result !== "saved") {
      setPortError(result)

      return
    }

    mutate((current) => current?.port && { ...current, port: { ...current.port, saved: value } })
    setPortDraft(undefined)
  }

  return (
    <ui.SettingsLayout title={ctx.t("network.title")} description={ctx.t("network.description")}>
      <section class="settings-section" data-action="network-mode">
        <h3 class="settings-section-title">{ctx.t("network.mode")}</h3>
        <Show
          when={snapshot()}
          fallback={
            <div class="flex items-center gap-3" role="status">
              {ctx.t(status.loading ? "network.loading" : "network.unavailable")}
              <Show when={!status.loading && rpc()}>
                <ui.Button onClick={() => void refetch()}>{ctx.t("network.retry")}</ui.Button>
              </Show>
            </div>
          }
        >
          {(current) => (
            <>
              <RadioGroup
                class="loginom-network-modes"
                label={ctx.t("network.mode")}
                hideLabel
                value={current().mode}
                disabled={pending()}
                onChange={(value) => {
                  const selected = modes.find((mode) => mode === value)

                  if (selected) void selectMode(selected)
                }}
              >
                <For each={modes}>
                  {(mode) => (
                    <RadioItem
                      value={mode}
                      label={ctx.t(`network.${mode}`)}
                      description={ctx.t(`network.${mode}.description`)}
                    />
                  )}
                </For>
              </RadioGroup>
              <span class="text-11-regular text-v2-text-text-muted" role="status">
                {ctx.t(current().mode === current().activeMode ? "network.mode.restart" : "network.mode.pending")}
              </span>
              <Show when={modeError()}>
                <p role="alert">{ctx.t("network.mode.failed")}</p>
              </Show>
            </>
          )}
        </Show>
      </section>

      <Show when={snapshot()}>
        {(current) => (
          <ui.SettingsSection title={ctx.t("network.effects")}>
            <ui.SettingsRow title={ctx.t("network.models")} description={ctx.t(`network.${current().mode}.models`)} />
            <ui.SettingsRow title={ctx.t("network.loginom")} description={ctx.t(`network.${current().mode}.loginom`)} />
            <ui.SettingsRow title={ctx.t("network.docs")} description={ctx.t("network.docs.description")} />
            <Show when={current().mode === "device"}>
              <ui.SettingsRow title={ctx.t("network.access")} description={ctx.t("network.device.access")} />
            </Show>
          </ui.SettingsSection>
        )}
      </Show>

      <ui.SettingsSection title={ctx.t("network.service")}>
        <ui.SettingsRow
          id="network-proxy"
          title={ctx.t("network.proxy")}
          description={ctx.t(proxy.loading ? "network.loading" : `network.proxy.${proxy()?.source ?? "unavailable"}`)}
        >
          <Show when={!proxy.loading && proxy()?.hosts.length}>
            <span class="loginom-network-proxy">{proxy()?.hosts.join(", ")}</span>
          </Show>
        </ui.SettingsRow>

        <ui.SettingsRow
          id="network-port"
          title={ctx.t("network.port")}
          description={
            port() ? ctx.t("network.port.current", { port: port()?.current ?? "" }) : ctx.t("network.port.unavailable")
          }
        >
          <Show when={port()?.editable}>
            <form
              class="loginom-network-port"
              onSubmit={(event) => {
                event.preventDefault()
                void savePort()
              }}
            >
              <div class="loginom-network-port-field">
                <TextField
                  type="text"
                  inputmode="numeric"
                  label={ctx.t("network.port.next")}
                  hideLabel
                  validationState={portError() ? "invalid" : "valid"}
                  aria-describedby="loginom-network-port-message"
                  value={portText()}
                  disabled={pending()}
                  onChange={(value) => {
                    setPortDraft(value)
                    setPortError(undefined)
                  }}
                />
              </div>
              <ui.Button type="submit" variant="contrast" disabled={pending() || portText() === String(port()?.saved)}>
                {ctx.t("save")}
              </ui.Button>
            </form>
          </Show>
        </ui.SettingsRow>
      </ui.SettingsSection>
      <Show when={port()?.editable}>
        <div id="loginom-network-port-message" class="text-11-regular text-v2-text-text-muted">
          <p role="status">
            {ctx.t(port()?.saved === port()?.current ? "network.port.restart" : "network.port.pending", {
              port: port()?.saved ?? "",
            })}
          </p>
          <Show when={portError()}>{(issue) => <p role="alert">{ctx.t(`network.port.error.${issue()}`)}</p>}</Show>
        </div>
      </Show>
    </ui.SettingsLayout>
  )
}
