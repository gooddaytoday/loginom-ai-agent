import { test } from "node:test"
import assert from "node:assert/strict"
import { copyFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { constants } from "node:fs"
import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { tmpdir } from "node:os"
import { join } from "node:path"
const execute = promisify(execFile)
const verifier = new URL("../src/resources.mjs", import.meta.url).href

for (const variant of [
  "valid",
  "tampered",
  "traversal",
  "symlink",
  "duplicate",
  "missing-browser",
  "wrong-node-version",
]) {
  test(`bundled resource validation: ${variant}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "Loginom ресурсы "))
    try {
      await mkdir(join(root, "bin"))
      await copyFile(process.execPath, join(root, "bin/node"), constants.COPYFILE_FICLONE)
      await writeFile(join(root, "browser"), "test browser payload")
      const files = await Promise.all(
        ["bin/node", "browser"].map(async (path) => ({
          path,
          sha256: createHash("sha256")
            .update(await readFile(join(root, path)))
            .digest("hex"),
        })),
      )
      const manifest = { protocol: 1, nodeVersion: process.versions.node, node: "bin/node", browser: "browser", files }
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
      const outcome = await execute(join(root, "bin/node"), ["--input-type=module", "-e", program, root], {
        env: { PATH: "" },
      }).then(
        (result) => result.stdout.trim(),
        (error) => error.stderr,
      )
      if (variant === "valid") assert.equal(outcome, "VERIFIED")
      if (variant !== "valid") assert.match(outcome, /LOGINOM_RESOURCE(S_INVALID|_HASH_MISMATCH)/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}
