import path from "node:path"
import { main } from "./run"
import { evalsRoot, loadConfig } from "./config"
import { loadTasks } from "./task"
import { validateNodeRun } from "./node-evals"

export async function runNodeEvals(argv: string[], env: Record<string, string | undefined>) {
  if (argv.some((arg) => ["--calibrate", "--judge-only", "--keep-storage", "--dry-run", "--reset-profile"].includes(arg.split("=")[0]!)))
    return { code: 2, runDir: null, error: "unsupported mode: code-only live runner" }
  const args = ["--tasks", path.join(evalsRoot, "tasks/node-evals"), ...argv, "--skip-judge", "--repeat", "1"]
  const config = loadConfig(args, env)
  const tasks = await loadTasks(config.tasksDir, config.only)
  const run = await main(args, env)
  const verdict = await validateNodeRun(run.runDir, tasks.map((task) => task.id), config.tasksDir)
  await Bun.write(path.join(run.runDir, "code-verdict.json"), JSON.stringify(verdict, null, 2) + "\n")
  await Bun.write(path.join(run.runDir, "code-report.md"), [
    `# Node eval: ${verdict.verdict}`, "", `Code: ${verdict.code}; generic harness: ${run.code}.`, "",
    ...verdict.errors.map((error) => `- ERROR: ${error}`), ...verdict.failures.map((failure) => `- FAIL: ${failure}`), "",
  ].join("\n"))
  return { code: verdict.code, runDir: run.runDir }
}
