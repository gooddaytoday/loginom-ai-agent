import { expect, test } from "bun:test"
import { chmod, mkdtemp, rm, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { loadJudgeEnvironment } from "../src/slots"
import { writeLeaseReceipt } from "../src/lease"
import { parallelFixture } from "./helpers/parallel-fixture"

test("offline judge loads its private home and state without requiring Loginom credentials", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-judge-"))
  try {
    const fixture = await parallelFixture(root)
    const file = path.join(root, "slots.json")
    await writeLeaseReceipt(file, fixture.slots)
    expect(await loadJudgeEnvironment(file)).toEqual({ codexHome: fixture.slots.judge.codexHome,
      stateDir: fixture.slots.controller.stateDir })
    expect(await Bun.file(fixture.slots.controller.adminCredentialsFile).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("offline judge refuses a profile alias that resolves into its private home", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-judge-alias-"))
  try {
    const fixture = await parallelFixture(root)
    const alias = path.join(root, "profile-alias")
    await symlink(fixture.slots.judge.codexHome, alias)
    fixture.slots.slots[0]!.profileDir = alias
    const file = path.join(root, "slots.json")
    await writeLeaseReceipt(file, fixture.slots)
    await expect(loadJudgeEnvironment(file)).rejects.toThrow("SLOT_PATH_OVERLAP")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("offline judge refuses public state directories before any execution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-offline-judge-private-"))
  try {
    const fixture = await parallelFixture(root)
    const file = path.join(root, "slots.json")
    await writeLeaseReceipt(file, fixture.slots)
    await chmod(fixture.slots.controller.stateDir, 0o755)
    await expect(loadJudgeEnvironment(file)).rejects.toThrow("SLOT_PATH_PRIVATE")
  } finally { await rm(root, { recursive: true, force: true }) }
})
