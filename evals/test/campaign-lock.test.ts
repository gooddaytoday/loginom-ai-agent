import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tryCampaignLock } from "../src/campaign-lock"

test("a contended campaign lock returns without waiting and can be reacquired after release", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-lock-"))
  const file = path.join(root, "controller.lock")
  const release = await tryCampaignLock(file)
  try {
    expect(release).toBeFunction()
    expect(await tryCampaignLock(file)).toBeUndefined()
    await release!()
    const acquired = await tryCampaignLock(file)
    expect(acquired).toBeFunction()
    await acquired!()
  } finally { await rm(root, { recursive: true, force: true }) }
})
