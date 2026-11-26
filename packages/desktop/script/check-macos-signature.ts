#!/usr/bin/env bun
import { $ } from "bun"
import { cp, mkdir, mkdtemp } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { verifyResources } from "../../loginom-runtime/src/resources.mjs"

// B5.1l: checks a packed, ad-hoc signed macOS app (CI only, writes only to a temporary directory):
// 1. the signature is valid, 2. the staged resources still match resource-manifest.json after signing (electron-builder
// skips them, `mac.signIgnore`), 3. the Keychain helper reads an entry written before a re-sign, as after an update.
if (process.platform !== "darwin") throw Error("MACOS_REQUIRED")
const app = process.argv[2] && resolve(process.argv[2])
if (!app?.endsWith(".app")) throw Error("Required: <path to the .app>")
const resources = join(app, "Contents/Resources/loginom")

await $`/usr/bin/codesign --verify --deep --strict --verbose=2 ${app}`
console.log("codesign: app verified")

const pins = await Bun.file(resolve(import.meta.dir, "../../product/loginom-release.json")).json()
await verifyResources(resources, {
  nodePath: join(resources, "bin/node"),
  nodeVersion: pins.nodeVersion,
  forceHash: true,
})
console.log("resource-manifest: every file matches after signing")

const account = randomBytes(32).toString("hex")
const helper = async (binary: string, operation: string) => {
  const child = Bun.spawn([binary], { stdin: new Blob([`${operation} ${account}`]), stdout: "pipe", stderr: "ignore" })
  const value = await new Response(child.stdout).text()
  return { code: await child.exited, value }
}
const installed = join(await mkdtemp(join(tmpdir(), "loginom-keychain-sign-")), "bin")
await mkdir(installed)
const binary = join(installed, "loginom-keychain")
await cp(join(resources, "bin/loginom-keychain"), binary)
const created = await helper(binary, "create")
if (created.code !== 0 || !created.value) throw Error("KEYCHAIN_CREATE_FAILED")

// The release flow signs the helper again with the same identity. This must keep the entry readable.
await $`/usr/bin/codesign --force --sign - --timestamp=none ${binary}`
const again = await helper(binary, "read")
if (again.code !== 0 || again.value !== created.value) throw Error("KEYCHAIN_READ_AFTER_RESIGN_FAILED")
console.log("keychain helper: entry readable after re-sign")

// A rebuilt helper has another code directory hash (here: hardened runtime flag). Report only: ad-hoc signatures
// cannot promise the same access, and stage G (Developer ID) is the fix if it fails.
await $`/usr/bin/codesign --force --sign - --timestamp=none --options runtime ${binary}`
const changed = await helper(binary, "read")
console.log(`keychain helper: entry after a changed code hash: ${changed.code === 0 && changed.value === created.value ? "readable" : "NOT readable (informational)"}`)
