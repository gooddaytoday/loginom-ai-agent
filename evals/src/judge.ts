import path from "node:path"
import { childEnvironment } from "./child-environment"
import { cp, mkdir, rm } from "node:fs/promises"
import { evalsRoot } from "./config"
import type { ChecklistItem, Task } from "./task"
import type { AgentRun } from "./cli"
import { unzip } from "./artifact"
import { EvalFailure } from "./fail"
import { checkOracle } from "./oracle"
import { superviseProcess } from "./process-supervisor"
import { runJudgeUnit } from "./judge-unit"
import type { AttemptResult } from "./report"
import { readLeaseReceipt, writeLeaseReceipt } from "./lease"

export const judgePromptFile = path.join(evalsRoot, "src", "judge-prompt.md")
export const verdictSchemaFile = path.join(evalsRoot, "src", "verdict.schema.json")

export type Verdict = {
  checklist: { id: string; passed: boolean; evidence: string }[]
  summary: string
  confidence: "high" | "medium" | "low"
}
export type JudgeSettings = {
  command: string[]
  model: string
  reasoning: string
  timeoutMs: number
  passThreshold: number
  env?: Record<string, string>
  systemd?: boolean
  transportReserve?: boolean
}
type RunView = Pick<AgentRun, "finalText" | "tools" | "nodeReceipts" | "nodeReceiptsDropped">

export function parseVerdict(text: string): Verdict | undefined {
  const parsed = parseJson(text) as Partial<Verdict> | undefined
  if (!parsed || !Array.isArray(parsed.checklist) || typeof parsed.summary !== "string") return undefined
  if (!["high", "medium", "low"].includes(String(parsed.confidence))) return undefined
  const valid = parsed.checklist.every(
    (item) => typeof item?.id === "string" && typeof item.passed === "boolean" && typeof item.evidence === "string",
  )
  return valid ? (parsed as Verdict) : undefined
}

export function scoreVerdict(checklist: ChecklistItem[], verdict: Verdict, threshold: number) {
  const ids = verdict.checklist.map((item) => item.id)
  const expected = checklist.map((item) => item.id)
  const missing = expected.filter((id) => !ids.includes(id))
  const extra = ids.filter((id) => !expected.includes(id))
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
  if (missing.length || extra.length || duplicates.length)
    return {
      ok: false as const,
      error: `checklist ids: missing=[${missing}] extra=[${extra}] duplicates=[${duplicates}]`,
    }
  const items = checklist.map((item) => {
    const answer = verdict.checklist.find((candidate) => candidate.id === item.id)
    return { id: item.id, passed: answer?.passed === true, evidence: answer?.evidence ?? "" }
  })
  const total = checklist.reduce((sum, item) => sum + item.weight, 0)
  if (total === 0) return { ok: false as const, error: "checklist пуст" }
  const passed = checklist.reduce(
    (sum, item) => sum + (items.find((candidate) => candidate.id === item.id)?.passed ? item.weight : 0),
    0,
  )
  const score = Math.round((100 * passed) / total)
  const requiredPassed = checklist.every((item) => !(item.required || item.requiresResultFile) || items.find((answer) => answer.id === item.id)?.passed)
  const structure = checklist.filter((item) => item.axis === "structure")
  const structural_score = checklist.some((item) => item.axis === undefined) || !structure.length ? null :
    Math.min(100, 100 * structure.reduce((sum, item) => sum + (items.find((answer) => answer.id === item.id)?.passed ? item.weight : 0), 0) /
    structure.reduce((sum, item) => sum + item.weight, 0))
  return { ok: true as const, score, pass: score >= threshold && requiredPassed, items, structural_score }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export async function judgeInfo(config: { judge: Pick<JudgeSettings, "command" | "model" | "reasoning" | "env" | "systemd" | "transportReserve"> }, signal?: AbortSignal) {
  const version = await judgeVersion(config.judge, signal)
  return {
    backend: "codex" as const,
    codex_version: version.exitCode === 0 ? version.stdout.trim() : null,
    model: config.judge.model,
    reasoning: config.judge.reasoning,
    ...(config.judge.transportReserve ? { transport_reserve: 1 as const } : {}),
    prompt_sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(judgePromptFile).bytes()).digest("hex"),
    schema_sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(verdictSchemaFile).bytes()).digest("hex"),
  }
}
export type JudgeInfo = Awaited<ReturnType<typeof judgeInfo>>

