import fs from "node:fs/promises"
import path from "node:path"
import { Product, productChannel } from "@loginom-ai-agent/product"
import { cliProfile } from "@loginom-ai-agent/product/cli-profile"
import { InstallationChannel, InstallationVersion } from "@opencode-ai/core/installation/version"
import { withStandaloneCancellation } from "./standalone-cancellation"
import { acquireProfile, profileEnvironment } from "./profile"
import { notifyUpdate } from "./update-notifier"

export class StandaloneRunCloseError extends Error {
  constructor(cause: unknown) {
    super("LOGINOM_HOST_CLEANUP_FAILED", { cause })
  }
}

export async function standalone(
  args: string[],
  execute: (args: string[], paths: ReturnType<typeof cliProfile>) => Promise<void>,
) {
  const options = args.slice(0, args.indexOf("--") < 0 ? args.length : args.indexOf("--"))
  if (options.includes("--help") || options.includes("-h")) {
    process.stdout.write(
      `${Product.name} CLI\n\nUsage: ${Product.cliExecutable} [options] [command]\n\n` +
        "Commands: run, providers (auth), models, loginom setup/check/status (saved connection and pending recovery; readiness: check)/cancel-pending/recover\n" +
        "          diagnostics export [--session <id>] [--output <path>] [--no-chat]\n" +
        "Without a command: interactive TUI\n\n" +
        "Options: --headless, --no-headless, --help, --version\n" +
        "Management: --format json; setup --stdin-json; recover --acknowledge [id...]\n" +
        "Profile: LOGINOM_AI_AGENT_CLI_PROFILE (absolute path)\n",
    )
    return
  }
  if (options.includes("--version") || options.includes("-v")) {
    process.stdout.write(`${InstallationVersion}\n`)
    return
  }
  const command = options.filter((value) => !HEADLESS_FLAGS.includes(value))[0]
  // Reads the profile without its guard, so it also works while a `run` hangs.
  // Diagnostics never open a UI, so the headless flags do not apply to it.
  if (command === "diagnostics") {
    const channel = cliChannel()
    const { diagnosticsCommand } = await import("@loginom-ai-agent/loginom-host/diagnostics-cli")
    process.exitCode = await diagnosticsCommand(
      args.filter((value) => !HEADLESS_FLAGS.includes(value)),
      cliProfile({ channel, root: process.env.LOGINOM_AI_AGENT_CLI_PROFILE }),
      { version: InstallationVersion, channel },
    )
    return
  }
  if (["run", "providers", "auth", "models"].includes(command))
    return withStandaloneCancellation(() => executeProfile(args, execute))
  return executeProfile(args, execute)
}

const HEADLESS_FLAGS = ["--headless", "--no-headless"]

function cliChannel() {
  return productChannel(
    process.env.LOGINOM_AI_AGENT_CHANNEL ?? (InstallationChannel === "local" ? "dev" : InstallationChannel),
  )
}

async function executeProfile(
  args: string[],
  execute: (args: string[], paths: ReturnType<typeof cliProfile>) => Promise<void>,
) {
  const channel = cliChannel()
  const profile = await acquireProfile(
    cliProfile({
      channel,
      root: process.env.LOGINOM_AI_AGENT_CLI_PROFILE,
    }).root,
    channel,
  )
  // Chromium's Unix socket path includes TMPDIR and must fit sun_path (108 bytes on Linux).
  // The short alias retains all actual temporary files inside the isolated profile.
  const temporary =
    process.platform === "linux"
      ? await fs.mkdtemp("/tmp/loginom-cli-").catch(async (error: unknown) => {
          await profile.release()
          throw error
        })
      : undefined
  if (temporary)
    await fs.symlink(profile.paths.tmp, path.join(temporary, "tmp")).catch(async (error: unknown) => {
      await fs.rmdir(temporary)
      await profile.release()
      throw error
    })
  const environment = profileEnvironment(profile.paths, process.env)
  if (temporary)
    Object.assign(environment, {
      TMPDIR: path.join(temporary, "tmp"),
      TMP: path.join(temporary, "tmp"),
      TEMP: path.join(temporary, "tmp"),
    })
  Object.keys(process.env)
    .filter((key) => !(key in environment))
    .forEach((key) => {
      delete process.env[key]
    })
  Object.assign(process.env, environment, { LOGINOM_AI_AGENT_CHANNEL: channel })
  const notifier = new AbortController()
  const notification = notifyUpdate({ ...profile.paths, signal: notifier.signal })
  // Failed startup still requires a cleanup ACK. A failed close after run may
  // release the local guard once the host and all profile processes are gone.
  const failure = await execute(args, profile.paths)
    .finally(async () => {
      notifier.abort()
      await notification
    })
    .catch(async (error: unknown) => {
      if (error instanceof StandaloneRunCloseError) {
        if (await profile.hasNoSurvivors().catch(() => false)) return error
        throw error
      }
      const { NodeHostStartupError } = await import("@loginom-ai-agent/loginom-host/node-client")
      if (!(error instanceof NodeHostStartupError)) throw error
      if (error.cleanupError !== undefined) process.stderr.write("LOGINOM_HOST_CLEANUP_FAILED\n")
      if (!error.cleanupConfirmed) throw error
      return error
    })
  try {
    if (temporary) {
      await fs.unlink(path.join(temporary, "tmp"))
      await fs.rmdir(temporary)
    }
    await profile.release()
  } catch (error) {
    if (!failure) throw error
    const code =
      error instanceof Error && error.message === "PROFILE_OWNER_CHANGED"
        ? "PROFILE_OWNER_CHANGED"
        : "LOGINOM_HOST_CLEANUP_FAILED"
    if (failure instanceof StandaloneRunCloseError) {
      if (code !== failure.message) process.stderr.write(`${code}\n`)
      throw failure
    }
    const { NodeHostStartupError } = await import("@loginom-ai-agent/loginom-host/node-client")
    process.stderr.write(`${code}\n`)
    throw new NodeHostStartupError(failure.cause, false, error)
  }
  if (failure) throw failure
}
