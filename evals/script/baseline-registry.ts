import { parseArgs } from "node:util"
import { acceptBaseline, acceptedBaseline } from "../src/baseline-registry"
import { BaselineFailure } from "../src/baseline"

if (Bun.argv.includes("--help")) {
  console.log("Operator only: baseline-registry.ts current --registry FILE | accept --registry FILE --series DIR --issue ID --decision REF --archive FILE --archive-sha256 HASH --expected-current ID|none")
  process.exit(0)
}
const values = parseArgs({ args: Bun.argv.slice(3), strict: true, options: Object.fromEntries(
  ["registry", "series", "issue", "decision", "archive", "archive-sha256", "expected-current"].map(name => [name, { type: "string" as const }])) }).values
const required = (key: string) => {
  const value = values[key]
  if (!value) throw new BaselineFailure("MISSING_ARGUMENT")
  return value
}
try {
  const result = Bun.argv[2] === "current" ? await acceptedBaseline(required("registry")) : Bun.argv[2] === "accept" ?
    await acceptBaseline(required("registry"), required("series"), { issue: required("issue"), decision: required("decision"),
      archive: required("archive"), archiveSha256: required("archive-sha256"),
      expectedCurrent: required("expected-current") === "none" ? null : required("expected-current") }) : undefined
  if (!result) throw new BaselineFailure("UNKNOWN_COMMAND")
  console.log(JSON.stringify({ status: "ACCEPTED", baseline: result }))
} catch (error) {
  console.log(JSON.stringify({ status: "BLOCKED", reason: error instanceof BaselineFailure ? error.message : "REGISTRY_OPERATION_FAILED" }))
  process.exitCode = 2
}
