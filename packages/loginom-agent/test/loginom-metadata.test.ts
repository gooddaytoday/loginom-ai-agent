import { expect, test } from "bun:test"
import { dockToolResult } from "../src/dock"

const receipt = { operation_id: "operation", state: "settled", status: "SUCCEEDED" }
const node = { guid: "node-guid", label: "Фильтр", type: "transform.filter_data" }
const feed = { v: 1, operationId: "operation", state: "settled", status: "SUCCEEDED", node }
const reply = (value: typeof receipt, loginom?: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
  structuredContent: value,
  _meta: { loginom },
})

test.each([
  { kind: "configure" },
  {
    kind: "execute",
    executionId: "exec",
    ports: [
      {
        index: 0,
        guid: "port-guid",
        rowCount: 1,
        columnCount: 1,
        preview: {
          schema: [{ index: 0, name: "Amount", type: "integer" }],
          sample: [[{ type: "integer", is_null: false, value: 0 }]],
          sampleComplete: true,
        },
        details: { delivered: { kind: "preview" } },
      },
    ],
    outputConfiguration: { kind: "confirmed", readback: { kind: "row_filter", conditions: [] } },
  },
  { kind: "export", files: [{ artifactId: "file", name: "report.csv", bytes: 42 }] },
])("Dock forwards the $kind feed without altering the model reply", async (details) => {
  const loginom = { ...feed, ...details }
  const result = await dockToolResult(reply(receipt, loginom), 4)
  expect(result).toEqual({ content: JSON.stringify(receipt), metadata: { generation: 4, loginom } })
})

test("Dock keeps the native error and the original model error text", async () => {
  const failure = { ...receipt, status: "FAILED" }
  const loginom = {
    ...feed,
    status: "FAILED",
    error: {
      code: "NODE_EXECUTION_FAILED",
      message: "Ошибка Loginom",
      source: "loginom",
      attribution: "verified_node",
    },
  }
  await expect(dockToolResult(reply(failure, loginom), 4)).rejects.toMatchObject({
    message: JSON.stringify(failure),
    metadata: { generation: 4, loginom, isError: true },
  })
})

test("Dock accepts older or malformed private metadata without affecting the tool result", async () => {
  for (const loginom of [undefined, { ...feed, v: 2 }, { ...feed, ports: [{ rowCount: -1 }] }]) {
    expect(await dockToolResult(reply(receipt, loginom), 4)).toEqual({
      content: JSON.stringify(receipt),
      metadata: { generation: 4 },
    })
  }
})

test("Dock enforces the metadata byte budget for multibyte JSON", async () => {
  const limit = 16 * 1024
  const empty = { ...feed, limitations: [""] }
  const available = limit - Buffer.byteLength(JSON.stringify(empty))
  const line = "Ж".repeat(Math.floor(available / 2)) + "a".repeat(available % 2)
  const loginom = { ...feed, limitations: [line] }
  const oversized = { ...feed, limitations: [line + "a"] }
  expect(JSON.stringify(oversized).length).toBeLessThan(limit)
  expect(await dockToolResult(reply(receipt, loginom), 4)).toEqual({
    content: JSON.stringify(receipt),
    metadata: { generation: 4, loginom },
  })
  expect(await dockToolResult(reply(receipt, oversized), 4)).toEqual({
    content: JSON.stringify(receipt),
    metadata: { generation: 4 },
  })
})
