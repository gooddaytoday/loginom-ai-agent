import { parseArgs } from "node:util"
import { readFile, writeFile } from "node:fs/promises"
import { compareMultiOutput } from "./multi-output-oracle.mjs"

const args = parseArgs({ options: {
  expected: { type: "string" }, observation: { type: "string" }, output: { type: "string" },
}, strict: true }).values
if (!args.expected || !args.observation || !args.output)
  throw Error("Required: --expected --observation --output")
const result = compareMultiOutput(
  JSON.parse(await readFile(args.expected, "utf8")),
  JSON.parse(await readFile(args.observation, "utf8")),
)
await writeFile(args.output, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 })
console.log(JSON.stringify(result))
process.exitCode = result.status === "PASS" ? 0 : 1
