import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { evalsRoot } from "../src/config"

test("cold reader rejects a different CLI source pin before loading browser resources", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "import-cold-pin-"))
  try {
    await Bun.write(path.join(root, "cli-manifest.json"), JSON.stringify({ metadata: { sourceCommit: "other", sourceDirty: false } }))
    const file = path.join(root, "empty.json")
    await Bun.write(file, "{}")
    const run = Bun.spawn([process.execPath, path.join(evalsRoot, "script/text-import-cold/reader.mjs"),
      "--resources", path.join(root, "resources/loginom"), "--config", file, "--saved", file,
      "--expected", file, "--events", path.join(root, "events.jsonl"), "--output", path.join(root, "cold")],
      { stdout: "pipe", stderr: "pipe" })
    const [code, error] = await Promise.all([run.exited, new Response(run.stderr).text()])
    expect(code).not.toBe(0)
    expect(error).toContain("TEXT_IMPORT_CLI_PIN_DIFFERS")
    expect(await Bun.file(path.join(root, "cold/session.json")).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test.skipIf(!process.env.EVAL_TEXT_IMPORT_COLD_REGRESSION)("cold reader without DISPLAY verifies the admitted saved reference through exact resources", async () => {
  const admission = await Bun.file(process.env.EVAL_TEXT_IMPORT_COLD_REGRESSION!).json() as {
    config: string; resources: string; task: string; attempt: string; output: string; lease: string; runtimeRoot: string
  }
  const lease = await Bun.file(admission.lease).json()
  expect(lease.task).toBe(process.env.MULTICA_TASK_ID)
  expect(lease.role).toBe("rich")
  expect(JSON.stringify(await Bun.file(path.join(admission.runtimeRoot, "operations/stand.lease/owner.json")).json()) === JSON.stringify(lease)).toBe(true)
  const resources = await Bun.file(path.join(admission.resources, "resource-manifest.json")).json() as { node: string }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "NODE_USE_ENV_PROXY", "DEBUG", "XDG_RUNTIME_DIR"].includes(key)))
  const run = Bun.spawn([path.join(admission.resources, resources.node), path.join(evalsRoot, "script/text-import-cold/reader.mjs"),
    "--resources", admission.resources, "--config", admission.config, "--saved", path.join(admission.output, "saved.json"),
    "--expected", path.join(admission.output, "expected.json"), "--events", path.join(admission.attempt, "events.jsonl"),
    "--output", admission.output], { env, stdout: "pipe", stderr: "pipe" })
  const [code, output, error] = await Promise.all([run.exited, new Response(run.stdout).text(), new Response(run.stderr).text()])
  await writeFile(path.join(admission.output, "reader-stdout.txt"), output, { mode: 0o600 })
  await writeFile(path.join(admission.output, "reader-stderr.txt"), error, { mode: 0o600 })
  expect(code).toBe(0)
  const journal = (await Bun.file(path.join(admission.output, "execution-events.jsonl")).text()).trim().split("\n").map(line => JSON.parse(line))
  const opens = journal.filter(row => row.operation_id === "txt-cold-settings" && row.phase === "node_step_prepared" && row.action.verb === "begin_wizard")
  expect(opens).toHaveLength(1)
  const before = journal.find(row => row.phase === "node_observation_completed" && row.step === opens[0].step - 1).outcome.output
  const receipt = journal.find(row => row.phase === "node_step_completed" && row.internal_operation_id === opens[0].internal_operation_id).outcome
  expect(receipt.status).toBe("SUCCEEDED")
  expect(receipt.trace.filter((entry: { event: string; verb?: string }) => entry.event === "ui_gesture_applied" && entry.verb === "begin_wizard")).toHaveLength(1)
  expect(receipt.output.geometry.viewport).toEqual({ width: 1920, height: 1080 })
  expect(receipt.output.wizard.owner_context.status).toBe("observed")
  for (const key of ["document_id", "workflow_id", "node_id"]) expect(receipt.output.prepared_node_context[key]).toBe(before.prepared_node_context[key])
  const { validateUiAction } = await import(path.join(admission.resources, "runtime/client/lib/workspace-ui.mjs"))
  const { wizardOpenBinding, boundWizardDeactivationConfirmation } = await import(path.join(admission.resources, "runtime/client/lib/node-wizard-open.mjs"))
  const { wizardCloseBinding, wizardCloseDialogOwner, boundWizardCloseConfirmation } = await import(path.join(admission.resources, "runtime/client/lib/node-wizard-close.mjs"))
  expect(() => validateUiAction(opens[0].action, receipt.output)).toThrow("absent, ambiguous")
  expect(boundWizardDeactivationConfirmation(receipt.output, wizardOpenBinding(before))).toBe(false)
  const ambiguous = structuredClone(before)
  ambiguous.ui.elements.push(structuredClone(ambiguous.ui.elements.find((element: { ref: string }) => element.ref === opens[0].action.ref)))
  expect(() => wizardOpenBinding(ambiguous)).toThrow("One prepared settings control")
  for (const status of ["unobserved", "ambiguous"]) {
    const unowned = structuredClone(receipt.output)
    unowned.wizard.owner_context.status = status
    expect(() => wizardCloseBinding(unowned)).toThrow("prepared wizard")
  }
  const confirmation = journal.find(row => row.outcome?.output?.node_wizard_confirmation?.kind === "close").outcome.output
  expect(boundWizardCloseConfirmation(confirmation, confirmation.node_wizard_confirmation)).toBe(true)
  for (const key of ["document_id", "workflow_id", "node_id"]) {
    const foreign = structuredClone(confirmation)
    foreign.prepared_node_context[key] += "-foreign"
    expect(wizardCloseDialogOwner(foreign, confirmation.node_wizard_confirmation)).toBe(false)
  }
  const foreignOwner = structuredClone(confirmation)
  foreignOwner.wizard.owner_context.node.tid += ">foreign"
  expect(wizardCloseDialogOwner(foreignOwner, confirmation.node_wizard_confirmation)).toBe(false)
  const checker = Bun.spawn(["python3", path.join(evalsRoot, "script/check-text-import-cold.py"), admission.task, admission.attempt, admission.output],
    { stdout: "pipe", stderr: "pipe" })
  const [checked, verdict, diagnostics] = await Promise.all([checker.exited, new Response(checker.stdout).text(), new Response(checker.stderr).text()])
  await writeFile(path.join(admission.output, "verdict.json"), verdict, { mode: 0o600 })
  expect(diagnostics).toBe("")
  expect(checked).toBe(0)
  expect(JSON.parse(verdict)).toEqual({ errors: [], failures: [] })
}, 900_000)
