// Smoke test: v1 SDK (the plugin contract) can actually reach core endpoints
// against the current server. v1 generation has been frozen since #5216
// (2025-12-07) so types may be stale, but runtime calls should still work
// for endpoints the v1 SDK was generated against.
import { afterEach, describe, expect, test } from "bun:test"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import { Global } from "@opencode-ai/core/global"
import { createOpencodeClient } from "@opencode-ai/sdk"
import { Server } from "../../src/server/server"
import { tmpdir, disposeAllInstances } from "../fixture/fixture"
import { resetDatabase } from "../fixture/db"

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

function client(directory: string) {
  return createOpencodeClient({
    baseUrl: "http://test",
    directory,
    fetch: ((req: Request) => Server.Default().app.fetch(req)) as unknown as typeof fetch,
  })
}

describe("v1 SDK runtime smoke", () => {
  test("session.list reaches the server and returns 200", async () => {
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    const sdk = client(tmp.path)
    const result = await sdk.session.list()
    expect(result.error).toBeUndefined()
    expect(Array.isArray(result.data)).toBe(true)
  })

  test("path.get reaches the server and returns 200", async () => {
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    const sdk = client(tmp.path)
    const result = await sdk.path.get()
    expect(result.error).toBeUndefined()
    expect(result.data).toBeDefined()
  })

  test("config.get reaches the server and returns 200", async () => {
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    const sdk = client(tmp.path)
    const result = await sdk.config.get()
    expect(result.error).toBeUndefined()
    expect(result.data).toBeDefined()
  })

  test("skill and command endpoints refresh their warm catalogs after home skills change", async () => {
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    const name = "catalog-smoke"
    const folder = join(Global.Path.home, ".agents", "skills", name)
    const writeSkill = (description: string) =>
      Bun.write(join(folder, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n`)
    const catalogEntry = async (route: "/skill" | "/command") => {
      const response = await Server.Default().app.request(route, { headers: { "x-opencode-directory": tmp.path } })
      expect(response.status).toBe(200)
      const entries: { name: string; description: string }[] = await response.json()
      return entries.find((entry) => entry.name === name)?.description
    }
    try {
      expect(await catalogEntry("/skill")).toBeUndefined()
      expect(await catalogEntry("/command")).toBeUndefined()

      await writeSkill("First revision")
      expect(await catalogEntry("/skill")).toBe("First revision")
      expect(await catalogEntry("/command")).toBe("First revision")

      await writeSkill("Second revision")
      expect(await catalogEntry("/command")).toBe("Second revision")
      expect(await catalogEntry("/skill")).toBe("Second revision")
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  test("session 404: result-tuple path returns the error body", async () => {
    await using tmp = await tmpdir({ git: true, config: { formatter: false, lsp: false } })
    const sdk = client(tmp.path)
    const result = await sdk.session.get({ path: { id: "ses_no_such" } as never })
    expect(result.error).toBeDefined()
    // wire body for 404 is NamedError-shaped
    expect(result.error).toMatchObject({ name: "NotFoundError" })
  })
})
