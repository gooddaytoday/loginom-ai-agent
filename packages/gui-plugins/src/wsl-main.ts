import type { Plugin } from "@opencode/plugin/gui/main"
import { setupWsl } from "./wsl/main"
import { discoverProductCli, installProductCli } from "./loginom-gui/wsl-install"

export function loginomWslMain(systemProxyEnabled: () => boolean): Plugin.MainSetup {
  return (ctx) =>
    setupWsl(ctx, {
      discover: discoverProductCli,
      install: ({ ctx, runtime, distro, version, logFailure }) =>
        installProductCli(
          (script, options) => runtime.runWslSh(script, distro, options),
          version,
          ctx.t,
          ctx.signal,
          logFailure,
          async (destination, signal) => {
            const { fetchWslRelease } = await import("./loginom-gui/wsl-transport")

            return fetchWslRelease({ version, destination, signal, systemProxyEnabled: systemProxyEnabled() })
          },
        ),
    })
}

export default loginomWslMain(() => true)
