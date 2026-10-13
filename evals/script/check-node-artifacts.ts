import { validateNodeAttempt } from "../src/node-evals"

const [taskDir, attemptDir, packagePath] = process.argv.slice(2)
try {
  if (!taskDir || !attemptDir) throw Error("usage: bun script/check-node-artifacts.ts <taskDir> <attemptDir> [remotePackagePath]")
  const result = await validateNodeAttempt(taskDir, attemptDir, packagePath)
  const code = result.errors.length ? 2 : result.failures.length ? 1 : 0
  console.log(JSON.stringify({ verdict: code === 2 ? "ERROR" : code === 1 ? "FAIL" : "PASS", ...result }, null, 2))
  process.exitCode = code
} catch (error) { console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 2 }
