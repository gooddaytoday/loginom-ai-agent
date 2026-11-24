#!/usr/bin/env bun
import { $ } from "bun"
import path from "node:path"
import { copyBuiltCliToResources, resolveChannel } from "./utils"
import { verifyBundles } from "./verify-bundles"

// Prepares resources/ (icons, metainfo, the bundled CLI) for LOGINOM_AI_AGENT_CHANNEL and builds the app into out/.
// Loginom AI Agent: every channel takes the CLI from ../cli/dist and fails without it; none downloads one from npm.
const dir = path.resolve(import.meta.dir, "..")

const cli = path.resolve(dir, "../cli/dist")

const channel = resolveChannel()

process.chdir(dir)

await $`bun ./script/copy-icons.ts ${channel}`

await $`bun ./script/copy-metainfo.ts ${channel}`

await copyBuiltCliToResources(cli)

// Loginom AI Agent (B4.8a): resources/loginom — Node, the Host entry, Chromium, the Dock runtime, help and the product
// skills. Every channel needs LOGINOM_AI_AGENT_NODE_SOURCE and LOGINOM_AI_AGENT_BROWSER_SOURCE, as in 0.4.
await $`bun ./scripts/bundle-loginom.ts`

await $`bunx electron-vite build`

await verifyBundles(path.join(dir, "out"))
