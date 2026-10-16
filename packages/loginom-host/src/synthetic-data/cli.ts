import { pathToFileURL } from "node:url"
import { runSyntheticData } from "./run"

const operations = ["validate", "generate", "inspect"] as const

async function main(argv: string[]) {
  const requested = argv[0]
  const operation = operations.find((item) => item === requested)
  if (!operation) throw Error("SYNTHETIC_DATA_CLI_UNSUPPORTED")
  const allowed = operation === "validate" ? ["--spec", "--directory"] : operation === "inspect" ? ["--lgp", "--directory", "--name"] : ["--spec", "--preset", "--params", "--directory", "--name"]
  const options = new Map<string, string>()
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key || !allowed.includes(key) || options.has(key) || !value || value.startsWith("--")) throw Error("SYNTHETIC_DATA_ARGUMENTS_INVALID")
    options.set(key, value)
  }
  if (!options.get("--directory")) throw Error("SYNTHETIC_DATA_ARGUMENTS_INVALID")
  if (operation === "generate" && !!options.get("--spec") === !!options.get("--preset")) throw Error("SYNTHETIC_DATA_ARGUMENTS_INVALID")
  if (operation === "validate" && !options.get("--spec")) throw Error("SYNTHETIC_DATA_ARGUMENTS_INVALID")
  if (operation === "inspect" && !options.get("--lgp")) throw Error("SYNTHETIC_DATA_ARGUMENTS_INVALID")
  const result = await runSyntheticData({
    operation,
    directory: options.get("--directory") ?? "",
    spec: options.get("--spec"),
    preset: options.get("--preset"),
    params: options.get("--params"),
    name: options.get("--name"),
    lgp: options.get("--lgp"),
  })
  process.stdout.write(JSON.stringify(result) + "\n")
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write((error instanceof Error && /^SYNTHETIC_DATA_[A-Z_]+$/.test(error.message) ? error.message : "SYNTHETIC_DATA_FAILED") + "\n")
    process.exitCode = 1
  })
}
