import { expect, test } from "bun:test"
import { constants } from "node:fs"
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { createHash } from "node:crypto"
import { verifyInstallationResources, warmInstallationBrowser } from "../src/host"

const browser = process.env.LOGINOM_DOCK_TEST_BROWSER

async function fixture(realBrowser: boolean) {
  const directory = await mkdtemp(join(tmpdir(), "loginom-warmup-"))
  const resources = join(directory, "resources")
  const root = join(directory, "profile")
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE")
  const binary = process.platform === "win32" ? "bin/node.exe" : "bin/node"
  await mkdir(join(resources, "bin"), { recursive: true })
  await cp(node, join(resources, binary), { mode: constants.COPYFILE_FICLONE })
  // The worker is real source; only Node/browser payloads belong to this fixture manifest.
  await symlink(resolve(import.meta.dir, "../../loginom-runtime"), join(resources, "runtime"), "junction")
  const executable = "browsers/" + (realBrowser ? basename(browser!) : "invalid-browser.exe")
  await mkdir(join(resources, "browsers"))
  if (realBrowser)
    await cp(dirname(browser!), join(resources, "browsers"), { recursive: true, mode: constants.COPYFILE_FICLONE })
  if (!realBrowser) await writeFile(join(resources, executable), "not an executable", { mode: 0o700 })
  await writeFile(
    join(resources, "resource-manifest.json"),
    JSON.stringify({
      protocol: 1,
      nodeVersion: "24.19.0",
      node: binary,
      browser: executable,
      files: await Promise.all(
        [binary, executable].map(async (path) => ({
          path,
          sha256: createHash("sha256")
            .update(await readFile(join(resources, path)))
            .digest("hex"),
        })),
      ),
    }),
  )
  return {
    directory,
    resources,
    root,
    async [Symbol.asyncDispose]() {
      const receipt = await readFile(join(root, "browser-warmup.json"), "utf8").then(JSON.parse, () => undefined)
      if (receipt?.profile) await rm(receipt.profile, { recursive: true, force: true })
      await rm(directory, { recursive: true, force: true })
    },
  }
}

test.skipIf(!browser)(
  "installer warms a verified Chromium and confirms worker exit before publishing readiness",
  async () => {
    await using f = await fixture(true)
    const verified = await verifyInstallationResources({ ...f, resourceVersion: "fixture" })
    await warmInstallationBrowser({ ...f, verified })
    const receipt = JSON.parse(await readFile(join(f.root, "browser-warmup.json"), "utf8"))
    expect(receipt).toMatchObject({
      status: "ready",
      closed_ack: true,
      node_exit_code: 0,
      manifestHash: verified.manifestHash,
      browserHash: verified.browserHash,
    })
    await expect(readFile(join(receipt.profile, "Local State"))).rejects.toMatchObject({ code: "ENOENT" })
  },
  30_000,
)

test("installer cannot publish warm readiness for a hash-valid executable that cannot launch", async () => {
  await using f = await fixture(false)
  const verified = await verifyInstallationResources({ ...f, resourceVersion: "fixture" })
  await expect(warmInstallationBrowser({ ...f, verified })).rejects.toThrow("LOGINOM_BROWSER_WARMUP_FAILED")
  const receipt = JSON.parse(await readFile(join(f.root, "browser-warmup.json"), "utf8"))
  expect(receipt.status).toBe("failed")
  expect(receipt.closed_ack).not.toBe(true)
}, 20_000)
