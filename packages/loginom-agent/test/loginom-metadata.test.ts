import { expect, test } from "bun:test"
import { withLoginomMetadata } from "../../loginom-runtime/client/lib/loginom-feed-metadata.mjs"
import { loginomSaveMetadata } from "../../loginom-runtime/client/lib/user-results.mjs"
import { dockToolResult } from "../src/dock"
import type { LoginomMetadataFields } from "../src/loginom-metadata"

const receipt = { operation_id: "operation", state: "settled", status: "SUCCEEDED" }
const node = { guid: "node-guid", label: "Фильтр", type: "transform.filter_data" }
const feed = { v: 1, operationId: "operation", state: "settled", status: "SUCCEEDED", node }
const reply = (value: typeof receipt, loginom?: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
  structuredContent: value,
  _meta: { loginom },
})

test("Dock forwards the runtime Save projection and its file proof alongside the graph and busy signal", async () => {
  const path = "/account/saved.lgp"
  const savedFileRead = { kind: "savedFileRead", nodeCount: 2, scope: "package", workflowGuidMatch: true,
    file: { mtime: "2026-11-27T15:00:00.000Z", size: 1024, hash: "b".repeat(64) } }
  const busy = { version: 1, operationId: "operation", windowId: "09a4db75-00cf-4ee0-912d-c252afbaba0f", active: false }
  const savedPackageGraph = {
    status: "compared",
    save_operation_id: "operation",
    package_path: path,
    changes: [{
      kind: "node_renamed",
      node_id: "node-guid",
      before: "Слияние",
      saved: "Левое",
      observed_before_save: "Слияние",
      repair: { label: "Попросить исправить", prompt: "Проверить узел node-guid" },
    }, { kind: "node_added", node_id: "new-guid" }],
    saved_labels: [{ node_id: "node-guid", label: "Левое" }],
    unchecked_sorting: [],
  }
  const options = { knownSecrets: [], busy, savedPackageGraph, savedFile: { fileExists: true, evidence: savedFileRead } }
  const input = withLoginomMetadata(reply(receipt), { receipt: loginomSaveMetadata({
    operation_id: "operation", action_key: "package.save_checkpoint", status: "SUCCEEDED",
    output: { package_ref: { path, active_identity: path } },
  }, options) })
  const result = await dockToolResult(input, 1)
  expect(result.metadata?.loginom).toEqual(input._meta.loginom)
  expect(result.metadata?.loginom).toMatchObject({
    v: 1, operationId: "operation", state: "settled", kind: "save", busy,
    evidence: [{ kind: "saved", path }, { kind: "savedFilePresence", fileExists: true }, savedFileRead],
    savedPackageGraph: {
      scope: "activeWorkflow", savedLabels: [{ nodeId: "node-guid", label: "Левое" }], truncated: false,
      changes: expect.arrayContaining([{ kind: "node_added", nodeId: "new-guid" }]),
    },
  })
  expect(result.content).toEqual(input.content[0].text)
})

