export * as Standalone from "./standalone"

import path from "node:path"
import { productChannel } from "@loginom-ai-agent/product"
import { cliProfile } from "@loginom-ai-agent/product/cli-profile"
import { LOGINOM_AI_AGENT_CHANNEL, LOGINOM_AI_AGENT_VERSION } from "./version"

// Loginom AI Agent (B2.7a3): the commands of the product CLI that run before it opens its profile, as in 0.4
// (`a080f7725c:packages/opencode/src/cli/standalone.ts`). Help and version touch no storage: no profile, no channel
// directory of Desktop, no log. `diagnostics export` reads the profile without opening it or taking its writer latch, so
// it works while a server holds the profile. The `loginom` commands (B2.7b) open the profile but none of the CLI.
// Nothing here may import `@opencode/util/global` statically: it fixes its paths on import, and the profile is applied
// after this.

const headless = ["--headless", "--no-headless"]

/**
 * Runs help, version, `diagnostics export` and the `loginom` commands and exits the process; returns only for a command
 * of the CLI. Help and version answer the same way they do with the profile: from the command tree, for any command.
 */
export async function early(args: string[]) {
  const options = args.slice(0, args.indexOf("--") < 0 ? args.length : args.indexOf("--"))
  if (options.some((value) => ["--help", "-h", "--version", "-v"].includes(value))) return exit(await help())
  const command = options.filter((value) => !headless.includes(value))[0]
  // `loginom setup/status/check/cancel-pending/recover` start their own Host in the profile, without the CLI (B2.7b).
  if (command === "loginom") {
    const { LoginomManagement } = await import("./loginom-management")
    return exit(await LoginomManagement.command(args))
  }
  // Diagnostics open no UI, so the headless flags do not apply to them (0.4).
  if (command !== "diagnostics") return
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

/**
 * The arguments for the CLI and the project directory of a `run`, from the flags of the product CLI that OpenCode 2 lacks
 * (B2.7a4). `run --dir` sets the directory OpenCode 2 takes from `PWD`, and `run --variant` joins `--model` as
 * `provider/model#variant`, the way `evals` and `run-check.py` pass them to 0.4. The headless flags are dropped; a `run`
 * records its browser mode and `run --command <skill>` in `env` (B2.7a4b): OpenCode 2's server starts the Host
 * (`loginom-agent/src/host.ts`), and the private server of the run inherits the mode, while the run attaches the skill to
 * its prompt (`run/product.ts`). Another command, such as that server's own `serve`, leaves both as it found them. Fails
 * with `CLI_ARGUMENT_INVALID` (exit code 2).
 */
export function forward(args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
  const boundary = args.indexOf("--") < 0 ? args.length : args.indexOf("--")
  const options = args.slice(0, boundary)
  if (headless.every((flag) => options.includes(flag)))
    throw new Error("CLI_ARGUMENT_INVALID: --headless and --no-headless exclude each other")
  const rest = options.filter((value) => !headless.includes(value))
  if (rest[0] !== "run") return { args: [...rest, ...args.slice(boundary)] }
  if (options.includes("--headless")) env.LOGINOM_AI_AGENT_HEADLESS = "1"
  else delete env.LOGINOM_AI_AGENT_HEADLESS
  const command = take(rest, "--command")
  if (command === undefined) delete env.LOGINOM_AI_AGENT_RUN_COMMAND
  else env.LOGINOM_AI_AGENT_RUN_COMMAND = command
  const dir = take(rest, "--dir")
  // `default` is the model's own setting, as OpenCode 2 reads a `#default` variant.
  const variant = take(rest, "--variant")
  if (variant !== undefined && variant !== "default") {
    const model = take(rest, "--model") ?? take(rest, "-m")
    if (model === undefined || model.includes("#"))
      throw new Error("CLI_ARGUMENT_INVALID: --variant needs --model provider/model without a variant")
    rest.push("--model", `${model}#${variant}`)
  }
  return {
    args: [...rest, ...args.slice(boundary)],
    directory: dir === undefined ? undefined : path.resolve(cwd, dir),
  }
}

// Removes `--name value` or `--name=value` from `options` and returns the value.
function take(options: string[], name: string) {
  const index = options.findIndex((value) => value === name || value.startsWith(name + "="))
  if (index < 0) return undefined
  const [option, next] = options.splice(index, options[index] === name ? 2 : 1)
  if (option !== name) return option!.slice(name.length + 1)
  if (next === undefined) throw new Error(`CLI_ARGUMENT_INVALID: ${name} needs a value`)
  return next
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
