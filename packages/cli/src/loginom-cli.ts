// Loginom AI Agent (B2.7c, G2): the entry of the product CLI, as `standalone.ts` was in 0.4. It applies the CLI profile
// before the CLI loads, because `@opencode/util/global` fixes its paths on import, and every process it starts inherits
// the profile: the service runs this entry again and opens the same one. `index.ts` stays the entry of Desktop's service,
// which keeps the channel directories. Building `loginom-ai-agent-cli` from this entry is B2.7a.
import { CliProfile } from "./profile"
import { Standalone } from "./standalone"

try {
  // Help, version and `diagnostics export` exit here, before the profile is opened (B2.7a3); the `loginom` commands exit
  // here too, with the profile open and without the CLI (B2.7b).
  await Standalone.early(process.argv.slice(2))
  // The flags of the product's `run` that OpenCode 2 lacks (B2.7a4); `run` takes its directory from PWD.
  const forwarded = Standalone.forward(process.argv.slice(2), process.env.PWD ?? process.cwd())
  process.argv.splice(2, Infinity, ...forwarded.args)
  if (forwarded.directory) process.env.PWD = forwarded.directory
  CliProfile.apply()
} catch (error) {
  if (!(error instanceof Error && /^(PROFILE_[A-Z_]+$|CLI_ARGUMENT_INVALID:)/.test(error.message))) throw error
  process.stderr.write(`${error.message}\n`)
  process.exit(error.message.startsWith("CLI_ARGUMENT_INVALID") ? 2 : 1)
}

await import("./index")
