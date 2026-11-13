import { test } from "node:test"
import assert from "node:assert/strict"
import { copyFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { constants } from "node:fs"
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { verifyResources } from "../src/resources.mjs"
const verifier = new URL("../src/resources.mjs", import.meta.url).href
const node = process.platform === "win32" ? "bin/node.exe" : "bin/node"

for (const variant of [
  "valid",
  "tampered",
  "traversal",
  "symlink",
  "duplicate",
  "missing-browser",
  "wrong-node-version",
]) {
  test(`bundled resource validation: ${variant}`, async (t) => {
    const root = await mkdtemp(join(tmpdir(), "Loginom ресурсы "))
    const running = { child: undefined, closed: Promise.resolve() }
    try {
      await mkdir(join(root, "bin"))
      await copyFile(process.execPath, join(root, node), constants.COPYFILE_FICLONE)
      await writeFile(join(root, "browser"), "test browser payload")
      const files = await Promise.all(
        [node, "browser"].map(async (path) => ({
          path,
          sha256: createHash("sha256")
            .update(await readFile(join(root, path)))
            .digest("hex"),
        })),
      )
      const manifest = { protocol: 1, nodeVersion: process.versions.node, node, browser: "browser", files }
      if (variant === "tampered") await writeFile(join(root, "browser"), "corrupted")
      if (variant === "traversal") files.push({ path: "../escape", sha256: "0".repeat(64) })
      if (variant === "symlink") {
        await rm(join(root, "browser"))
        await symlink(process.execPath, join(root, "browser"))
      }
      if (variant === "duplicate") files.push(files[1])
      if (variant === "missing-browser") files.pop()
      if (variant === "wrong-node-version") manifest.nodeVersion = "0.0.0"
      await writeFile(join(root, "resource-manifest.json"), JSON.stringify(manifest))
      const program = `import {verifyResources} from ${JSON.stringify(verifier)}; await verifyResources(process.argv[1]); console.log('VERIFIED');`
      const child = spawn(join(root, node), ["--input-type=module", "-e", program, root], {
        stdio: ["ignore", "pipe", "pipe"],
        signal: t.signal,
        env: { PATH: "", ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {}) },
      })
      running.child = child
      const stdout = [], stderr = []
      child.stdout.setEncoding("utf8").on("data", chunk => stdout.push(chunk))
      child.stderr.setEncoding("utf8").on("data", chunk => stderr.push(chunk))
      const exited = new Promise(resolve => {
        child.once("error", error => resolve({ error }))
        child.once("exit", (code, signal) => resolve({ code, signal }))
      })
      running.closed = new Promise(resolve => child.once("close", resolve))
      const status = await exited
      await running.closed
      assert.ifError(status.error)
      assert.equal(status.signal, null)
      assert.equal(status.code, variant === "valid" ? 0 : 1)
      const outcome = (variant === "valid" ? stdout : stderr).join("").trim()
      if (variant === "valid") assert.equal(outcome, "VERIFIED")
      if (variant !== "valid") assert.match(outcome, /LOGINOM_RESOURCE(S_INVALID|_HASH_MISMATCH)/)
      if (variant === "traversal") assert.match(outcome, /LOGINOM_RESOURCES_INVALID/)
    } finally {
      // Never unlink an executable while its child or stdio is still alive,
      // including cancellation/error paths. Do not let cleanup hide a live child.
      if (running.child && running.child.exitCode === null && running.child.signalCode === null) running.child.kill()
      await running.closed
      // Only after close: bounded fallback for the observed Windows EBUSY.
      await rm(root, { recursive: true, force: true,
        ...(process.platform === "win32" ? { maxRetries: 5, retryDelay: 100 } : {}) })
    }
  })
}

test("host verification uses its pinned Node identity and binds the session proof to the manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-resource-session-"))
  try {
    await copyFile(process.execPath, join(root, "node"), constants.COPYFILE_FICLONE)
    await writeFile(join(root, "browser"), "original")
    const files = await Promise.all(["node", "browser"].map(async path => ({ path,
      sha256: createHash("sha256").update(await readFile(join(root, path))).digest("hex") })))
    const manifest = { protocol: 1, nodeVersion: process.versions.node, node: "node", browser: "browser", files }
    await writeFile(join(root, "resource-manifest.json"), JSON.stringify(manifest))
    const identity = { nodePath: join(root, "node"), nodeVersion: process.versions.node }
    const verified = await verifyResources(root, identity)
    assert.match(verified.manifestHash, /^[a-f0-9]{64}$/)
    assert.equal((await verifyResources(root, { ...identity, manifestHash: verified.manifestHash })).browserPath, join(root, "browser"))
    await assert.rejects(verifyResources(root, { ...identity, nodeVersion: "0.0.0" }), /LOGINOM_RESOURCES_INVALID/)
    await writeFile(join(root, "browser"), "tampered")
    await assert.rejects(verifyResources(root, identity), /LOGINOM_RESOURCE_HASH_MISMATCH/)
    await writeFile(join(root, "resource-manifest.json"), JSON.stringify({ ...manifest, browser: "node" }))
    await assert.rejects(verifyResources(root, { ...identity, manifestHash: verified.manifestHash }), /LOGINOM_RESOURCE_HASH_MISMATCH/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
