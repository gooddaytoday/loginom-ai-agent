import { afterEach, expect, test } from "bun:test"
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import type { Cleanup, MainContext } from "@opencode/plugin/gui/main"
import type { Wsl, WslServersState } from "./contract"
import setup from "../loginom-gui/wsl-main"

const path = process.env.PATH

const cleanups: Cleanup[] = []

afterEach(async () => {
  process.env.PATH = path
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})

test("main starts a server saved by the new client and keeps a migrated 0.4 server stopped", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wsl-main-"))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const calls = join(dir, "calls")

  // Every program the WSL runtime starts, as a stand-in that only records that it ran.
  await Promise.all(
    ["wsl", "wsl.exe", "powershell.exe"].map(async (name) => {
      await writeFile(join(dir, name), `#!/bin/sh\nprintf '%s %s %s %s\\n' "${name}" "$1" "$2" "$3" >> "${calls}"\n`)
      await chmod(join(dir, name), 0o755)
    }),
  )
  process.env.PATH = `${dir}${delimiter}${path}`

  const ubuntu = { id: "wsl:Ubuntu", distro: "Ubuntu" }
  const debian = { id: "wsl:Debian", distro: "Debian", autostart: true }
  const saved = { servers: [ubuntu, debian] }
  const settings = new Map([["wslServers", saved]])
  const writes: (typeof saved)[] = []
  const states: (() => WslServersState)[] = []
  const teardown: Cleanup[] = []

  const ctx = {
    cli: { version: "2.3.0" },
    app: { packaged: true, version: "2.3.0" },
    log: { write: () => undefined },
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

      return { changed: () => undefined }
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

  const state = states[0]!
  expect(state().servers).toEqual([
    { config: ubuntu, runtime: { kind: "stopped" } },
    { config: debian, runtime: { kind: "starting" } },
  ])

  // The WSL stand-in reports no installed CLI, so the attempted automatic start ends without running a server.
  const deadline = Date.now() + 1_000
  while (state().servers[1]?.runtime.kind === "starting" && Date.now() < deadline) await Bun.sleep(10)
  expect(state().servers[1]?.runtime.kind).toBe("failed")
  expect(state().servers[0]?.runtime.kind).toBe("stopped")
  const invoked = (await readFile(calls, "utf8")).trim().split("\n")
  expect(invoked.every((line) => line === "wsl -d Debian --exec")).toBe(true)
  expect(writes).toEqual([])
  expect(settings.get("wslServers")).toBe(saved)
})
