import { fstatSync } from "node:fs"
import { createHash, randomUUID } from "node:crypto"
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
  const control = await standaloneSessionCompletion(signal)
  try {
    if (control && mode !== "run") throw Error("CLI_CONTROL_INVALID")
    const boundary = args.indexOf("--") < 0 ? args.length : args.indexOf("--")
    const flags = args.slice(0, boundary)
    if (
      control &&
      flags.some((value) =>
        ["--mini", "--interactive", "--attach"].some((flag) => value === flag || value.startsWith(flag + "=")),
      )
    )
      throw Error("CLI_CONTROL_INVALID")
    const json =
      flags.includes("--format=json") ||
      flags.some((value, index) => value === "--format" && flags[index + 1] === "json")
    const headless = flags.includes("--headless")
    const filtered = args.filter(
      (value, index) => index >= boundary || !["--headless", "--no-headless"].includes(value),
    )
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
      if (control) throw Error("CLI_CONTROL_INVALID")
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
    if (!bundle) {
      if (control) throw Error("CLI_CONTROL_UNCONFIRMED")
      return
    }
    if (signal?.aborted) {
      if (control) throw Error("CLI_CONTROL_UNCONFIRMED")
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
      if (
        control &&
        (status.value.recoveryMode !== "strict" ||
          status.value.sessionCompletion !== "open" ||
          status.value.state !== "ready" ||
          status.value.generation < 1 ||
          !status.value.hasApiKey ||
          status.value.recoveries?.length)
      )
        throw Error("CLI_CONTROL_UNREGISTERED")
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
        const { createRunCommand } = await import("./cmd/run")
        if (signal?.aborted) throw Error("CLI_CANCELLED")
        await parser.command(createRunCommand(control?.session)).parseAsync(filtered)
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
      if (control) {
        if (
          final.value.generation !== status.value.generation ||
          final.value.recoveryMode !== "strict" ||
          final.value.sessionCompletion !== "open" ||
          final.value.recoveries?.length ||
          final.value.state !== "ready" ||
          (process.exitCode !== undefined && process.exitCode !== 0)
        )
          throw Error("CLI_CONTROL_UNCONFIRMED")
        await control.complete(host, final.value.generation)
      }
      if (final.value.recoveries?.length) failure("LOGINOM_RECOVERY_REQUIRED", 4)
    } catch (error) {
      // A failed private completion keeps the profile guard even if local Host shutdown succeeds.
      if (control) throw Error("CLI_CONTROL_UNCONFIRMED")
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
  } finally {
    control?.close()
  }
}

/** Launcher-only inherited Unix socket. Neither argv nor model tools can select
 * identities or call this channel. The launcher must exclude it from model
 * descendants; ordinary child spawn uses only its explicit stdio descriptors.
 * This is a private capability, not an OS sandbox against same-UID inspection.
 */
