import path from "node:path"
import type { EvalConfig } from "./config"
import { evalsRoot, repoRoot } from "./config"
import { superviseProcess } from "./process-supervisor"

const saveActions = new Set(["package.save_as", "package.save_checkpoint"])
const nodeTools = new Set(["loginom_dock_node_apply", "loginom_dock_node_resume", "loginom_dock_node_wait"])
const memoryTools = new Set(["loginom_remember", "loginom_forget", "loginom_write", "loginom_edit", "loginom_add_resource"])
const providerNamePattern = /\b(APIError|ProviderAuthError|ProviderModelNotFoundError|ProviderInitError)\b/
const providerTextPattern = /\brate limit\b|\bstatus (4\d\d|5\d\d)\b|\bECONNRESET\b|\bETIMEDOUT\b/i
const receiptLimit = 8 * 1024
const receiptsLimit = 64 * 1024

type Part = {
  type?: string
  tool?: string
  text?: string
  cost?: number
  tokens?: { input?: number; output?: number; reasoning?: number }
  state?: { status?: string; input?: Record<string, unknown>; output?: string; error?: string }
}
type Event = { type?: string; sessionID?: string; part?: Part; error?: { name?: string; data?: { message?: string } } }

export function parseEvents(text: string) {
  const events = text.split("\n").flatMap((line) => {
    const parsed = parseJson(line)
    return typeof parsed === "object" && parsed !== null ? [parsed as Event] : []
  })
  const tools = events
    .filter((event) => event.type === "tool_use" && event.part?.type === "tool")
    .map((event) => event.part as Part)
  const completed = (part: Part) => part.state?.status === "completed"
  const saveReceipts = tools
    .filter(
      (part) =>
        part.tool === "loginom_dock_action_run" &&
        completed(part) &&
        saveActions.has(String(part.state?.input?.action_key)),
    )
    .flatMap((part) => {
      const found = packagePath(firstJsonObject(part.state?.output ?? ""))
      return found ? [found] : []
    })
  const receipts = truncateReceipts(
    tools.filter((part) => nodeTools.has(part.tool ?? "") && completed(part)).map((part) => part.state?.output ?? ""),
  )
  const prepare = tools.find((part) => part.tool === "loginom_dock_prepare" && completed(part))
  const preparation = firstJsonObject(prepare?.state?.output ?? "") as { skillRevision?: unknown } | undefined
  const errorEvents = events.filter((event) => event.type === "error")
  const steps = events.filter((event) => event.type === "step_finish").map((event) => event.part)
  const sum = (pick: (part: Part | undefined) => number | undefined) =>
    steps.reduce((acc, part) => acc + (pick(part) ?? 0), 0)
  return {
    sessionId: events.find((event) => typeof event.sessionID === "string")?.sessionID,
    saveReceipts,
    nodeReceipts: receipts.kept,
    nodeReceiptsDropped: receipts.dropped,
    actionManifestSha256: prepare?.state?.output?.match(/"manifest_sha256":"([0-9a-f]{64})"/)?.[1],
    skillRevision: typeof preparation?.skillRevision === "string" ? preparation.skillRevision : undefined,
    finalText: events.filter((event) => event.type === "text").at(-1)?.part?.text,
    cost: sum((part) => part?.cost),
    tokens: {
      input: sum((part) => part?.tokens?.input),
      output: sum((part) => part?.tokens?.output),
      reasoning: sum((part) => part?.tokens?.reasoning),
    },
    errors: errorEvents.flatMap((event) => (event.error?.name ? [event.error.name] : [])),
    errorTexts: errorEvents.map((event) => `${event.error?.name ?? ""} ${event.error?.data?.message ?? ""}`),
    tools: tools.map((part) => ({
      tool: part.tool ?? "?",
      status: part.state?.status ?? "?",
      action: typeof part.state?.input?.action_key === "string" ? part.state.input.action_key : undefined,
      target: targetType(part.state?.input),
      error: part.state?.error,
    })),
    counters: {
      toolCalls: tools.length,
      loginomToolCalls: tools.filter((part) => part.tool?.startsWith("loginom_")).length,
      toolErrors: tools.filter((part) => part.state?.status === "error").length,
      memoryToolCalls: tools.filter((part) => memoryTools.has(part.tool ?? "")).length,
    },
  }
}

export function failureKind(input: { exitCode: number; errors: string[]; errorTexts: string[]; stderr: string }) {
  if (input.errors.includes("CLI_PERMISSION_REJECTED")) return "permission" as const
  if (input.exitCode === 4 || input.errors.some((name) => name === "LOGINOM_RECOVERY_REQUIRED" || name === "LOGINOM_CALL_UNCERTAIN"))
    return "recovery" as const
  if (input.exitCode === 130 || input.errors.includes("CLI_CANCELLED")) return "cancelled" as const
  if ([...input.errors, ...input.errorTexts, input.stderr].some((text) => providerNamePattern.test(text)))
    return "provider" as const
  if (input.errorTexts.some((text) => providerTextPattern.test(text))) return "provider" as const
  if (input.errors.includes("CLI_TOOL_FAILED")) return "tool" as const
  return "other" as const
}
export type FailureKind = ReturnType<typeof failureKind>

