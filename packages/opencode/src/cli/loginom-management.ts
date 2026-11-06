import { Option, Schema } from "effect"
import { Loginom } from "@opencode-ai/schema/loginom"
import type { launchNodeHost } from "@loginom-ai-agent/loginom-host/node-client"

const setupSchema = Schema.Struct({
  mode: Schema.optionalKey(Loginom.Mode),
  endpoint: Schema.optionalKey(Schema.String),
  url: Schema.optionalKey(Schema.String),
  username: Schema.optionalKey(Schema.String),
  apiKey: Schema.optionalKey(Schema.String),
  password: Schema.optionalKey(Schema.String),
})
const setup = Schema.decodeUnknownOption(Schema.fromJsonString(setupSchema))
const view = Schema.decodeUnknownOption(Loginom.View)
const validation = Schema.decodeUnknownOption(Loginom.Validation)

export function setupCandidate(json: string, current: Loginom.View): Loginom.Candidate {
  const decoded = setup(json, { onExcessProperty: "error" })
  if (Option.isNone(decoded)) throw new Error("CLI_SETUP_INVALID")
  return {
    ...(decoded.value.mode ? { mode: decoded.value.mode } : {}),
    ...(decoded.value.mode === "custom"
      ? {
          ...(decoded.value.endpoint !== undefined ? { endpoint: decoded.value.endpoint } : {}),
          ...(decoded.value.apiKey === undefined
            ? {}
            : {
                apiKey:
                  decoded.value.apiKey === ""
                    ? { operation: "empty" as const }
                    : { operation: "replace" as const, value: decoded.value.apiKey },
              }),
        }
      : {}),
    revision: current.revision,
    url: decoded.value.url ?? current.url,
    username: decoded.value.username ?? current.username,
    password:
      decoded.value.password === undefined
        ? { operation: "preserve" }
        : decoded.value.password === ""
          ? { operation: "empty" }
          : { operation: "replace", value: decoded.value.password },
  }
}

export async function loginomManagement(
  host: Awaited<ReturnType<typeof launchNodeHost>>,
  command: string,
  options: {
    stdinJSON: boolean
    acknowledge: boolean
    ids?: string[]
  },
) {
  const decoded = view(await host.request("connection.status", {}))
  if (Option.isNone(decoded)) throw new Error("LOGINOM_REPLY_INVALID")
  const current = decoded.value
  if (command === "status") return current
  if (command === "cancel-pending") return host.request("connection.cancel-pending", { revision: current.revision })
  if (command === "recover") {
    if (!current.recoveries?.length) return current
    if (!options.acknowledge) {
      if (!process.stdin.isTTY) throw new Error("LOGINOM_RECOVERY_CONFIRMATION_REQUIRED")
      const { confirm, isCancel } = await import("@clack/prompts")
      const answer = await confirm({
        message: "Состояние Loginom проверено вручную. Подтвердить завершение восстановления без повтора операций?",
        initialValue: false,
        output: process.stderr,
      })
      if (isCancel(answer) || !answer) throw new Error("CLI_CANCELLED")
    }
    return host.request("connection.recover", {
      revision: current.revision,
      ids: options.ids?.length ? options.ids : current.recoveries,
    })
  }
  if (command === "check") {
    if (!current.generation) throw new Error("LOGINOM_CONFIG_REQUIRED")
    const checked = validation(await host.request("connection.check", setupCandidate("{}", current)))
    if (Option.isNone(checked)) throw new Error("LOGINOM_REPLY_INVALID")
    return {
      ok: true,
      code: "LOGINOM_CONNECTION_VALID",
      help: checked.value.help,
      browser: checked.value.browser ?? { state: "unknown" },
    }
  }
  if (command !== "setup") throw new Error("CLI_ARGUMENT_INVALID")
  const candidate = options.stdinJSON ? setupCandidate(await readSetup(), current) : await interactiveSetup(current)
  const checked = validation(await host.request("connection.check", candidate))
  if (Option.isNone(checked)) throw new Error("LOGINOM_REPLY_INVALID")
  const saved = view(
    await host.request("connection.save", { revision: current.revision, validationId: checked.value.validationId }),
  )
  if (Option.isNone(saved)) throw new Error("LOGINOM_REPLY_INVALID")
  if (saved.value.failure) throw new Error(saved.value.failure)
  if (saved.value.state === "recoverable-error") throw new Error("LOGINOM_RECOVERY_REQUIRED")
  return saved.value
}

async function readSetup() {
  if (process.stdin.isTTY) throw new Error("CLI_STDIN_REQUIRED")
  const chunks: Buffer[] = []
  const state = { bytes: 0 }
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    state.bytes += buffer.length
    if (state.bytes > 64 * 1024) throw new Error("CLI_SETUP_TOO_LARGE")
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString("utf8")
}

async function interactiveSetup(current: Loginom.View): Promise<Loginom.Candidate> {
  if (!process.stdin.isTTY) throw new Error("CLI_STDIN_REQUIRED")
  const { password, text, select } = await import("@clack/prompts")
  const connectionMode = await select({
    message: "Сервер Loginom AI",
    initialValue: current.mode,
    output: process.stderr,
    options: [
      { value: "cloud", label: "Облачный сервер" },
      { value: "custom", label: "Свой сервер" },
    ],
  })
  if (connectionMode !== "cloud" && connectionMode !== "custom") throw new Error("CLI_CANCELLED")
  const endpoint =
    connectionMode === "custom"
      ? await text({
          message: "MCP endpoint",
          initialValue: current.endpoint,
          defaultValue: current.endpoint,
          output: process.stderr,
        })
      : undefined
  if (connectionMode === "custom" && typeof endpoint !== "string") throw new Error("CLI_CANCELLED")
  const key =
    connectionMode === "custom"
      ? await password({
          message: current.hasApiKey ? "Ключ сервера (Enter — сохранить текущий)" : "Ключ сервера",
          output: process.stderr,
        })
      : undefined
  if (connectionMode === "custom" && typeof key !== "string") throw new Error("CLI_CANCELLED")
  const url = await text({
    message: "URL Loginom",
    defaultValue: current.url,
    initialValue: current.url,
    output: process.stderr,
  })
  if (typeof url !== "string") throw new Error("CLI_CANCELLED")
  const username = await text({
    message: "Имя пользователя",
    defaultValue: current.username,
    initialValue: current.username,
    output: process.stderr,
  })
  if (typeof username !== "string") throw new Error("CLI_CANCELLED")
  const mode = await select({
    message: "Пароль Loginom",
    output: process.stderr,
    options: [
      ...(current.hasPassword ? [{ value: "preserve", label: "Сохранить текущий" }] : []),
      { value: "empty", label: "Пустой пароль" },
      { value: "replace", label: "Ввести новый" },
    ],
  })
  if (typeof mode !== "string") throw new Error("CLI_CANCELLED")
  const secret = mode === "replace" ? await password({ message: "Новый пароль", output: process.stderr }) : ""
  if (typeof secret !== "string") throw new Error("CLI_CANCELLED")
  return setupCandidate(
    JSON.stringify({
      mode: connectionMode,
      ...(connectionMode === "custom" ? { endpoint, ...(key || !current.hasApiKey ? { apiKey: key } : {}) } : {}),
      url,
      username,
      ...(mode === "preserve" ? {} : { password: secret }),
    }),
    current,
  )
}