export async function judgeVersion(judge: Pick<JudgeSettings, "command" | "env" | "systemd">, signal?: AbortSignal) {
  const version = await runJudge({ cmd: [...judge.command, "--version"], cwd: evalsRoot,
    env: judgeEnvironment(judge.env), timeoutMs: 10_000, signal, owner: { kind: "judge", id: "version" } }, judge)
    .catch(() => { throw new EvalFailure("Судья недоступен: проверка версии не подтверждена", 2) })
  if (!version.cleanupConfirmed || version.timedOut || version.interrupted)
    throw new EvalFailure("JUDGE_VERSION_UNCONFIRMED", 2)
  return { exitCode: version.exitCode, stdout: version.stdout }
}

export function judgeEnvironment(env?: Record<string, string>) {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).flatMap(([key, value]) =>
        value === undefined || /^(LOGINOM_|EVAL_|JUDGE_|FAKE_CODEX_)/.test(key) ? [] : [[key, value] as const],
      ),
    ),
    ...env,
  }
}

export function judgeCommand(input: { command: string[]; dir: string; model: string; reasoning: string }) {
  return [
    ...input.command,
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--skip-git-repo-check",
    "-s",
    "read-only",
    "-C",
    input.dir,
    "-m",
    input.model,
    "-c",
    `model_reasoning_effort=${input.reasoning}`,
    "-c",
    "project_doc_max_bytes=0",
    "-c",
    "model_provider=evals-openai",
    "-c",
    "model_providers.evals-openai.name=OpenAI",
    "-c",
    "model_providers.evals-openai.requires_openai_auth=true",
    "-c",
    "model_providers.evals-openai.request_max_retries=0",
    "-c",
    "model_providers.evals-openai.stream_max_retries=0",
    "-c",
    "model_providers.evals-openai.supports_websockets=false",
    "--json",
    "--output-schema",
    path.join(input.dir, "verdict.schema.json"),
    "-o",
    path.join(input.dir, "verdict.json"),
    "-",
  ]
}

export async function prepareJudgeDir(input: {
  task: Task
  run?: RunView
  artifactDir: string
  prompt: string
  dir: string
  checklist: ChecklistItem[]
}) {
  await rm(input.dir, { recursive: true, force: true })
  await mkdir(input.dir, { recursive: true })
  const stub = "недоступно: калибровка"
  await Promise.all([
    cp(judgePromptFile, path.join(input.dir, "PROMPT.md")),
    Bun.write(path.join(input.dir, "TASK.md"), input.prompt),
    cp(path.join(input.task.dir, input.task.spec), path.join(input.dir, "SPEC.md")),
    Bun.write(
      path.join(input.dir, "checklist.json"),
      JSON.stringify(input.checklist.map(({ id, text }) => ({ id, text })), null, 2),
    ),
    Bun.write(path.join(input.dir, "expected-output.md"), input.task.expectedOutput),
    Bun.write(
      path.join(input.dir, "agent-final-message.md"),
      input.run ? (input.run.finalText ?? "(агент не вернул финального текста)") : stub,
    ),
    Bun.write(path.join(input.dir, "tools-summary.md"), input.run ? toolsSummary(input.run) : stub),
    Bun.write(path.join(input.dir, "node-readbacks.md"), input.run ? nodeReadbacks(input.run) : stub),
    cp(verdictSchemaFile, path.join(input.dir, "verdict.schema.json")),
    cp(input.artifactDir, path.join(input.dir, "artifact"), { recursive: true }),
  ])
  if (!(await unzip(path.join(input.task.dir, input.task.reference), path.join(input.dir, "reference"))))
    throw new EvalFailure(`${input.task.id}: эталон ${input.task.reference} не распакован или не содержит Unit.xml`, 1)
}

function toolsSummary(run: RunView) {
  const rows = run.tools.map(
    (tool) => `| ${tool.tool} | ${tool.action ?? tool.target ?? ""} | ${tool.status} | ${tool.error ?? ""} |`,
  )
  return ["| Инструмент | action / тип узла | Статус | Ошибка |", "|---|---|---|---|", ...rows].join("\n")
}

