import path from "node:path"
import { lstat, readdir, realpath } from "node:fs/promises"
import { baselineHash, BaselineFailure } from "./baseline"
import { loadTasks } from "./task"
import { parseVerdict, scoreVerdict } from "./judge"
import { checkOracle } from "./oracle"
import { validateNodeRun } from "./node-evals"
import type { RunSummary } from "./report"

// These files define scoring, not operational scheduling. Old series are read at their exact Git revision.
export const evaluatorFiles = ["evaluation.ts", "judge.ts", "judge-prompt.md", "verdict.schema.json", "oracle.ts", "task.ts", "report.ts",
  "node-evals.ts", "node-xml.ts", "node-evidence.ts", "node-events.ts", "node-bindings.ts", "node-cases.ts"]

export async function evaluatorFingerprint(checkout: string, sha?: string) {
  const files = await Promise.all(evaluatorFiles.map(async file => {
    if (!sha) return [file, baselineHash(await Bun.file(path.join(checkout, "evals/src", file)).bytes())]
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new BaselineFailure("EVALUATOR_REVISION_REQUIRED")
    const process = Bun.spawn(["git", "-C", checkout, "show", `${sha}:evals/src/${file}`], { stdout: "pipe", stderr: "pipe" })
    const bytes = new Uint8Array(await new Response(process.stdout).arrayBuffer())
    if (await process.exited !== 0) throw new BaselineFailure("EVALUATOR_SOURCE_UNAVAILABLE")
    return [file, baselineHash(bytes)]
  }))
  return baselineHash(JSON.stringify(files))
}

/** Replays deterministic scoring of existing evidence. It never dispatches an agent or a judge. */
export async function replayEvaluatorEvidence(checkout: string, sources: { regularRun: string; nodeRun: string }, threshold: number) {
  const before = await replaySourceHashes(sources)
  const regularSummary = await Bun.file(path.join(sources.regularRun, "summary.json")).json() as RunSummary
  const regularTask = regularSummary.tasks?.[0]
  const attempt = regularTask?.attempts?.[0]
  if (regularSummary.task_ids?.length !== 1 || regularTask?.id !== "calc-data-double" || regularTask.attempts.length !== 1 ||
    attempt?.attempt !== 1 || attempt.status !== "completed" || attempt.judge_status === "error") throw new BaselineFailure("REGULAR_REPLAY_SOURCE_REQUIRED")
  const task = (await loadTasks(path.join(checkout, "evals/tasks"), [regularTask.id]))[0]!
  const out = path.join(sources.regularRun, task.id, "1")
  const verdict = parseVerdict(await Bun.file(path.join(out, "judge/verdict.json")).text())
  if (!verdict) throw new BaselineFailure("REGULAR_REPLAY_FAILED")
  const scored = scoreVerdict(task.checklist, verdict, threshold)
  const oracle = await checkOracle(task, path.join(out, "artifact"))
  if (!scored.ok || scored.score !== attempt.score || (scored.pass && oracle.passed !== false) !== attempt.pass ||
    (attempt.oracle_pass ?? null) !== oracle.passed) throw new BaselineFailure("REGULAR_REPLAY_FAILED")
  const node = await validateNodeRun(sources.nodeRun, ["crosstable-fixed-sum"], path.join(checkout, "evals/tasks/node-evals"))
  if (node.code !== 0) throw new BaselineFailure("NODE_REPLAY_FAILED")
  if (JSON.stringify(before) !== JSON.stringify(await replaySourceHashes(sources))) throw new BaselineFailure("REPLAY_SOURCE_CHANGED")
  const nodeSummary = await Bun.file(path.join(sources.nodeRun, "summary.json")).json() as RunSummary
  return { version: 1 as const, status: "VERIFIED" as const, modelCalls: 0 as const, threshold, sources, files: before,
    evaluatorSha256: await evaluatorFingerprint(checkout),
    mode: [regularSummary, nodeSummary].every(summary => summary.agent?.cli_mode === "binary" && summary.harness?.dirty === false) ? "live" : "fixture",
    regular: { score: scored.score, pass: scored.pass && oracle.passed !== false, oracle: oracle.passed }, node: { code: node.code, verdict: node.verdict } }
}

export async function verifyEvaluatorReplay(file: string, checkout: string, threshold: number) {
  const info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid?.() || info.mode & 0o077 || await realpath(file) !== file)
    throw new BaselineFailure("REPLAY_PATH_REFUSED")
  const saved = await Bun.file(file).json() as Awaited<ReturnType<typeof replayEvaluatorEvidence>>
  const current = await replayEvaluatorEvidence(checkout, saved.sources, threshold)
  if (JSON.stringify(current) !== JSON.stringify(saved)) throw new BaselineFailure("REPLAY_EVIDENCE_CHANGED")
  return current
}

async function replaySourceHashes(sources: { regularRun: string; nodeRun: string }) {
  const walk = async (root: string, directory: string): Promise<{ path: string; sha256: string }[]> => {
    const files = await Promise.all((await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name)).map(async item => {
      const file = path.join(directory, item.name)
      if (item.isSymbolicLink()) throw new BaselineFailure("REPLAY_SYMLINK_REFUSED")
      if (item.isDirectory()) return walk(root, file)
      if (!item.isFile()) throw new BaselineFailure("REPLAY_FILE_REFUSED")
      return [{ path: path.relative(root, file), sha256: baselineHash(await Bun.file(file).bytes()) }]
    }))
    return files.flat()
  }
  return Promise.all(Object.values(sources).map(async root => {
    if (!path.isAbsolute(root) || await realpath(root) !== root) throw new BaselineFailure("REPLAY_PATH_REFUSED")
    return { root, files: await walk(root, root) }
  }))
}
