export * as Standalone from "./standalone"

import { productChannel } from "@loginom-ai-agent/product"
import { cliProfile } from "@loginom-ai-agent/product/cli-profile"
import { LOGINOM_AI_AGENT_CHANNEL, LOGINOM_AI_AGENT_VERSION } from "./version"

// Loginom AI Agent (B2.7a3): the commands of the product CLI that run before it opens its profile, as in 0.4
// (`a080f7725c:packages/opencode/src/cli/standalone.ts`). Help and version touch no storage: no profile, no channel
// directory of Desktop, no log. `diagnostics export` reads the profile without opening it or taking its writer latch, so
// it works while a server holds the profile. Nothing here may import `@opencode/util/global` statically: it fixes its
// paths on import, and the profile is applied after this.

const headless = ["--headless", "--no-headless"]

/**
 * Runs help, version and `diagnostics export` and exits the process; returns only for a command that needs the profile.
 * Help and version answer the same way they do with the profile: from the command tree, for any command in `args`.
 */
export async function early(args: string[]) {
  const options = args.slice(0, args.indexOf("--") < 0 ? args.length : args.indexOf("--"))
  if (options.some((value) => ["--help", "-h", "--version", "-v"].includes(value))) return exit(await help())
  // Diagnostics open no UI, so the headless flags do not apply to them (0.4).
  if (options.filter((value) => !headless.includes(value))[0] !== "diagnostics") return
  const channel = productChannel(LOGINOM_AI_AGENT_CHANNEL === "latest" ? "prod" : LOGINOM_AI_AGENT_CHANNEL)
  const { diagnosticsCommand } = await import("@loginom-ai-agent/loginom-host/diagnostics-cli")
  return exit(
    await diagnosticsCommand(
      args.filter((value) => !headless.includes(value)),
      cliProfile({ channel, root: process.env.LOGINOM_AI_AGENT_CLI_PROFILE }),
      { version: LOGINOM_AI_AGENT_VERSION, channel },
    ),
  )
}

// The command tree without its handlers and without the layers of `index.ts` (paths, config, log): the CLI framework
// prints help and version itself and never reaches a handler.
async function help() {
  const { NodeServices } = await import("@effect/platform-node")
  const { Effect, Exit } = await import("effect")
  const { Commands } = await import("./commands/commands")
  const { Runtime } = await import("./framework/runtime")
  const exit = await Effect.runPromiseExit(
    Runtime.run(Commands, [], { version: LOGINOM_AI_AGENT_VERSION }).pipe(Effect.provide(NodeServices.layer)),
  )
  return Exit.isSuccess(exit) ? 0 : 1
}

// process.exit drops output still queued for a pipe; ending the streams waits for it.
async function exit(code: number): Promise<never> {
  await Promise.all(
    [process.stdout, process.stderr].map((stream) => new Promise<void>((resolve) => stream.end(() => resolve()))),
  )
  return process.exit(code)
}
