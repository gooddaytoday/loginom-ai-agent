import { parseArgs } from "node:util"
import path from "node:path"
import { collectHostResources, loadResourceContainers } from "../src/parallel-resources"
import { loadResourceSlots } from "../src/slots"
import { EvalFailure } from "../src/fail"
import { globalLockRoot } from "../src/lease"

try {
  if (Object.keys(process.env).some(key => /^(LOGINOM_|EVAL_|JUDGE_|FAKE_CODEX_|OPENAI_|ANTHROPIC_|CODEX_)/.test(key)))
    throw new EvalFailure("RESOURCE_ENVIRONMENT_PRIVATE", 2)
  const args = parseArgs({ args: process.argv.slice(2), options: {
    config: { type: "string" }, out: { type: "string" }, "interval-ms": { type: "string" },
    "run-id": { type: "string" }, phase: { type: "string" },
  } })
  const phase = args.values.phase
  if (!args.values.config || !args.values.out || phase !== undefined && phase !== "before" && phase !== "run" && phase !== "after")
    throw new EvalFailure("RESOURCE_ARGUMENTS", 2)
  const file = await loadResourceSlots(path.resolve(args.values.config))
  const out = path.resolve(args.values.out)
  if ([globalLockRoot, path.resolve(args.values.config), file.controller.adminCredentialsFile, file.judge.codexHome,
    ...(file.auth ? [file.auth.sharedDir] : []), ...file.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir])]
    .some(root => out === root || out.startsWith(root + path.sep) || root.startsWith(out + path.sep)))
    throw new EvalFailure("RESOURCE_OUTPUT_EXPOSED", 2)
  const containers = await loadResourceContainers(file)
  const controller = new AbortController()
  const abort = () => controller.abort()
  process.on("SIGINT", abort)
  process.on("SIGTERM", abort)
  try {
    const result = await collectHostResources({ out, containers, intervalMs: Number(args.values["interval-ms"] ?? 1000),
      runId: args.values["run-id"] ?? null, phase: phase ?? null, signal: controller.signal,
      paths: [file.controller.stateDir, ...file.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir])] })
    console.log(JSON.stringify(result))
  } finally { process.off("SIGINT", abort); process.off("SIGTERM", abort) }
} catch (error) {
  console.error(error instanceof EvalFailure ? error.message : "RESOURCE_COMMAND_FAILED")
  process.exitCode = 2
}
