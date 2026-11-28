import { createKeyed, type Context } from "@opencode/plugin/gui"
import { createSignal, onCleanup, type Accessor } from "solid-js"
import type { PackageSelection, RemotePackageSelection } from "./contract"
import { packageConnection, samePackageConnection } from "./package-rpc"
import { loginomServer } from "./server"

export function watchPackageSelection(
  ctx: Context,
  selection: Accessor<PackageSelection | undefined>,
  clear: () => void,
  refresh: Accessor<number>,
) {
  const [confirmed, setConfirmed] = createSignal<RemotePackageSelection>()
  const lifetime = new AbortController()
  const server = () => loginomServer(ctx)
  onCleanup(() => lifetime.abort())

  async function verify(entry: RemotePackageSelection, signal = lifetime.signal) {
    const target = server()
    const client = target?.client

    if (!target || signal.aborted || selection() !== entry) return false

    try {
      const current = await packageConnection(target, AbortSignal.any([signal, AbortSignal.timeout(12_000)]))

      if (signal.aborted || selection() !== entry || server()?.client !== client) return false

      if (!current || !samePackageConnection(current.identity, entry.connection)) {
        clear()

        return false
      }

      setConfirmed(entry)

      return true
    } catch {
      if (!signal.aborted && selection() === entry && server()?.client === client) setConfirmed(undefined)

      return false
    }
  }

  createKeyed(
    () => {
      const entry = selection()
      const client = server()?.client

      if (entry?.kind === "loginom" && client) return { entry, client, refresh: refresh() }
    },
    ({ entry }) => {
      setConfirmed(undefined)
      const controller = new AbortController()
      const signal = AbortSignal.any([lifetime.signal, controller.signal])
      let timer: ReturnType<typeof setTimeout> | undefined

      const check = async () => {
        await verify(entry, signal)

        if (!signal.aborted && selection() === entry) timer = setTimeout(() => void check(), 5_000)
      }

      onCleanup(() => {
        controller.abort()
        clearTimeout(timer)
      })
      void check()
    },
    { otherwise: () => setConfirmed(undefined) },
  )

  return {
    visible: () => {
      const entry = selection()

      return entry?.kind === "file" || entry === confirmed() ? entry : undefined
    },
    verify,
  }
}
