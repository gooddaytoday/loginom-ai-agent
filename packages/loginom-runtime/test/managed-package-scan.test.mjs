import assert from "node:assert/strict"
import { fork } from "node:child_process"
import { createHash } from "node:crypto"
import { once } from "node:events"
import { constants } from "node:fs"
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import test from "node:test"

async function loginomFixture({ candidate, keepOpen }) {
  const { runInNewContext } = await import("node:vm")
  const { default: assert } = await import("node:assert/strict")
  assert.equal(keepOpen, true)
  const archive = [0x50, 0x4b, 0x03, 0x04, 0xff]
  const storage = {
    FileInfoList: {
      GetDirectoryItems: () => [],
      GetFileInfoItemsEx: () => [{ FileName: "Example.lgp", Time: "2026-01-02T03:04:05Z", Size: archive.length }],
    },
    GetFileInfo(path) {
      assert.equal(path, "/common/Example.lgp")
      return { Size: archive.length }
    },
    OpenFile(path, mode) {
      assert.equal(path, "/common/Example.lgp")
      assert.equal(mode, 0)
      return { ReadBuffer: (output) => output.set(archive) }
    },
  }
  const connection = { Connected: true, UserName: candidate.username, Session: { get_FileStorage: () => storage } }
  const app = {
    FServerConnection: connection,
    FMainForm: { FMapTree: { FServerConnection: connection } },
    LogOut() {
      this.FServerConnection = null
      this.FMainForm = null
    },
  }
  const page = {
    evaluate: (fn, input) => runInNewContext(`(${fn})(input)`, {
      Date, btoa, input, location: new URL(candidate.url), ReleaseObject: () => {},
      bg: {
        app: { Application: { FInstance: app } },
        TBGFileOpenMode: { fomRead: 0 },
        selectAllAsync: (items) => (consume) => consume(items),
        forEach: (items, consume) => items.forEach(consume),
      },
    }),
  }
  return { context: { pages: () => [page], async close() { assert.equal(app.FServerConnection, null) } } }
}

test("managed scan serves package storage over IPC without a workspace client", { timeout: 20_000 }, async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "managed-package-scan-"))
  let child, exited
  context.after(async () => {
    if (child?.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
    try { await exited } finally { await rm(directory, { recursive: true, force: true }) }
  })
  const node = basename(process.execPath)
  const browser = "browser-fixture"
  await copyFile(process.execPath, join(directory, node), constants.COPYFILE_FICLONE)
  await writeFile(join(directory, browser), "")
  const files = await Promise.all([node, browser].map(async (path) => ({
    path, sha256: createHash("sha256").update(await readFile(join(directory, path))).digest("hex"),
  })))
  await writeFile(join(directory, "resource-manifest.json"), JSON.stringify({
    protocol: 1, nodeVersion: process.versions.node, node, browser, files,
  }))
  const loginom = new URL("../src/connection-check.mjs", import.meta.url).href
  const preload = `import { registerHooks } from 'node:module';
    registerHooks({ load(url, context, nextLoad) {
      if (url === ${JSON.stringify(loginom)})
        return { format: 'module', shortCircuit: true, source: ${JSON.stringify(
          `export const loginBrowser = ${loginomFixture};
          export const loginomAddress = String;
          export const reauthenticateReloadedPage = () => { throw Error("unexpected login recovery") };`
        )} };
      return nextLoad(url, context);
    } });`
  child = fork(new URL("../src/managed-entry.mjs", import.meta.url), [], {
    execPath: join(directory, node),
    execArgv: ["--import", "data:text/javascript," + encodeURIComponent(preload)],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  })
  exited = once(child, "exit")
  const request = async (operation, input) => {
    const pending = once(child, "message", { signal: AbortSignal.timeout(10_000) })
    child.send({ id: operation, operation, input })
    const [reply] = await pending
    assert.equal(reply.id, operation)
    return reply
  }
  assert.deepEqual((await request("start", {
    protocol: 1, generation: 2, chat: "fixture", stateDir: join(directory, "state"), resources: directory,
    packageScan: true, headless: true,
    connection: { url: "http://127.0.0.1", username: "fixture", password: "", apiKey: "" },
  })).result, { packageScan: true, protocol: 1, generation: 2 })
  const listing = await request("packageList", "/common")
  const archive = await request("packageRead", "/common/Example.lgp")
  assert.deepEqual(listing, { id: "packageList", result: { folder: "/common", slow: false, entries: [
    { kind: "package", name: "Example.lgp", path: "/common/Example.lgp", sizeBytes: 5, modifiedAt: "2026-01-02T03:04:05.000Z" },
  ] } })
  assert.deepEqual(archive, { id: "packageRead", result: "UEsDBP8=" })
  assert.deepEqual(await request("list"), { id: "list", error: "LOGINOM_REQUEST_INVALID" })
  assert.deepEqual(await request("close"), { id: "close", result: { closed: true } })
  assert.deepEqual(await exited, [0, null])
})
