import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { connectionStore } from "./connection-store"
import { credentials } from "./credentials"

const initial = { mode: "custom" as const, endpoint: "http://example.test/mcp", generation: 1, revision: 1, url: "http://example.test/app/", username: "user", apiKey: "test-key-private", password: "" }

test("Linux persists plaintext with private permissions and a staged generation cannot change active settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-store-"))
  try {
    const store = connectionStore(directory, credentials("linux"))
    expect(await store.read()).toBeUndefined()
    await store.stage(initial)
    expect(await store.read()).toBeUndefined()
    await store.activate(1)
    expect(await store.read()).toEqual(initial)
    const file = join(directory, "connection.json")
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect((await stat(join(directory, "generations", "1.json"))).mode & 0o777).toBe(0o600)
    expect(await readFile(file, "utf8")).toContain(initial.apiKey)
    await store.stage({ ...initial, generation: 2, revision: 2, username: "other", password: "second-secret" })
    expect(await store.read()).toEqual(initial)
    await expect(store.activate(3)).rejects.toThrow("LOGINOM_GENERATION_MISSING")
    expect(await store.read()).toEqual(initial)
    await store.activate(2)
    expect(await connectionStore(directory, credentials("linux")).read()).toEqual({ ...initial, generation: 2, revision: 2, username: "other", password: "second-secret" })
    await expect(store.stage(initial)).rejects.toThrow("LOGINOM_GENERATION_EXISTS")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("rejects generation path traversal and corrupt records without including contents in errors", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-store-"))
  try {
    const store = connectionStore(directory, credentials("linux"))
    await expect(store.activate(NaN)).rejects.toThrow("LOGINOM_GENERATION_INVALID")
    await writeFile(join(directory, "connection.json"), 'private-content-not-json', { mode: 0o600 })
    await expect(store.read()).rejects.toThrow(/^LOGINOM_STORE_INVALID$/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("does not follow a symlink for the generation directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-store-"))
  const target = await mkdtemp(join(tmpdir(), "loginom-target-"))
  try {
    await symlink(target, join(directory, "generations"))
    await expect(connectionStore(directory, credentials("linux")).stage(initial)).rejects.toThrow("LOGINOM_STORE_OWNER_INVALID")
  } finally { await rm(directory, { recursive: true, force: true }); await rm(target, { recursive: true, force: true }) }
})

test("legacy records default to cloud and discard the old Dock key without rewriting the file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-store-"))
  try {
    const store = connectionStore(directory, credentials("linux"))
    const file = join(directory, "connection.json")
    const record = JSON.stringify({ generation: 1, revision: 1, url: "http://stand.test/app/", username: "user",
      secrets: { apiKey: "LEGACY-CANARY", password: "password-canary" } })
    await writeFile(file, record, { mode: 0o600 })
    expect(await store.read()).toMatchObject({ mode: "cloud", apiKey: "", password: "password-canary", url: "http://stand.test/app/", generation: 1 })
    expect(await readFile(file, "utf8")).toBe(record)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("safeStorage keeps legacy metadata envelopes readable and writes only the secret pair", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-store-"))
  const payloads: string[] = []
  const codec = credentials("darwin", {
    isEncryptionAvailable: () => true,
    encryptString(value) { payloads.push(value); return Buffer.from(String(payloads.length - 1)) },
    decryptString(value) { return payloads[Number(value.toString())] },
  })
  try {
    const store = connectionStore(directory, codec)
    await writeFile(join(directory, "connection.json"), JSON.stringify({ ...initial, mode: undefined, secrets: codec.encode(initial) }), { mode: 0o600 })
    expect(await store.read()).toMatchObject({ mode: "cloud", apiKey: "", password: initial.password, username: initial.username })
    await store.stage(initial)
    await store.savePending(initial)
    expect(payloads.slice(1).map((payload) => JSON.parse(payload))).toEqual([
      { apiKey: initial.apiKey, password: initial.password },
      { apiKey: initial.apiKey, password: initial.password },
    ])
    await store.activate(1)
    expect(await store.read()).toEqual(initial)
    expect(await store.pending()).toEqual(initial)
    const bad = { ...initial, secrets: codec.encode({ kind: "loginom-cloud-v1", installationKey: "private-canary" }) }
    await writeFile(join(directory, "connection.json"), JSON.stringify(bad), { mode: 0o600 })
    await expect(store.read()).rejects.toThrow(/^LOGINOM_STORE_INVALID$/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
