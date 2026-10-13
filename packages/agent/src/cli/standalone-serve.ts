import { standaloneCancellation } from "./standalone-cancellation"
import type { NetworkOptions } from "./network"

let closed = false
export const standaloneServeClosed = () => closed

// The existing server command owns HTTP/storage only. Import no TUI or NodeHost.
export async function standaloneServe(args: string[]) {
  closed = false
  const { default: yargs } = await import("yargs")
  const { withNetworkOptions, resolveNetworkOptions } = await import("./network")
  const { AppRuntime } = await import("../effect/app-runtime")
  const { Server } = await import("../server/server")
  const signal = standaloneCancellation()
  let listener: Awaited<ReturnType<typeof Server.listen>> | undefined
  let failed = false, primary: unknown
  const remember = (error: unknown) => {
    if (!failed) { failed = true; primary = error }
  }
  try {
    await yargs().exitProcess(false).help(false).version(false).strict()
      .fail((_message, error) => { throw error ?? Error("CLI_ARGUMENT_INVALID") })
      .command({ command: "serve", builder: withNetworkOptions, async handler(options) {
        signal?.throwIfAborted()
        const network = await AppRuntime.runPromise(resolveNetworkOptions(options as NetworkOptions), { signal })
        listener = await Server.listen(network)
        process.stdout.write(`opencode server listening on http://${listener.hostname}:${listener.port}\n`)
        if (!signal) throw Error("CLI_CANCELLATION_REQUIRED")
        // Graceful stop drains original HTTP/storage work; another SIGINT cannot force exit.
        if (!signal.aborted) await new Promise<void>(resolve => {
          signal.addEventListener("abort", () => resolve(), { once: true })
        })
      } }).parseAsync(args)
  } catch (error) { remember(error) }
  // A refused/pending listener close must retain the profile and runtime scopes.
  if (listener) {
    try { await listener.stop(false) } catch (error) { remember(error); throw primary }
  }
  const { HttpApiApp } = await import("../server/routes/instance/httpapi/server")
  try { if (HttpApiApp.webHandler.loaded()) await HttpApiApp.webHandler().dispose() }
  catch (error) { remember(error); throw primary }
  try { await AppRuntime.dispose(); closed = true } catch (error) { remember(error) }
  if (failed) throw primary
}
