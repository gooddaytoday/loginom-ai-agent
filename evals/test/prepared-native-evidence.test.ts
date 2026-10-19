import { expect, test } from "bun:test"
import path from "node:path"
import { mkdtemp, rm, symlink } from "node:fs/promises"
import { collectNodeNativeEvidence } from "../src/node-native"
import { archiveProfileHistory } from "../src/profile"
import { collectTextImportEvidence } from "../src/text-import"

test("prepared slots: crosstable evidence reads the confirmed profile history archive", async () => {
  const event = { operation_id: "observed", phase: "node_observation_completed", outcome: { status: "SUCCEEDED",
    output: { node_crosstable: { verified: true, inventory_complete: true, node_context: { verified: true }, input_fields: [] } } } }
  const context = await fixture(event)
  try {
    await collectNodeNativeEvidence(context.attempt, context.profile, context.history)
    const proof = await Bun.file(path.join(context.attempt, "native-crosstable.json")).json()
    expect(proof.archive).toBe(context.cleanup.archive)
    expect(proof.observations).toHaveLength(1)
    expect(proof.observations[0]).toMatchObject({ operation_id: "observed", source: "runtime/execution-events.jsonl" })
    expect(proof.observations[0].source_sha256).toMatch(/^[a-f0-9]{64}$/)
  } finally { await context.close() }
})

test("prepared slots: text-import preserves raw events from the confirmed archive", async () => {
  const event = { operation_id: "import-1", phase: "node_observation_completed", outcome: { status: "REFUSED", error: "format rejected" } }
  const context = await fixture(event)
  try {
    await collectTextImportEvidence(context.attempt, context.profile, context.history)
    const proof = await Bun.file(path.join(context.attempt, "native-import.json")).json()
    expect(proof.archive).toBe(context.cleanup.archive)
    expect(proof.files).toEqual([{ source: "runtime/execution-events.jsonl", events: [event],
      sha256: new Bun.CryptoHasher("sha256").update(context.raw).digest("hex") }])
  } finally { await context.close() }
})

test("prepared slots: evidence rejects another profile even with the same configured history", async () => {
  const context = await fixture({ operation_id: "owned" })
  try {
    await expect(collectNodeNativeEvidence(context.attempt, path.join(context.root, "other-profile"), context.history))
      .rejects.toThrow("own confirmed history archive")
    expect(await Bun.file(path.join(context.attempt, "native-crosstable.json")).exists()).toBe(false)
  } finally { await context.close() }
})

test.each([
  ["failed processes", { processes: { status: "failed", capture_complete: true, unknownProcesses: [] } }],
  ["incomplete process capture", { processes: { status: "confirmed", capture_complete: false, unknownProcesses: [] } }],
  ["unknown process", { processes: { status: "confirmed", capture_complete: true, unknownProcesses: [{ pid: 123 }] } }],
  ["missing unknown-process inventory", { processes: { status: "confirmed", capture_complete: true } }],
  ["unknown server sessions", { serverSessions: "unknown" }],
  ["storage deletion refused", { storageDeletionAllowed: false }],
  ["next admission refused", { nextAdmissionAllowed: false }],
] as const)("prepared slots: %s prevents exporting evidence", async (_name, patch) => {
  const context = await fixture({ operation_id: "unconfirmed" })
  try {
    await Bun.write(path.join(context.attempt, "cleanup.json"), JSON.stringify({ ...context.cleanup, ...patch }))
    await expect(collectTextImportEvidence(context.attempt, context.profile, context.history)).rejects.toThrow("own confirmed history archive")
    expect(await Bun.file(path.join(context.attempt, "native-import.json")).exists()).toBe(false)
  } finally { await context.close() }
})

test.each(["foreign archive", "noncanonical path", "symlink escape"] as const)(
  "prepared slots: evidence rejects %s", async kind => {
    const context = await fixture({ operation_id: "owned" }), foreign = await fixture({ operation_id: "foreign" })
    try {
      const archive = kind === "foreign archive" ? foreign.cleanup.archive : kind === "noncanonical path"
        ? `${context.history}/../${path.basename(context.history)}/${path.basename(context.cleanup.archive)}`
        : path.join(context.history, "alias")
      if (kind === "symlink escape") await symlink(foreign.cleanup.archive, archive)
      await Bun.write(path.join(context.attempt, "cleanup.json"), JSON.stringify({ ...context.cleanup, archive }))
      await expect(collectNodeNativeEvidence(context.attempt, context.profile, context.history)).rejects.toThrow("own confirmed history archive")
      expect(await Bun.file(path.join(context.attempt, "native-crosstable.json")).exists()).toBe(false)
    } finally { await Promise.all([context.close(), foreign.close()]) }
  },
)

async function fixture(event: unknown) {
  const root = await mkdtemp("/home/kiselev/storage/tmp/prepared-native-")
  const profile = path.join(root, "profile"), history = path.join(root, "history"), attempt = path.join(root, "attempt")
  const raw = JSON.stringify(event) + "\n"
  await Bun.write(path.join(profile, "runtime/execution-events.jsonl"), raw)
  const archive = await archiveProfileHistory(profile, "attempt", history)
  const cleanup = { profileDir: profile, archive, closed: [], removed: [], slotId: "slot-a", serverEpoch: "epoch",
    serverSessions: "confirmed", storageDeletionAllowed: true, nextAdmissionAllowed: true,
    processes: { status: "confirmed", capture_complete: true, unknownProcesses: [], processes: [], runtimeDirectories: [], writer: null, error: null } }
  await Bun.write(path.join(attempt, "cleanup.json"), JSON.stringify(cleanup))
  return { root, profile, history, attempt, cleanup, raw, async close() { await rm(root, { recursive: true, force: true }) } }
}
