#!/usr/bin/env bun
import { $ } from "bun"
import { resolve } from "node:path"

import { copyIcons } from "./copy-icons"
import { resolveChannel } from "./utils"

const channel = resolveChannel()
const packageDirectory = resolve(import.meta.dir, "..")
const agentDirectory = resolve(packageDirectory, "../agent")

await copyIcons(channel, packageDirectory)
if (process.platform === "linux")
  await $`${process.execPath} ${resolve(import.meta.dir, "copy-metainfo.ts")} ${channel}`

await $`${process.execPath} script/build-node.ts`.cwd(agentDirectory).env({
  ...process.env,
  MODELS_DEV_API_JSON: resolve(import.meta.dir, "../../product/models.json"),
})

await $`${process.execPath} ${resolve(import.meta.dir, "bundle-loginom.ts")}`.cwd(packageDirectory)
