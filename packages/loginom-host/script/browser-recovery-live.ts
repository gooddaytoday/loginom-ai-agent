#!/usr/bin/env bun
// Operator-only live acceptance for browser recovery. It plays the model over the
// real private Node Host of an installed build: a read cancelled in its read phase
// leaves no Dock option (T2), the lease is started, browser tools act on the same
// page, finish is verified by the runtime and Dock continues. It never runs in CI.
// Usage: bun script/browser-recovery-live.ts <build-dir> <configured-cli-profile> <csv> <package-path> <evidence-dir>
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { launchNodeHost } from "../src/node-client"

const [build, profile, csv, packagePath, evidence] = process.argv.slice(2).map((value, index) =>
  index === 3 ? value : resolve(value),
)
if (!build || !profile || !csv || !packagePath?.endsWith(".lgp") || !evidence)
  throw new Error("Usage: <build-dir> <configured-cli-profile> <csv> <package-path> <evidence-dir>")
await mkdir(evidence, { recursive: true })
const resources = join(build, "resources/loginom")
const host = await launchNodeHost({
  node: join(resources, "bin/node"),
  entry: join(resources, "host/node-host.mjs"),
  root: join(profile, "loginom"),
  resources,
  headless: true,
  environment: process.env,
  browserRecovery: true,
})
const run = "live-" + Date.now()
const userMessage = "msg_" + run
const log: unknown[] = []
const record = async (step: string, value: unknown) => {
  log.push({ step, at: new Date().toISOString(), value })
  await writeFile(join(evidence, "steps.json"), JSON.stringify(log, null, 2))
  console.log(step, JSON.stringify(value).slice(0, 600))
}
const call = async (name: string, args: unknown, admissions?: unknown) => {
  const result = await host
    .request("call", { run, name, args, userMessage, ...(admissions ? { admissions } : {}) }, 400_000)
    .catch((error: Error) => ({ isError: true, content: [{ type: "text", text: error.message }] }))
  await record(name, result)
  return result as { isError?: boolean; structuredContent?: Record<string, unknown>; content: { type: string; text?: string }[] }
}
const json = (result: { content: { type: string; text?: string }[] }) => JSON.parse(result.content[0]?.text ?? "null")
const tools = async () => {
  const listed = (await host.request("tools", { run })) as { tools: { name: string }[] }
  const names = listed.tools.map((tool) => tool.name)
  await record("tools", names)
  return names
}
const settle = async (id: string) => {
  for (let i = 0; i < 60; i++) {
    const job = json(await call("dock_node_wait", { operation_id: id, timeout_ms: 10_000 }))
    if (job.state === "settled") return job
  }
  throw new Error("Job did not settle: " + id)
}
const check = (ok: unknown, message: string) => {
  if (!ok) throw new Error("CHECK FAILED: " + message)
}

try {
  await host.request("connection.ready", {})
  await record("acquire", await host.request("acquire", { run, session: run }))
  await host.request("scope", { run, mode: "bind", scope: { taskMessageID: userMessage, profile: "loginom-automation" } })
  const prepared = json(
    await call("dock_prepare", { intent: "new_draft" }, [
      { userMessage, files: [{ name: basename(csv), data: (await readFile(csv)).toString("base64") }] },
    ]),
  )
  check(prepared.prepared === true, "prepared")
  const names = await tools()
  check(names.includes("dock_browser_recovery") && !names.includes("browser_click"), "recovery tool listed, browser tools hidden")
  const artifact = prepared.input_artifacts[0]
  const delivered = json(
    await call("dock_artifact_deliver", {
      operation_id: "deliver-1",
      artifact_id: artifact.artifact_id,
      upload_grant_id: artifact.upload_grant_id,
      budget_ms: 60_000,
    }),
  )
  check(delivered.status === "SUCCEEDED", "delivered")
  const workflow = { workflow_id: prepared.workspace.workflow_ref.workflow_id }
  await call("dock_node_apply", {
    operation_id: "import-1",
    contract_revision: "1.0.0",
    document_id: prepared.workspace.document_id,
    workflow_ref: workflow,
    target: { kind: "new", type: "imports.text", label: "Источник" },
    inputs: [],
    mode: "delimited",
    parameters: {
      source: { artifact_id: artifact.artifact_id, upload_operation_id: "deliver-1:upload" },
      settings: JSON.parse(await readFile(csv + ".settings.json", "utf8")),
    },
    finish: "execute",
    read: { sample_rows: 5 },
  })
  check((await settle("import-1")).status === "SUCCEEDED", "import succeeded")

  // T2: cancel a fresh read once it reaches its read phase.
  await call("dock_node_read", { operation_id: "read-1", source_operation_id: "import-1", read: { ports: [0], sample_rows: 5 } })
  for (let i = 0; i < 600; i++) {
    const status = json(await call("dock_node_status", { operation_id: "read-1" }))
    if (status.progress?.pending_phase === "read" || status.state === "settled") break
    await Bun.sleep(100)
  }
  await call("dock_node_cancel", { operation_id: "read-1" })
  const stopped = await settle("read-1")
  await record("stopped-read", stopped)
  const inspected = json(await call("dock_operation_inspect", { operation_id: "read-1" }))
  const next = inspected.output?.next_steps?.[0]
  await record("trigger", { browser_recovery: inspected.output?.browser_recovery, next })
  check(next?.tool === "dock_browser_recovery", "browser recovery is the next step")

  // Dock control is refused while the lease is held; the lease starts in browser.
  const started = await call("dock_browser_recovery", { action: "start", operation_id: "read-1" })
  check(started.structuredContent?.phase === "browser", "lease reached browser phase")
  check((await tools()).includes("browser_snapshot"), "browser tools listed after start")
  check((await call("dock_node_read", { operation_id: "read-x", source_operation_id: "import-1" })).isError, "Dock refused")
  check((await call("browser_navigate", { url: "https://example.test" })).isError, "navigation refused")
  await call("browser_snapshot", { depth: 3 })
  const path = prepared.workspace.workflow_ref.navigation_path ?? []
  let verification = await call("dock_browser_recovery", {
    action: "finish",
    operation_id: "read-1",
    actions_performed: ["Inspected the page after the cancelled read"],
  })
  if (verification.structuredContent?.phase === "browser" && path.length) {
    await call("browser_click", { target: `[data-tid="${path.at(-1).tid}"]`, element: "scenario breadcrumb" })
    verification = await call("dock_browser_recovery", {
      action: "finish",
      operation_id: "read-1",
      actions_performed: ["Returned from the output view to the scenario"],
    })
  }
  const verified = verification.structuredContent?.verification as { status?: string; next_step?: { tool?: string } }
  check(verification.structuredContent?.phase === "dock" && verified?.status === "continuable", "verified continuable")
  check(!(await tools()).includes("browser_snapshot"), "browser tools withdrawn after finish")

  // Dock continues the step and saves.
  await call("dock_node_read", { operation_id: "read-2", source_operation_id: "import-1", read: { ports: [0], sample_rows: 5 } })
  check((await settle("read-2")).status === "SUCCEEDED", "Dock continued with a fresh read")
  const saved = json(
    await call("dock_action_run", {
      action_key: "package.save_checkpoint",
      operation_id: "save-1",
      parameters: { path: packagePath, conflict_policy: "replace" },
    }),
  )
  check(saved.status === "SUCCEEDED", "package saved")
  await record("RESULT", "PASS")
} catch (error) {
  await record("RESULT", "FAIL: " + (error as Error).message)
  process.exitCode = 1
} finally {
  await host.request("release", { run }).catch(() => undefined)
  await host.close().catch((error) => console.error("close", error))
}
