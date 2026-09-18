import { $ } from "bun"
import { resolve } from "node:path"

import { copyIcons } from "./copy-icons"

const packageDirectory = resolve(import.meta.dir, "..")

await $`${process.execPath} run install-electron`.cwd(packageDirectory)

const value = process.env.LOGINOM_AI_AGENT_CHANNEL
await copyIcons(value === "beta" || value === "prod" ? value : "dev", packageDirectory)

await $`${process.execPath} script/build-node.ts`.cwd(resolve(packageDirectory, "../agent"))
