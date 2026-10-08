import { runBaseline } from "../src/baseline"

const result = await runBaseline(process.argv.slice(2), process.env)
console.log(JSON.stringify(result))
process.exitCode = result.code
