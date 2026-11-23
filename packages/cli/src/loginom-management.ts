// Loginom AI Agent (B2.7b): `loginom setup/status/check/cancel-pending/recover` of the product CLI, as in 0.4
// (`a080f7725c:packages/opencode/src/cli/{loginom-management,standalone-command}.ts`). A command opens the CLI profile
// under its writer latch and starts its own Node host in `<profile>/loginom`, the directory of the Host that the profile's
// server starts (B2.3). Setup saves the connection there as a new generation through `cliCredentials` (decision В-97,
// п. 4), and the server reads it when it starts. Nothing else runs: no server and no database. While the profile's server
// holds the latch, a command answers PROFILE_BUSY (exit code 3), so one profile never has two Hosts.
export * as LoginomManagement from "./loginom-management"

import { access } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { Option, Schema } from "effect"
import { hostError } from "@loginom-ai-agent/loginom-host/errors"
import { Loginom } from "@loginom-ai-agent/loginom-host/loginom"
import { launchNodeHost, NodeHostStartupError } from "@loginom-ai-agent/loginom-host/node-client"
import { CliProfile } from "./profile"
import { CliResources } from "./resources"

const setupSchema = Schema.Struct({
  url: Schema.optionalKey(Schema.String),
  username: Schema.optionalKey(Schema.String),
  // Older setup scripts still send their own MCP key; the built-in key replaced it.
  apiKey: Schema.optionalKey(Schema.String),
  password: Schema.optionalKey(Schema.String),
})
const setup = Schema.decodeUnknownOption(Schema.fromJsonString(setupSchema))
const view = Schema.decodeUnknownOption(Loginom.View)
const validation = Schema.decodeUnknownOption(Loginom.Validation)

/**
 * Runs `loginom <command>` from the arguments of the product CLI in its profile and returns the exit code of 0.4: 0, 1,
 * 2 (arguments, setup input, configuration), 3 (busy profile, conflict), 4 (recovery) or 130 (cancelled). With
 * `--format json` stdout holds one JSON document: the result, or `{ ok: false, code }`; stderr gets the code.
 */
export async function command(args: string[]) {
  const parsed = parse(args)
  if (!parsed) {
    process.stderr.write("CLI_ARGUMENT_INVALID\n")
    return 2
  }
  const format = parsed.values.format
  const action = parsed.positionals[1] ?? ""
  if (
    !["default", "json"].includes(format) ||
    parsed.positionals[0] !== "loginom" ||
    !["status", "setup", "check", "cancel-pending", "recover"].includes(action) ||
    (parsed.positionals.length > 2 && (action !== "recover" || !parsed.values.acknowledge)) ||
    (parsed.values["stdin-json"] && action !== "setup") ||
    (parsed.values.acknowledge && action !== "recover") ||
    (parsed.values.headless && parsed.values["no-headless"])
  )
    return failure("CLI_ARGUMENT_INVALID", format)
  const paths = CliProfile.apply()
  const latch = await CliProfile.take(paths.root, false).catch((error: unknown) => {
    if (!(error instanceof CliProfile.Busy)) throw error
    process.stderr.write(error.message + "\n")
    return undefined
  })
  if (!latch) return 3
  const code = await manage(parsed, paths.loginom).catch(async (error: unknown) => {
    if (error instanceof Error && error.message === "LOGINOM_HOST_CLEANUP_FAILED") return error
    await latch.release()
    throw error
  })
  // A Host whose cleanup is unconfirmed may still use the profile, so its latch stays, as in 0.4. The next server takes
  // it over once this process is gone (B2.7c).
  if (code instanceof Error) {
    process.stderr.write("LOGINOM_HOST_CLEANUP_FAILED\n")
    return 1
  }
  await latch.release()
  return code
}

async function manage(parsed: NonNullable<ReturnType<typeof parse>>, root: string) {
  const format = parsed.values.format
  const bundle = await resources().catch((error: Error) => error)
  if (bundle instanceof Error) return failure(bundle, format)
  const host = await launchNodeHost({
    node: bundle.node,
    entry: bundle.entry,
    root,
    resources: bundle.resources,
    headless: parsed.values.headless && !parsed.values["no-headless"],
    environment: process.env,
    strictRecovery: process.env.LOGINOM_AI_AGENT_STRICT_RECOVERY === "1",
  }).catch((error: unknown) => {
    if (!(error instanceof NodeHostStartupError) || !error.cleanupConfirmed)
      throw new Error("LOGINOM_HOST_CLEANUP_FAILED", { cause: error })
    return error
  })
  if (host instanceof NodeHostStartupError) return failure(host, format)
  const action = parsed.positionals[1]!
  const code = await loginomManagement(host, action, {
    stdinJSON: parsed.values["stdin-json"],
    acknowledge: parsed.values.acknowledge,
    ids: parsed.positionals.slice(2),
  }).then(
    (result) => {
      process.stdout.write(
        (action === "status" && format !== "json"
          ? statusText(result as ReturnType<typeof statusView>)
          : JSON.stringify(result, null, format === "json" ? undefined : 2)) + "\n",
      )
      return 0
    },
    (error: unknown) => failure(error, format),
  )
  await host.close()
  return code
}