function nodeReadbacks(run: RunView) {
  const blocks = run.nodeReceipts.map((receipt, index) => `## Квитанция ${index + 1}\n\n\`\`\`json\n${receipt}\n\`\`\``)
  const dropped = run.nodeReceiptsDropped ? `\n\n_Отброшено старших квитанций: ${run.nodeReceiptsDropped}_` : ""
  return blocks.length ? blocks.join("\n\n") + dropped : "Квитанций выполнения узлов нет."
}

export async function judgeTask(input: {
  task: Task
  run?: RunView
  artifactDir: string
  prompt: string
  outDir: string
  judge: JudgeSettings
  signal?: AbortSignal
  checklist?: ChecklistItem[]
  judgeAttemptsUsed?: 0 | 1 | 2
  judgeTransportError?: boolean
  saveJudgeFields?: (fields: Partial<Pick<AttemptResult, "judge_attempts" | "judge_status" | "judge_transport_error" | "score" | "pass" | "structural_score" |
    "judge_confidence" | "judge_summary" | "checklist" | "oracle_pass" | "oracle_error">>) => Promise<void>
}) {
  return judgeInvocation(input)
}

async function judgeInvocation(input: Parameters<typeof judgeTask>[0], admit?: () => void) {
  if (input.judgeAttemptsUsed === 2 && (!input.judge.transportReserve || !input.judgeTransportError))
    return { ok: false as const, error: "Judge invocation budget exhausted", attempts: 2 as const, exhausted: input.judge.transportReserve === true }
  const checklist = input.checklist ?? input.task.checklist
  const checked = input.run ? await checkOracle(input.task, input.artifactDir) : { passed: null, error: null }
  const oracle = { oracle_pass: checked.passed, oracle_error: checked.error }
  await prepareJudgeDir({ ...input, dir: input.outDir, checklist })
  admit?.()
  for (let attempt = (input.judgeAttemptsUsed ?? 0) + 1; attempt <= 3; attempt++) {
    await input.saveJudgeFields?.({ judge_attempts: attempt, judge_transport_error: false })
    const result = await invoke(input, checklist, attempt, oracle)
    if (result.ok) return { ...result, pass: result.pass && checked.passed !== false, ...oracle, attempts: attempt }
    const transport = "transportError" in result && result.transportError === true
    if (input.signal?.aborted || "cleanupUnconfirmed" in result) return { ...result, ...oracle, attempts: attempt }
    if (attempt === 1 || attempt === 2 && input.judge.transportReserve && transport) continue
    return { ...result, ...oracle, attempts: attempt, exhausted: input.judge.transportReserve === true }
  }
  throw Error("JUDGE_BUDGET_INVALID")
}
export type Judged = Awaited<ReturnType<typeof judgeTask>> | { ok: false; error: string; attempts: 0; cleanupUnconfirmed?: true }

export function createJudgeGate() {
  let sequence = Promise.resolve()
  let poisoned = false
  return (input: Parameters<typeof judgeTask>[0]): Promise<Judged> => {
    const previous = sequence
    const finished = Promise.withResolvers<void>()
    // Cancelled waiters return early; later judges must still await their predecessor.
    sequence = previous.then(() => finished.promise)
    const cancelled = Promise.withResolvers<void>()
    const abort = () => cancelled.resolve()
    input.signal?.addEventListener("abort", abort, { once: true })
    if (input.signal?.aborted) abort()
    return Promise.race([previous, cancelled.promise]).then<Judged>(() => {
      if (input.signal?.aborted) return { ok: false, error: "interrupted before judge", attempts: 0 }
      if (poisoned) return { ok: false, error: "Judge gate blocked by unconfirmed cleanup", attempts: 0, cleanupUnconfirmed: true }
      let admitted = false
      return judgeInvocation(input, () => { admitted = true }).then(result => {
        if ("cleanupUnconfirmed" in result && result.cleanupUnconfirmed) poisoned = true
        return result
      }).catch((error: unknown) => {
        if (!admitted) throw error
        // An exception can happen after spawning, before the cleanup outcome reaches this gate.
        poisoned = true
        return { ok: false, error: "Judge invocation failed without confirmed result", attempts: 0, cleanupUnconfirmed: true }
      })
    }).finally(() => {
      input.signal?.removeEventListener("abort", abort)
      finished.resolve()
    })
  }
}

