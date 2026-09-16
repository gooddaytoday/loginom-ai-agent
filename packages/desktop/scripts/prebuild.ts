#!/usr/bin/env bun
import { $ } from "bun"
import { resolve } from "node:path"

import { resolveChannel } from "./utils"

const channel = resolveChannel()
await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`

await $`cd ../agent && bun script/build-node.ts`.env({
  ...process.env,
  MODELS_DEV_API_JSON: resolve(import.meta.dir, "../../product/models.json"),
})

await $`bun ./scripts/bundle-loginom.ts`
