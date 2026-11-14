import { expect, test } from "bun:test"
import { constants } from "node:fs"
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { createHash } from "node:crypto"
import { verifyInstallationResources, warmInstallationBrowser } from "../src/host"

const browser = process.env.LOGINOM_DOCK_TEST_BROWSER
const enabled = !!browser && !!process.env.LOGINOM_AI_AGENT_TEST_NODE

async function fixture(realBrowser: boolean, worker?: string) {
  const directory = await mkdtemp(join(tmpdir(), "loginom-warmup-"))
  const resources = join(directory, "resources")
  const root = join(directory, "profile")
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE")
  const binary = process.platform === "win32" ? "bin/node.exe" : "bin/node"
  await mkdir(join(resources, "bin"), { recursive: true })
  await cp(node, join(resources, binary), { mode: constants.COPYFILE_FICLONE })
  // The worker is real source; only Node/browser payloads belong to this fixture manifest.
  if (worker) {
    await mkdir(join(resources, "runtime/src"), { recursive: true })
    await writeFile(join(resources, "runtime/src/browser-warmup-entry.mjs"), worker)
  } else await symlink(resolve(import.meta.dir, "../../loginom-runtime"), join(resources, "runtime"), "junction")
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
      await rm(directory, { recursive: true, force: true })
    },
  }
}

test.skipIf(!enabled)(
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

test.skipIf(!enabled)(
  "failed warmup closes the worker and removes both current and previous profiles",
  async () => {
    await using f = await fixture(false)
    const verified = await verifyInstallationResources({ ...f, resourceVersion: "fixture" })
    await writeFile(join(f.root, "browser-warmup-phases.jsonl"), "old-history\n".repeat(100_000))
    const previous = await mkdtemp(join(tmpdir(), "lbw"))
    await writeFile(join(previous, "owned"), "previous interrupted warmup")
    await writeFile(
      join(f.root, "browser-warmup.json"),
      JSON.stringify({ protocol: 1, profile: previous, status: "failed" }),
    )
    await expect(warmInstallationBrowser({ ...f, verified })).rejects.toThrow("LOGINOM_BROWSER_WARMUP_FAILED")
    const receipt = JSON.parse(await readFile(join(f.root, "browser-warmup.json"), "utf8"))
    expect((await readFile(join(f.root, "browser-warmup-phases.jsonl.1"), "utf8")).startsWith("old-history")).toBe(true)
    expect(receipt.status).toBe("failed")
    expect(receipt.closed_ack).toBe(true)
    expect(receipt.node_exit_code).toBe(0)
    expect(receipt.reason.name).toBe("Error")
    expect(receipt.reason.code).toBeTruthy()
    await expect(readFile(join(previous, "owned"))).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(receipt.profile)).rejects.toMatchObject({ code: "ENOENT" })
    const phases = (await readFile(join(f.root, "browser-warmup-phases.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(phases).toContainEqual(
      expect.objectContaining({
        phase: "browser.launch",
        status: "failed",
        reason: expect.objectContaining({ code: expect.any(String) }),
      }),
    )
  },
  20_000,
)

test.skipIf(!process.env.LOGINOM_AI_AGENT_TEST_NODE)(
  "warmup has one bounded budget and closes a worker that never replies to warm",
  async () => {
    await using f = await fixture(
      false,
      `process.on('message', m => {
    if(m.method==='start')process.send({id:m.id,result:{protocol:1,ready:true,pid:process.pid}});
    if(m.method==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
  });`,
    )
    const verified = await verifyInstallationResources({ ...f, resourceVersion: "fixture" })
    const started = performance.now()
    await expect(warmInstallationBrowser({ ...f, verified, timeoutMs: 1200 })).rejects.toThrow(
      "LOGINOM_BROWSER_WARMUP_FAILED",
    )
    expect(performance.now() - started).toBeLessThan(5000)
    const receipt = JSON.parse(await readFile(join(f.root, "browser-warmup.json"), "utf8"))
    expect(receipt).toMatchObject({
      status: "failed",
      closed_ack: true,
      node_exit_code: 0,
      reason: { code: "LOGINOM_HOST_TIMEOUT" },
    })
    await expect(readFile(receipt.profile)).rejects.toMatchObject({ code: "ENOENT" })
  },
  10_000,
)

test
  .skipIf(!process.env.LOGINOM_AI_AGENT_TEST_NODE)
  .each(["LOGINOM_RESOURCE_HASH_MISMATCH", "LOGINOM_RESOURCE_CACHE_WRITE_FAILED", "LOGINOM_NODE_PATH_MISMATCH"])(
  "installation verification retains the distinct diagnostic: %s",
  async (code) => {
    await using f = await fixture(false)
    await verifyInstallationResources({ ...f, resourceVersion: "fixture" })
    if (code === "LOGINOM_RESOURCE_HASH_MISMATCH")
      await writeFile(join(f.resources, "browsers/invalid-browser.exe"), "tampered")
    if (code === "LOGINOM_RESOURCE_CACHE_WRITE_FAILED") {
      await rm(join(f.root, "resource-verification.json"))
      await mkdir(join(f.root, "resource-verification.json"))
    }
    if (code === "LOGINOM_NODE_PATH_MISMATCH") {
      const path = join(f.resources, "resource-manifest.json")
      const manifest = JSON.parse(await readFile(path, "utf8"))
      manifest.node = manifest.browser
      await writeFile(path, JSON.stringify(manifest))
    }
    await expect(verifyInstallationResources({ ...f, resourceVersion: "fixture" })).rejects.toThrow(code)
    const phases = (await readFile(join(f.root, "startup-phases.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(phases.at(-1)).toMatchObject({ scope: "installation", status: "failed", error: { name: "Error", code } })
  },
)
