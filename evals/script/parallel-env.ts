import { parseArgs } from "node:util"
import path from "node:path"
import { lstat, mkdir, realpath } from "node:fs/promises"
import { EvalFailure } from "../src/fail"
import { globalLockRoot, writeLeaseReceipt } from "../src/lease"
import { loadResourceSlots } from "../src/slots"
import { recoverOfflineJudgeIncident } from "../src/judge-recovery"

try {
  const args = parseArgs({ args: process.argv.slice(2), allowPositionals: true, options: {
    config: { type: "string" }, incident: { type: "string" }, out: { type: "string" },
  } })
  if (args.positionals.length !== 1 || args.positionals[0] !== "recover" || !args.values.config || !args.values.incident || !args.values.out)
    throw new EvalFailure("PARALLEL_ENV_ARGUMENTS", 2)
  const slotsFile = path.resolve(args.values.config), out = path.resolve(args.values.out)
  const file = await loadResourceSlots(slotsFile)
  if ([globalLockRoot, slotsFile, file.controller.stateDir, file.controller.adminCredentialsFile, file.judge.codexHome,
    ...(file.auth ? [file.auth.sharedDir] : []), ...file.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir])]
    .some(root => out === root || out.startsWith(root + path.sep) || root.startsWith(out + path.sep)))
    throw new EvalFailure("PARALLEL_ENV_OUTPUT_EXPOSED", 2)
  const parent = await lstat(path.dirname(out))
  if (!parent.isDirectory() || parent.uid !== process.getuid?.() || (parent.mode & 0o777) !== 0o700 || await realpath(path.dirname(out)) !== path.dirname(out))
    throw new EvalFailure("PARALLEL_ENV_OUTPUT_PRIVATE", 2)
  await mkdir(out, { mode: 0o700 }).catch(() => { throw new EvalFailure("PARALLEL_ENV_OUTPUT_PRIVATE", 2) })
  const receipt = await recoverOfflineJudgeIncident({ slotsFile, journal: path.resolve(args.values.incident) })
  await writeLeaseReceipt(path.join(out, "receipt.json"), { version: 2, kind: "offline-judge-recovery-result", ...receipt })
  console.log(JSON.stringify(receipt))
} catch (error) {
  console.error(error instanceof EvalFailure ? error.message : "PARALLEL_ENV_COMMAND_FAILED")
  process.exitCode = 2
}
