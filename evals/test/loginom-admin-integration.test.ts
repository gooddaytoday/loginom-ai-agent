import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { verifyAdminRuntime } from "../src/preflight"

const integration = process.env.EVAL_ADMIN_INTEGRATION === "1" ? test : test.skip
const identity = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
  studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }

integration("real Node driver: rejects generic execution and disposes without starting a browser", async () => {
  const runtime = await verifyAdminRuntime("/home/kiselev/.local/bin/loginom-ai-agent-cli")
  const root = await mkdtemp(path.join(tmpdir(), "evals-admin-driver-"))
  try {
    const child = Bun.spawn([runtime.node, path.resolve(import.meta.dir, "../script/loginom-admin-driver.mjs")],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe", cwd: root, env: { PATH: "/usr/bin:/bin", HOME: root, LANG: "C.UTF-8" } })
    const request = { v: 1, id: "driver-1", op: "evaluate", expectedIdentity: identity, deadline: Date.now() + 2000, payload: { javascript: "secret-canary-never-execute" } }
    child.stdin.write(JSON.stringify(request) + "\n" + JSON.stringify({ ...request, id: "driver-2", op: "dispose", payload: {} }) + "\n")
    child.stdin.end()
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(code).toBe(0)
    expect(stdout.trim().split("\n").map(line => JSON.parse(line))).toEqual([
      { v: 1, id: "driver-1", outcome: "not_applied", data: { code: "ADMIN_REQUEST_INVALID" } },
      { v: 1, id: "driver-2", outcome: "confirmed", data: { disposed: true } },
    ])
    expect(stdout + stderr).not.toContain("secret-canary")
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)

integration("real Node driver: missing or malformed private credentials fail before browser launch", async () => {
  const runtime = await verifyAdminRuntime("/home/kiselev/.local/bin/loginom-ai-agent-cli")
  const root = await mkdtemp(path.join(tmpdir(), "evals-admin-credentials-"))
  try {
    await mkdir(`${root}/secrets`, { mode: 0o700 })
    await writeFile(`${root}/secrets/invalid.json`, '{"password":"secret-canary-invalid-json"', { mode: 0o600 })
    await writeFile(`${root}/secrets/format-only.json`, JSON.stringify({ username: "unused-fixture", password: "secret-canary-format" }), { mode: 0o600 })
    const child = Bun.spawn([runtime.node, path.resolve(import.meta.dir, "../script/loginom-admin-driver.mjs")],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe", cwd: root, env: { PATH: "/usr/bin:/bin", HOME: root, LANG: "C.UTF-8" } })
    const request = { v: 1, id: "missing", op: "init", expectedIdentity: identity, deadline: Date.now() + 2000,
      payload: { resourceRoot: runtime.resources, manifestHash: runtime.manifestHash, url: "http://127.0.0.1:1/app/", credentialsFile: `${root}/secrets/missing.json`, profileDir: `${root}/profile` } }
    child.stdin.write(JSON.stringify(request) + "\n" + JSON.stringify({ ...request, id: "malformed", payload: { ...request.payload, credentialsFile: `${root}/secrets/invalid.json` } }) + "\n" +
      JSON.stringify({ ...request, id: "bad-runtime", payload: { ...request.payload, credentialsFile: `${root}/secrets/format-only.json`, manifestHash: "0".repeat(64) } }) + "\n" +
      JSON.stringify({ ...request, id: "dispose", op: "dispose", payload: {} }) + "\n")
    child.stdin.end()
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(code).toBe(0)
    expect(stdout.trim().split("\n").map(line => JSON.parse(line))).toEqual([
      { v: 1, id: "missing", outcome: "not_applied", data: { code: "ADMIN_CREDENTIAL_PRIVATE" } },
      { v: 1, id: "malformed", outcome: "not_applied", data: { code: "ADMIN_CREDENTIAL_INVALID" } },
      { v: 1, id: "bad-runtime", outcome: "not_applied", data: { code: "ADMIN_RUNTIME_HASH" } },
      { v: 1, id: "dispose", outcome: "confirmed", data: { disposed: true } },
    ])
    expect(stdout + stderr).not.toContain("secret-canary")
    expect(await Bun.file(`${root}/profile`).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)
