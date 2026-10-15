import path from "node:path"
import { parseArgs } from "node:util"
import { readEvalrunnerConfig, qualifyEvalrunner, executeEvalrunner, checkEvalrunnerEvidence } from "../src/evalrunner"
import { prepareEvalrunnerSeries, runEvalrunnerSeries, checkEvalrunnerSeries } from "../src/evalrunner-controller"
import type { EvalrunnerSeriesScope } from "../src/evalrunner-series"

const { values, positionals } = parseArgs({ args: Bun.argv.slice(2), allowPositionals: true, options: {
  config: { type: "string" }, series: { type: "string" }, case: { type: "string" },
  issue: { type: "string" }, task: { type: "string" }, collection: { type: "string" },
  scope: { type: "string" }, baseline: { type: "string" }, help: { type: "boolean" },
} })
const command = positionals[0]
try {
  if (values.help) {
    console.log("prepare|smoke|run|check|status (legacy compatible)\nprepare-series --config FILE --issue ID --task ID --scope full|readiness-calc|readiness-node\nstart-series|resume-series|check-series --config FILE --series DIR --task ID\ncompare-series --config FILE --series DIR --baseline ARCHIVE")
  } else if (command === "check") {
    if (!values.series) throw Error("--series required")
    console.log(JSON.stringify(await checkEvalrunnerEvidence(values.series)))
  } else {
    if (!values.config) throw Error("--config required")
    const config = await readEvalrunnerConfig(values.config)
    if (command === "prepare-series") {
      if (!values.issue || !values.task || !["full", "readiness-calc", "readiness-node"].includes(values.scope ?? "")) throw Error("--issue --task --scope required")
      console.log(JSON.stringify(await prepareEvalrunnerSeries(config, { issue: values.issue, task: values.task, scope: values.scope as EvalrunnerSeriesScope })))
    } else if (command === "start-series" || command === "resume-series") {
      if (!values.series || !values.task) throw Error("--series --task required")
      console.log(JSON.stringify(await runEvalrunnerSeries(config, { series: values.series, task: values.task, resume: command === "resume-series" })))
    } else if (command === "check-series") {
      if (!values.series) throw Error("--series required")
      const result = await checkEvalrunnerSeries(config, values.series)
      console.log(JSON.stringify(result)); if (result.status !== "RELEASED") process.exitCode = 2
    } else if (command === "compare-series") {
      if (!values.series || !values.baseline) throw Error("--series --baseline required")
      const { compareEvalrunnerSeries } = await import("../src/evalrunner-compare")
      console.log(JSON.stringify(await compareEvalrunnerSeries(config, values.series, values.baseline)))
    } else if (command === "status") console.log(JSON.stringify({ status: await Bun.file(path.join(config.root, "operations/stand.lease/owner.json")).exists() ? "BUSY/BLOCKED" : "FREE" }))
    else if (command === "prepare") {
      const proof = await qualifyEvalrunner(config)
      console.log(JSON.stringify({ ...proof, env: undefined }))
    } else if (command === "smoke" || command === "run") {
      if (config.version === 2) throw Error("Version 2 uses versioned series admission; use start-series")
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
