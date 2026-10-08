import { basename, isAbsolute, join, resolve } from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { randomUUID } from "node:crypto"
import { observeProcesses } from "./processes.mjs"

// Independent acceptance runner; plans come from the local saved-package verifier.
// This entrypoint is neither shipped with the product nor exposed to the model.
process.umask(0o077)
const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const input = JSON.parse(Buffer.concat(chunks).toString())
const saved = input.plan
const name = basename(saved.packagePath)
if (
  !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.connection.username) ||
  !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.resultPrefix) ||
  saved.packagePath !== `/${input.connection.username}/${name}` ||
  !name.endsWith(".lgp") ||
  !(name.startsWith(input.resultPrefix + ".") || name.startsWith(input.resultPrefix + "-"))
)
  throw Error("COLD_PACKAGE_OWNERSHIP_INVALID")
if (saved.export.path !== `/${input.connection.username}/${input.resultPrefix}.result.csv`)
  throw Error("COLD_OUTPUT_OWNERSHIP_INVALID")
const address = new URL(input.connection.url)
if (
  !["http:", "https:"].includes(address.protocol) ||
  !["localhost", "127.0.0.1"].includes(address.hostname) ||
  address.username ||
  address.password
)
  throw Error("COLD_LOCAL_ENDPOINT_REQUIRED")
if (!/^[a-f0-9-]{36}$/i.test(saved.export.guid) || typeof saved.export.label !== "string" || !saved.export.label)
  throw Error("COLD_EXPORT_IDENTITY_INVALID")
if (![input.resources, input.output].every((path) => typeof path === "string" && isAbsolute(path)))
  throw Error("COLD_PATHS_ABSOLUTE_REQUIRED")
