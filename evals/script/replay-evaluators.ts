import { parseArgs } from "node:util"
import { writeFile } from "node:fs/promises"
import { replayEvaluatorEvidence } from "../src/evaluator-replay"

try {
  const args = parseArgs({ args: Bun.argv.slice(2), strict: true, options: { checkout: { type: "string" }, regular: { type: "string" }, node: { type: "string" }, out: { type: "string" } } }).values
  if (!args.checkout || !args.regular || !args.node || !args.out) throw Error("REPLAY_ARGUMENTS_REQUIRED")
  const proof = await replayEvaluatorEvidence(args.checkout, { regularRun: args.regular, nodeRun: args.node }, 70)
  await writeFile(args.out, JSON.stringify(proof), { flag: "wx", mode: 0o400 })
  console.log(JSON.stringify({ status: proof.status, mode: proof.mode, modelCalls: proof.modelCalls, evaluatorSha256: proof.evaluatorSha256, proof: args.out }))
} catch {
  console.error("EVALUATOR_REPLAY_BLOCKED")
  process.exitCode = 2
}
