import fs from "node:fs/promises"
import path from "node:path"
import { Product, productChannel } from "@loginom-ai-agent/product"
import { cliProfile } from "@loginom-ai-agent/product/cli-profile"
import { cliCapabilities } from "@loginom-ai-agent/product/cli-capabilities"
import { InstallationChannel, InstallationVersion } from "@loginom-ai-agent/core/installation/version"
import { withStandaloneCancellation } from "./standalone-cancellation"
import { acquireProfile, profileEnvironment } from "./profile"

declare const LOGINOM_AI_AGENT_LIBC: string | undefined

const capabilities = () =>
  cliCapabilities(
    process.platform,
    process.arch,
    typeof LOGINOM_AI_AGENT_LIBC === "string" ? LOGINOM_AI_AGENT_LIBC : undefined,
  )

export async function standalone(
  args: string[],
  execute: (args: string[], paths: ReturnType<typeof cliProfile>) => Promise<void>,
) {
  const options = args.slice(0, args.indexOf("--") < 0 ? args.length : args.indexOf("--"))
  if (args.length === 1 && args[0] === "--capabilities") {
    process.stdout.write(JSON.stringify({ capabilities: capabilities() }) + "\n")
    return
  }
  if (options.includes("--help") || options.includes("-h")) {
    process.stdout.write(
      `${Product.name} CLI\n\nUsage: ${Product.cliExecutable} [options] [command]\n\n` +
        "Commands: run, providers (auth), models, loginom setup/check/status/cancel-pending/recover\n" +
        "Without a command: interactive TUI\n\n" +
        "Options: --headless, --no-headless, --help, --version, --capabilities\n" +
        "Management: --format json; setup --stdin-json; recover --acknowledge [id...]\n" +
        "Profile: LOGINOM_AI_AGENT_CLI_PROFILE (absolute path)\n",
    )
    return
  }
  if (options.includes("--version") || options.includes("-v")) {
    process.stdout.write(`${InstallationVersion}\n`)
    return
  }
  if (
    ["run", "providers", "auth", "models"].includes(
      options.filter((value) => !["--headless", "--no-headless"].includes(value))[0],
    )
  )
    return withStandaloneCancellation(() => executeProfile(args, execute))
  return executeProfile(args, execute)
}

async function executeProfile(
  args: string[],
  execute: (args: string[], paths: ReturnType<typeof cliProfile>) => Promise<void>,
) {
  const channel = productChannel(
    process.env.LOGINOM_AI_AGENT_CHANNEL ?? (InstallationChannel === "local" ? "dev" : InstallationChannel),
  )
  if (process.env.LOGINOM_AI_AGENT_SHARED_AUTH_DIR && process.env.LOGINOM_AI_AGENT_AUTH_CONTENT)
    throw new Error("SHARED_AUTH_CONTENT_CONFLICT")
  if (process.env.LOGINOM_AI_AGENT_SHARED_AUTH_DIR && !capabilities().includes("shared-oauth-v1"))
    throw new Error("SHARED_AUTH_PLATFORM_UNSUPPORTED")
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
  // The callback must finish backend/host cleanup before returning. Rejection keeps
  // the guard: a failed cleanup is not evidence that another writer can safely start.
  await execute(args, profile.paths)
  if (temporary) {
    await fs.unlink(path.join(temporary, "tmp"))
    await fs.rmdir(temporary)
  }
  await profile.release()
}
