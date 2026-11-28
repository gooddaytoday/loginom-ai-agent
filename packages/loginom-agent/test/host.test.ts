import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ServiceHost } from "../src/host"

test("an unready Host does not prevent an empty package inventory", async () => {
  const data = await mkdtemp(join(tmpdir(), "loginom-inventory-"))
  try {
    await ServiceHost.start({
      data,
      connect: async () => { throw new Error("Host unavailable") },
    })
    expect(await ServiceHost.packageInventory()).toEqual([])
  } finally {
    await ServiceHost.close()
    await rm(data, { recursive: true, force: true })
  }
})
