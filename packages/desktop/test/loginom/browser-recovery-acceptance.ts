import { supervise } from "@loginom-ai-agent/loginom-host/supervisor"
import { inputStore } from "@loginom-ai-agent/loginom-host/inputs"
import { createHash, randomUUID } from "node:crypto"
import { mkdir, readdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import assert from "node:assert/strict"

process.umask(0o077)
const scenario = process.argv[2]
assert.ok(scenario === "BR-S1" || scenario === "BR-S3", "Expected BR-S1 or BR-S3")
assert.ok(process.env.LOGINOM_AI_AGENT_TEST_CONFIG, "Private config required")
assert.ok(process.env.LOGINOM_AI_AGENT_TEST_RESOURCES, "Fresh staged resources required")
const config = await Bun.file(process.env.LOGINOM_AI_AGENT_TEST_CONFIG!).json()
assert.equal(config.workflow_profile.passwordless_login, true)
const resources = resolve(process.env.LOGINOM_AI_AGENT_TEST_RESOURCES!)
const manifestBytes = await Bun.file(join(resources, "resource-manifest.json")).text()
const manifest = JSON.parse(manifestBytes)
const run = randomUUID()
const directory = join(resources, "..", "evidence", run)
await mkdir(directory, { recursive: true, mode: 0o700 })
console.log(`Private acceptance evidence: ${directory}`)
const packagePath = `/${config.workflow_profile.loginom_user}/browser-recovery-${run}.lgp`
const sequence = { value: 0 }
const child = await supervise({
  node: join(resources, "bin/node"),
  entry: join(resources, "runtime/src/managed-entry.mjs"),
  resources,
  stateDir: directory,
  generation: 1,
  chat: run,
  headless: false,
  connection: {
    url: config.loginom_url,
    username: config.workflow_profile.loginom_user,
    apiKey: config.api_key,
    password: "",
  },
  endpoint: manifest.endpoint,
  actionManifestUri: manifest.actionManifestUri,
  actionManifestSha256: manifest.actionManifestSha256,
  acceptanceCleanupPackage: packagePath,
  browserRecovery: true,
  acceptanceFault: [
    {
      kind: "phase_stop",
      node_type: "transform.calculator",
      phase: "configure",
      code: "UI_SCAN_LIMIT",
      times: scenario === "BR-S1" ? 1 : 3,
    },
    ...(scenario === "BR-S1"
      ? [{ kind: "release_refusal" as const, node_type: "transform.calculator", times: 1 }]
      : []),
  ],
})
async function invoke(name: string, args: Record<string, unknown>) {
  const reply = await child.request("call", { name, arguments: args })
  assert.ok(reply && typeof reply === "object" && "result" in reply, "Invalid tool envelope")
  const serialized = JSON.stringify(reply.result)
  await writeFile(join(directory, `${String(++sequence.value).padStart(2, "0")}-${name}.json`), serialized, {
    mode: 0o600,
  })
  assert.ok(!serialized.includes(config.api_key), "Secret in tool result")
  const result = JSON.parse(serialized)
  assert.ok(!serialized.includes("user_action"), "Unexpected user_action")
  assert.ok(!result.isError, `Tool failed: ${name}`)
  return result
}
async function call(name: string, args: Record<string, unknown>) {
  const result = await invoke(name, args)
  return (
    result.structuredContent ?? JSON.parse(result.content.find((item: { type: string }) => item.type === "text").text)
  )
}
async function waitNode(operation: string) {
  const deadline = Date.now() + 240000
  while (Date.now() < deadline) {
    const result = await call("dock_node_wait", {
      operation_id: operation,
      timeout_ms: Math.min(60000, deadline - Date.now()),
    })
    if (result.state === "settled") return result
  }
  throw Error("NODE_DEADLINE_EXCEEDED")
}
async function apply(request: Record<string, unknown> & { operation_id: string }) {
  let result = await call("dock_node_apply", request)
  if (result.state === "running") result = await waitNode(request.operation_id)
  assert.equal(result.state, "settled")
  return result
}
function text(result: { content: Array<{ type: string; text?: string }> }) {
  return result.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
}
async function findOwnedControl(target: string, owner: string) {
  const button = text(await invoke("browser_snapshot", { target, depth: 2 }))
  const ref = button.match(/```yaml\n- [^\n]*\[ref=([a-zA-Z0-9]+)\]/)?.[1]
  assert.ok(ref, "Unique observed control root required")
  const found = text(await invoke("browser_find", { regex: `\\[ref=${ref}\\]` }))
  assert.match(found, /Found 1 match for /, "Control must match exactly once")
  const snapshot = text(await invoke("browser_snapshot", { target: owner, depth: 8 }))
  assert.equal(
    snapshot.split("\n").filter((line) => line.includes(`[ref=${ref}]`)).length,
    1,
    "Control must belong to the current owner",
  )
  return { ref, snapshot }
}
const status: Record<string, unknown> = {
  scenario,
  status: "FAIL",
  resourceManifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
}
try {
  const csv = await Bun.file(join(import.meta.dir, "fixtures/standalone-cli/A/sales.csv")).text()
  const files = await inputStore(join(directory, "inputs")).admit(
    run,
    "input",
    [{ name: "sales.csv", data: Buffer.from(csv).toString("base64") }],
    `/${config.workflow_profile.loginom_user}`,
  )
  await child.request("admit", { userMessage: "input", files })
  const prepared = await call("dock_prepare", { intent: "new_draft", operation_id: "prepare" })
  assert.equal(prepared.workspace.authenticated, true)
  assert.equal(prepared.input_artifacts.length, 1)
  const artifact = prepared.input_artifacts[0]
  let delivery = await call("dock_artifact_deliver", {
    operation_id: "deliver",
    artifact_id: artifact.artifact_id,
    upload_grant_id: artifact.upload.grant_id,
    budget_ms: 90000,
  })
  // Resume only the runtime's proven no-upload checkpoint, once, with its original identity.
  if (
    delivery.status === "NOT_APPLIED" &&
    delivery.effect_possible === false &&
    delivery.cleanup_complete === true &&
    delivery.output?.upload_submitted_or_unknown === false &&
    delivery.output?.inspection_required === false &&
    delivery.next_step?.tool === "dock_artifact_delivery_resume" &&
    delivery.next_step.original_operation_id === "deliver"
  )
    delivery = await call("dock_artifact_delivery_resume", {
      operation_id: "deliver",
      resume_id: "deliver-resume",
      budget_ms: 120000,
    })
  assert.equal(delivery.status, "SUCCEEDED")
  assert.equal(delivery.output.upload_completion_verified, true)
  const identity = {
    contract_revision: "1.0.0",
    document_id: prepared.workspace.document_id,
    workflow_ref: { workflow_id: prepared.workspace.workflow_ref.workflow_id },
  }
  const policy = {
    mappings: [],
    finish: "execute",
    read: { ports: [], sample_rows: 10, require_exact_numbers: true, coverage: "sample" },
  }
  const imported = await apply({
    ...identity,
    ...policy,
    operation_id: "import",
    target: { kind: "new", type: "imports.text", label: "Recovery CSV", position: { x: 240, y: 160 } },
    inputs: [],
    mode: "delimited",
    parameters: {
      source: { artifact_id: artifact.artifact_id, upload_operation_id: delivery.output.upload_operation_id },
      settings: {
        source: {
          source_path: artifact.upload.destination,
          encoding: "UTF-8",
          rows_to_skip: 0,
          first_line_as_title: true,
        },
        format: { delimiter: ";", decimal_separator: ".", null_marker: "", text_qualifier: '"' },
        columns: [
          { name: "Category", label: "Category", type: "string", data_kind: "Дискретный", used: true },
          { name: "amount", label: "amount", type: "integer", data_kind: "Непрерывный", used: true },
        ],
      },
    },
  })
  assert.equal(imported.status, "SUCCEEDED")
  const parameters = {
    expressions: [
      {
        target: { kind: "new" },
        name: "DoubleAmount",
        label: "DoubleAmount",
        type: "integer",
        formula: "amount * 2",
        replace: false,
      },
    ],
  }
  const request = {
    ...identity,
    ...policy,
    operation_id: "calculator",
    target: { kind: "new", type: "transform.calculator", label: `Recovery ${scenario}`, position: { x: 520, y: 160 } },
    inputs: [{ source: imported.node, output: 0, input: 0 }],
    mode: "expression",
    parameters,
  }
  let stopped = await apply(request)
  assert.notEqual(stopped.status, "SUCCEEDED")
  await call("dock_operation_inspect", { operation_id: request.operation_id })
  const released = await call("dock_operation_recover", {
    operation_id: request.operation_id,
    recovery_operation_id: "release",
    strategy: "abandon_operation",
  })
  if (scenario === "BR-S3") {
    assert.equal(released.status, "SUCCEEDED")
    stopped = await apply({
      ...request,
      operation_id: "calculator-again",
      target: { kind: "existing", type: "transform.calculator", ref: stopped.node },
      inputs: [],
      mappings: [],
    })
  }
  assert.equal(
    scenario === "BR-S1" ? released.output?.browser_recovery?.basis?.trigger : stopped.next_step?.trigger,
    scenario === "BR-S1" ? "T1" : "T3",
  )
  const operation = scenario === "BR-S1" ? "calculator" : "calculator-again"
  const started = await call("dock_browser_recovery", { action: "start", operation_id: operation })
  assert.equal(started.state, "browser")
  assert.equal(started.recovery_input.node.node_id, stopped.node.node_id)
  const wizard = `[data-tid="${started.recovery_input.workflow_ref.prefix};WizrdMCF"]`
  // Canonical controls from node-wizard-close/calculator-node; refs are freshly observed, never inferred from position.
  const label = scenario === "BR-S1" ? "Отмена" : "Выполнить"
  const button = scenario === "BR-S1" ? "btnClose" : "btnExecute"
  const owned = await findOwnedControl(
    `${wizard} [data-tid="${started.recovery_input.workflow_ref.prefix};WizrdMCF;${button}"]`,
    wizard,
  )
  assert.ok(owned.snapshot.includes("Описание узла"), "Expected observed final wizard page")
  await invoke("browser_click", { target: owned.ref })
  if (scenario === "BR-S1") {
    const question = "Вы действительно хотите закрыть мастер настройки?"
    const confirmation = text(await invoke("browser_find", { text: question }))
    if (!confirmation.includes("No matches found for")) {
      const dialog = ".x-message-box:visible"
      const snapshot = text(await invoke("browser_snapshot", { target: dialog, depth: 6 }))
      assert.ok(snapshot.includes(question) && snapshot.includes("Подтвердить"), "Unexpected cancellation question")
      assert.ok(snapshot.includes("Да") && snapshot.includes("Нет"), "Unexpected cancellation choices")
      const yes = await findOwnedControl(`${dialog} [data-tid="msgbox;tlb;yes"]`, dialog)
      assert.ok(yes.snapshot.includes(question), "Cancellation question changed")
      await invoke("browser_click", { target: yes.ref })
    }
  }
  await invoke("browser_wait_for", { textGone: "Описание узла" })
  const recovered = await call("dock_browser_recovery", {
    action: "finish",
    report: {
      actions: [`Clicked ${label} in the owned wizard`],
      result: "Wizard closed",
      settings: ["DoubleAmount = amount * 2; integer; no output mapping"],
    },
  })
  assert.equal(recovered.state, "dock")
  assert.equal(recovered.result, scenario === "BR-S1" ? "continuable" : "completed")
  status.recovery = recovered
  let source = recovered.receipt_id
  if (scenario === "BR-S1") {
    const resumed = await apply({
      ...request,
      operation_id: "calculator-corrected",
      target: { kind: "existing", type: "transform.calculator", ref: stopped.node },
      inputs: [],
      mappings: [],
    })
    assert.equal(resumed.status, "SUCCEEDED")
    assert.equal(resumed.cleanup_complete, true)
    source = "calculator-corrected"
  }
  let read = await call("dock_node_read", {
    source_operation_id: source,
    operation_id: "read",
    read: { ports: [0], sample_rows: 10, require_exact_numbers: true },
  })
  if (read.state === "running") read = await waitNode("read")
  assert.equal(read.status, "SUCCEEDED")
  status.readSourceOperation = source
  let saved = await invoke("dock_action_run", {
    action_key: "package.save_checkpoint",
    operation_id: "save",
    parameters: { path: packagePath, conflict_policy: "fail" },
  })
  const body = saved.structuredContent ?? JSON.parse(saved.content[0].text)
  assert.equal(body.status, "SUCCEEDED")
  assert.equal(body.output?.package_ref?.path, packagePath)
  assert.equal(body.output.save_completed, true)
  assert.equal(body.output.workflow_preserved, true)
  let dirty = saved.content
    .filter((block: { type: string }) => block.type === "text")
    .map((block: { text: string }) => JSON.parse(block.text))
    .find((block: { kind: string }) => block.kind === "dock_saved_package_state")
  let saveOperation = "save"
  if (dirty?.modified === true) {
    assert.equal(dirty.next_step?.tool, "dock_action_run")
    assert.equal(dirty.next_step.arguments?.action_key, "package.save_checkpoint")
    saveOperation = "checkpoint"
    saved = await invoke("dock_action_run", { ...dirty.next_step.arguments, operation_id: saveOperation })
    const checkpoint = saved.structuredContent ?? JSON.parse(saved.content[0].text)
    assert.equal(checkpoint.status, "SUCCEEDED")
    assert.equal(checkpoint.output?.package_ref?.path, packagePath)
    dirty = saved.content
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { text: string }) => JSON.parse(block.text))
      .find((block: { kind: string }) => block.kind === "dock_saved_package_state")
  }
  assert.equal(dirty?.package_path, packagePath)
  assert.equal(dirty?.modified, false)
  status.saved = { operation_id: saveOperation, modified: false }
  status.status = "PASS"
} catch (error) {
  status.error = error instanceof Error ? error.message : "Unknown failure"
} finally {
  status.runtimeClose = await child.close().then(
    () => "confirmed",
    () => "unconfirmed",
  )
  const attempts = join(directory, "generations/1/chats", run, "attempts")
  const names = await readdir(attempts)
  assert.equal(names.length, 1)
  const attempt = join(attempts, names[0])
  const cleanup = Bun.file(join(attempt, "package-cleanup.json"))
  const packageCleanup = (await cleanup.exists()) ? await cleanup.json() : { status: "UNVERIFIED" }
  status.packageCleanup = packageCleanup
  status.packageCleanupConfirmed =
    packageCleanup.status === "SUCCEEDED" &&
    packageCleanup.package_closed === true &&
    packageCleanup.logged_out === true &&
    packageCleanup.unsaved_changes_discarded === false &&
    packageCleanup.package_path === packagePath &&
    packageCleanup.save_operation_id === (status.saved as { operation_id?: string } | undefined)?.operation_id
  const journal = await Bun.file(join(attempt, "execution-events.jsonl"))
    .text()
    .catch(() => "")
  const faults = journal
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((event) => event.phase === "acceptance_fault_injected")
  status.faults = faults.map((event) => ({ kind: event.kind, phase: event.target_phase, remaining: event.remaining }))
  const configure = faults.filter((event) => event.kind === "phase_stop" && event.target_phase === "configure")
  if (
    configure.length !== (scenario === "BR-S1" ? 1 : 2) ||
    configure.at(-1)?.remaining !== (scenario === "BR-S1" ? 0 : 1)
  )
    status.status = "FAIL"
  status.journalPhases = [
    "acceptance_fault_injected",
    "browser_recovery_handoff",
    "browser_recovery_verified",
    "browser_recovery_dock_resumed",
  ].filter((phase) => journal.includes(`"phase":"${phase}"`))
  if (
    status.runtimeClose !== "confirmed" ||
    status.packageCleanupConfirmed !== true ||
    (status.journalPhases as string[]).length !== 4
  )
    status.status = "FAIL"
  await writeFile(join(directory, "result.json"), JSON.stringify(status, null, 2), { mode: 0o600 })
}
console.log(`${scenario}: ${status.status}`)
if (status.status !== "PASS") process.exitCode = 1