test.each([false, null])("Dock retains a saved file presence result of %s alongside the successful Save", async (fileExists) => {
  const path = "/account/saved.lgp"
  const options = {
    knownSecrets: [],
    savedPackageGraph: { status: "unavailable", save_operation_id: "operation", package_path: path },
    savedFile: { fileExists },
  }
  const input = withLoginomMetadata(reply(receipt), { receipt: loginomSaveMetadata({
    operation_id: "operation", action_key: "package.save_checkpoint", status: "SUCCEEDED",
    output: { package_ref: { path, active_identity: path } },
  }, options) })
  const result = await dockToolResult(input, 1)
  expect(result.metadata?.loginom).toMatchObject({
    status: "SUCCEEDED", evidence: [{ kind: "saved", path }, { kind: "savedFilePresence", fileExists }],
  })
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
    scope: "activeWorkflow",
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
  const runtimeEvidence = [
    { kind: "tableRead", port: 0, portGuid: "port-guid", rowsRead: 2, rowCount: 5, executionId: "exec" },
    { kind: "executed", executionId: "exec", scope: "activeWorkflow" },
    { kind: "saved", path: "/package.lgp" },
    { kind: "reopenedGraphRead", nodeCount: 2, scope: "activeWorkflow" },
  ]
  const receiptWindow = {
    runtimeId: "e27791d5-b776-4f78-8fea-a93aefc13028",
    documentId: "document",
    startSequence: 8,
    confirmedSequence: 9,
  }
  const host = {
    evidence: [
      {
        kind: "savedFileRead",
        nodeCount: 2,
        scope: "package",
        workflowGuidMatch: true,
        file: { mtime: "2026-11-27T15:00:00.000Z", size: 1024, hash: "b".repeat(64) },
      },
    ],
    packageAccess: { packagePath: "/package.lgp", kind: "read_only", lockMarker: "unknown" },
    packageVariables: {
      source: "saved",
      definitionsCoverage: "complete",
      defaultsCoverage: "unavailable",
      usagesCoverage: "partial",
      definitions: [{ name: "Region", type: "String" }],
      defaults: null,
      usages: [],
    },
  } as const
  const agentCopy = { originalPath: "/original.lgp", path: "/package.lgp" }
  const updates = [
    { busy },
    { step },
    { manualEdits, verificationStale: true },
    { savedPackageGraph },
    { kind: "save", evidence: runtimeEvidence, receiptWindow },
  ]
  const result = updates.reduce((current, update) => withLoginomMetadata(current, update), reply(receipt, feed))
  const loginom = {
    ...feed,
    busy,
    step,
    manualEdits,
    verificationStale: true,
    savedPackageGraph,
    ...host,
    kind: "save",
    evidence: [...runtimeEvidence, ...host.evidence],
    receiptWindow,
    agentCopy,
  }
  expect(Buffer.byteLength(JSON.stringify(loginom))).toBeLessThanOrEqual(16 * 1024)
  expect(await dockToolResult(result, 4, { toolCallId: "call_other", host, agent: { agentCopy } })).toEqual({
    content: JSON.stringify(receipt),
    metadata: { generation: 4, loginom },
  })
})

test("Dock uses the explicit tool call ID for package metadata without a runtime receipt", async () => {
  const agent = { agentCopy: { originalPath: "/original.lgp", path: "/copy.lgp" } } satisfies LoginomMetadataFields
  const host = { packageAccess: { kind: "writable", packagePath: "/copy.lgp" } }
  const input = { toolCallId: "call_prepare", host, agent }
  const result = await dockToolResult({ content: [{ type: "text", text: "prepared" }] }, 4, input)
  expect(result).toEqual({
    content: "prepared",
    metadata: { generation: 4, loginom: { v: 1, operationId: "call_prepare", state: "settled", ...host, ...agent } },
  })
})

test("Dock discards invalid fields individually and lists their names", async () => {
  const busy = { version: 1, windowId: "32ef40ff-08d2-476a-ad73-1ef3feb17ce8", operationId: "operation", active: true }
  const ports = [
    {
      index: 0,
      guid: "port",
      rowCount: 1,
      columnCount: 1,
      preview: {
        schema: [{ index: 0, name: "Amount", type: "integer" }],
        sample: [[{ type: "integer", value: 42 }]],
        sampleComplete: true,
      },
    },
  ]
  const oversizedGraph = { status: "unavailable", saveOperationId: "save", packagePath: "Ж".repeat(4096) }
  const loginom = {
    ...feed,
    busy,
    ports,
    verificationStale: null,
    step: { outcome: "done" },
    savedPackageGraph: oversizedGraph,
  }
  expect(Buffer.byteLength(JSON.stringify(loginom))).toBeLessThan(16 * 1024)
  expect(await dockToolResult(reply(receipt, loginom), 4)).toEqual({
    content: JSON.stringify(receipt),
    metadata: {
      generation: 4,
      loginom: { ...feed, busy, ports, dropped: ["step", "verificationStale", "savedPackageGraph"] },
    },
  })
  expect(await dockToolResult(reply(receipt, { ...feed, ports: [{ rowCount: -1 }] }), 4)).toEqual({
    content: JSON.stringify(receipt),
    metadata: { generation: 4, loginom: { ...feed, dropped: ["ports"] } },
  })
})

test("Dock keeps tool text on missing or unsupported feed identities", async () => {
  for (const loginom of [undefined, { ...feed, v: 2 }]) {
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
    metadata: { generation: 4, loginom: { ...feed, limitations: [], omitted: { limitations: 1 } } },
  })
})
