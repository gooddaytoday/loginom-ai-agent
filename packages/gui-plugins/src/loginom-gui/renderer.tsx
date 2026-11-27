import type { MountedSession, Plugin } from "@opencode/plugin/gui"
import { createKeyed, createLatest, Slot } from "@opencode/plugin/gui"
import { BuiltinSlot } from "@opencode/plugin/gui/builtin"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { Menu } from "@opencode/ui/menu"
import { showToast } from "@opencode/ui/toast"
import { getFilename } from "@opencode/util/path"
import { Schema } from "effect"
import { createSignal, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import {
  FocusStatus,
  PackageSnapshot,
  PackageState,
  WindowFocus,
  WindowList,
  Windows,
  type LoginomWindow,
} from "./contract"
import type definition from "./index"

function saveStatus(modified: boolean | null | undefined, path: string | undefined, open: boolean) {
  if (modified === true || (open && !path)) return "package.unsaved"

  if (modified === false && path) return "package.saved"

  return "package.unknown"
}

function observe(session: MountedSession, client: MountedSession["server"]["client"]) {
  const lifetime = new AbortController()
  const [refresh, setRefresh] = createStore({ snapshot: 0, windows: 0 })
  onCleanup(() => lifetime.abort())

  const request = (signal = lifetime.signal) => ({
    location: { directory: session.directory },
    signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
  })

  const packages = client.rpc(PackageState)
  const windowList = client.rpc(Windows)

  const snapshot = createLatest(
    () => refresh.snapshot,
    (_revision, signal) =>
      packages
        .snapshot({ sessionID: session.id }, request(signal))
        .then(Schema.decodeUnknownSync(PackageSnapshot))
        .catch(() => undefined),
  )

  const list = createLatest(
    () => refresh.windows,
    (_revision, signal) =>
      windowList
        .list({}, request(signal))
        .then(Schema.decodeUnknownSync(WindowList))
        .catch(() => undefined),
  )

  packages.events.on(
    "changed",
    ({ data }) => {
      setRefresh((previous) => ({
        snapshot: previous.snapshot + (data.sessionID === session.id ? 1 : 0),
        windows: previous.windows + 1,
      }))
    },
    lifetime,
  )
  windowList.events.on(
    "changed",
    () => {
      setRefresh((previous) => ({ snapshot: previous.snapshot + 1, windows: previous.windows + 1 }))
    },
    lifetime,
  )

  return {
    key: session.key,
    snapshot: () => snapshot.latest,
    windows: () => list.latest?.windows,
    async show(window: LoginomWindow) {
      const current = list.latest?.windows.some(
        (item) => item.windowID === window.windowID && item.sessionID === window.sessionID,
      )

      if (!current) return "no-window"

      const result = await client
        .rpc(WindowFocus)
        .show({ sessionID: window.sessionID }, request())
        .then(Schema.decodeUnknownSync(FocusStatus))
        .catch((): "failed" => "failed")

      if (lifetime.signal.aborted) return

      if (result === "no-window") setRefresh("windows", (revision) => revision + 1)

      return result
    },
  }
}

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const [observation, setObservation] = createSignal<ReturnType<typeof observe>>()
  createKeyed(
    () => {
      const session = ctx.sessions.current()

      if (!session?.server.connected || session.pending) return

      return { session, client: session.server.client }
    },
    ({ session, client }) => setObservation(observe(session, client)),
    {
      equals: (previous, next) =>
        previous.session.key === next.session.key &&
        previous.session.directory === next.session.directory &&
        previous.client === next.client,
      otherwise: () => setObservation(undefined),
    },
  )

  function data(input: { session: MountedSession; active: boolean }) {
    const current = observation()

    if (input.active && current?.key === input.session.key) return current
  }

  const packageName = (name: string | null | undefined, path: string | undefined) =>
    name || getFilename(path) || ctx.t("package.untitled")

  ctx.add(BuiltinSlot, {
    at: "session.header.below",
    render(input) {
      const state = () => {
        const current = data(input)
        const snapshot = current?.snapshot()
        const window = current?.windows()?.find((item) => item.sessionID === input.session.id)

        if (!window && snapshot?.open !== true && !snapshot?.lastSave && !snapshot?.path) return

        const closed = snapshot?.open === false && !window
        const path = snapshot?.path ?? window?.path ?? (closed ? snapshot?.lastSave?.path : undefined)
        const modified = snapshot?.modified ?? window?.modified

        return {
          name: packageName(window?.packageName, path),
          path,
          status: saveStatus(modified, path, snapshot?.open === true || !!window),
          closed,
          readOnly: window?.readOnly === true,
          busy: window?.busy === true,
        }
      }

      return (
        <Show when={state()}>
          {(value) => (
            <div
              role="status"
              aria-label={ctx.t("package.working")}
              class="mx-3 mb-2 flex min-w-0 shrink-0 items-start gap-2 rounded-md border border-v2-border-border-base px-3 py-2 text-12-regular md:mx-6"
            >
              <Icon name="file-document" class="mt-0.5 shrink-0 text-v2-icon-icon-muted" />
              <div class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <strong class="max-w-full truncate" title={value().path}>
                  {value().name}
                </strong>
                <span class="text-v2-text-text-muted">{ctx.t(value().status)}</span>
                <Show when={value().closed}>
                  <span>{ctx.t("package.closed")}</span>
                </Show>
                <Show when={value().readOnly}>
                  <span>{ctx.t("package.readOnly")}</span>
                </Show>
                <Show when={value().busy}>
                  <strong>{ctx.t("package.busy")}</strong>
                </Show>
              </div>
            </div>
          )}
        </Show>
      )
    },
  })

  function renderWindows(input: { session: MountedSession; active: boolean }) {
    async function show(window: LoginomWindow) {
      const result = await data(input)?.show(window)

      if (result === "focus-unconfirmed") showToast(ctx.t("windows.focusUnconfirmed"))

      if (result === "no-window") showToast(ctx.t("windows.noWindow"))

      if (result === "failed") showToast({ variant: "error", title: ctx.t("windows.showFailed") })
    }

    return (
      <Show when={data(input)?.windows()}>
        {(windows) => (
          <Menu appearance="standard" gutter={6} placement="bottom-end">
            <Menu.Trigger as={Button} size="small" variant="ghost-muted">
              {ctx.t("windows.menu")}
              <Icon name="outline-chevron-down" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content class="w-72 max-w-[calc(100vw-16px)] max-h-[60vh]" style={{ "overflow-y": "auto" }}>
                <Menu.Group>
                  <Menu.GroupLabel>{ctx.t("windows.heading")}</Menu.GroupLabel>
                  <For each={windows()} fallback={<Menu.Item disabled>{ctx.t("windows.empty")}</Menu.Item>}>
                    {(window) => (
                      <Menu.Item class="min-w-0" onSelect={() => void show(window)}>
                        <span class="flex min-w-0 flex-col items-start py-1">
                          <strong class="max-w-full truncate">
                            {window.sessionTitle ||
                              input.session.server.data.session.get(window.sessionID)?.title ||
                              window.sessionID}
                          </strong>
                          <span class="max-w-full break-words text-v2-text-text-muted" title={window.path ?? undefined}>
                            {packageName(window.packageName, window.path ?? undefined)} ·{" "}
                            {ctx.t(saveStatus(window.modified, window.path ?? undefined, true))}
                            {window.state === "minimized" ? ` · ${ctx.t("windows.minimized")}` : ""}
                            {window.busy ? ` · ${ctx.t("package.busy")}` : ""}
                          </span>
                          <span>{ctx.t("windows.show")}</span>
                        </span>
                      </Menu.Item>
                    )}
                  </For>
                </Menu.Group>
              </Menu.Content>
            </Menu.Portal>
          </Menu>
        )}
      </Show>
    )
  }

  ctx.add(Slot, { at: "session.header", render: renderWindows })
  ctx.add(BuiltinSlot, { at: "session.header.mobile", render: renderWindows })
}

export default setup
