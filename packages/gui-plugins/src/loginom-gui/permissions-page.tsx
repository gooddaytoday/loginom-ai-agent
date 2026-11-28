import { permissionDefaults, permissionKinds, type Kind } from "@loginom-ai-agent/product/permissions"
import { createKeyed, usePlugin, type SettingsPage } from "@opencode/plugin/gui"
import { createMemo, createSignal, createUniqueId, For, onCleanup, Show, untrack } from "solid-js"
import type definition from "./index"
import { initialPermissions, permissionPatch, permissionView, transitionPermissions } from "./permissions-machine"
import { profileService } from "./profile-service"

const effects = ["allow", "ask", "deny"] as const

export default function PermissionsPage(props: Pick<Parameters<SettingsPage["render"]>[0], "workspace">) {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const service = createMemo(() => profileService(ctx))

  const source = createMemo(() => {
    const server = service()

    if (!server) return
    const workspace = props.workspace
    const directory = workspace?.server === server.id ? workspace.directory : undefined

    return { client: server.client, directory }
  })

  const [state, setState] = createSignal(initialPermissions)
  let controller: AbortController | undefined
  onCleanup(() => controller?.abort())

  function dispatch(event: Parameters<typeof transitionPermissions>[1]) {
    const previous = untrack(state)
    const next = transitionPermissions(previous, event)

    if (next === previous) return
    setState(next)

    if (next.attempt === previous.attempt) return
    controller?.abort()
    const target = untrack(source)

    if (!target || (next.type !== "loading" && next.type !== "saving")) return
    controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)])
    void request(target, next, signal)
  }

  async function request(
    target: NonNullable<ReturnType<typeof source>>,
    next: Extract<ReturnType<typeof transitionPermissions>, { type: "loading" | "saving" }>,
    signal: AbortSignal,
  ) {
    const directory = target.directory
    const location = directory ? { directory } : undefined

    try {
      if (next.type === "saving")
        await target.client.experimental.config.update(permissionPatch(next.selected), {
          signal,
          headers: directory ? { "x-opencode-directory": encodeURIComponent(directory) } : undefined,
        })

      const entries = await target.client.config.get({ location }, { signal })
      dispatch({ type: "loaded", attempt: next.attempt, entries })
    } catch {
      dispatch({ type: "failed", attempt: next.attempt })
    }
  }

  const reload = () => dispatch({ type: source() ? "load" : "disconnect" })
  createKeyed(source, reload, { otherwise: reload })

  const current = (kind: Kind) => permissionView(state(), kind).value
  const label = (effect: ReturnType<typeof current>) => ctx.t(`permission_${effect}`)
  const disabled = () => state().type !== "ready"
  const descriptionPrefix = createUniqueId()

  const description = (kind: Kind) =>
    current(kind) === permissionDefaults[kind]
      ? ctx.t("permissionsDefault")
      : ctx.t("permissionsChanged", {
          effect: kind === "terminal" ? ctx.t("permissionTerminalOff") : label(permissionDefaults[kind]),
        })

  const issue = () => {
    const current = state()

    if (current.type === "error") return current.issue

    if (current.type === "idle") return "permissionsLoadFailed"
  }

  const Override = (props: { kind: Kind }) => {
    const row = () => permissionView(state(), props.kind)
    const message = (effect: ReturnType<typeof current> | undefined) => (effect ? label(effect) : undefined)

    return (
      <>
        <Show when={message(row().workspaceOverride)}>
          {(value) => (
            <span class="text-12-regular text-text-base">{ctx.t("permissionsProjectOverride", { effect: value() })}</span>
          )}
        </Show>
        <Show when={message(row().profileOverride)}>
          {(value) => (
            <span role="status" class="text-12-regular text-text-base">
              {ctx.t("permissionsProfileOverride", { effect: value() })}
            </span>
          )}
        </Show>
      </>
    )
  }

  return (
    <ui.SettingsLayout title={ctx.t("permissionsTitle")} description={ctx.t("permissionsDescription")}>
      <Show when={state().type === "loading" || state().type === "saving"}>
        <p role="status">{ctx.t(state().type === "saving" ? "saving" : "permissionsLoading")}</p>
      </Show>
      <Show when={issue()}>
        {(value) => (
          <>
            <p role="alert" class="text-12-regular text-text-danger-base">{ctx.t(value())}</p>
            <ui.Button onClick={reload}>{ctx.t("permissionsReload")}</ui.Button>
          </>
        )}
      </Show>
      <Show when={state().type === "ready" || state().type === "saving"}>
        <ui.SettingsSection
          footer={
            <div class="pt-3">
              <ui.Button
                disabled={disabled()}
                onClick={() => dispatch({
                  type: "save",
                  selected: permissionKinds.map((kind) => ({ kind, effect: permissionDefaults[kind] })),
                })}
              >
                {ctx.t("permissionsReset")}
              </ui.Button>
            </div>
          }
        >
          <For each={permissionKinds.filter((kind) => kind !== "terminal")}>
            {(kind) => (
              <ui.SettingsRow title={ctx.t(`permission_${kind}`)} description={ctx.t(`permission_${kind}_hint`)}>
                <div class="flex min-w-0 flex-col items-start gap-1">
                  <select
                    class="max-w-full cursor-pointer rounded-md border border-border-base bg-surface-raised-base px-2 py-1 text-text-strong"
                    aria-label={ctx.t(`permission_${kind}`)}
                    aria-describedby={`${descriptionPrefix}-${kind}`}
                    disabled={disabled()}
                    onChange={(event) => {
                      const effect = effects.find((value) => value === event.currentTarget.value)

                      if (effect) dispatch({ type: "save", selected: [{ kind, effect }] })
                    }}
                  >
                    <Show when={current(kind) === "mixed"}>
                      <option disabled selected>
                        {label("mixed")}
                      </option>
                    </Show>
                    <For each={effects}>
                      {(effect) => (
                        <option value={effect} selected={current(kind) === effect}>
                          {label(effect)}
                        </option>
                      )}
                    </For>
                  </select>
                  <span id={`${descriptionPrefix}-${kind}`} class="text-12-regular text-text-base">
                    {description(kind)}
                  </span>
                  <Override kind={kind} />
                </div>
              </ui.SettingsRow>
            )}
          </For>
        </ui.SettingsSection>
        <ui.SettingsSection title={ctx.t("permission_terminal")}>
          <ui.SettingsRow title={ctx.t("permissionTerminalToggle")} description={ctx.t("permission_terminal_hint")}>
            <div class="flex min-w-0 flex-col items-start gap-1 [&>[data-component=switch]]:flex-col-reverse [&>[data-component=switch]]:items-start">
              <ui.Switch
                label={ctx.t("permissionTerminalToggle")}
                description={description("terminal")}
                hideLabel
                disabled={disabled()}
                checked={current("terminal") === "ask"}
                onChange={(checked) =>
                  dispatch({ type: "save", selected: [{ kind: "terminal", effect: checked ? "ask" : "deny" }] })
                }
              />
              <Override kind="terminal" />
            </div>
          </ui.SettingsRow>
        </ui.SettingsSection>
      </Show>
    </ui.SettingsLayout>
  )
}
