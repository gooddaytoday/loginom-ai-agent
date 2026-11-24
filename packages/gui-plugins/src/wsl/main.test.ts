import { afterEach, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import type { Cleanup, MainContext } from "@opencode/plugin/gui/main"
import type { Wsl, WslServersState } from "./contract"
import setup from "./main"

const path = process.env.PATH

const cleanups: Cleanup[] = []

afterEach(async () => {
  process.env.PATH = path
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})

// A 0.4 Desktop on Windows kept the WSL servers it served in its settings file under `wslServers`, and main imports them.
// The product window does not load WSL (B4.11e), so main must not start them: no `wsl` for a CLI probe or `serve`, no
// install from the network, and the saved records stay as they are.
test("main starts nothing for WSL servers saved by 0.4 while the window does not load WSL", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wsl-main-"))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const calls = join(dir, "calls")

  // Every program the WSL runtime starts, as a stand-in that only records that it ran.
  await Promise.all(
    ["wsl", "wsl.exe", "powershell.exe"].map(async (name) => {
      await writeFile(join(dir, name), `#!/bin/sh\necho "${name} $*" >> "${calls}"\n`)
      await chmod(join(dir, name), 0o755)
    }),
  )
  process.env.PATH = `${dir}${delimiter}${path}`

  const saved = { servers: [{ id: "wsl:Ubuntu", distro: "Ubuntu" }] }
  const settings = new Map([["wslServers", saved]])
  const writes: (typeof saved)[] = []
  const logs: string[] = []
  const states: (() => WslServersState)[] = []
  const changes = { count: 0 }
  const teardown: Cleanup[] = []

  const ctx = {
    cli: { version: "2.3.0" },
    app: { packaged: true },
    log: { write: (_level: string, message: string) => logs.push(message) },
    t: (key: string) => key,
    storage: {
      store: (_key: string, options: { initial: typeof saved; from?: { settings: string } }) => ({
        get value() {
          return (options.from && settings.get(options.from.settings)) ?? options.initial
        },
        set: (value: typeof saved) => writes.push(value),
      }),
    },
    provide: (_token: typeof Wsl, impl: { state: () => WslServersState }) => {
      states.push(impl.state)

      return { changed: () => changes.count++ }
    },
    onCleanup: (fn: Cleanup) => teardown.unshift(fn),
  }

  // SAFETY: the WSL main entry reads only `cli.version`, `app.packaged`, `log.write`, `t`, `storage.store`, `provide`
  // and `onCleanup`, which this stand-in implements; the store and the Ipc are its own.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- see SAFETY above
  await setup(ctx as unknown as MainContext)
  cleanups.push(async () => {
    await Promise.all(teardown.map((cleanup) => cleanup()))
  })

  // A start shows at once in `logs`, `changes` and a `starting` server; its `wsl` runs in another process, so give that
  // half a second to show up as well.
  const deadline = Date.now() + 500

  while (Date.now() < deadline && !existsSync(calls) && changes.count === 0) await Bun.sleep(20)

  expect(existsSync(calls)).toBe(false)
  expect(changes.count).toBe(0)
  expect(logs).toEqual([])
  expect(states.map((state) => state().servers)).toEqual([
    [{ config: { id: "wsl:Ubuntu", distro: "Ubuntu" }, runtime: { kind: "stopped" } }],
  ])
  expect(writes).toEqual([])
  expect(settings.get("wslServers")).toBe(saved)
})
