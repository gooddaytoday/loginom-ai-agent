import { Option, Schema } from "effect"
import { Loginom } from "@loginom-ai-agent/schema/loginom"
import { LoginomHost } from "@loginom-ai-agent/loginom-host/adapter"
import { launchNodeHost, launchSortingDiagnostic } from "@loginom-ai-agent/loginom-host/node-client"
import type { cliProfile } from "@loginom-ai-agent/product/cli-profile"
import { Product } from "@loginom-ai-agent/product"
import { standaloneCancellation } from "./standalone-cancellation"
import { standaloneBundle } from "./standalone-bundle"

declare const LOGINOM_AI_AGENT_SORTING_ACCEPTANCE: string | undefined

export async function standaloneRun(args: string[], paths: ReturnType<typeof cliProfile>, mode: "run" | "tui" = "run", acceptanceCleanupPackage?: string) {
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
  const sorting = typeof LOGINOM_AI_AGENT_SORTING_ACCEPTANCE !== "undefined" && LOGINOM_AI_AGENT_SORTING_ACCEPTANCE === "sorting-before-close-v1"
  if (sorting && (mode !== "run" || !acceptanceCleanupPackage)) throw Error("LOGINOM_SORTING_ADMISSION_REQUIRED")
  const launcher = sorting ? launchSortingDiagnostic : launchNodeHost
  const host = await launcher({
    ...bundle,
    root: paths.loginom,
    headless,
    environment: process.env,
    acceptanceCleanupPackage,
    ...(sorting ? {packagePath: acceptanceCleanupPackage!} : {}),
    strictRecovery: process.env.LOGINOM_AI_AGENT_STRICT_RECOVERY === "1",
  })
  const owner = { deferRelease: true, leases: new Set<{ release(): Promise<void> }>(),
    ...(sorting ? {audit: {authorization: (host as Awaited<ReturnType<typeof launchSortingDiagnostic>>).auditAuthorization, phase: "ordinary" as "ordinary" | "capture"}} : {}) }
  let auditRefused = false, auditRejection: unknown
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
    const { applyCliSystemProxy, systemProxyNoticeLine } = await import("./standalone-proxy")
    const systemProxy = await applyCliSystemProxy()
    LoginomHost.connect(host.port, owner)
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
      if (sorting) {
        try {
          if (owner.leases.size !== 1) throw Error("LOGINOM_SORTING_RUN_REQUIRED")
          owner.audit!.phase = "capture"
          for (const lease of owner.leases) await lease.release()
        } catch (rejected) {auditRefused = true; auditRejection = rejected; throw rejected}
      }
    } else {
      const { TuiThreadCommand, setTuiLoginomHost, setTuiStartupWarning } = await import("./cmd/tui")
      setTuiLoginomHost(host.port)
      setTuiStartupWarning(systemProxyNoticeLine(systemProxy))
      cleanup.detach = () => {
        setTuiLoginomHost()
        setTuiStartupWarning()
      }
      await parser.command(TuiThreadCommand).parseAsync(filtered)
    }
    const final = Schema.decodeUnknownOption(Loginom.View)(await host.request("connection.status", {}))
    if (Option.isNone(final)) throw new Error("LOGINOM_REPLY_INVALID")
    if (final.value.recoveries?.length) failure("LOGINOM_RECOVERY_REQUIRED", 4)
  } catch (error) {
    if (sorting) {auditRefused=true; auditRejection=error; throw error}
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
    if (auditRefused) throw Object.assign(new Error("LOGINOM_SORTING_AUDIT_REFUSED"), {
      failed: true, rejectedValue: auditRejection, cause: auditRejection, phase: owner.audit?.phase, host, owner, cleanup,
    })
    try {
      await host.close()
    } catch (rejectedValue) {
      // Internal handoff to the existing foreground caller. Never infer refusal
      // from truthiness: undefined/null/false/0/empty string are valid rejections.
      throw Object.assign(new Error("LOGINOM_OWNER_CLEANUP_REFUSED"), {
        cleanupRefused: true, rejectedValue, host, owner, cleanup,
      })
    }
    owner.deferRelease = false
    for (const lease of owner.leases) await lease.release()
    await cleanup.dispose?.()
    cleanup.detach?.()
    LoginomHost.disconnect()
    if (signal?.aborted && process.exitCode !== 130 && process.exitCode !== 4) failure("CLI_CANCELLED", 130)
  }
}
