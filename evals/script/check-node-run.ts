import { validateNodeRun } from "../src/node-evals"

const [runDir, ids, tasksDir] = process.argv.slice(2)
if (!runDir || !ids) { console.error("usage: bun script/check-node-run.ts <runDir> <comma-separated case IDs> [tasksDir]"); process.exitCode = 2 }
else {
  const result = await validateNodeRun(runDir, ids.split(","), tasksDir)
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.code
}
