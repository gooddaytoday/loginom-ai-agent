import { expect, test } from "bun:test"
import { readNodeOutput } from "../src/node-output"

test("expanded sample uses only the selected session's recorded tool receipt", async () => {
  const request = { sessionID: "ses_chat", messageID: "msg_response", toolCallID: "selected-call", port: 0 }
  const metadata = {
    generation: 2,
    loginom: {
      v: 1, operationId: "original", state: "settled", status: "SUCCEEDED",
      executionId: "execution", executionStatus: "completed", cleanupComplete: true,
      ports: [{ index: 0, guid: "native", rowCount: 1, columnCount: 1 }],
    },
  }
  const message = {
    type: "assistant", id: request.messageID, time: { created: 1 }, agent: "build", model: { providerID: "test", id: "test-model" },
    content: [{
      type: "tool", id: request.toolCallID, name: "loginom_dock_node_wait", time: { created: 1 },
      state: { status: "completed", input: { operation_id: "untrusted" }, content: [{ type: "text", text: "arbitrary" }], metadata },
    }],
  } satisfies Awaited<ReturnType<Parameters<typeof readNodeOutput>[0]>>[number]
  const unavailable = { kind: "unavailable", reason: "historical_only" }
  const read: NonNullable<Parameters<typeof readNodeOutput>[2]> = async (session, receipt) => {
    expect(session).toBe(request.sessionID)
    expect(receipt).toEqual({ generation: 2, operationId: "original", executionId: "execution", portGuid: "native" })
    return { rows: [[{ value: "on demand" }]] }
  }
  const history: Parameters<typeof readNodeOutput>[0] = async ({ sessionID }) => sessionID === request.sessionID ? [message] : []
  expect(await readNodeOutput(history, request, read)).toEqual({ kind: "available", rows: [[{ value: "on demand" }]] })
  expect(await readNodeOutput(history, request, async () => null)).toEqual(unavailable)
  const forbidden = async () => { throw Error("must not contact runtime") }
  let called = false
  for (const change of [{ sessionID: "ses_other" }, { port: 1 }, { toolCallID: "different-call" }]) {
    expect(await readNodeOutput(history, { ...request, ...change }, async () => {
      called = true
      return forbidden()
    })).toEqual(unavailable)
  }
  expect(called).toBe(false)
})
