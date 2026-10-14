import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { verifyAdminRuntime } from "../src/preflight"
import { openLoginomAdmin } from "../src/loginom-admin"
import { createPair, destroyPair, readServerIdentity } from "../src/parallel-pair"
import { loadSlots, parseSlots } from "../src/slots"

const integration = process.env.EVAL_ADMIN_INTEGRATION === "1" ? test : test.skip
const identity = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
  studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }

const liveIntegration = process.env.EVAL_ADMIN_LIVE_CONFIG ? test : test.skip

liveIntegration("trusted bridge: configured research admin login reads the role and disposes its native browser", async () => {
  const file = await loadSlots(process.env.EVAL_ADMIN_LIVE_CONFIG!, 1)
  const pair = await Bun.file(path.join(file.controller.stateDir, "pair.json")).json()
  expect({ purpose: pair.purpose, phase: pair.phase }).toEqual({ purpose: "research", phase: "ready" })
  const identity = await readServerIdentity(file)
  const previous = new Set(await readdir(file.controller.stateDir))
  const connection = await openLoginomAdmin(file, identity)
  try {
    expect(connection.identity).toEqual(identity)
    await expect(connection.inspect()).rejects.toThrow("SESSION_IDENTITY_UNSUPPORTED")
  } finally { await connection.dispose() }
  const directories = (await readdir(file.controller.stateDir)).filter(name => name.startsWith("admin-") && !previous.has(name))
  expect(directories).toHaveLength(1)
  const receipt = await Bun.file(path.join(file.controller.stateDir, directories[0]!, "connection.json")).json()
  expect(receipt).toMatchObject({ kind: "loginom-admin-connection", status: "disposed", initialization: "confirmed", dispose: "confirmed",
    identity, processes: { status: "confirmed", error: null, observation_mode: "continuous", capture_complete: true } })
  const observation = await Bun.file(path.join(file.controller.stateDir, directories[0]!, "session-observations.json")).json()
  expect(observation).toMatchObject({ version: 1, kind: "admin-session-observations", identity, sessionIdentityQualified: false })
  expect(observation.ownSession.guid).toBeString()
  expect(observation.ownSession.objectId).toBeString()
  expect(observation.ownSession).toHaveProperty("managedObjectId")
  expect(observation.sessions.length).toBeGreaterThan(0)
  expect(observation.sessions.every((row: Record<string, unknown>) => Object.hasOwn(row, "sessionGuid"))).toBe(true)
  expect(observation.sessions.every((row: { objectId: string }) => typeof row.objectId === "string" && row.objectId.length > 0)).toBe(true)
  expect(receipt.processes.browserBindings.length).toBeGreaterThan(0)
  expect(receipt.processes.verification.map((pass: { owned_remaining: number }) => pass.owned_remaining)).toEqual([0, 0])
  expect(await readServerIdentity(file)).toEqual(identity)
}, 90_000)

