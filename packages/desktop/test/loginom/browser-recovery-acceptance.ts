import { supervise } from "@loginom-ai-agent/loginom-host/supervisor"
import { createHash, randomUUID } from "node:crypto"
import { mkdir, readdir, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import assert from "node:assert/strict"

process.umask(0o077)
const scenario = process.argv[2]
assert.ok(
  scenario === "BR-S1" || scenario === "BR-S2" || scenario === "BR-S3" || scenario === "BR-S4" || scenario === "BR-S5" || scenario === "BR-S6",
  "Expected BR-S1, BR-S2, BR-S3, BR-S4, BR-S5 or BR-S6",
)
assert.equal(process.argv.length, 4, "Expected scenario and one private saved-A manifest path")
const exportsFile = scenario === "BR-S2" || scenario === "BR-S5" || scenario === "BR-S6"
const noBrowserCalls = scenario === "BR-S4" || scenario === "BR-S5"
const seed = await Bun.file(resolve(process.argv[3]!)).json()
assert.equal(seed.label, "A")
assert.equal(typeof seed.path, "string")
assert.equal(typeof seed.node, "string")
assert.deepEqual(seed.expected, { Alpha: 35, Beta: 20 })
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
      node_type: exportsFile ? "exports.text" : "transform.calculator",
      phase: noBrowserCalls ? "execute" : "configure",
      code: "UI_SCAN_LIMIT",
      times: scenario === "BR-S3" ? 3 : 1,
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
// S6 alone expects public refusals; ordinary invoke remains strict.
async function refuse(name: string, args: Record<string, unknown>, code: string) {
  assert.equal(scenario, "BR-S6")
  const reply = await child.request("call", { name, arguments: args })
  assert.ok(reply && typeof reply === "object" && "result" in reply, "Invalid tool envelope")
  const serialized = JSON.stringify(reply.result)
  await writeFile(join(directory, `${String(++sequence.value).padStart(2, "0")}-${name}.json`), serialized, {
    mode: 0o600,
  })
  assert.ok(!serialized.includes(config.api_key), "Secret in tool result")
  assert.ok(!serialized.includes("user_action"), "Unexpected user_action")
  const result = JSON.parse(serialized)
  assert.equal(result.isError, true)
  const body =
    result.structuredContent ?? JSON.parse(result.content.find((item: { type: string }) => item.type === "text").text)
  assert.equal(body.error?.code, code)
  return { result, body }
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
async function runScenario() {
  const opened = await call("dock_prepare", {
    intent: "open_package",
    package_path: seed.path,
    operation_id: "open-seed",
  })
  assert.equal(opened.workspace.status, "READY")
  assert.equal(opened.workspace.package_ref.path, seed.path)
  const copied = await call("dock_action_run", {
    action_key: "package.save_as",
    operation_id: "own-save-as",
    parameters: { path: packagePath, conflict_policy: "fail" },
  })
  assert.equal(copied.status, "SUCCEEDED")
  assert.equal(copied.cleanup_complete, true)
  assert.equal(copied.output.package_ref.path, packagePath)
  const prepared = await call("dock_prepare", {
    intent: "open_package",
    package_path: packagePath,
    operation_id: "prepare-copy",
  })
  assert.equal(prepared.workspace.status, "READY")
  assert.equal(prepared.workspace.authenticated, true)
  assert.equal(prepared.workspace.package_ref.path, packagePath)
  assert.ok(
    !prepared.workspace.workflow_ref.navigation_path.some((item: { label: string }) =>
      item.label.endsWith("(только чтение)"),
    ),
    "COLD_PACKAGE_READONLY",
  )
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
  const grouped = await apply({
    ...identity,
    operation_id: "group",
    target: {
      kind: "existing",
      type: "transform.group_data",
      ref: {
        document_id: identity.document_id,
        workflow_id: identity.workflow_ref.workflow_id,
        node_id: seed.node,
      },
    },
    inputs: [],
    mappings: [],
    parameters: {},
    mode: "aggregate",
    finish: "execute",
    read: { ports: [0], sample_rows: 10, require_exact_numbers: true },
  })
  assert.equal(grouped.status, "SUCCEEDED")
  assert.equal(grouped.cleanup_complete, true)
  assert.equal(grouped.execution.status, "completed")
  const port = grouped.output.ports.find((item: { port: number }) => item.port === 0)
  assert.equal(port.fresh, true)
  assert.equal(port.execution_id, grouped.execution.execution_id)
  assert.equal(port.row_count, 2)
  assert.equal(port.sample_complete, true)
  assert.equal(port.precision.numbers_verified, true)
  assert.deepEqual(
    port.schema.map((field: { name: string; type: string }) => [field.name, field.type]).sort(),
    [["Category", "string"], ["Total", "real"]],
  )
  const category = port.schema.findIndex((field: { name: string }) => field.name === "Category")
  const total = port.schema.findIndex((field: { name: string }) => field.name === "Total")
  assert.deepEqual(
    port.sample.map((row: Array<{ value: string | number }>) => [row[category].value, row[total].value]).sort(),
    Object.entries(seed.expected).sort(),
  )
  const destination = exportsFile ? `${prepared.storage_directories.exports}/browser-recovery-${run}.csv` : ""
  const parameters = exportsFile
    ? {
        destination,
        overwrite: "replace",
        encoding: "UTF-8",
        delimiter: ";",
        header: "names",
        bom: false,
        line_ending: "LF",
        decimal_separator: ".",
        null_marker: "",
        text_qualifier: '"',
      }
    : {
        expressions: [
          {
            target: { kind: "new" },
            name: "DoubleAmount",
            label: "DoubleAmount",
            type: "integer",
            formula: "Total*2",
            replace: false,
          },
        ],
      }
  const request = {
    ...identity,
    ...policy,
    ...(exportsFile ? { read: { ports: [], sample_rows: 0, require_exact_numbers: false } } : {}),
    operation_id: exportsFile ? "export" : "calculator",
    target: {
      kind: "new",
      type: exportsFile ? "exports.text" : "transform.calculator",
      label: `Recovery ${scenario}`,
      position: { x: 520, y: 160 },
    },
    inputs: [{ source: grouped.node, output: 0, input: 0 }],
    mode: exportsFile ? "delimited" : "expression",
    parameters,
  }
  let stopped = await apply(request)
  assert.notEqual(stopped.status, "SUCCEEDED")
  const inspected = await call("dock_operation_inspect", { operation_id: request.operation_id })
  if (exportsFile) {
    assert.deepEqual(inspected.output.recovery_options, [])
    assert.equal(inspected.next_step?.trigger, "T2")
    assert.equal(inspected.next_step?.reason_code, "NO_RECOVERY_OPTIONS")
  }
  const released =
    exportsFile
      ? undefined
      : await call("dock_operation_recover", {
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
  if (scenario === "BR-S4") {
    assert.equal(released.status, "SUCCEEDED")
    assert.equal(released.output.original_outcome.output.browser_recovery.next_step.trigger, "T4")
    assert.equal(released.output.original_outcome.output.browser_recovery.next_step.effect, "execution")
  }
  if (scenario !== "BR-S4") {
    assert.equal(
      scenario === "BR-S1" ? released.output?.browser_recovery?.basis?.trigger : stopped.next_step?.trigger,
      scenario === "BR-S1" ? "T1" : exportsFile ? "T2" : "T3",
    )
  }
  const operation = scenario === "BR-S3" ? "calculator-again" : request.operation_id
  const started = await call("dock_browser_recovery", { action: "start", operation_id: operation })
  assert.equal(started.state, "browser")
  if (scenario === "BR-S2" || scenario === "BR-S4" || scenario === "BR-S6") assert.equal(started.budget.calls_remaining, 30)
  assert.equal(started.recovery_input.node.node_id, stopped.node.node_id)
  if (scenario === "BR-S6") {
    const began = Date.now()
    status.recoveryAttempt = started.attempt_id
    await refuse("dock_workspace_observe", {}, "BROWSER_RECOVERY_ACTIVE")
    await refuse("browser_evaluate", { function: "() => 1" }, "BROWSER_RECOVERY_ACTIVE")
    const forbidden = await refuse(
      "browser_snapshot",
      { filename: join(directory, "forbidden.txt") },
      "BROWSER_RECOVERY_ARGUMENT_FORBIDDEN",
    )
    assert.equal(forbidden.result._meta["loginom/browser_recovery"].calls_remaining, 30)
    await refuse("browser_navigate", { url: config.loginom_url }, "BROWSER_RECOVERY_ACTIVE")
    for (let count = 1; count <= 30; count++) {
      const snapshot = await invoke("browser_snapshot", { depth: 1 })
      const metadata = snapshot._meta["loginom/browser_recovery"]
      assert.equal(metadata.attempt_id, started.attempt_id)
      assert.equal(metadata.state, "browser")
      assert.equal(metadata.calls_remaining, 30 - count)
    }
    const exhausted = await refuse("browser_snapshot", { depth: 1 }, "BROWSER_RECOVERY_BUDGET_EXHAUSTED")
    status.recovery = exhausted.body
    assert.equal(exhausted.body.state, "stopped")
    assert.equal(exhausted.body.stop_reason, "budget_exhausted")
    assert.equal(exhausted.result._meta["loginom/browser_recovery"].attempt_id, started.attempt_id)
    assert.equal(exhausted.result._meta["loginom/browser_recovery"].state, "stopped")
    assert.equal(exhausted.result._meta["loginom/browser_recovery"].calls_remaining, 0)
    status.browserElapsedMs = Date.now() - began
    assert.ok((status.browserElapsedMs as number) < 600000)
    status.status = "PASS"
    return
  }
  const label = scenario === "BR-S3" ? "Выполнить" : "Отмена"
  if (!noBrowserCalls) {
    const wizard = `[data-tid="${started.recovery_input.workflow_ref.prefix};WizrdMCF"]`
    // Canonical controls from node-wizard-close/calculator-node; refs are freshly observed, never inferred from position.
    const button = scenario === "BR-S3" ? "btnExecute" : "btnClose"
    const owned = await findOwnedControl(
      `${wizard} [data-tid="${started.recovery_input.workflow_ref.prefix};WizrdMCF;${button}"]`,
      wizard,
    )
    assert.ok(owned.snapshot.includes("Описание узла"), "Expected observed final wizard page")
    await invoke("browser_click", { target: owned.ref })
    if (scenario !== "BR-S3") {
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
  }
  const recovered = await call("dock_browser_recovery", {
    action: "finish",
    report: {
      actions: noBrowserCalls ? [] : [`Clicked ${label} in the owned wizard`],
      result:
        scenario === "BR-S4"
          ? "No browser actions; verify the released execution"
          : scenario === "BR-S5"
            ? "No browser actions; verify the current export file"
            : "Wizard closed",
      settings: [
        scenario === "BR-S2"
          ? "Export draft cancelled; intended UTF-8 CSV settings will be reapplied through Dock"
          : scenario === "BR-S5"
            ? "Export UTF-8 CSV settings unchanged; verify the current file"
            : "DoubleAmount = Total*2; integer; no output mapping",
      ],
    },
  })
  assert.equal(recovered.state, "dock")
  assert.equal(recovered.result, scenario === "BR-S3" || noBrowserCalls ? "completed" : "continuable")
  if (scenario === "BR-S4") {
    assert.equal(recovered.verified.execution.verified, true)
    assert.equal(recovered.verified.execution.owner_verified, true)
    assert.equal(recovered.verified.execution.status, "completed")
    assert.equal(recovered.verified.output_schema.verified, true)
    assert.equal(recovered.next_step.tool, "dock_node_read")
    assert.equal(recovered.next_step.arguments.source_operation_id, recovered.receipt_id)
  }
  if (scenario === "BR-S5") {
    assert.equal(recovered.verified.execution.verified, true)
    assert.equal(recovered.verified.execution.owner_verified, true)
    assert.equal(recovered.verified.execution.status, "completed")
    assert.equal(recovered.next_step.tool, undefined)
    assert.ok(recovered.next_step.instruction.includes(destination))
  }
  status.recovery = recovered
  let source = recovered.receipt_id
  if (scenario === "BR-S2") {
    const original = await waitNode(operation)
    assert.equal(original.output.released_by, "browser_recovery")
    assert.equal(original.output.recovery_receipt_id, recovered.receipt_id)
  }
  const resumed =
    scenario === "BR-S1" || scenario === "BR-S2"
      ? await apply({
          ...request,
          operation_id: scenario === "BR-S2" ? "export-corrected" : "calculator-corrected",
          target: { kind: "existing", type: request.target.type, ref: stopped.node },
          inputs: [],
          mappings: [],
        })
      : undefined
  if (resumed) {
    assert.equal(resumed.status, "SUCCEEDED")
    assert.equal(resumed.cleanup_complete, true)
    source = scenario === "BR-S2" ? "export-corrected" : "calculator-corrected"
  }
  if (exportsFile) {
    if (scenario === "BR-S2") {
      assert.deepEqual(resumed.node, stopped.node)
      assert.equal(resumed.execution.status, "completed")
      assert.equal(resumed.output.file_artifacts.length, 1)
    }
    const { verified: fileVerified, ...recoveredArtifact } = recovered.verified?.export_file ?? {}
    if (scenario === "BR-S5") assert.equal(fileVerified, true)
    const artifact = scenario === "BR-S2" ? resumed.output.file_artifacts[0] : recoveredArtifact
    const execution = scenario === "BR-S2" ? resumed.execution : recovered.verified.execution
    assert.equal(artifact.destination, destination)
    assert.equal(artifact.execution_id, execution.execution_id)
    assert.equal(artifact.freshness_basis, "native_absence_check_and_completed_execution")
    const attempts = join(directory, "generations/1/chats", run, "attempts")
    const names = await readdir(attempts)
    assert.equal(names.length, 1)
    const attempt = join(attempts, names[0])
    const session = await Bun.file(join(attempt, "session.json")).json()
    const events = (await Bun.file(join(attempt, "execution-events.jsonl")).text())
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    const browserCalls = events.filter((event) => event.phase === "browser_recovery_call")
    if (scenario === "BR-S2")
      assert.equal(recovered.budget.calls_remaining, started.budget.calls_remaining - browserCalls.length - 1)
    const configured = events.filter(
      (event) =>
        event.operation_id === (scenario === "BR-S2" ? source : operation) &&
        event.phase === "node_phase_completed" &&
        event.receipt?.phase === "configure",
    )
    assert.equal(configured.length, 1)
    const check = configured[0].receipt.value.configuration.configured.destination_check
    assert.equal(check.verified, true)
    assert.equal(check.destination, destination)
    assert.equal(check.existed, false)
    const verified = events.filter(
      (event) => event.phase === "export_file_bytes_verified" && event.result.verification_id === artifact.verification_id,
    )
    assert.equal(verified.length, 1)
    assert.deepEqual(verified[0].result, artifact)
    if (scenario === "BR-S2") assert.equal(verified[0].operation_id, source)
    if (scenario === "BR-S5") {
      const receipt = events.filter(
        (event) => event.operation_id === recovered.receipt_id && event.phase === "browser_recovery_verified",
      )
      assert.equal(receipt.length, 1)
      assert.equal(receipt[0].result.original_operation_id, operation)
      assert.deepEqual(receipt[0].result.node, stopped.node)
      assert.deepEqual(receipt[0].facts.export_file, recovered.verified.export_file)
    }
    const binding = {
      session_id: session.sessionId,
      document_id: identity.document_id,
      workflow_id: identity.workflow_ref.workflow_id,
      node_id: stopped.node.node_id,
      execution_id: execution.execution_id,
      destination,
    }
    assert.deepEqual(verified[0].binding, binding)
    const download = events.filter(
      (event) => event.operation_id === verified[0].operation_id && event.phase === "export_file_download_completed",
    )
    assert.equal(download.length, 1)
    assert.equal(download[0].id, artifact.verification_id)
    assert.equal(download[0].outcome.status, "SUCCEEDED")
    assert.equal(download[0].outcome.cleanup_complete, true)
    assert.equal(download[0].outcome.output.artifact_id, artifact.artifact_id)
    assert.equal(download[0].outcome.output.download_completed, true)
    for (const [key, value] of Object.entries(binding))
      assert.equal(download[0].outcome.output.output_binding[key], value)
    const completed = events.filter(
      (event) => event.operation_id === verified[0].operation_id && event.phase === "export_file_read_completed",
    )
    assert.equal(completed.length, 1)
    assert.equal(completed[0].workflow_return_verified, true)
    assert.deepEqual(completed[0].result, artifact)
    const bytes = Buffer.from(
      await Bun.file(
        join(attempt, "artifacts/input", `output-${artifact.artifact_id}`, basename(destination)),
      ).arrayBuffer(),
    )
    assert.equal(bytes.length, artifact.bytes)
    assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256)
    const csv = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    assert.equal(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false)
    assert.equal(csv.includes("\r"), false)
    assert.equal(csv.endsWith("\n"), true)
    // This fixture has only plain Category/Total fields; other CSV syntax must fail, not be normalized.
    const rows = csv
      .slice(0, -1)
      .split("\n")
      .map((line) =>
        line.split(";").map((field) => {
          const match = /^(?:"([^";]*)"|([^";]*))$/.exec(field)
          assert.ok(match, "Unexpected CSV field syntax")
          return match[1] ?? match[2]!
        }),
      )
    assert.equal(rows.length, 3)
    const headers = rows[0]!
    assert.deepEqual([...headers].sort(), port.schema.map((field: { name: string }) => field.name).sort())
    assert.ok(rows.every((row) => row.length === headers.length))
    assert.deepEqual(
      rows
        .slice(1)
        .map((row) => {
          const number = row[headers.indexOf("Total")]!
          assert.match(number, /^[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/)
          return [row[headers.indexOf("Category")], Number(number)]
        })
        .sort(),
      port.sample.map((row: Array<{ value: string | number }>) => [row[category].value, row[total].value]).sort(),
    )
    status.file = { artifact, lineageVerified: true, semanticVerified: true, rawBytesVerified: true }
  }
  if (!exportsFile) {
    let read = await call("dock_node_read", {
      source_operation_id: source,
      operation_id: "read",
      read: { ports: [0], sample_rows: 10, require_exact_numbers: true },
    })
    if (read.state === "running") read = await waitNode("read")
    assert.equal(read.status, "SUCCEEDED")
    if (scenario === "BR-S4") {
      const output = read.output.ports.find((item: { port: number }) => item.port === 0)
      assert.equal(output.fresh, true)
      assert.equal(output.execution_id, read.execution.execution_id)
    }
    status.readSourceOperation = source
  }
  let saved = await invoke("dock_action_run", {
    action_key: "package.save_checkpoint",
    operation_id: "save",
    parameters: { path: packagePath, conflict_policy: "replace" },
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
}
try {
  await runScenario()
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
  const phaseFaults = faults.filter(
    (event) => event.kind === "phase_stop" && event.target_phase === (noBrowserCalls ? "execute" : "configure"),
  )
  if (noBrowserCalls && journal.includes('"phase":"browser_recovery_call"')) status.status = "FAIL"
  if (
    phaseFaults.length !== (scenario === "BR-S3" ? 2 : 1) ||
    phaseFaults.at(-1)?.remaining !== (scenario === "BR-S3" ? 1 : 0)
  )
    status.status = "FAIL"
  status.journalPhases = [
    "acceptance_fault_injected",
    "browser_recovery_handoff",
    "browser_recovery_verified",
    "browser_recovery_dock_resumed",
  ].filter((phase) => journal.includes(`"phase":"${phase}"`))
  if (scenario === "BR-S6") {
    try {
      const events = journal.split("\n").filter(Boolean).map((line) => JSON.parse(line))
      const calls = events.filter((event) => event.phase === "browser_recovery_call")
      assert.equal(calls.length, 30)
      calls.forEach((event, index) => {
        assert.equal(event.attempt_id, status.recoveryAttempt)
        assert.equal(event.tool, "browser_snapshot")
        assert.deepEqual(event.arguments, { depth: 1 })
        assert.equal(event.is_error, false)
        assert.deepEqual(event.page, { origin_ok: true, page_count: 1, document_present: true })
        assert.equal(event.calls_remaining, 29 - index)
      })
      assert.ok((status.journalPhases as string[]).includes("browser_recovery_handoff"))
      assert.equal(
        events.some((event) => ["browser_recovery_verified", "browser_recovery_dock_resumed"].includes(event.phase)),
        false,
      )
      status.browserCalls = calls.length
    } catch (error) {
      status.status = "FAIL"
      status.journalError = error instanceof Error ? error.message : "Unknown failure"
    }
    status.assertions = status.status
    status.scope = "negative_assertions"
  } else if (
    status.runtimeClose !== "confirmed" ||
    status.packageCleanupConfirmed !== true ||
    (status.journalPhases as string[]).length !== 4
  )
    status.status = "FAIL"
  await writeFile(join(directory, "result.json"), JSON.stringify(status, null, 2), { mode: 0o600 })
}
console.log(`${scenario}: ${status.status}`)
if (status.status !== "PASS") process.exitCode = 1
