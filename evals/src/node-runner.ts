import path from "node:path"
import { main } from "./run"
import { evalsRoot, loadConfig } from "./config"
import { loadTasks } from "./task"
import { validateNodeRun } from "./node-evals"
import { coverageCaseIds, nodeCaseIds } from "./node-cases"
import { collectNodeNativeEvidence } from "./node-native"
import { textImportIds, textImportChecks, collectTextImportEvidence, assertTextImportModel } from "./text-import"
import type { RunSummary } from "./report"

export async function runNodeEvals(argv: string[], env: Record<string, string | undefined>, options?: Parameters<typeof main>[2]) {
  const state = { runDir: null as string | null }
  try { return await executeNodeEvals(argv, options?.fixture ? { ...env, EVAL_SLOTS_FILE: env.EVAL_SLOTS_FILE ?? "fixture-programmatic-only" } : env, options, state) }
  catch (error) { return { code: 2, runDir: state.runDir, error: error instanceof Error ? error.message : String(error) } }
}

async function executeNodeEvals(argv: string[], env: Record<string, string | undefined>, options: Parameters<typeof main>[2], state: { runDir: string | null }) {
  if (argv.some((arg) => ["--calibrate", "--judge-only", "--keep-storage", "--dry-run", "--reset-profile"].includes(arg.split("=")[0]!)))
    return { code: 2, runDir: null, error: "unsupported mode: code-only live runner" }
  const args = ["--tasks", path.join(evalsRoot, "tasks/node-evals"), ...argv, "--skip-judge", "--repeat", "1"]
  const config = loadConfig(args, env)
  const tasks = await loadTasks(config.tasksDir, config.only)
  if (tasks.some(task => textImportIds.includes(task.id))) assertTextImportModel(config)
  for (const task of tasks) {
    if (!(nodeCaseIds as readonly string[]).includes(task.id) && !textImportIds.includes(task.id)) throw Error(`unsupported node case: ${task.id}`)
    for (const item of task.checklist) if (item.required && !(textImportIds.includes(task.id) ? textImportChecks : ["input", "crosstable", "graph", "export", "result", "sequence"]).includes(item.id))
      throw Error(`unknown required ID: ${item.id}`)
  }
  const run = await main(args, env, options)
  state.runDir = run.runDir
  const summary=await Bun.file(path.join(run.runDir,"summary.json")).json() as RunSummary
  for (const task of summary.tasks) for (const attempt of task.attempts) {
    if (attempt.status !== "completed" || attempt.environment_cleanup?.status !== "confirmed") continue
    const slot = summary.slots?.find(slot => slot.id === attempt.slot_id)
    if (summary.slots && !slot || (summary.config.parallel ?? 1) > 1 && !summary.slots)
      throw Error("Unknown node evidence slot")
    if (task.id === "crosstable-min-max" || coverageCaseIds.includes(task.id))
      await collectNodeNativeEvidence(path.join(run.runDir, task.id, String(attempt.attempt)), slot?.profileDir ?? config.profileDir, slot?.historyDir)
    if (textImportIds.includes(task.id))
      await collectTextImportEvidence(path.join(run.runDir, task.id, String(attempt.attempt)), slot?.profileDir ?? config.profileDir, slot?.historyDir)
  }
  const verdict = await validateNodeRun(run.runDir, tasks.map((task) => task.id), config.tasksDir)
  await Bun.write(path.join(run.runDir, "code-verdict.json"), JSON.stringify(verdict, null, 2) + "\n")
  await Bun.write(path.join(run.runDir, "code-report.md"), [
    `# Node eval: ${verdict.verdict}`, "", `Code: ${verdict.code}; generic harness: ${run.code}.`, "",
    ...verdict.attempts.map(a => `- ${a.task_id}#${a.attempt}: ${a.verdict}, status=${a.status}, cleanup=${a.cleanup}; session=${a.session_id ?? "unknown"}${a.infra_retry_initial ? `; initial infra retry=${a.infra_retry_initial.status}` : ""}`), "",
    ...verdict.errors.map((error) => `- ERROR: ${error}`), ...verdict.failures.map((failure) => `- FAIL: ${failure}`), "",
  ].join("\n"))
  return { code: verdict.code, runDir: run.runDir }
}
