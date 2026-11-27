import { expect, test } from "bun:test"
import type { SessionDomain } from "@opencode/plugin/promise/session"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { Schema } from "effect"
import { exportMetadata, turnExports } from "../src/export-receipts"

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

test("the next prompt in a transcript without idle markers does not inherit the preceding export", async () => {
  const time = { created: 1 }
  const id = SessionMessage.ID.make("msg_current")
  const decode = Schema.decodeUnknownSync(Schema.Array(SessionMessage.Info))
  const history = decode([
    { type: "user", id: "msg_previous", time, text: "Export" },
    {
      type: "assistant",
      id: "msg_export",
      time,
      agent: "build",
      model: { id: "test-model", providerID: "test" },
      content: [
        {
          type: "tool",
          id: "export",
          name: "loginom_dock_node_wait",
          time,
          state: {
            status: "completed",
            input: {},
            content: [{ type: "text", text: "Done" }],
            metadata: { loginom: { export: { ...artifact, name: "отчёт.txt", node } } },
          },
        },
      ],
    },
    { type: "user", id, time, text: "Next task" },
  ])
  const read: SessionDomain["history"] = async ({ type, cursor, limit = 2 }) => {
    const anchor = history.findIndex((message) => message.id === cursor?.id)
    const previous = cursor?.direction === "previous"
    const page = (previous ? history.slice(0, anchor) : history.slice(anchor + 1)).filter(
      (message) => !type || message.type === type,
    )
    return previous ? page.slice(-limit) : page.slice(0, limit)
  }
  const sessionID = Session.ID.create()
  const signal = new AbortController().signal
  expect((await turnExports(read, { sessionID, messageID: history[0].id }, signal))?.files).toHaveLength(1)
  expect(await turnExports(read, { sessionID, messageID: id }, signal)).toEqual({ files: [] })
})
