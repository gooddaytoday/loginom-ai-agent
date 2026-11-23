// Loginom AI Agent (B2.7c, G2): the entry of the product CLI, as `standalone.ts` was in 0.4. It applies the CLI profile
// before the CLI loads, because `@opencode/util/global` fixes its paths on import, and every process it starts inherits
// the profile: the service runs this entry again and opens the same one. `index.ts` stays the entry of Desktop's service,
// which keeps the channel directories. Building `loginom-ai-agent-cli` from this entry is B2.7a.
import { CliProfile } from "./profile"

try {
  CliProfile.apply()
} catch (error) {
  if (!(error instanceof Error && /^PROFILE_[A-Z_]+$/.test(error.message))) throw error
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
}

await import("./index")
