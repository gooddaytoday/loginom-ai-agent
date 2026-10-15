import path from "node:path"
import { parseArgs } from "node:util"
import { readEvalrunnerConfig, qualifyEvalrunner, executeEvalrunner } from "../src/evalrunner"

const { values, positionals } = parseArgs({ args: Bun.argv.slice(2), allowPositionals: true, options: {
  config: { type: "string" }, series: { type: "string" }, case: { type: "string" },
  issue: { type: "string" }, task: { type: "string" }, collection: { type: "string" },
} })
const command = positionals[0]
try {
  if (command === "check") {
    if (!values.series) throw Error("--series required")
    const receipt = await Bun.file(path.join(values.series, "release.json")).json() as { runDir: string; summarySha256: string }
    const hash = new Bun.CryptoHasher("sha256").update(await Bun.file(path.join(receipt.runDir, "summary.json")).bytes()).digest("hex")
    if (hash !== receipt.summarySha256) throw Error("Evidence changed")
    console.log(JSON.stringify(receipt))
  } else {
    if (!values.config) throw Error("--config required")
    const config = await readEvalrunnerConfig(values.config)
    if (command === "status") console.log(JSON.stringify({ status: await Bun.file(path.join(config.root, "operations/stand.lease/owner.json")).exists() ? "BUSY/BLOCKED" : "FREE" }))
    else if (command === "prepare") {
      const proof = await qualifyEvalrunner(config)
      console.log(JSON.stringify({ ...proof, env: undefined }))
    } else if (command === "smoke" || command === "run") {
      if (!values.series || !values.case || !values.issue || !values.task) throw Error("--series --case --issue --task required")
      if (command === "smoke" && !["calc-data-double", "crosstable-fixed-sum"].includes(values.case)) throw Error("Unknown smoke")
      if (command === "smoke" && values.issue !== config.readinessIssue) throw Error("Readiness issue differs")
      console.log(JSON.stringify(await executeEvalrunner(config, { series: values.series, case: values.case, issue: values.issue, task: values.task, collection: values.collection })))
    } else throw Error("Expected prepare|smoke|run|check|status")
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "EvalRunner failed")
  process.exitCode = 2
}
