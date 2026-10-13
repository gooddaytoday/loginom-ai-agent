import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { connectionStore } from "../src/connection/connection-store"
import { connectionService } from "../src/connection/connection-service"
import { cliCredentials } from "../src/connection/cli-credentials"

test.each([
  ["LOGINOM_KNOWLEDGE_AUTH_FAILED", "LOGINOM_KNOWLEDGE_AUTH_FAILED"],
  ["LOGINOM_LOGIN_REJECTED", "LOGINOM_LOGIN_REJECTED"],
  ["private password and token detail", "LOGINOM_HOST_REQUEST_FAILED"],
] as const)("saved connection startup reports only the allowlisted code for %s", async (error, code) => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-startup-code-"))
  const store = connectionStore(directory, cliCredentials("linux"))
  await store.stage({ generation: 1, revision: 1, url: "http://localhost/app/", username: "fixture-user", apiKey: "fixture-key", password: "fixture-password" })
  await store.activate(1)
  const service = await connectionService(store, { async check() {}, async prepare() { throw Error(error) } })
  try {
    await service.settled()
    expect(await service.api.status()).toMatchObject({ state: "recoverable-error", failure: code, hasApiKey: true })
    if (code !== error) expect(JSON.stringify(await service.api.status())).not.toContain(error)
    expect((await store.read())?.generation).toBe(1)
    expect(service.acquire("offline-startup-proof")).toBeUndefined()
  } finally { await service.close(); await rm(directory, { recursive: true, force: true }) }
})
