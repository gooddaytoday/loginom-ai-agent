import { Option, Schema } from "effect"
import { builtinMainContext } from "@opencode/plugin/gui/builtin"
import type { MainContext } from "@opencode/plugin/gui/main"
import { Wsl } from "./contract"
import { createWslRuntime, type WslRuntime } from "./runtime"
import { createWslServersController, wslServerIdForDistro } from "./servers"
import { spawnWslSidecar } from "./sidecar"

// A record is kept when it names a distro; an id that is missing or not a non-empty string is derived from the distro.
const Distro = Schema.Struct({ distro: Schema.NonEmptyString })

const Id = Schema.Struct({ id: Schema.NonEmptyString })

const Autostart = Schema.Struct({ autostart: Schema.Literal(true) })

const Saved = Schema.Struct({ servers: Schema.Array(Schema.Unknown) })

type WslCliAdapter = {
  discover: () => string
  install: (input: {
    ctx: MainContext
    runtime: WslRuntime
    distro: string
    version: string
    logFailure: (code: string) => void
  }) => Promise<void>
}

export function setupWsl(ctx: MainContext, cli: WslCliAdapter) {
  const packaged = ctx.app.packaged
  const desktopLog = ctx.log
  const t = ctx.t
  const runtime = createWslRuntime(t, cli)

  // The distros main serves; stored before in the desktop settings file. Read leniently like that file: one bad record
  // must not drop the others.
  const saved = builtinMainContext(ctx).storage.store("servers", {
    schema: Saved,
    initial: { servers: [] },
    from: { settings: "wslServers" },
  })

  const log = <Data extends Readonly<Record<string, unknown>>>(level: "info" | "error", message: string, data: Data) =>
    desktopLog.write(level, `[wsl] ${message}`, data)

  const controller = createWslServersController({
    cli: { version: ctx.app.version },
    runtime,
    t,
    log,
    readServers: () =>
      saved.value.servers.flatMap((value) => {
        const record = Schema.decodeUnknownOption(Distro)(value)

        if (Option.isNone(record)) return []
        const distro = record.value.distro
        const id = Schema.decodeUnknownOption(Id)(value)

        return [{
          id: Option.isSome(id) ? id.value.id : wslServerIdForDistro(distro),
          distro,
          ...(Schema.is(Autostart)(value) ? { autostart: true } : {}),
        }]
      }),
    writeServers: (servers) => saved.set({ servers }),
    installCli: (distro, build) =>
      cli.install({
        ctx,
        runtime,
        distro,
        version: build.version,
        logFailure: (code) => log("error", "WSL CLI installation", { distro, code }),
      }),
    spawnSidecar: (distro, signal) => {
      log("info", "spawning wsl sidecar", { distro })

      return spawnWslSidecar(distro, {
        runtime,
        t,
        packaged,
        signal,
        onLine: (line) => log("info", "wsl sidecar", { distro, stream: line.stream, text: line.text }),
      })
    },
  })

  const provider = ctx.provide(Wsl, {
    state: () => controller.getState(),
    probeRuntime: () => controller.probeRuntime(),
    refreshDistros: () => controller.refreshDistros(),
    installWsl: () => controller.installWsl(),
    installDistro: (input) => controller.installDistro(input.name),
    probeAddable: (input) => controller.probeAddable(input.distros),
    installOpencode: (input) => controller.installOpencode(input.name),
    addServer: (input) => controller.addServer(input.distro),
    removeServer: (input) => controller.removeServer(input.id),
    startServer: (input) => controller.startServer(input.id),
  })

  ctx.onCleanup(controller.subscribe(() => provider.changed()))
  // Finalizers run in reverse: the servers stop before the state stops being published.
  ctx.onCleanup(() => controller.stopServers())
  // В-101: imported 0.4 entries have no autostart flag and stay stopped.
  controller.startConfiguredServers()
}
