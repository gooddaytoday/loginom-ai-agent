import assert from "node:assert/strict"
import { completedDockReceipts } from "./receipts.mjs"

export function verifyImportBuild(tools, input) {
  assert.ok(
    tools.some(
      (t) =>
        t.state.status === "completed" &&
        t.state.metadata?.activation?.profile === "loginom-automation" &&
        t.state.metadata.activation.digest === input.skills.find((s) => s.name === "loginom-automation").digest,
    ),
    "SCENARIO_ACTIVATION_NOT_VERIFIED",
  )
  const receipts = completedDockReceipts(tools).map((receipt) => receipt.body)
  const prepared = receipts.find((r) => r.input_artifacts)
  assert.ok(prepared, "SCENARIO_PREPARE_NOT_VERIFIED")
  assert.equal(prepared.input_artifacts.length, 1)
  assert.equal(prepared.input_artifacts[0].sha256, input.csvSha256)
  const imported = receipts.findLast(
    (r) => r.status === "SUCCEEDED" && r.configuration?.readback?.kind === "text_import",
  )
  assert.ok(imported, "SCENARIO_IMPORT_NOT_VERIFIED")
  assert.equal(
    imported.configuration.readback.source.source_path,
    prepared.input_artifacts[0].upload.destination,
    "SCENARIO_IMPORT_SOURCE_CHANGED",
  )
  assert.equal(imported.execution.status, "completed")
  const port = imported.output.ports.find((p) => p.port === 0)
  assert.equal(port.row_count, 3)
  assert.equal(port.sample_complete, true)
  const category = port.schema.findIndex((c) => c.name === "Category" && c.type === "string")
  const amount = port.schema.findIndex((c) => c.name === "amount" && ["integer", "real"].includes(c.type))
  assert.ok(category >= 0 && amount >= 0)
  assert.deepEqual(
    port.sample.map((row) => row[category].value),
    ["Alpha", "Beta", "Alpha"],
  )
  const numbersVerified = port.precision?.numbers_verified === true
  if (numbersVerified)
    assert.deepEqual(
      port.sample.map((row) => Number(row[amount].value)),
      [10, 20, 25],
    )
  const saved = receipts.findLast((r) => r.status === "SUCCEEDED" && r.action_key === "package.save_checkpoint")
  assert.ok(saved && receipts.indexOf(saved) > receipts.indexOf(imported), "SCENARIO_SAVE_NOT_VERIFIED")
  assert.equal(saved.output.save_completed, true)
  assert.equal(saved.output.package_ref.path, input.packagePath)
  return {
    builtNodes: { source: imported.node.node_id },
    inputSha256: input.csvSha256,
    importNumbersVerified: numbersVerified,
  }
}

export function verifyCalculatorModification(tools, input) {
  assert.ok(
    tools.some(
      (t) =>
        t.state.status === "completed" &&
        t.state.metadata?.activation?.profile === "loginom-automation" &&
        t.state.metadata.activation.digest === input.skills.find((s) => s.name === "loginom-automation").digest,
    ),
    "SCENARIO_ACTIVATION_NOT_VERIFIED",
  )
  const receipts = completedDockReceipts(tools).map((receipt) => receipt.body)
  const calculator = receipts.findLast(
    (r) => r.status === "SUCCEEDED" && r.configuration?.readback?.kind === "calculator",
  )
  assert.ok(calculator, "SCENARIO_CALCULATOR_NOT_VERIFIED")
  const expression = calculator.configuration.readback.expressions.find((e) => e.name === "amount_double")
  assert.ok(
    expression && ["amount*2", "2*amount"].includes(expression.formula.replace(/\s/g, "")),
    "SCENARIO_FORMULA_CHANGED",
  )
  assert.equal(calculator.execution.status, "completed")
  const port = calculator.output.ports.find((p) => p.port === 0)
  assert.equal(port.row_count, 3)
  assert.equal(port.sample_complete, true)
  assert.equal(port.precision.numbers_verified, true, "SCENARIO_NUMERIC_PRECISION_NOT_VERIFIED")
  const indices = ["Category", "amount", "amount_double"].map((name) => port.schema.findIndex((c) => c.name === name))
  assert.ok(indices.every((index) => index >= 0))
  assert.ok(
    port.schema[indices[0]].type === "string" &&
      indices.slice(1).every((index) => ["integer", "real"].includes(port.schema[index].type)),
    "SCENARIO_OUTPUT_SCHEMA_CHANGED",
  )
  assert.deepEqual(
    port.sample.map((row) => [row[indices[0]].value, Number(row[indices[1]].value), Number(row[indices[2]].value)]),
    [
      ["Alpha", 10, 20],
      ["Beta", 20, 40],
      ["Alpha", 25, 50],
    ],
  )
  const saved = receipts.findLast((r) => r.status === "SUCCEEDED" && r.action_key === "package.save_checkpoint")
  assert.ok(saved && receipts.indexOf(saved) > receipts.indexOf(calculator), "SCENARIO_SAVE_NOT_VERIFIED")
  assert.equal(saved.output.save_completed, true)
  assert.equal(saved.output.package_ref.path, input.packagePath)
  return { builtNodes: { source: input.sourceNode, calculator: calculator.node.node_id } }
}

export function verifyImportExecution(tools, input) {
  assert.ok(
    tools.some(
      (t) =>
        t.state.status === "completed" &&
        t.state.metadata?.activation?.profile === "loginom-automation" &&
        t.state.metadata.activation.digest === input.skills.find((s) => s.name === "loginom-automation").digest,
    ),
    "SCENARIO_ACTIVATION_NOT_VERIFIED",
  )
  const receipts = completedDockReceipts(tools).map((receipt) => receipt.body)
  const executed = receipts.findLast(
    (r) => r.status === "SUCCEEDED" && r.node?.node_id === input.sourceNode && r.execution?.status === "completed",
  )
  assert.ok(executed, "SCENARIO_ORIGINAL_SOURCE_NOT_EXECUTED")
  const port = executed.output.ports.find((p) => p.port === 0)
  assert.equal(port.row_count, 3)
  assert.equal(port.sample_complete, true)
  assert.equal(port.precision.numbers_verified, true, "SCENARIO_NUMERIC_PRECISION_NOT_VERIFIED")
  const category = port.schema.findIndex((c) => c.name === "Category" && c.type === "string")
  const amount = port.schema.findIndex((c) => c.name === "amount" && ["integer", "real"].includes(c.type))
  assert.ok(category >= 0 && amount >= 0)
  assert.deepEqual(
    port.sample.map((row) => [row[category].value, Number(row[amount].value)]),
    [
      ["Alpha", 10],
      ["Beta", 20],
      ["Alpha", 25],
    ],
  )
  const saved = receipts.findLast((r) => r.status === "SUCCEEDED" && r.action_key === "package.save_checkpoint")
  assert.ok(saved && receipts.indexOf(saved) > receipts.indexOf(executed), "SCENARIO_SAVE_NOT_VERIFIED")
  assert.equal(saved.output.save_completed, true)
  assert.equal(saved.output.package_ref.path, input.packagePath)
  return { builtNodes: { source: input.sourceNode } }
}