const root = resolve(input.resources)
const load = (name) => import(pathToFileURL(join(root, "runtime", name)).href)
const { verifyResources } = await load("src/resources.mjs")
const resources = await verifyResources(root)
const { loginBrowser } = await load("src/connection-check.mjs")
const { makeWorkspacePrepareCode } = await load("client/lib/workspace.mjs")
const { createNodeTargetBrowserAdapter } = await load("client/lib/node-target-browser.mjs")
const { createNodeProcedure } = await load("client/lib/node-procedure.mjs")
const { createNodeExecutionProcedure } = await load("client/lib/node-execution-procedure.mjs")
const { createExecutionJournal } = await load("client/lib/execution-journal.mjs")
const { withBrowserReceipt } = await load("client/lib/executor.mjs")
const { makePackageCleanupCode } = await load("client/lib/package-cleanup.mjs")
const { selectPreparedGraphNode } = await load("client/lib/node-graph-selection.mjs")
const { openPreparedWizard } = await load("client/lib/node-wizard-open.mjs")
const { closePreparedWizard } = await load("client/lib/node-wizard-close.mjs")
const { makeTextExportContextCode } = await load("client/lib/text-export-context.mjs")
await mkdir(input.output, { mode: 0o700 })
const session = randomUUID()
const secrets = [input.connection.password].filter(Boolean)
const record = createExecutionJournal({
  directory: input.output,
  metadata: { sessionId: session, clientRevision: resources.manifestHash, actionManifestDigest: resources.manifest.actionManifestSha256 },
  knownSecrets: secrets,
})
const observer = observeProcesses()
const state = { context: null, execute: null, prepared: null, closed: false }
const cleanup = () => state.execute(makePackageCleanupCode({
  sessionId: session,
  documentId: state.prepared.document_id,
  account: input.connection.username,
  packagePath: saved.packagePath,
  loginomUrl: input.connection.url,
  loginomBuild: "7.4.2",
  tabTid: state.prepared.workflow_ref.tab_tid,
  diagnosticDiscard: true,
}))
const result = { status: "FAIL", settingsReapplied: false, packagePath: saved.packagePath, packageSha256: saved.packageSha256, export: saved.export }
try {
  const opened = await loginBrowser({
    browserPath: resources.browserPath,
    profile: join(input.output, "browser"),
    candidate: input.connection,
    headless: true,
    keepOpen: true,
  })
  state.context = opened.context
  const page = opened.context.pages()[0]
  state.execute = (code) => new Function("page", `return (${code})(page)`)(page)
  const prepared = await state.execute(makeWorkspacePrepareCode({
    loginomUrl: page.url(),
    compatibility: { loginom_build: "7.4.2", platform: "linux", browser: "chromium" },
    sessionId: session,
    operationId: "cold-export-open",
    intent: "open_package",
    packagePath: saved.packagePath,
  }))
  state.prepared = prepared
  if (prepared.status !== "READY" || prepared.package_ref.path !== saved.packagePath || prepared.workflow_ref.navigation_path.some((item) => item.label.endsWith("(только чтение)")))
    throw Error("COLD_PACKAGE_NOT_WRITABLE")
  const origin = address.origin
  const adapter = createNodeTargetBrowserAdapter({ execute: state.execute, origin, build: "7.4.2" })
  const graph = await adapter.observe({ document_id: prepared.document_id, workflow_ref: prepared.workflow_ref }, Date.now() + 30_000)
  const matches = graph.nodes.filter((node) => node.ref.node_id === saved.export.guid && node.type === "exports.text" && node.label === saved.export.label)
  if (matches.length !== 1) throw Error("COLD_NODE_IDENTITY_CHANGED")
  const node = matches[0].ref
  const operation = { id: "cold-export-execute", action: { action_key: "acceptance.cold_export", revision: "1" }, deadline: Date.now() + 240_000 }
  const channel = createNodeProcedure({
    operation,
    execute: state.execute,
    record,
    targetOrigin: origin,
    targetBuild: "7.4.2",
    maxSteps: 4096,
    preparedNodeContext: { document_id: prepared.document_id, workflow_ref: prepared.workflow_ref, node },
    wrapMutation: (code, receipt) => withBrowserReceipt(`(${code})(page)`, {
      receipt_namespace: session,
      receipt_id: receipt.id,
      receipt_signature: receipt.signature,
      operation_id: receipt.id,
    }),
  })
  // LGP can contain both XML and binary settings. Inspect the actual saved
  // destination before executing; XML alone cannot authorize an export path.
  const initial = await channel.observe({
    condition: "owned export node for saved destination check",
    ready: (s) => s.prepared_node_context?.verified && s.prepared_node_context.surface === "graph",
  })
  await selectPreparedGraphNode(channel, initial, "select owned export for saved destination check")
  await openPreparedWizard(channel)
  const configuration = await state.execute(makeTextExportContextCode({
    document_id: prepared.document_id,
    workflow_ref: prepared.workflow_ref,
    node,
  }))
  await writeFile(join(input.output, "saved-export-context.json"), JSON.stringify(configuration, null, 2) + "\n")
  const cancelled = await closePreparedWizard(channel)
  if (!configuration.verified || configuration.values.destination.value !== saved.export.path ||
      !cancelled.verified || cancelled.settings_applied !== false)
    throw Error("COLD_SAVED_EXPORT_DESTINATION_MISMATCH")
  result.savedDestinationVerified = true
  const driver = createNodeExecutionProcedure(channel, node, { allowDeactivate: true })
  await driver.prepare()
  await driver.launchGraph()
  await driver.identify()
  const execution = await driver.waitCompleted({})
  if (execution.status !== "completed" || !execution.verified || !execution.owner_verified)
    throw Error("COLD_EXECUTION_NOT_VERIFIED")
  result.execution = execution
  // The parent collects exactly this owned CSV while this authenticated session
  // still exists. Closing the session cannot substitute for a fresh-file proof.
  console.log(JSON.stringify({ event: "cold-export-file-required", path: saved.export.path }))
  const collectionDeadline = Date.now() + 30_000
  const acknowledgement = join(input.output, "export-collected.json")
  let collected
  while (Date.now() < collectionDeadline) {
    collected = await readFile(acknowledgement, "utf8").then(JSON.parse).catch((error) => {
      if (error.code === "ENOENT") return null
      throw error
    })
    if (collected) break
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  if (collected?.path !== saved.export.path || !/^[a-f0-9]{64}$/.test(collected.sha256))
    throw Error("COLD_FRESH_EXPORT_COLLECTION_UNCONFIRMED")
  result.collectedExport = collected
  const closed = await cleanup()
  await writeFile(join(input.output, "cleanup.json"), JSON.stringify(closed, null, 2) + "\n")
  if (closed.status !== "SUCCEEDED" || !closed.package_closed || !closed.logged_out)
    throw Error("COLD_CLEANUP_UNCONFIRMED")
  state.closed = true
  result.status = "EXECUTION_VERIFIED_PARENT_FILE_PROOFS_REQUIRED"
} finally {
  if (!state.closed && state.prepared?.status === "READY" && state.prepared.package_ref?.path === saved.packagePath) {
    await cleanup()
      .then((closed) => writeFile(join(input.output, "cleanup.json"), JSON.stringify(closed, null, 2) + "\n"))
      .catch(() => console.error("COLD_PACKAGE_CLEANUP_UNCONFIRMED"))
  }
  await state.context?.close()
  const processes = await observer.close()
  await writeFile(join(input.output, "processes.json"), JSON.stringify(processes, null, 2) + "\n")
  result.processCleanupVerified = processes.remaining.length === 0
  const body = JSON.stringify(result, null, 2)
  if (secrets.some((secret) => body.includes(secret))) throw Error("SECRET_IN_RESULT")
  await writeFile(join(input.output, "result.json"), body + "\n")
  if (processes.remaining.length) throw Error("COLD_OWNED_PROCESS_SURVIVED")
}
console.log(JSON.stringify({ status: result.status, settingsReapplied: false, processCleanupVerified: true }))
