import { $ } from "bun"

await $`bun run install-electron`

await $`bun ./scripts/copy-icons.ts ${process.env.LOGINOM_AI_AGENT_CHANNEL ?? "dev"}`

await $`cd ../agent && bun script/build-node.ts`
