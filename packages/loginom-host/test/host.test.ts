import { expect, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createLoginomHost } from "../src/host"
import { credentials } from "../src/connection/credentials"

test("shared host can manage an unconfigured profile without Electron or starting a runtime", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-host-"))
  try {
    const host = await createLoginomHost({
      root: directory,
      resources: join(directory, "absent-resources"),
      codec: credentials("linux"),
      environment: {},
      headless: true,
    })
    expect(await host.api.status()).toMatchObject({ state: "unconfigured" })
    expect(host.acquire("test-run")).toBeUndefined()
    expect(await readdir(directory)).not.toContain("runtime")
    await host.close()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
