import { expect, test } from "bun:test"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { exportMetadata, exportReceipts } from "../src/export-receipts"
import { temporaryData } from "./fixture/temporary-data"

const node = { document_id: "doc", workflow_id: "workflow", node_id: "node" }
const artifact = {
  artifact_id: "artifact",
  destination: "/exports/отчёт.txt",
  bytes: 0,
  sha256: "a".repeat(64),
  verification_id: "op:export-download",
  execution_id: "exec",
  freshness_basis: "native_absence_check_and_completed_execution",
}

test("an artifact not bound to the completed execution is not a confirmed export", () => {
  const receipt = {
    result_version: "user-v1",
    operation_id: "op",
    state: "settled",
    status: "SUCCEEDED",
    action_key: "node.apply",
    cleanup_complete: true,
    error: null,
    node,
    execution: { status: "completed", execution_id: "exec" },
    output: { status: "complete", file_artifacts: [artifact] },
  }
  expect(exportMetadata("dock_node_status", receipt)?.export.bytes).toBe(0)
  expect(
    exportMetadata("dock_node_status", { ...receipt, execution: { ...receipt.execution, execution_id: "other" } }),
  ).toBeUndefined()
  expect(exportMetadata("dock_node_status", { ...receipt, cleanup_complete: false })).toBeUndefined()
  expect(exportMetadata("file_sample", receipt)).toBeUndefined()
})

test("the first confirming turn keeps the receipt after reopening the store", async () => {
  await using temp = await temporaryData()
  const sessionID = Session.ID.create()
  const first = SessionMessage.ID.make("msg_first")
  const repeated = SessionMessage.ID.make("msg_repeated")
  const { execution_id, freshness_basis, ...file } = artifact
  const receipt = { ...file, name: "отчёт.txt", node }
  expect(exportReceipts(temp.directory).record(sessionID, first, receipt)).toBe(true)

  const reopened = exportReceipts(temp.directory)
  expect(reopened.record(sessionID, repeated, { ...receipt, artifact_id: "another-cache" })).toBe(false)
  expect(reopened.turn({ sessionID, messageID: first })).toEqual({ files: [receipt] })
  expect(reopened.turn({ sessionID, messageID: repeated })).toEqual({ files: [] })
  reopened.remove(sessionID)
  expect(reopened.turn({ sessionID, messageID: first })).toBeUndefined()
})
