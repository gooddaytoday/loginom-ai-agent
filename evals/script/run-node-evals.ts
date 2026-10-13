import { runNodeEvals } from "../src/node-runner"

const argv = process.argv.slice(2)
if (argv.includes("--help")) {
  console.log("bun script/run-node-evals.ts [--tasks ./tasks/node-evals] [--only id,...] [--label text] [--timeout-ms number] [--parallel N]\nEVAL_SLOTS_FILE selects a prepared slot config; --parallel uses its first N slots. Runs one attempt per selected case, mandatory --skip-judge, then writes code-verdict.json and code-report.md. Exit: PASS=0 FAIL=1 ERROR=2.")
} else {
  const result = await runNodeEvals(argv, process.env)
  if (result.error) console.error(`ERROR: ${result.error}`)
  if (result.runDir) console.log(`Code verdict: ${result.runDir}/code-verdict.json`)
  process.exitCode = result.code
}
