import assert from "node:assert/strict"
import { completedDockReceipts } from "./receipts.mjs"

export function verifySalesScenario(tools, input) {
  assert.ok(
    tools.some(
      (t) =>
        t.state.metadata?.activation?.profile === "loginom-automation" &&
        t.state.metadata.activation.digest === input.skills.find((s) => s.name === "loginom-automation").digest,
    ),
  )
  const receipts = completedDockReceipts(tools)
  const prepared = receipts.find((r) => r.tool.tool === "loginom_dock_prepare")?.body
  assert.ok(prepared, "SCENARIO_PREPARE_NOT_VERIFIED")
  const imported = receipts.find(
    (r) => r.body.status === "SUCCEEDED" && r.body.configuration?.readback?.kind === "text_import",
  )?.body
  assert.ok(imported, "SCENARIO_IMPORT_NOT_VERIFIED")
  if (input.csvPath) {
    const admitted = tools.find(t => t.tool === "loginom_file_admit" && t.state.status === "completed" && t.state.input.path === input.csvPath)
    assert.ok(admitted, "SCENARIO_PATH_ADMISSION_NOT_VERIFIED")
    const source = JSON.parse(admitted.state.output)
    assert.equal(source.source_path, input.csvPath)
    assert.equal(source.artifact.sha256, input.csvSha256)
    const delivery = receipts.find(r => r.tool.tool === "loginom_dock_artifact_deliver" &&
      r.tool.state.input.artifact_id === source.artifact.artifact_id && r.tool.state.input.upload_grant_id === source.artifact.upload.grant_id)
    assert.ok(delivery, "SCENARIO_PATH_DELIVERY_NOT_VERIFIED")
    assert.equal(delivery.body.operation_id, delivery.tool.state.input.operation_id)
    const proof = delivery.body.status === "SUCCEEDED" ? delivery.body.output
      : receipts.find(r => r.body.operation_id === delivery.body.operation_id && r.body.outcome?.status === "SUCCEEDED")?.body.outcome
    assert.ok(proof?.cleanup_complete && proof.upload_completion_verified, "SCENARIO_PATH_UPLOAD_NOT_VERIFIED")
    assert.equal(proof.sha256, input.csvSha256)
    assert.equal(proof.destination, source.artifact.upload.destination)
    assert.equal(imported.configuration.readback.source.source_path, proof.destination, "SCENARIO_IMPORT_SOURCE_CHANGED")
  } else {
    assert.equal(prepared.input_artifacts.length, 1)
    assert.equal(prepared.input_artifacts[0].sha256, input.csvSha256)
  }
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
  return {
    builtNodes: { source: imported.node.node_id, grouping: grouping.node.node_id },
    inputSha256: input.csvSha256,
  }
}
