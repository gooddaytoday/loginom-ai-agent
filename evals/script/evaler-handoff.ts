import { evaluateHandoff } from "../src/evaler-handoff"

try {
  const filename = process.argv[2]
  if (!filename || process.argv.length !== 3) throw new Error("usage")
  const decision = evaluateHandoff(await Bun.file(filename).json())
  console.log(JSON.stringify(decision, null, 2))
  process.exitCode = decision.action === "blocked" ? 2 : 0
} catch {
  console.log(JSON.stringify({ action: "blocked", reason: "invalid handoff input; usage: bun script/evaler-handoff.ts <input.json>" }))
  process.exitCode = 2
}
