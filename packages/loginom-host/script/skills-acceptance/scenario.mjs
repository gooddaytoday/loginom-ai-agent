import assert from "node:assert/strict"

export function verifySalesScenario(tools, input) {
  assert.ok(
    tools.some(
      (t) =>
        t.state.metadata?.activation?.profile === "loginom-automation" &&
        t.state.metadata.activation.digest === input.skills.find((s) => s.name === "loginom-automation").digest,
    ),
  )
  const receipts = tools
    .filter((t) => t.tool.startsWith("loginom_dock_") && t.state.status === "completed")
    .flatMap((t) =>
      t.state.output
        .split("\n\n")
        .map(JSON.parse)
        .map((body) => ({ tool: t, body })),
    )
  const prepared = receipts.find((r) => r.tool.tool === "loginom_dock_prepare")?.body
  assert.ok(prepared, "SCENARIO_PREPARE_NOT_VERIFIED")
  assert.equal(prepared.input_artifacts.length, 1)
  assert.equal(prepared.input_artifacts[0].sha256, input.csvSha256)
  const grouping = receipts.findLast(
    (r) => r.body.status === "SUCCEEDED" && r.body.configuration?.readback?.kind === "grouping",
  )?.body
  assert.ok(grouping, "SCENARIO_GROUPING_NOT_VERIFIED")
  assert.deepEqual(
    grouping.configuration.readback.group_by.map((field) => field.name),
    ["Category"],
  )
  assert.ok(grouping.configuration.readback.measures.some((field) => field.name === "amount" && field.functions === 1))
  assert.equal(grouping.execution.status, "completed")
  const port = grouping.output.ports.find((p) => p.port === 0)
  assert.equal(port.row_count, 2)
  assert.equal(port.sample_complete, true)
  const category = port.schema.findIndex((c) => c.name === "Category")
  const amount = port.schema.findIndex((c) => c.name !== "Category" && ["integer", "real"].includes(c.type))
  assert.ok(category >= 0 && amount >= 0)
  assert.deepEqual(
    port.sample.map((row) => [row[category].value, Number(row[amount].value)]).sort((a, b) => a[0].localeCompare(b[0])),
    [
      ["Alpha", 35],
      ["Beta", 20],
    ],
  )
  const saved = receipts.findLast(
    (r) => r.body.status === "SUCCEEDED" && r.body.action_key === "package.save_checkpoint",
  )?.body
  assert.ok(saved, "SCENARIO_SAVE_NOT_VERIFIED")
  assert.equal(saved.output.save_completed, true)
  assert.equal(saved.output.package_ref.path, input.packagePath)
  const imported = receipts.find(
    (r) => r.body.status === "SUCCEEDED" && r.body.configuration?.readback?.kind === "text_import",
  )?.body
  assert.ok(imported, "SCENARIO_IMPORT_NOT_VERIFIED")
  return {
    builtNodes: { source: imported.node.node_id, grouping: grouping.node.node_id },
    inputSha256: input.csvSha256,
  }
}
