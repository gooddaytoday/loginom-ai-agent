import { validateLab57EquivalentGuard } from "../src/lab57-guard-provenance"

const args = Bun.argv.slice(2)
if (args.some(arg => arg.startsWith("--"))) {
  console.log(JSON.stringify({ status: "SOURCE_ONLY", applied: false, reason: "MUTATION_NOT_IMPLEMENTED" }))
  process.exitCode = 2
} else if (args.length !== 2) {
  console.log(JSON.stringify({ status: "SOURCE_ONLY", applied: false, reason: "TWO_OFFLINE_INPUT_FILES_REQUIRED" }))
  process.exitCode = 2
} else {
  try {
    const proof = validateLab57EquivalentGuard(await Bun.file(args[0]!).json(), await Bun.file(args[1]!).json())
    console.log(JSON.stringify(proof))
    process.exitCode = proof.missing.length ? 2 : 0
  } catch {
    console.log(JSON.stringify({ status: "SOURCE_ONLY", applied: false, reason: "OFFLINE_INPUT_REFUSED" }))
    process.exitCode = 2
  }
}
