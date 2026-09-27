import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

let directory: string
let entry: string
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "desktop-managed-test-"))
  entry = join(directory, "fixture.mjs")
  const built = await Bun.build({
    entrypoints: [join(import.meta.dir, "../../../test/loginom/fixtures/managed-control.ts")],
    outdir: directory, naming: "fixture.mjs", target: "node",
    plugins: [{ name: "fixture-electron-metadata", setup(build) {
      build.onResolve({ filter: /^electron$/ }, () => ({ path: "electron", namespace: "fixture" }))
      build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "js", contents: `
        export const app={isPackaged:true,getPath:()=>process.env.TEST_ROOT};
        export const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};
      ` }))
    } }],
  })
  expect(built.success, built.logs.join("\n")).toBe(true)
})
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }) })

for (const mode of ["ordinary", "normal", "host", "host-lost-ack", "descendant", "duplicate-adoption",
  "invalid-low", "invalid-high", "invalid-newline", "not-socket", "no-registration", "legacy-registration",
  "wrong-ack", "extra-ack", "duplicate-ack", "oversized-ack", "lost-ack", "split-invalid-utf8", "unsolicited",
  "authenticated-first", "foreign-attempt", "duplicate-begin", "changed-binding", "done-phase", "concurrent",
  "stop-bind", "stop-pending", "close-pending", "abort-pending", "corrupt-registration", "detached-event", "timeout", "max-logins"]) {
  test(`managed Desktop control with a real inherited Node socket: ${mode}`, async () => {
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node executable")
    const child = Bun.spawn([node, entry, mode], { stdout: "pipe", stderr: "pipe" })
    const stdout = new Response(child.stdout).text(), stderr = new Response(child.stderr).text()
    const timer = setTimeout(() => child.kill(), 16_000)
    try {
      expect(await child.exited, (await stdout) + (await stderr)).toBe(0)
      expect(JSON.parse((await stdout).trim())).toMatchObject({ pass: true, mode })
    } finally { clearTimeout(timer); child.kill(); await child.exited }
  }, 20_000)
}

test("Desktop consumes control before startup and fences callbacks before awaited Host cleanup", async () => {
  const source = await readFile(join(import.meta.dir, "../index.ts"), "utf8")
  expect(source.startsWith('import { managedDesktopControl } from "./loginom/managed-control"')).toBe(true)
  const stop = source.slice(source.indexOf("const stopSidecars ="), source.indexOf("const relaunch ="))
  expect(stop.indexOf("managedDesktopControl?.stop()")).toBeLessThan(stop.indexOf("await (await loginomStarting)?.close()"))
  expect(stop.indexOf("await (await loginomStarting)?.close()")).toBeLessThan(stop.indexOf("managedDesktopControl?.close()"))
  expect(source).toContain("loginomStarting = desktopLoginom(loginBarrier)")
  expect(source.slice(source.indexOf("function exitFailedStartup"))).toContain("managedDesktopControl?.abort()")
  expect(source.indexOf("delete process.env.LOGINOM_AI_AGENT_DESKTOP_CONTROL_FD"))
    .toBeGreaterThan(source.indexOf("const shellEnv = preferAppEnv"))
})
