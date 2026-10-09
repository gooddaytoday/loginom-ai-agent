import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { collectTextImportEvidence } from "../src/text-import"

test("text import collects complete raw journal evidence only from its own confirmed archive", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "text-import-native-"))
  try {
    const profile = path.join(root, "profile"), archive = profile + ".history/run/1"
    const source = "loginom/runtime/generations/1/chats/c/attempts/a/execution-events.jsonl"
    const raw = JSON.stringify({ operation_id: "import-1", phase: "node_observation_completed",
      outcome: { status: "SUCCEEDED", output: { wizard: { stage: "text_import_format" } } } }) + "\n"
    await Bun.write(path.join(archive, source), raw)
    const attempt = path.join(root, "attempt")
    const cleanup = { result: { status: "confirmed" }, stages: [{ stage: "profile_history", status: "confirmed", path: archive }] }
    await Bun.write(path.join(attempt, "cleanup.json"), JSON.stringify(cleanup))
    await collectTextImportEvidence(attempt, profile)
    const proof = await Bun.file(path.join(attempt, "native-import.json")).json()
    expect(proof.files).toHaveLength(1)
    expect(proof.files[0]).toMatchObject({ source, sha256: new Bun.CryptoHasher("sha256").update(raw).digest("hex") })
    expect(proof.files[0].events).toEqual([JSON.parse(raw)])
    await expect(collectTextImportEvidence(attempt, path.join(root, "other"))).rejects.toThrow("own confirmed")
    await Bun.write(path.join(attempt, "cleanup.json"), JSON.stringify({ ...cleanup, result: { status: "unknown" } }))
    await expect(collectTextImportEvidence(attempt, profile)).rejects.toThrow("own confirmed")
  } finally { await rm(root, { recursive: true, force: true }) }
})
