import { parseArgs } from "node:util"
import path from "node:path"
import { createPair, destroyPair } from "../src/parallel-pair"
import { loadSlots } from "../src/slots"
import { globalLockRoot } from "../src/lease"
import { EvalFailure } from "../src/fail"

try {
  const args = parseArgs({ args: process.argv.slice(2), allowPositionals: true, options: {
    config: { type: "string" }, purpose: { type: "string" }, out: { type: "string" },
  } })
  const action = args.positionals[0]
  if (args.positionals.length !== 1 || !["create", "destroy"].includes(action ?? "") || !args.values.config || !args.values.out ||
    (args.values.purpose !== "acceptance" && args.values.purpose !== "research")) throw new EvalFailure("PAIR_ARGUMENTS", 2)
  const file = await loadSlots(path.resolve(args.values.config), 1)
  const options = { purpose: args.values.purpose, out: path.resolve(args.values.out), lockRoot: globalLockRoot } as const
  const receipt = action === "create" ? await createPair(file, options) : await destroyPair(file, options)
  console.log(JSON.stringify(receipt))
} catch (error) {
  // Docker/config inputs may contain private data; expose only stable diagnostic codes.
  console.error(error instanceof EvalFailure ? error.message : "PAIR_COMMAND_FAILED")
  process.exitCode = 2
}
