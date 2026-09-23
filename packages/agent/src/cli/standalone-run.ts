import { Option, Schema } from "effect"
import { Loginom } from "@loginom-ai-agent/schema/loginom"
import { LoginomHost } from "@loginom-ai-agent/loginom-host/adapter"
import { launchNodeHost } from "@loginom-ai-agent/loginom-host/node-client"
import type { cliProfile } from "@loginom-ai-agent/product/cli-profile"
import { Product } from "@loginom-ai-agent/product"
import { standaloneCancellation } from "./standalone-cancellation"
import { standaloneBundle } from "./standalone-bundle"

export async function standaloneRun(args: string[], paths: ReturnType<typeof cliProfile>, mode: "run" | "tui" = "run") {
  const signal = mode === "run" ? standaloneCancellation() : undefined
  const boundary = args.indexOf("--") < 0 ? args.length : args.indexOf("--")
  const flags = args.slice(0, boundary)
  const json =
    flags.includes("--format=json") || flags.some((value, index) => value === "--format" && flags[index + 1] === "json")
  const headless = flags.includes("--headless")
  const filtered = args.filter((value, index) => index >= boundary || !["--headless", "--no-headless"].includes(value))
  const failure = (code: string, exit: number) => {
    process.exitCode = exit
    if (json)
      process.stdout.write(JSON.stringify({ type: "error", error: { name: code, data: { message: code } } }) + "\n")
    process.stderr.write(code + "\n")
  }
  if (
    (headless && flags.includes("--no-headless")) ||
    (mode === "tui" &&
      flags.some((value) =>
        ["--port", "--hostname", "--mdns", "--cors"].some(
          (option) => value === option || value.startsWith(option + "="),
        ),
      )) ||
    flags.some(
      (value) =>
        value === "--attach" || value.startsWith("--attach=") || value === "--mini" || value === "--interactive",
    )
  ) {
    failure("CLI_ARGUMENT_INVALID", 2)
    return
  }
  const bundle = await standaloneBundle().catch((error: Error) => {
    failure(
      error.message === "LOGINOM_BUNDLE_REQUIRED" ? error.message : "LOGINOM_BUNDLE_INCOMPLETE",
      error.message === "LOGINOM_BUNDLE_REQUIRED" ? 2 : 1,
    )
    return undefined
  })
  if (!bundle) return
  if (signal?.aborted) {
    failure("CLI_CANCELLED", 130)
    return
  }
  const host = await launchNodeHost({
    ...bundle,
    root: paths.loginom,
    headless,
    environment: process.env,
    strictRecovery: process.env.LOGINOM_AI_AGENT_STRICT_RECOVERY === "1",
  })
  const cleanup: { dispose?: () => Promise<void>; detach?: () => void } = {}
  try {
    if (signal?.aborted) throw Error("CLI_CANCELLED")
    const status = Schema.decodeUnknownOption(Loginom.View)(await host.request("connection.status", {}))
    if (Option.isNone(status)) throw new Error("LOGINOM_REPLY_INVALID")
    if (status.value.recoveries?.length) {
      failure("LOGINOM_RECOVERY_REQUIRED", 4)
      return
    }
    if (mode === "run" && !status.value.hasApiKey) {
      failure("LOGINOM_CONFIG_REQUIRED", 2)
      return
    }
    if (mode === "run" && status.value.state !== "ready") {
      failure("LOGINOM_CONNECTION_NOT_READY", 1)
      return
    }
    if (mode === "tui" && !status.value.hasApiKey && process.stdin.isTTY) {
      const { confirm, isCancel } = await import("@clack/prompts")
      const setup = await confirm({
        message: "Настроить Loginom сейчас? Можно продолжить обычный чат без подключения.",
        initialValue: false,
        output: process.stderr,
      })
      // readline pauses stdin when the startup prompt closes; the TUI reuses this stream.
      process.stdin.resume()
      if (isCancel(setup)) {
        failure("CLI_CANCELLED", 130)
        return
      }
      if (setup) {
        const { loginomManagement } = await import("./loginom-management")
        await loginomManagement(host, "setup", { stdinJSON: false, acknowledge: false })
        process.stdin.resume()
      }
    }
    // Configure the existing v1 backend only after the profile and Loginom preflight.
    process.env.LOGINOM_AI_AGENT_DISABLE_AUTOUPDATE = "1"
    process.env.LOGINOM_AI_AGENT_DISABLE_MODELS_FETCH = "1"
    LoginomHost.connect(host.port)
    const { AppRuntime } = await import("../effect/app-runtime")
    cleanup.dispose = async () => {
      const { HttpApiApp } = await import("../server/routes/instance/httpapi/server")
      try {
        // The in-process HTTP handler owns a scope independent of AppRuntime.
        if (HttpApiApp.webHandler.loaded()) await HttpApiApp.webHandler().dispose()
      } finally {
        await AppRuntime.dispose()
      }
    }
    const { default: yargs } = await import("yargs")
    const parser = yargs()
      .scriptName(Product.cliExecutable)
      .parserConfiguration({ "populate--": true })
      .exitProcess(false)
      .help(false)
      .version(false)
      .strict()
      .fail((_message, error) => {
        throw error ?? new Error("CLI_ARGUMENT_INVALID")
      })
    if (mode === "run") {
      const { RunCommand } = await import("./cmd/run")
      if (signal?.aborted) throw Error("CLI_CANCELLED")
      await parser.command(RunCommand).parseAsync(filtered)
    } else {
      const { TuiThreadCommand, setTuiLoginomHost } = await import("./cmd/tui")
      setTuiLoginomHost(host.port)
      cleanup.detach = () => setTuiLoginomHost()
      await parser.command(TuiThreadCommand).parseAsync(filtered)
    }
    const final = Schema.decodeUnknownOption(Loginom.View)(await host.request("connection.status", {}))
    if (Option.isNone(final)) throw new Error("LOGINOM_REPLY_INVALID")
    if (final.value.recoveries?.length) failure("LOGINOM_RECOVERY_REQUIRED", 4)
  } catch (error) {
    if (error instanceof Error && error.message === "LOGINOM_TUI_CLEANUP_FAILED") throw error
    if (error instanceof Error && error.message === "CLI_CANCELLED") {
      failure("CLI_CANCELLED", 130)
      return
    }
    failure(
      error instanceof Error && error.message === "CLI_ARGUMENT_INVALID" ? "CLI_ARGUMENT_INVALID" : "CLI_RUN_FAILED",
      error instanceof Error && error.message === "CLI_ARGUMENT_INVALID" ? 2 : 1,
    )
  } finally {
    try {
      await cleanup.dispose?.()
    } finally {
      cleanup.detach?.()
      LoginomHost.disconnect()
      await host.close()
      if (signal?.aborted && process.exitCode !== 130 && process.exitCode !== 4) failure("CLI_CANCELLED", 130)
    }
  }
}
