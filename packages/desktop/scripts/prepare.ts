#!/usr/bin/env bun
import { Script } from "@loginom-ai-agent/script"
import { resolve } from "node:path"

await import("./prebuild")

const packageJson = resolve(import.meta.dir, "../package.json")
const pkg = await Bun.file(packageJson).json()
pkg.version = Script.version
await Bun.write(packageJson, JSON.stringify(pkg, null, 2) + "\n")
console.log(`Updated package.json version to ${Script.version}`)
