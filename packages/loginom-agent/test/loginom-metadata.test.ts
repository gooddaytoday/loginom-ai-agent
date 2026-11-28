import { expect, test } from "bun:test"
import { withLoginomMetadata } from "../../loginom-runtime/client/lib/loginom-feed-metadata.mjs"
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
      },
    ],
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

test("Dock retains all scenario 10 fields written by independent feed producers", async () => {
  const busy = { version: 1, windowId: "32ef40ff-08d2-476a-ad73-1ef3feb17ce8", operationId: "operation", active: false }
  const step = {
    outcome: "completed",
    retryAvailable: false,
    persistence: "saved_through",
    save: { operationId: "save", path: "/package.lgp", throughStep: { operationId: "operation", label: "Фильтр" } },
  }
  const manualEdits = [
    { kind: "node_added", node: { ...node, position: { x: 0, y: 0 } } },
    { kind: "node_removed", node: { ...node, position: { x: 3, y: 8 } } },
    { kind: "node_renamed", guid: node.guid, from: node.label, to: "Новый фильтр" },
    { kind: "node_moved", guid: node.guid, label: node.label, from: { x: 0, y: 0 }, to: { x: 1, y: 2 } },
    {
      kind: "link_removed",
      link: { source: "source", output: "out", target: node.guid, input: "in" },
      sourceLabel: "Источник",
      targetLabel: node.label,
    },
  ]
  const savedPackageGraph = {
    saveOperationId: "save",
    packagePath: "/package.lgp",
    status: "compared",
    scope: "active_workflow",
    savedLabels: [{ nodeId: node.guid, label: "Новый фильтр" }],
    changes: [
      { kind: "node_missing", nodeId: "missing", before: "Источник" },
      {
        kind: "node_renamed",
        nodeId: node.guid,
        before: node.label,
        saved: "Новый фильтр",
        observedBeforeSave: node.label,
        repair: { label: "Исправить", prompt: "Восстановите имя узла" },
      },
      { kind: "sorting_field_order", nodeId: "sort", label: "Сортировка", before: ["b", "a"], saved: ["a", "b"] },
      { kind: "link_added", endpoints: ["source", "out", node.guid, "in"] },
    ],
    uncheckedSorting: ["another-sort"],
    renameAttribution: "observed_during_save",
  }
  const packageVariables = { source: "saved", state: "deferred" }
  const updates = [{ busy }, { step }, { packageVariables }, { manualEdits, verificationStale: true }, { savedPackageGraph }]
  const result = updates.reduce((current, update) => withLoginomMetadata(current, update), reply(receipt, feed))
  expect(await dockToolResult(result, 4)).toEqual({
    content: JSON.stringify(receipt),
    metadata: { generation: 4, loginom: { ...feed, busy, step, packageVariables, manualEdits, verificationStale: true, savedPackageGraph } },
  })
})

test("Dock rejects a field that exceeds its own UTF-8 budget even when the block fits", async () => {
  const invalid = [
    { busy: { version: 1, windowId: "32ef40ff-08d2-476a-ad73-1ef3feb17ce8", operationId: "a".repeat(256), active: true } },
    {
      step: {
        outcome: "completed",
        retryAvailable: false,
        persistence: "saved_through",
        save: { operationId: "save", path: "Ж".repeat(1024), throughStep: { operationId: "operation", label: "" } },
      },
    },
    { manualEdits: [{ kind: "node_renamed", guid: node.guid, from: "", to: "Ж".repeat(2048) }] },
    { verificationStale: "invalid" },
    { savedPackageGraph: { status: "unavailable", saveOperationId: "save", packagePath: "Ж".repeat(4096) } },
  ]
  for (const field of invalid) {
    const loginom = { ...feed, ...field }
    expect(Buffer.byteLength(JSON.stringify(loginom))).toBeLessThan(16 * 1024)
    expect(await dockToolResult(reply(receipt, loginom), 4)).toEqual({
      content: JSON.stringify(receipt),
      metadata: { generation: 4 },
    })
  }
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
