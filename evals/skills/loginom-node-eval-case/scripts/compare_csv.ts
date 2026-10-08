// Сверяет файл результата с oracle.csv функцией compareCsv eval-harness. Печатает {"passed", "error"}.
import path from "node:path"

const [agentRepo, oracle, result, tolerance] = process.argv.slice(2)
if (!agentRepo || !oracle || !result || tolerance === undefined)
  throw new Error("usage: bun compare_csv.ts <agent_repo> <oracle.csv> <result> <tolerance>")
const { compareCsv } = await import(path.join(agentRepo, "evals/src/oracle.ts")) as typeof import("../../../src/oracle")
console.log(JSON.stringify(compareCsv(await Bun.file(oracle).text(), await Bun.file(result).text(), Number(tolerance))))
