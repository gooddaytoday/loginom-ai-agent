import { expect, test } from "bun:test"
import { SessionID } from "@opencode/schema/session-id"
import { dockToolResult } from "../src/dock"

const packagePath = "/user/shared/plan.lgp"
const sessionId = SessionID.make("ses_writer")
const packageAccess = { packagePath, kind: "other_conversation", sessionId }
const agentCopy = { originalPath: "/user/original.lgp", path: packagePath }
const content = "Prepared"
const toolCallId = "call_prepare"
const loginom = { v: 1, operationId: toolCallId, state: "settled", agentCopy }

const reply = (access: unknown) => ({
  content: [{ type: "text", text: content }],
  _meta: { loginomFields: { packageAccess: access, agentCopy } },
})

test("Dock publishes the v1 package access and a resolvable conversation link alongside other Host fields", async () => {
  const result = await dockToolResult(reply({ ...packageAccess, account: "private" }), 4, {
    toolCallId,
    hasSession: async (id) => id === sessionId,
  })
  expect(result).toEqual({ content, metadata: { generation: 4, loginom: { ...loginom, packageAccess } } })
})

test("Dock keeps the read-only status when a conversation link cannot be resolved", async () => {
  const result = await dockToolResult(reply(packageAccess), 4, {
    toolCallId,
    hasSession: async () => {
      throw Error("Session missing")
    },
  })
  expect(result).toEqual({
    content,
    metadata: {
      generation: 4,
      loginom: { ...loginom, packageAccess: { packagePath, kind: "read_only", lockMarker: "unknown" } },
    },
  })
})

test("Dock drops the legacy sessionID field while keeping the other Host fields", async () => {
  const result = await dockToolResult(reply({ packagePath, kind: "other_conversation", sessionID: sessionId }), 4, {
    toolCallId,
    hasSession: async () => true,
  })
  expect(result).toEqual({
    content,
    metadata: { generation: 4, loginom: { ...loginom, dropped: ["packageAccess"] } },
  })
})