const droppedChildEnv = /^(LOGINOM_|EVAL_|JUDGE_|FAKE_CODEX_)/

export function agentCommand(config: EvalConfig, env: Record<string, string | undefined> = process.env) {
  const inherited = Object.entries(env).flatMap(([key, value]) =>
    value === undefined || droppedChildEnv.test(key) ? [] : [[key, value] as const],
  )
  const isolated: Record<string, string> = {
    ...Object.fromEntries(inherited),
    LOGINOM_AI_AGENT_CLI_PROFILE: config.profileDir,
    LOGINOM_AI_AGENT_PURE: "1",
    LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG: "1",
    LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE_PROMPT: "1",
  }
  if (config.agent.cliMode === "source")
    return {
      cmd: ["bun", "run", "src/standalone.ts"],
      cwd: path.join(repoRoot, "packages", "agent"),
      env: { ...isolated, LOGINOM_AI_AGENT_CLI_BUNDLE: config.agent.bundle },
    }
  if (config.agent.cliMode === "binary") return { cmd: [config.agent.cliBin ?? "loginom-ai-agent-cli"], cwd: evalsRoot, env: isolated }
  return { cmd: ["bun", path.join(evalsRoot, "fixtures", "fake-cli.ts")], cwd: evalsRoot, env: isolated }
}
export type AgentCommand = ReturnType<typeof agentCommand> & { cleanupDir?: string; cleanupSecrets?: string[] }

export async function runAgent(input: {
  command: AgentCommand
  taskId: string
  model: string
  variant?: string
  prompt: string
  files: string[]
  workdir: string
  timeoutMs: number
  outDir: string
  profileDir?: string
  signal?: AbortSignal
}) {
  const args = [
    "run",
    "--headless",
    "--format",
    "json",
    "--model",
    input.model,
    "--variant",
    input.variant ?? "default",
    ...input.files.flatMap((file) => ["--file", file]),
    "--dir",
    input.workdir,
    "--",
    input.prompt,
  ]
  const processRun = await superviseProcess({
    cmd: [...input.command.cmd, ...args], cwd: input.command.cwd,
    env: { ...input.command.env, EVAL_TASK_ID: input.taskId },
    profileDir: input.profileDir, outDir: input.outDir,
    timeoutMs: input.timeoutMs, signal: input.signal,
  })
  const stdout = processRun.stdout
  const stderr = processRun.stderr
  const exitCode = processRun.exitCode
  const parsed = parseEvents(stdout)
  const run = {
    exitCode,
    timedOut: processRun.timedOut,
    interrupted: processRun.interrupted,
    startedAt: processRun.startedAt,
    durationMs: processRun.durationMs,
    ...parsed,
    processCleanup: processRun.processCleanup,
    failureKind: failureKind({ exitCode, errors: parsed.errors, errorTexts: parsed.errorTexts, stderr }),
    stderrHead: stderr.split("\n").slice(0, 20).join("\n"),
  }
  await Bun.write(path.join(input.outDir, "run.json"), JSON.stringify(run, null, 2)).catch(() => {
    run.processCleanup.status = "failed"
    run.processCleanup.error ??= "Agent run evidence persistence failed"
  })
  return run
}
export type AgentRun = Awaited<ReturnType<typeof runAgent>>

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function packagePath(receipt: unknown) {
  const value = receipt as { output?: { package_ref?: { path?: unknown } }; package_ref?: { path?: unknown } } | undefined
  const found = value?.output?.package_ref?.path ?? value?.package_ref?.path
  return typeof found === "string" ? found : undefined
}

// Dock может добавлять отдельные JSON-документы после квитанции сохранения.
function firstJsonObject(output: string): unknown {
  const text = output.trimStart()
  if (!text.startsWith("{")) return undefined
  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') quoted = true
    if (char === "{" || char === "[") depth++
    if (char === "}" || char === "]") depth--
    if (depth === 0) return parseJson(text.slice(0, index + 1))
  }
  return undefined
}

function targetType(input: Record<string, unknown> | undefined) {
  const target = input?.target as { type?: unknown } | undefined
  return typeof target?.type === "string" ? target.type : undefined
}

// Квитанции узлов идут судье целиком, но ограничены: длинные усекаются, при переполнении отбрасываются старшие.
function truncateReceipts(receipts: string[]) {
  const limited = receipts.map((receipt) =>
    receipt.length > receiptLimit ? `${receipt.slice(0, receiptLimit)}…[truncated]` : receipt,
  )
  const kept: string[] = []
  let total = 0
  for (const receipt of [...limited].reverse()) {
    if (total + receipt.length > receiptsLimit) break
    kept.unshift(receipt)
    total += receipt.length
  }
  return { kept, dropped: limited.length - kept.length }
}
