// Готовит рабочую папку попытки: копирует входы по basename и пишет промпт функцией buildAgentPrompt eval-harness.
import path from "node:path"

const [agentRepo, caseDir, work, packagePath, resultName] = process.argv.slice(2)
if (!agentRepo || !caseDir || !work || !packagePath || !resultName)
  throw new Error("usage: bun prepare_attempt.ts <agent_repo> <case_dir> <attempt_dir> <package_path> <result_name>")
const { buildAgentPrompt } = await import(path.join(agentRepo, "evals/src/task.ts"))
const task = await Bun.file(path.join(caseDir, "task.json")).json()
const inputs: string[] = task.inputs ?? []
const basenames = inputs.map((input) => path.basename(input))
if (new Set(basenames).size !== basenames.length) throw new Error(`имена входов должны различаться: ${basenames}`)
const copied = await Promise.all(
  inputs.map(async (input) => {
    const target = path.join(work, path.basename(input))
    await Bun.write(target, Bun.file(path.join(caseDir, input)))
    return target
  }),
)
await Bun.write(path.join(work, "prompt.txt"), buildAgentPrompt(task.prompt, packagePath, resultName))
await Bun.write(path.join(work, "files.txt"), copied.map((file) => `${file}\n`).join(""))
