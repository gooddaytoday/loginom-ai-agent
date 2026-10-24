import { parseArgs } from "node:util"
import path from "node:path"
import { lstat, mkdir, realpath } from "node:fs/promises"
import { EvalFailure } from "../src/fail"
import { globalLockRoot, readLeaseReceipt, writeLeaseReceipt } from "../src/lease"
import { loadResourceSlots } from "../src/slots"
import { readEnvironmentStatus } from "../src/parallel-status"

try {
  const args = parseArgs({ args: process.argv.slice(2), allowPositionals: true, options: {
    config: { type: "string" }, incident: { type: "string" }, out: { type: "string" }, parallel: { type: "string" },
  } })
  const command = args.positionals[0]
  if (args.positionals.length !== 1 || !["status", "prepare", "verify"].includes(command ?? "") || !args.values.config ||
    (command === "prepare" || command === "verify") && (!args.values.out || args.values.incident || args.values.parallel !== undefined &&
      (!/^[1-9][0-9]*$/.test(args.values.parallel) || !Number.isSafeInteger(Number(args.values.parallel)))) ||
    command === "status" && (args.values.incident || args.values.out || args.values.parallel))
    throw new EvalFailure("PARALLEL_ENV_ARGUMENTS", 2)
  const slotsFile = path.resolve(args.values.config)
  const file = await loadResourceSlots(slotsFile)
  if (command === "status") console.log(JSON.stringify(await readEnvironmentStatus(file)))
  if (command !== "status") {
    const out = path.resolve(args.values.out!)
    if ([globalLockRoot, slotsFile, file.controller.stateDir, file.controller.adminCredentialsFile, file.judge.codexHome,
      ...(file.auth ? [file.auth.sharedDir] : []), ...file.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir])]
      .some(root => out === root || out.startsWith(root + path.sep) || root.startsWith(out + path.sep)))
      throw new EvalFailure("PARALLEL_ENV_OUTPUT_EXPOSED", 2)
    const parent = await lstat(path.dirname(out))
    if (!parent.isDirectory() || parent.uid !== process.getuid?.() || (parent.mode & 0o777) !== 0o700 || await realpath(path.dirname(out)) !== path.dirname(out))
      throw new EvalFailure("PARALLEL_ENV_OUTPUT_PRIVATE", 2)
    await mkdir(out, { mode: 0o700 }).catch(() => { throw new EvalFailure("PARALLEL_ENV_OUTPUT_PRIVATE", 2) })
    if (command === "prepare" || command === "verify") {
      const { prepareEnvironment, verifyEnvironment, EnvironmentFailure } = await import("../src/environment-preparation")
      const check = command === "prepare" ? prepareEnvironment : verifyEnvironment
      const receipt = await check({ slotsFile, parallel: Number(args.values.parallel ?? "1") }).catch(async error => {
        const failure = error instanceof EnvironmentFailure ? await readLeaseReceipt(error.receipt) : { version: 2,
          kind: command === "prepare" ? "environment-preparation" : "environment-verification", status: "failed", ready: false,
          reason: error instanceof EvalFailure ? error.message : "PREPARATION_FAILED", finalization: { status: "unconfirmed" } }
        if (!failure || typeof failure !== "object" || Array.isArray(failure)) throw new EvalFailure("PREPARATION_RECEIPT_UNCONFIRMED", 2)
        await writeLeaseReceipt(path.join(out, "receipt.json"), failure)
        throw error
      })
      await writeLeaseReceipt(path.join(out, "receipt.json"), receipt)
      console.log(JSON.stringify(receipt))
      process.exitCode = receipt.code
    }
  }
} catch (error) {
  console.error(error instanceof EvalFailure ? error.message : "PARALLEL_ENV_COMMAND_FAILED")
  process.exitCode = 2
}
