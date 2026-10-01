import path from "node:path"
import { cp, mkdir, rm } from "node:fs/promises"
import type { EvalConfig } from "./config"
import { evalsRoot } from "./config"
import type { ChecklistItem, Task } from "./task"
import type { AgentRun } from "./cli"
import { unzip } from "./artifact"
import { EvalFailure } from "./fail"
import { checkOracle } from "./oracle"

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
  return { ok: true as const, score, pass: score >= threshold && requiredPassed, items }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export async function judgeInfo(config: EvalConfig) {
  const version = await Bun.$`${config.judge.command} --version`.quiet().nothrow()
  return {
    backend: "codex" as const,
    codex_version: version.exitCode === 0 ? version.text().trim() : null,
    model: config.judge.model,
    reasoning: config.judge.reasoning,
    prompt_sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(judgePromptFile).bytes()).digest("hex"),
    schema_sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(verdictSchemaFile).bytes()).digest("hex"),
  }
}
export type JudgeInfo = Awaited<ReturnType<typeof judgeInfo>>

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
}) {
  const checklist = input.checklist ?? input.task.checklist
  const checked = input.run ? await checkOracle(input.task, input.artifactDir) : { passed: null, error: null }
  const oracle = { oracle_pass: checked.passed, oracle_error: checked.error }
  await prepareJudgeDir({ ...input, dir: input.outDir, checklist })
  const first = await invoke(input, checklist, 1)
  if (first.ok) return { ...first, pass: first.pass && checked.passed !== false, ...oracle, attempts: 1 as const }
  if (input.signal?.aborted) return { ok: false as const, error: first.error, ...oracle, attempts: 1 as const }
  const second = await invoke(input, checklist, 2)
  return second.ok
    ? { ...second, pass: second.pass && checked.passed !== false, ...oracle, attempts: 2 as const }
    : { ok: false as const, error: `${first.error}; повтор: ${second.error}`, ...oracle, attempts: 2 as const }
}
export type Judged = Awaited<ReturnType<typeof judgeTask>> | { ok: false; error: string; attempts: 0 }

export function judgedFields(judged: Judged) {
  if (judged.ok)
    return {
      score: judged.score,
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
    score: null,
    pass: "oracle_pass" in judged && judged.oracle_pass === false ? false : null,
    judge_status: "error" as const,
    judge_attempts: judged.attempts,
    judge_confidence: null,
    judge_summary: judged.error,
    checklist: null,
    oracle_pass: "oracle_pass" in judged ? judged.oracle_pass : null,
    oracle_error: "oracle_error" in judged ? judged.oracle_error : null,
  }
}

async function invoke(
  input: { outDir: string; judge: JudgeSettings; signal?: AbortSignal },
  checklist: ChecklistItem[],
  attempt: number,
) {
  const verdictPath = path.join(input.outDir, "verdict.json")
  await rm(verdictPath, { force: true })
  const proc = Bun.spawn(
    judgeCommand({ command: input.judge.command, dir: input.outDir, model: input.judge.model, reasoning: input.judge.reasoning }),
    {
      cwd: input.outDir,
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).flatMap(([key, value]) =>
            value === undefined || /^(LOGINOM_|EVAL_|JUDGE_|FAKE_CODEX_)/.test(key) ? [] : [[key, value] as const],
          ),
        ),
        ...input.judge.env,
      },
      stdin: Bun.file(path.join(input.outDir, "PROMPT.md")),
      stdout: Bun.file(path.join(path.dirname(input.outDir), `judge-events-${attempt}.jsonl`)),
      stderr: Bun.file(path.join(path.dirname(input.outDir), `judge-stderr-${attempt}.txt`)),
    },
  )
  const timer = setTimeout(() => proc.kill("SIGKILL"), input.judge.timeoutMs)
  const onAbort = () => proc.kill("SIGKILL")
  input.signal?.addEventListener("abort", onAbort, { once: true })
  if (input.signal?.aborted) proc.kill("SIGKILL")
  const exitCode = await proc.exited
  clearTimeout(timer)
  input.signal?.removeEventListener("abort", onAbort)
  if (exitCode !== 0) return { ok: false as const, error: `судья завершился кодом ${exitCode}` }
  const file = Bun.file(verdictPath)
  if (!(await file.exists())) return { ok: false as const, error: "verdict.json не создан" }
  const verdict = parseVerdict(await file.text())
  if (!verdict) return { ok: false as const, error: "verdict.json не соответствует схеме" }
  const scored = scoreVerdict(checklist, verdict, input.judge.passThreshold)
  if (!scored.ok) return { ok: false as const, error: scored.error }
  return { ...scored, verdict }
}
