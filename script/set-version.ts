#!/usr/bin/env bun

import { parseArgs } from "node:util"
import { appendFile } from "node:fs/promises"
import path from "node:path"
import semver from "semver"

const args = parseArgs({
  args: process.argv.slice(2),
  options: { bump: { type: "string" }, version: { type: "string" } },
  strict: true,
}).values
if (!!args.bump === !!args.version)
  throw new Error("Provide exactly one of --bump patch|minor|major or --version X.Y.Z[-pre.N]")

const root = path.resolve(import.meta.dir, "..")
const current = (await Bun.file(path.join(root, "package.json")).json()).version
const next = args.version ? requireVersion(args.version) : bumpVersion(current, args.bump)

for (const file of ["package.json", "packages/desktop/package.json"].map((file) => path.join(root, file))) {
  const pkg = await Bun.file(file).json()
  pkg.version = next
  // Both manifests are 2-space JSON with a trailing newline, so this round-trip only changes the version.
  await Bun.write(file, JSON.stringify(pkg, null, 2) + "\n")
}
// bun.lock records workspace versions; keep it in sync so a later resolution does not rewrite it in an unrelated change.
const lock = path.join(root, "bun.lock")
await Bun.write(lock, syncLockVersion(await Bun.file(lock).text(), "packages/desktop", next))

console.log(`${current} -> ${next} (package.json, packages/desktop/package.json, bun.lock)`)
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `version=${next}\n`)

function requireVersion(input: string) {
  const parsed = semver.parse(input)
  if (!parsed) throw new Error(`Invalid version ${JSON.stringify(input)}; expected X.Y.Z[-pre.N]`)
  // Build metadata is not part of a release identity and breaks tag and artifact names.
  if (parsed.build.length) throw new Error(`Version ${JSON.stringify(input)} must not carry build metadata`)
  return parsed.version
}

function bumpVersion(version: string, bump: string | undefined) {
  if (bump !== "patch" && bump !== "minor" && bump !== "major") throw new Error(`Unknown bump ${JSON.stringify(bump)}`)
  const next = semver.inc(version, bump)
  if (!next) throw new Error(`Cannot bump ${JSON.stringify(version)} from package.json`)
  return next
}

function syncLockVersion(lock: string, workspace: string, version: string) {
  const start = lock.indexOf(`\n    ${JSON.stringify(workspace)}: {\n`)
  if (start === -1) throw new Error(`bun.lock has no workspace entry for ${workspace}`)
  const end = lock.indexOf("\n    },", start)
  if (end === -1) throw new Error(`bun.lock entry for ${workspace} is not terminated`)
  const block = lock.slice(start, end)
  const line = /^ {6}"version": "[^"]*",$/m
  if (!line.test(block)) throw new Error(`bun.lock entry for ${workspace} has no version`)
  return lock.slice(0, start) + block.replace(line, `      "version": ${JSON.stringify(version)},`) + lock.slice(end)
}
