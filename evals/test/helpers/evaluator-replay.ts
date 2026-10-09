import { cp } from "node:fs/promises"
import path from "node:path"
import { evalsRoot } from "../../src/config"
import { loadTasks } from "../../src/task"

export async function replayFixture(directory: string) {
  const regularRun = path.join(directory, "regular")
  const nodeRun = path.join(directory, "node")
  const task = (await loadTasks(path.join(evalsRoot, "tasks"), ["calc-data-double"]))[0]!
  await Bun.write(path.join(regularRun, "summary.json"), JSON.stringify({ task_ids: [task.id], tasks: [{ id: task.id, attempts: [{ attempt: 1, status: "completed", score: 100, pass: true, oracle_pass: null }] }] }))
  await Bun.write(path.join(regularRun, task.id, "1/judge/verdict.json"), JSON.stringify({ confidence: "high", summary: "saved fixture verdict", checklist: task.checklist.map(item => ({ id: item.id, passed: true, evidence: "fixture" })) }))
  const out = path.join(nodeRun, "crosstable-fixed-sum/1")
  await cp(path.join(evalsRoot, "tasks/node-evals/crosstable-fixed-sum/reference.lgp"), path.join(out, "artifact/package.lgp"), { recursive: true })
  const proc = Bun.spawn(["unzip", "-q", path.join(out, "artifact/package.lgp"), "-d", path.join(out, "artifact/unpacked")], { stdout: "pipe", stderr: "pipe" })
  if (await proc.exited) throw Error("FIXTURE_UNZIP_FAILED")
  const protocol = await Bun.file(path.join(evalsRoot, "test/fixtures/node-evals/fixed-sum-protocol.json")).json() as unknown[]
  await Bun.write(path.join(out, "events.jsonl"), protocol.map(event => JSON.stringify(event)).join("\n"))
  await Bun.write(path.join(out, "artifact/results/node-evals-crosstable-fixed-sum-3.result.csv"), await Bun.file(path.join(evalsRoot, "tasks/node-evals/crosstable-fixed-sum/oracle.csv")).bytes())
  await Bun.write(path.join(out, "cleanup.json"), JSON.stringify({ result: { status: "confirmed" }, processes: { status: "confirmed" }, stages: ["processes", "diagnostics", "writer", "ready", "profile_history"].map(stage => ({ stage, status: "confirmed" })) }))
  await Bun.write(path.join(nodeRun, "summary.json"), JSON.stringify({ task_ids: ["crosstable-fixed-sum"], config: { repeat: 1 }, storage_leftovers: [], tasks: [{ id: "crosstable-fixed-sum", attempts: [{ attempt: 1, status: "completed", package_path: "/user/node-evals-crosstable-fixed-sum-3.lgp", environment_cleanup: { status: "confirmed" } }] }] }))
  return { regularRun, nodeRun }
}

