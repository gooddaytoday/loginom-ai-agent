import { ConnectionSettingsRpc } from "@loginom-ai-agent/loginom-host/settings-rpc"
import { createKeyed, type Plugin } from "@opencode/plugin/gui"
import { createMemo, createSignal, onCleanup, untrack } from "solid-js"
import type definition from "./index"
import { initial, transition, view } from "./machine"

type Activated = Extract<ReturnType<typeof transition>["effects"][number], { type: "activated" }>

export function profileService(
  ctx: Parameters<Plugin.Setup<typeof definition>>[0],
  onActivated: (status: Activated["status"]) => void,
) {
  const server = createMemo(() => {
    const servers = ctx.servers.list().flatMap((id) => ctx.servers.get(id) ?? [])

    if (ctx.desktop) return servers.find((item) => item.builtin)
    const serving = ctx.servers.get(location.origin)

    if (serving) return serving
    const local = servers.filter((item) => item.local)

    if (local.length === 1) return local.at(0)
  })

  const client = () => server()?.client
  const [state, setState] = createSignal(initial)
  const page = createMemo(() => view(state()))
  let controller: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  function dispatch(event: Parameters<typeof transition>[1]) {
    const next = transition(untrack(state), event)
    setState(next.state)
    next.effects.forEach(run)
  }

  function run(effect: ReturnType<typeof transition>["effects"][number]) {
    if (effect.type === "activated") {
      onActivated(effect.status)

      return
    }

    if (effect.type === "cancel") {
      clearTimeout(timer)
      controller?.abort()

      return
    }

    const request = async () => {
      controller = new AbortController()
      const canceled = controller.signal
      const timeout = effect.type === "check" ? 245_000 : 12_000
      const deadline = effect.type === "status" ? Math.min(timeout, effect.timeout ?? timeout) : timeout
      const signal = AbortSignal.any([canceled, AbortSignal.timeout(deadline)])
      const target = untrack(server)
      const current = target?.client

      const directory =
        target?.data.location.default().directory ||
        (await current?.location.get({}, { signal }).catch(() => undefined))?.directory

      if (canceled.aborted) return

      const rpc = current?.rpc(ConnectionSettingsRpc)
      const options = directory ? { location: { directory }, signal } : undefined

      switch (effect.type) {
        case "status": {
          const result = options && (await rpc?.status({}, options).catch(() => undefined))
          dispatch({
            type: "status",
            attempt: effect.attempt,
            now: Date.now(),
            result: result ?? { ok: false, issue: "unavailable" },
          })
          break
        }

        case "check": {
          const result = options && (await rpc?.check(effect.input, options).catch(() => undefined))
          dispatch({ type: "checked", attempt: effect.attempt, result: result ?? { ok: false, issue: "unavailable" } })
          break
        }

        case "save": {
          const result = options && (await rpc?.save(effect.input, options).catch(() => undefined))
          dispatch({
            type: "saved",
            attempt: effect.attempt,
            now: Date.now(),
            result: result ?? { ok: false, issue: "saveFailed" },
          })
          break
        }
      }
    }

    if (effect.type === "status" && effect.delay) {
      timer = setTimeout(() => void request(), effect.delay)

      return
    }

    void request()
  }

  const reload = () => dispatch({ type: "target", available: !!client() })
  createKeyed(client, reload, { otherwise: reload })
  onCleanup(() => dispatch({ type: "disposed" }))

  return { server, client, page, dispatch }
}