integration("trusted bridge: failed initialization disposes the actual Node child with durable process proof", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "evals-admin-bridge-"))
  const name = `eval-admin-${crypto.randomUUID().slice(0, 8)}`
  const port = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
  const url = `http://127.0.0.1:${port.port}/app/`
  port.stop(true)
  const file = parseSlots({ version: 2,
    server: { container: `${name}-server`, studioContainer: `${name}-studio`, network: name, alias: "loginom-server-7.4.2-test", url,
      storageRoot: "/workdir/UserStorage", backupRoot: "/workdir/SessionBackup" },
    controller: { stateDir: `${root}/controller`, adminCredentialsFile: `${root}/secrets/missing.json` },
    judge: { codexHome: `${root}/judge` },
    slots: [{ id: "a", username: "eval-a", profileDir: `${root}/a/profile`, workspaceRoot: `${root}/a/work`, historyDir: `${root}/a/history` }],
  }, 1)
  await mkdir(`${root}/locks`, { mode: 0o700 })
  const options = { purpose: "research" as const, out: `${root}/evidence`, lockRoot: `${root}/locks` }
  const pair = await createPair(file, options)
  try {
    await expect(openLoginomAdmin(file, pair.identity, { binary: "/home/kiselev/.local/bin/loginom-ai-agent-cli" })).rejects.toThrow("ADMIN_CREDENTIAL_PRIVATE")
    const directory = (await readdir(file.controller.stateDir)).filter(name => name.startsWith("admin-"))
    expect(directory).toHaveLength(1)
    const receipt = await Bun.file(path.join(file.controller.stateDir, directory[0]!, "connection.json")).json()
    expect(receipt).toMatchObject({ version: 1, kind: "loginom-admin-connection", status: "disposed", identity: pair.identity,
      initialization: "not_applied", initializationCode: "ADMIN_CREDENTIAL_PRIVATE", initializationStage: null, dispose: "confirmed", disposeCode: null, processes: { status: "confirmed", error: null, observation_mode: "continuous", capture_complete: true } })
    expect(receipt.processes.verification.map((pass: { owned_remaining: number }) => pass.owned_remaining)).toEqual([0, 0])
    expect(receipt.processes.processes.some((entry: { executable: string }) => entry.executable.endsWith("/resources/loginom/bin/node"))).toBe(true)
    const journals = await Promise.all((await readdir(path.join(file.controller.stateDir, directory[0]!, "commands")))
      .map(name => Bun.file(path.join(file.controller.stateDir, directory[0]!, "commands", name)).json()))
    expect(journals.map(row => [row.op, row.state]).sort()).toEqual([["dispose", "confirmed"], ["init", "not_applied"]])
    expect(await Bun.file(`${root}/secrets/missing.json`).exists()).toBe(false)
    expect(receipt.processes.browserBindings).toEqual([])
    await expect(openLoginomAdmin(file, { ...pair.identity, serverEpoch: "e".repeat(64) }, { binary: "/home/kiselev/.local/bin/loginom-ai-agent-cli" }))
      .rejects.toThrow("SERVER_EPOCH_CHANGED")
    expect((await readdir(file.controller.stateDir)).filter(name => name.startsWith("admin-"))).toEqual(directory)
  } finally { await destroyPair(file, options); await rm(root, { recursive: true, force: true }) }
}, 60_000)

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
    child.stdin.write(JSON.stringify(request) + "\n" + JSON.stringify({ ...request, id: "missing-parent", payload: { ...request.payload, credentialsFile: `${root}/absent/secret.json` } }) + "\n" +
      JSON.stringify({ ...request, id: "malformed", payload: { ...request.payload, credentialsFile: `${root}/secrets/invalid.json` } }) + "\n" +
      JSON.stringify({ ...request, id: "bad-runtime", payload: { ...request.payload, credentialsFile: `${root}/secrets/format-only.json`, manifestHash: "0".repeat(64) } }) + "\n" +
      JSON.stringify({ ...request, id: "dispose", op: "dispose", payload: {} }) + "\n")
    child.stdin.end()
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(code).toBe(0)
    expect(stdout.trim().split("\n").map(line => JSON.parse(line))).toEqual([
      { v: 1, id: "missing", outcome: "not_applied", data: { code: "ADMIN_CREDENTIAL_PRIVATE" } },
      { v: 1, id: "missing-parent", outcome: "not_applied", data: { code: "ADMIN_CREDENTIAL_PRIVATE" } },
      { v: 1, id: "malformed", outcome: "not_applied", data: { code: "ADMIN_CREDENTIAL_INVALID" } },
      { v: 1, id: "bad-runtime", outcome: "not_applied", data: { code: "ADMIN_RUNTIME_HASH" } },
      { v: 1, id: "dispose", outcome: "confirmed", data: { disposed: true } },
    ])
    expect(stdout + stderr).not.toContain("secret-canary")
    expect(await Bun.file(`${root}/profile`).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)