export function judgedFields(judged: Judged) {
  if (judged.ok)
    return {
      score: judged.score,
      structural_score: judged.structural_score,
      pass: judged.pass,
      judge_status: "scored" as const,
      judge_attempts: judged.attempts,
      judge_confidence: judged.verdict.confidence,
      judge_summary: judged.verdict.summary,
      checklist: judged.items,
      oracle_pass: judged.oracle_pass,
      oracle_error: judged.oracle_error,
    }
  return {
    ...("cleanupUnconfirmed" in judged && judged.cleanupUnconfirmed ? { judge_cleanup_unconfirmed: true } : {}),
    judge_transport_error: "transportError" in judged && judged.transportError === true,
    score: null,
    structural_score: null,
    pass: "exhausted" in judged && judged.exhausted ? null : "oracle_pass" in judged && judged.oracle_pass === false ? false : null,
    judge_status: "exhausted" in judged && judged.exhausted ? "unscored" as const : "error" as const,
    judge_attempts: judged.attempts,
    judge_confidence: null,
    judge_summary: judged.error,
    checklist: null,
    oracle_pass: "oracle_pass" in judged ? judged.oracle_pass : null,
    oracle_error: "oracle_error" in judged ? judged.oracle_error : null,
  }
}

async function invoke(
  input: Parameters<typeof judgeTask>[0],
  checklist: ChecklistItem[],
  attempt: number,
  oracle: { oracle_pass: boolean | null; oracle_error: string | null },
) {
  const verdictPath = path.join(input.outDir, "verdict.json")
  await rm(verdictPath, { force: true })
  const processDir = path.join(path.dirname(input.outDir), `judge-processes-${attempt}`)
  await mkdir(processDir, { recursive: true, mode: 0o700 })
  const artifactSha256 = input.judge.transportReserve ? await judgeArtifactHash(input.artifactDir) : undefined
  const supervised = await runJudge({
    cmd: judgeCommand({ command: input.judge.command, dir: input.outDir, model: input.judge.model, reasoning: input.judge.reasoning }),
    cwd: input.outDir, env: judgeEnvironment(input.judge.env),
    stdin: await Bun.file(path.join(input.outDir, "PROMPT.md")).text(),
    outDir: processDir,
    timeoutMs: input.judge.timeoutMs, signal: input.signal,
    owner: { kind: "judge", id: input.outDir },
  }, input.judge)
  try {
    if (input.judge.transportReserve) await writeLeaseReceipt(path.join(processDir, "outcome.json"), {
      version: 1, attempt, judgeDir: input.outDir, artifactSha256,
      verdictSha256: await judgeVerdictHash(verdictPath), exitCode: supervised.exitCode,
      cleanupConfirmed: supervised.cleanupConfirmed,
      judge: { model: input.judge.model, reasoning: input.judge.reasoning, timeoutMs: input.judge.timeoutMs, passThreshold: input.judge.passThreshold },
    })
    if (!supervised.cleanupConfirmed) return { ok: false as const,
      error: `Judge process cleanup unconfirmed: ${supervised.cleanupError ?? "unknown"}`, cleanupUnconfirmed: true }
    const exitCode = supervised.exitCode
    if (exitCode !== 0) return { ok: false as const, error: `судья завершился кодом ${exitCode}`,
      transportError: !supervised.timedOut && !supervised.interrupted && !(await Bun.file(verdictPath).exists()) &&
        /stream disconnected before completion: Transport error: network error:|TLS handshake timeout|connection reset by peer/.test(supervised.stderr + "\n" + supervised.stdout) }
    const file = Bun.file(verdictPath)
    if (!(await file.exists())) return { ok: false as const, error: "verdict.json не создан" }
    const verdict = parseVerdict(await file.text())
    if (!verdict) return { ok: false as const, error: "verdict.json не соответствует схеме" }
    const scored = scoreVerdict(checklist, verdict, input.judge.passThreshold)
    if (!scored.ok) return { ok: false as const, error: scored.error }
    await input.saveJudgeFields?.(judgedFields({ ...scored, verdict, ...oracle, pass: scored.pass && oracle.oracle_pass !== false, attempts: attempt }))
    return { ...scored, verdict }
  } finally {
    await Promise.all([[`judge-events-${attempt}.jsonl`, supervised.stdout], [`judge-stderr-${attempt}.txt`, supervised.stderr]].map(async ([file, content]) => {
      await Bun.write(path.join(path.dirname(input.outDir), file!), content!).catch((error: unknown) => {
        console.error(`Judge diagnostic copy failed (${file}): ${error instanceof Error ? error.message : String(error)}`)
      })
    }))
  }
}