// The Host files of the product CLI: the explicit `LOGINOM_AI_AGENT_RESOURCES` (a source run, `evals`), or the verified
// resources of a built CLI, as 0.4 `standalone-bundle.ts` found them.
async function resources() {
  const root =
    process.env.LOGINOM_AI_AGENT_RESOURCES ??
    (await CliResources.locate().catch(() => {
      throw new Error("LOGINOM_BUNDLE_INCOMPLETE")
    }))
  if (!root || !isAbsolute(root)) throw new Error("LOGINOM_BUNDLE_REQUIRED")
  const resources = resolve(root)
  const node = join(resources, "bin", process.platform === "win32" ? "node.exe" : "node")
  const entry = join(resources, "host", "node-host.mjs")
  const files = [node, entry, ...(process.platform === "darwin" ? [join(resources, "bin", "loginom-keychain")] : [])]
  const present = await Promise.all(
    files.map((file) =>
      access(file).then(
        () => true,
        () => false,
      ),
    ),
  )
  if (present.includes(false)) throw new Error("LOGINOM_BUNDLE_INCOMPLETE")
  return { resources, node, entry }
}

// Writes the code of a failed command, as 0.4 did, and returns its exit code.
function failure(value: unknown, format: string) {
  const message = value instanceof Error ? value.message : value
  const local = [
    "CLI_ARGUMENT_INVALID",
    "CLI_SETUP_INVALID",
    "CLI_SETUP_TOO_LARGE",
    "CLI_STDIN_REQUIRED",
    "CLI_CANCELLED",
    "LOGINOM_CONFIG_REQUIRED",
    "LOGINOM_RECOVERY_CONFIRMATION_REQUIRED",
    "LOGINOM_BUNDLE_REQUIRED",
    "LOGINOM_BUNDLE_INCOMPLETE",
  ]
  const code = typeof message === "string" && local.includes(message) ? message : hostError(value)
  if (format === "json") process.stdout.write(JSON.stringify({ ok: false, code }) + "\n")
  process.stderr.write(code + "\n")
  if (code === "CLI_CANCELLED") return 130
  if (["LOGINOM_RECOVERY_REQUIRED", "LOGINOM_CALL_UNCERTAIN", "LOGINOM_RECOVERY_CONFIRMATION_REQUIRED"].includes(code))
    return 4
  if (
    [
      "LOGINOM_REVISION_CONFLICT",
      "LOGINOM_APPLICATION_PENDING",
      "LOGINOM_APPLICATION_COMMITTING",
      "LOGINOM_RECOVERY_BUSY",
      "LOGINOM_RECOVERY_CONFLICT",
    ].includes(code)
  )
    return 3
  if (
    [
      "CLI_ARGUMENT_INVALID",
      "CLI_SETUP_INVALID",
      "CLI_SETUP_TOO_LARGE",
      "CLI_STDIN_REQUIRED",
      "LOGINOM_CONFIG_REQUIRED",
      "LOGINOM_CANDIDATE_INVALID",
      "LOGINOM_URL_INVALID",
      "LOGINOM_USERNAME_INVALID",
      "LOGINOM_BUNDLE_REQUIRED",
    ].includes(code)
  )
    return 2
  return 1
}

function parse(args: string[]) {
  try {
    return parseArgs({
      args,
      allowPositionals: true,
      options: {
        format: { type: "string", default: "default" },
        headless: { type: "boolean", default: false },
        "no-headless": { type: "boolean", default: false },
        "stdin-json": { type: "boolean", default: false },
        acknowledge: { type: "boolean", default: false },
      },
    })
  } catch {
    return undefined
  }
}

export function setupCandidate(json: string, current: Loginom.View): Loginom.Candidate {
  const decoded = setup(json, { onExcessProperty: "error" })
  if (Option.isNone(decoded)) throw new Error("CLI_SETUP_INVALID")
  return {
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

// Every command starts its own Host, so `starting` only means this process has not loaded Help yet.
// `status` reports the saved connection instead; readiness is `loginom check`.
export function statusView(current: Loginom.View) {
  if (current.state !== "starting") return current
  return { ...current, state: current.generation ? ("configured" as const) : ("unconfigured" as const) }
}

export function statusText(current: ReturnType<typeof statusView>) {
  const count = current.recoveries?.length ?? 0
  const clean = current.state !== "recoverable-error" && !count
  const lines = [
    current.generation
      ? `Подключение настроено: ${current.url}, пользователь ${current.username}.` +
        (clean ? " Незавершённых операций нет. Проверить соединение — `loginom check`." : "")
      : "Подключение не настроено — `loginom setup`.",
  ]
  if (current.state === "pending")
    lines.push("Сохранённое изменение подключения ещё не применено; отменить его — `loginom cancel-pending`.")
  if (count) {
    const word =
      count % 10 === 1 && count % 100 !== 11
        ? "операция"
        : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)
          ? "операции"
          : "операций"
    lines.push(
      `Требуется восстановление: ${count} ${word} — проверьте сценарий в Loginom и выполните \`loginom recover\`.`,
    )
  } else if (current.state === "recoverable-error")
    lines.push(
      `Ошибка подключения${current.failure ? `: ${current.failure}` : ""}. ` +
        "Проверить соединение — `loginom check`, настроить заново — `loginom setup`.",
    )
  return lines.join("\n")
}

export async function loginomManagement(
  host: Pick<Awaited<ReturnType<typeof launchNodeHost>>, "request">,
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
  if (command === "status") return statusView(current)
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
      help: { state: "ready" },
      browser: checked.value.browser ?? { state: "unknown" },
    }
  }
  if (command !== "setup") throw new Error("CLI_ARGUMENT_INVALID")
  const candidate = options.stdinJSON ? setupCandidate(await readSetup(), current) : await interactiveSetup(current)
  await host.request("connection.verify-resources", {})
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
      url,
      username,
      ...(mode === "preserve" ? {} : { password: secret }),
    }),
    current,
  )
}
