import { nodeOpsHelp, runNodeEvalOps } from "../src/node-eval-ops"

if (process.argv.slice(2).includes("--help")) console.log(nodeOpsHelp)
else {
  const result = await runNodeEvalOps(process.argv.slice(2))
  console.log(JSON.stringify(result))
  process.exitCode = result.code
}
