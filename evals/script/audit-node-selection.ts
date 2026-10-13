import path from "node:path"
import { parseArgs } from "node:util"
import { inspectSelection } from "../src/node-selection"
import type { SelectionMode } from "../src/node-selection"
import { readNodeXml } from "../src/node-xml"
import { checkOracle } from "../src/oracle"
import { loadTasks } from "../src/task"

async function main() {
  const args = parseArgs({ options: {
    tasks: { type: "string" }, task: { type: "string" }, attempt: { type: "string" }, mode: { type: "string" },
  } }).values
  if (!args.tasks || !args.task || !args.attempt || !selectionMode(args.mode)) {
    throw Error("AUDIT_ARGUMENTS_INVALID")
  }
  const task = (await loadTasks(args.tasks, [args.task]))[0]!
  const snapshot = await Bun.file(path.join(args.attempt, "parts.json")).json().catch(() => null) as unknown
  const artifactDir = path.join(args.attempt, "artifact")
  const xml = await Bun.file(path.join(artifactDir, "package.lgp")).exists()
    ? await readNodeXml(artifactDir).catch(() => ({ invalid: "XML_READ_FAILED" })) : null
  const oracle = await checkOracle(task, artifactDir)
  const selection = inspectSelection({
    mode: args.mode,
    nodeTypes: xml && !("invalid" in xml) ? xml.nodes.map((node) => node.type) : null,
    parts: record(snapshot) && Array.isArray(snapshot.parts) ? snapshot.parts : [],
  })
  const result = {
    auditStage: "pilot", taskID: args.task, mode: args.mode, ...selection,
    policyStatus: selection.failures.includes("JAVASCRIPT_NOT_ALLOWED") ? "failed" : "incomplete",
    oraclePassed: oracle.passed, oracleError: oracle.error, calculationPassed: false,
    historyComplete: false, runtimeSettled: false,
    // Task 1B completes receipt/history validation using the first real pilot.
    failures: [...selection.failures,
      ...(record(snapshot) && Array.isArray(snapshot.parts) ? [] : ["SNAPSHOT_INVALID"]),
      ...(xml === null ? ["PACKAGE_MISSING"] : "invalid" in xml ? ["PACKAGE_XML_INVALID"] : []),
      "AUDIT_NOT_FINALIZED"],
  }
  await Bun.write(path.join(args.attempt, "selection-audit.json"), JSON.stringify(result, null, 2) + "\n")
  process.exitCode = result.policyStatus === "failed" ? 1 : 2
}

function selectionMode(value: unknown): value is SelectionMode {
  return typeof value === "string" && ["standard", "explicit-js", "capability-gap", "standard-recovery"].includes(value)
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

await main().catch(() => {
  console.error("NODE_SELECTION_AUDIT_FAILED")
  process.exitCode = 2
})