export async function standaloneSessionCompletion(signal?: AbortSignal) {
  const selected = process.env.LOGINOM_AI_AGENT_CLI_CONTROL_FD
  delete process.env.LOGINOM_AI_AGENT_CLI_CONTROL_FD
  if (selected === undefined) return
  if (process.platform === "win32" || !/^(?:[3-9]|[1-5][0-9]|6[0-3])$/.test(selected))
    throw Error("CLI_CONTROL_INVALID")
  const fd = Number(selected)
  if (!fstatSync(fd).isSocket()) throw Error("CLI_CONTROL_INVALID")
  const state = {
    session: "",
    failed: false,
    buffer: "",
    requests: 0,
    socket: undefined as Bun.Socket | undefined,
    draining: undefined as { resolve(): void; reject(error: Error): void } | undefined,
    waiting: undefined as { resolve(value: string): void; reject(error: Error): void } | undefined,
    queued: [] as string[],
    allowed: "none" as "none" | "options" | "finish",
  }
  const fail = () => {
    if (state.failed) return
    state.failed = true
    state.waiting?.reject(Error("CLI_CONTROL_UNCONFIRMED"))
    state.waiting = undefined
    state.draining?.reject(Error("CLI_CONTROL_UNCONFIRMED"))
    state.draining = undefined
    state.socket?.terminate()
  }
  // Bun 1.3.14 supports adopting an inherited FD; node:net.Socket({fd})
  // does not. bun-types exposes FdSocketOptions but omits this overload.
  const connect = Bun.connect as typeof Bun.connect & ((options: Bun.FdSocketOptions) => Promise<Bun.Socket>)
  const socket = await connect({
    fd,
    socket: {
      data(_socket, chunk) {
        if (state.failed) return
        if (Buffer.byteLength(state.buffer) + chunk.byteLength > 256) return fail()
        state.buffer += chunk.toString("utf8")
        while (state.buffer.includes("\n")) {
          const end = state.buffer.indexOf("\n")
          const value = state.buffer.slice(0, end)
          state.buffer = state.buffer.slice(end + 1)
          // Exact compact frames also reject duplicate JSON keys and caller IDs.
          if (
            ++state.requests > 2 ||
            state.allowed === "none" ||
            value !== JSON.stringify({ version: 1, method: state.allowed })
          )
            return fail()
          state.allowed = "none"
          if (state.waiting) {
            state.waiting.resolve(value)
            state.waiting = undefined
          } else state.queued.push(value)
        }
      },
      error: fail,
      end: fail,
      close: fail,
      drain() {
        state.draining?.resolve()
        state.draining = undefined
      },
    },
  }).catch(() => {
    throw Error("CLI_CONTROL_INVALID")
  })
  state.socket = socket
  signal?.addEventListener("abort", fail, { once: true })
  function check() {
    if (state.failed || signal?.aborted || socket.readyState !== 1) throw Error("CLI_CONTROL_UNCONFIRMED")
  }
  async function next(expected: "options" | "finish") {
    check()
    const frame =
      state.queued.shift() ??
      (await new Promise<string>((resolve, reject) => {
        state.waiting = { resolve, reject }
      }))
    check()
    if (frame !== JSON.stringify({ version: 1, method: expected })) throw Error("CLI_CONTROL_INVALID")
  }
  async function write(value: object) {
    check()
    const bytes = Buffer.from(JSON.stringify(value) + "\n")
    if (bytes.length > 32768) throw Error("CLI_CONTROL_INVALID")
    let offset = 0
    while (offset < bytes.length) {
      check()
      const written = socket.write(bytes.subarray(offset))
      if (written < 0) throw Error("CLI_CONTROL_UNCONFIRMED")
      offset += written
      if (offset < bytes.length)
        await new Promise<void>((resolve, reject) => {
          state.draining = { resolve, reject }
        })
    }

    check()
  }
  return {
    session(sessionID: string) {
      check()
      if (state.session || !/^[a-zA-Z0-9_-]{1,160}$/.test(sessionID)) throw Error("CLI_CONTROL_INVALID")
      state.session = sessionID
    },
    async complete(host: Pick<Awaited<ReturnType<typeof launchNodeHost>>, "request">, generation: number) {
      check()
      if (!state.session || !Number.isSafeInteger(generation) || generation < 1) throw Error("CLI_CONTROL_INVALID")
      // Start a bounded controller window only after the run has settled. No
      // finish is sent because a model answered or the CLI returned exit zero.
      const timer = setTimeout(fail, 60000)
      try {
        state.allowed = "options"
        await write({ version: 1, type: "ready" })
        await next("options")
        const target = { generation, chat: createHash("sha256").update(state.session).digest("hex") }
        const decoded = Schema.decodeUnknownOption(Loginom.SessionCompletionBinding)(
          await host.request("connection.session-completion-options", target, 30000),
          { onExcessProperty: "error" },
        )
        check()
        if (
          Option.isNone(decoded) ||
          decoded.value.generation !== target.generation ||
          decoded.value.chat !== target.chat
        )
          throw Error("CLI_CONTROL_UNCONFIRMED")
        const completionId = randomUUID()
        state.allowed = "finish"
        await write({ version: 1, type: "options", completionId, binding: decoded.value })
        await next("finish")
        check()
        const receipt = Schema.decodeUnknownOption(Loginom.SessionCompletionReceipt)(
          await host.request("connection.finish-own-session", { completionId, binding: decoded.value }, 30000),
          { onExcessProperty: "error" },
        )
        check()
        if (
          Option.isNone(receipt) ||
          receipt.value.completionId !== completionId ||
          Object.keys(decoded.value).some(
            (key) =>
              decoded.value[key as keyof typeof decoded.value] !==
              receipt.value.binding[key as keyof typeof decoded.value],
          )
        )
          throw Error("CLI_CONTROL_UNCONFIRMED")
        await write({ version: 1, type: "receipt", receipt: receipt.value })
        if (
          receipt.value.status !== "SUCCEEDED" ||
          !receipt.value.packageClosed ||
          !receipt.value.loggedOut ||
          receipt.value.reason !== null
        )
          throw Error("CLI_CONTROL_UNCONFIRMED")
      } finally {
        clearTimeout(timer)
      }
    },
    close() {
      signal?.removeEventListener("abort", fail)
      fail()
      socket.terminate()
    },
  }
}
