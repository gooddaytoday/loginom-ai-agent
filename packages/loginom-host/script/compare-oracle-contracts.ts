import { createHash } from "node:crypto"

const paths = process.argv.slice(2)
if (paths.length < 2) throw Error("Provide at least two model-contract.json paths")
const contracts = await Promise.all(
  paths.map(async (path) => {
    const data = (await Bun.file(path).json()) as {
      system: { role: string; content: unknown }[]
      tools: { function: { name: string } }[]
    }
    const instructions = data.system.flatMap((message) =>
      typeof message.content === "string"
        ? message.content.split("\n").filter((line) => line.startsWith("Loginom is available through"))
        : [],
    )
    if (instructions.length !== 1 || !data.tools.length) throw Error("ORACLE_CONTRACT_INCOMPLETE")
    const names = data.tools.map((tool) => tool.function.name)
    if (new Set(names).size !== names.length || names.some((name) => !name.startsWith("loginom_")))
      throw Error("ORACLE_CONTRACT_TOOLS_INVALID")
    return {
      tools: canonical(
        data.tools.toSorted((a, b) =>
          a.function.name < b.function.name ? -1 : a.function.name > b.function.name ? 1 : 0,
        ),
      ),
      instructions: instructions[0],
      count: names.length,
    }
  }),
)
if (
  contracts.some(
    (contract) => contract.tools !== contracts[0].tools || contract.instructions !== contracts[0].instructions,
  )
)
  throw Error("ORACLE_CONTRACT_MISMATCH")
console.log(
  JSON.stringify({
    status: "PASS",
    captures: paths.length,
    tools: contracts[0].count,
    toolsSha256: createHash("sha256").update(contracts[0].tools).digest("hex"),
    bootstrapInstructionsSha256: createHash("sha256").update(contracts[0].instructions).digest("hex"),
  }),
)

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`
  return JSON.stringify(value)
}
