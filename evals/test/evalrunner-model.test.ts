import { expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { verifyEvalrunnerModel } from "../src/evalrunner-model"

test("model verification opens only a closed history copy and requires every assistant model and reasoning", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-model-"))
  const profile = path.join(root, "profile"), history = profile + ".history/closed", slot = path.join(root, "slot")
  await mkdir(path.join(history, "data"), { recursive: true, mode: 0o700 })
  await mkdir(slot)
  const source = path.join(history, "data/loginom-ai-agent.db")
  try {
    const db = new Database(source, { create: true })
    db.exec("CREATE TABLE message (id TEXT, session_id TEXT, data TEXT)")
    db.query("INSERT INTO message VALUES (?,?,?)").run("m1", "session", JSON.stringify({ role: "assistant", providerID: "openai", modelID: "gpt-6.1-sol", variant: "medium" }))
    db.close()
    await Bun.write(path.join(slot, "cleanup.json"), JSON.stringify({ stages: [{ stage: "profile_history", status: "confirmed", path: history }] }))
    const before = new Bun.CryptoHasher("sha256").update(await Bun.file(source).bytes()).digest("hex")
    const proof = await verifyEvalrunnerModel({ root, profile }, { sessionId: "session", cleanupFile: path.join(slot, "cleanup.json") })
    expect(proof.status).toBe("VERIFIED")
    expect(proof.assistantMessages).toBe(1)
    expect(proof.sourceHashesBefore).toEqual(proof.sourceHashesAfter)
    expect(new Bun.CryptoHasher("sha256").update(await Bun.file(source).bytes()).digest("hex")).toBe(before)
    const changed = new Database(source)
    changed.query("INSERT INTO message VALUES (?,?,?)").run("m2", "session", JSON.stringify({ role: "assistant", providerID: "openai", modelID: "gpt-6.1-sol", variant: "high" }))
    changed.close()
    await expect(verifyEvalrunnerModel({ root, profile }, { sessionId: "session", cleanupFile: path.join(slot, "cleanup.json") })).rejects.toThrow("Actual product model differs")
    await expect(verifyEvalrunnerModel({ root, profile }, { sessionId: "missing", cleanupFile: path.join(slot, "cleanup.json") })).rejects.toThrow("Actual product model differs")
  } finally { await rm(root, { recursive: true, force: true }) }
})
