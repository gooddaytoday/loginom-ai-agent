import { BaselineFailure, judgeBaselineRecovery } from "../src/baseline"

const result = await judgeBaselineRecovery(process.argv[2]!, process.argv[3]!, process.argv[4]!).catch(error => ({
  code: 2, status: "BLOCKED", reason: error instanceof BaselineFailure ? error.message : "JUDGE_OPERATION_FAILED",
}))
console.log(JSON.stringify(result))
process.exitCode = result.code