async function judgeArtifactHash(directory: string) {
  const files = (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: directory, onlyFiles: true }))).sort()
  const hasher = new Bun.CryptoHasher("sha256")
  for (const file of files) {
    const bytes = await Bun.file(path.join(directory, file)).bytes()
    hasher.update(JSON.stringify([file, bytes.length])).update(bytes)
  }
  return hasher.digest("hex")
}

async function judgeVerdictHash(file: string) {
  return await Bun.file(file).exists() ? new Bun.CryptoHasher("sha256").update(await Bun.file(file).bytes()).digest("hex") : null
}

export async function recoverJudgeOutcome(input: { task: Task; artifactDir: string; outDir: string;
  judge: Pick<JudgeSettings, "model" | "reasoning" | "timeoutMs" | "passThreshold"> }) {
  const outcome = await readLeaseReceipt(path.join(path.dirname(input.outDir), "judge-processes-3/outcome.json")).catch(() => undefined) as
    { version?: number; attempt?: number; judgeDir?: string; artifactSha256?: string; verdictSha256?: string | null; exitCode?: number; cleanupConfirmed?: boolean;
      judge?: { model?: string; reasoning?: string; timeoutMs?: number; passThreshold?: number } } | undefined
  if (!outcome || outcome.version !== 1 || outcome.attempt !== 3 || outcome.judgeDir !== input.outDir || outcome.cleanupConfirmed !== true ||
    !Number.isSafeInteger(outcome.exitCode) || outcome.artifactSha256 !== await judgeArtifactHash(input.artifactDir) ||
    outcome.judge?.model !== input.judge.model || outcome.judge.reasoning !== input.judge.reasoning ||
    outcome.judge.timeoutMs !== input.judge.timeoutMs || outcome.judge.passThreshold !== input.judge.passThreshold ||
    outcome.verdictSha256 !== await judgeVerdictHash(path.join(input.outDir, "verdict.json")))
    throw new EvalFailure("PENDING_JUDGE_OUTCOME_UNCONFIRMED", 2)
  const checked = await checkOracle(input.task, input.artifactDir)
  const oracle = { oracle_pass: checked.passed, oracle_error: checked.error }
  const verdict = outcome.exitCode === 0 && outcome.verdictSha256 !== null
    ? parseVerdict(await Bun.file(path.join(input.outDir, "verdict.json")).text()) : undefined
  const scored = verdict ? scoreVerdict(input.task.checklist, verdict, input.judge.passThreshold) : undefined
  if (scored?.ok && verdict) return { ...scored, verdict, ...oracle, pass: scored.pass && checked.passed !== false, attempts: 3 }
  return { ok: false as const, error: "JUDGE_BUDGET_EXHAUSTED", exhausted: true, attempts: 3, ...oracle }
}

async function runJudge(input: Parameters<typeof superviseProcess>[0] & { timeoutMs: number; stdin?: string },
  judge: Pick<JudgeSettings, "systemd">) {
  if (judge.systemd) return runJudgeUnit({ ...input, env: { ...childEnvironment(input.env),
    ...(input.env.CODEX_HOME ? { CODEX_HOME: input.env.CODEX_HOME } : {}) } })
  const result = await superviseProcess(input)
  return { ...result, cleanupConfirmed: result.processCleanup.status === "confirmed" && result.processCleanup.capture_complete,
    cleanupError: result.processCleanup.error }
}
