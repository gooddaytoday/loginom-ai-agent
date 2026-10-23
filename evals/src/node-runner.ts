import path from "node:path"
import { main } from "./run"
import { evalsRoot, loadConfig } from "./config"
import { loadTasks } from "./task"
import { validateNodeRun } from "./node-evals"
import { nodeCaseIds } from "./node-cases"
import { textImportIds, textImportChecks, assertTextImportModel } from "./text-import"

export async function runNodeEvals(argv: string[], env: Record<string, string | undefined>) {
  const state = { runDir: null as string | null }
  try { return await executeNodeEvals(argv, env, state) }
  catch (error) { return { code: 2, runDir: state.runDir, error: error instanceof Error ? error.message : String(error) } }
}

async function executeNodeEvals(argv: string[], env: Record<string, string | undefined>, state: { runDir: string | null }) {
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
  const run = await main(args, env)
  state.runDir = run.runDir
  const verdict = await validateNodeRun(run.runDir, tasks.map((task) => task.id), config.tasksDir)
  await Bun.write(path.join(run.runDir, "code-verdict.json"), JSON.stringify(verdict, null, 2) + "\n")
  await Bun.write(path.join(run.runDir, "code-report.md"), [
    `# Node eval: ${verdict.verdict}`, "", `Code: ${verdict.code}; generic harness: ${run.code}.`, "",
    ...verdict.attempts.map(a => `- ${a.task_id}#${a.attempt}: ${a.verdict}, status=${a.status}, cleanup=${a.cleanup}; session=${a.session_id ?? "unknown"}${a.infra_retry_initial ? `; initial infra retry=${a.infra_retry_initial.status}` : ""}`), "",
    ...verdict.errors.map((error) => `- ERROR: ${error}`), ...verdict.failures.map((failure) => `- FAIL: ${failure}`), "",
  ].join("\n"))
  return { code: verdict.code, runDir: run.runDir }
}
