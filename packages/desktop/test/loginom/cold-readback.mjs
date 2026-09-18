import { parseArgs } from "node:util"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { randomUUID } from "node:crypto"

// Independent acceptance reader. Only fixed, local, hash-verified helpers produce code;
// this entrypoint is not packaged or exposed as a model tool.
process.umask(0o077)
const args = parseArgs({
  options: {
    config: { type: "string" },
    resources: { type: "string" },
    saved: { type: "string" },
    output: { type: "string" },
  },
  strict: true,
}).values
if (!args.config || !args.resources || !args.saved || !args.output)
  throw Error("Required: --config --resources --saved --output")
const root = resolve(args.resources)
const load = (name) => import(pathToFileURL(join(root, "runtime", name)).href)
const { verifyResources } = await load("src/resources.mjs")
const resources = await verifyResources(root)
const compatibilityPlatform = resources.manifest.target?.startsWith("win32-")
  ? "windows"
  : resources.manifest.target?.startsWith("darwin-")
    ? "macos"
    : "linux"
const { loginBrowser } = await load("src/connection-check.mjs")
const { makeWorkspacePrepareCode } = await load("client/lib/workspace.mjs")
const { createNodeTargetBrowserAdapter } = await load("client/lib/node-target-browser.mjs")
const { createNodeProcedure } = await load("client/lib/node-procedure.mjs")
const { createNodeExecutionProcedure } = await load("client/lib/node-execution-procedure.mjs")
const { createExecutionJournal } = await load("client/lib/execution-journal.mjs")
const { withBrowserReceipt } = await load("client/lib/executor.mjs")
const { makePackageCleanupCode } = await load("client/lib/package-cleanup.mjs")
const { openNewOutputTable, configureTablePrecision, prepareTableRead, restoreTablePrecision, returnFromOutputTable } =
  await load("client/lib/node-output-procedure.mjs")
const { readTableOutputPages } = await load("client/lib/table-output-pages.mjs")
const { decodeTableOutput } = await load("client/lib/table-output-values.mjs")
const config = JSON.parse(await readFile(args.config, "utf8"))
if (config.workflow_profile?.passwordless_login !== true) throw Error("TEST_PASSWORD_UNAVAILABLE")
const saved = JSON.parse(await readFile(args.saved, "utf8"))
if (!saved.path.startsWith(`/${config.workflow_profile.loginom_user}/loginom-ai-agent-acceptance-`))
  throw Error("ACCEPTANCE_PACKAGE_REQUIRED")
await mkdir(args.output, { recursive: true, mode: 0o700 })
const session = randomUUID()
const metadata = {
  sessionId: session,
  clientRevision: resources.manifestHash,
  actionManifestDigest: resources.manifest.actionManifestSha256,
}
const record = createExecutionJournal({ directory: args.output, metadata, knownSecrets: [config.api_key] })
const { context } = await loginBrowser({
  browserPath: resources.browserPath,
  profile: join(args.output, "browser"),
  candidate: { url: config.loginom_url, username: config.workflow_profile.loginom_user, password: "" },
  headless: true,
  keepOpen: true,
})
const page = context.pages()[0]
const execute = (code) => new Function("page", `return (${code})(page)`)(page)
const state = { prepared: undefined, closed: false }
try {
  const prepared = await execute(
    makeWorkspacePrepareCode({
      loginomUrl: page.url(),
      compatibility: { loginom_build: "7.4.2", platform: compatibilityPlatform, browser: "chromium" },
      sessionId: session,
      operationId: "cold-open",
      intent: "open_package",
      packagePath: saved.path,
    }),
  )
  state.prepared = prepared
  if (
    prepared.status !== "READY" ||
    prepared.package_ref.path !== saved.path ||
    prepared.workflow_ref.navigation_path.some((item) => item.label.endsWith("(только чтение)"))
  )
    throw Error("COLD_PACKAGE_NOT_WRITABLE")
  const origin = new URL(config.loginom_url).origin
  const adapter = createNodeTargetBrowserAdapter({ execute, origin, build: "7.4.2" })
  const graph = await adapter.observe(
    { document_id: prepared.document_id, workflow_ref: prepared.workflow_ref },
    Date.now() + 30_000,
  )
  const matches = graph.nodes.filter(
    (node) =>
      node.ref.node_id === saved.node && node.type === "transform.group_data" && node.label === `Groups ${saved.label}`,
  )
  if (matches.length !== 1) throw Error("COLD_NODE_IDENTITY_CHANGED")
  const node = matches[0].ref
  const operation = {
    id: `cold-read-${saved.label}`,
    action: { action_key: "acceptance.cold_read", revision: "1" },
    deadline: Date.now() + 240_000,
  }
  const channel = createNodeProcedure({
    operation,
    execute,
    record,
    targetOrigin: origin,
    targetBuild: "7.4.2",
    maxSteps: 4096,
    preparedNodeContext: { document_id: prepared.document_id, workflow_ref: prepared.workflow_ref, node },
    wrapMutation: (code, receipt) =>
      withBrowserReceipt(`(${code})(page)`, {
        receipt_namespace: session,
        receipt_id: receipt.id,
        receipt_signature: receipt.signature,
        operation_id: receipt.id,
      }),
  })
  const driver = createNodeExecutionProcedure(channel, node)
  await driver.prepare()
  await driver.launchGraph()
  await driver.identify()
  const execution = await driver.waitCompleted({})
  if (execution.status !== "completed" || !execution.verified || !execution.owner_verified)
    throw Error("COLD_EXECUTION_NOT_VERIFIED")
  const opened = await openNewOutputTable(channel, 0)
  const precision = await configureTablePrecision(channel, opened.table)
  const data = await (async () => {
    try {
      const readSettings = await prepareTableRead(channel, opened.table)
      const raw = await readTableOutputPages(channel, opened.table, { sampleRows: 10 })
      const expected = new Map([
        ["Category", { name: "Category", label: "Category", type: "string" }],
        ["Total", { name: "Total", label: "Total", type: "real" }],
      ])
      if (
        raw.columns.length !== 2 ||
        new Set(raw.columns.map((column) => column.name)).size !== 2 ||
        raw.columns.some((column) => !expected.has(column.name))
      )
        throw Error("COLD_COLUMN_SET_CHANGED")
      return decodeTableOutput(raw, {
        formatProof: precision,
        readSettings,
        expectedColumns: raw.columns.map((column) => expected.get(column.name)),
        requireExactNumbers: true,
      })
    } finally {
      await restoreTablePrecision(channel, precision)
    }
  })()
  await returnFromOutputTable(channel, opened.table)
  const values = Object.fromEntries(
    data.sample.map((row) => [
      row[data.schema.findIndex((column) => column.name === "Category")].value,
      Number(row[data.schema.findIndex((column) => column.name === "Total")].value),
    ]),
  )
  if (
    data.row_count !== 2 ||
    !data.sample_complete ||
    !data.precision.numbers_verified ||
    values.Alpha !== saved.expected.Alpha ||
    values.Beta !== saved.expected.Beta
  )
    throw Error("COLD_VALUES_MISMATCH")
  // The independent reader created temporary viewers, which Loginom marks dirty.
  // The established QA helper verifies exact package/account ownership before discarding those views.
  const cleanup = await execute(
    makePackageCleanupCode({
      sessionId: session,
      documentId: prepared.document_id,
      account: config.workflow_profile.loginom_user,
      packagePath: saved.path,
      loginomUrl: config.loginom_url,
      loginomBuild: "7.4.2",
      tabTid: prepared.workflow_ref.tab_tid,
      diagnosticDiscard: true,
    }),
  )
  await writeFile(join(args.output, "cleanup.json"), JSON.stringify(cleanup, null, 2) + "\n")
  if (cleanup.status !== "SUCCEEDED" || !cleanup.package_closed || !cleanup.logged_out)
    throw Error("COLD_CLEANUP_UNCONFIRMED")
  state.closed = true
  const result = {
    status: "PASS",
    phase: "independent_cold_reopen_readback",
    dataset: saved.label,
    path: saved.path,
    node,
    execution,
    output: { ports: [data] },
    settingsReapplied: false,
    groups: values,
    total: saved.expected.Alpha + saved.expected.Beta,
  }
  const body = JSON.stringify(result, null, 2)
  if (body.includes(config.api_key)) throw Error("SECRET_IN_RESULT")
  await writeFile(join(args.output, "result.json"), body + "\n")
  console.log(
    JSON.stringify({
      status: result.status,
      phase: result.phase,
      dataset: saved.label,
      total: result.total,
      settingsReapplied: false,
    }),
  )
} finally {
  if (!state.closed && state.prepared?.status === "READY" && state.prepared.package_ref?.path === saved.path) {
    await execute(
      makePackageCleanupCode({
        sessionId: session,
        documentId: state.prepared.document_id,
        account: config.workflow_profile.loginom_user,
        packagePath: saved.path,
        loginomUrl: config.loginom_url,
        loginomBuild: "7.4.2",
        tabTid: state.prepared.workflow_ref.tab_tid,
        diagnosticDiscard: true,
      }),
    )
      .then((result) => writeFile(join(args.output, "cleanup.json"), JSON.stringify(result, null, 2) + "\n"))
      .catch(() => console.error("COLD_PACKAGE_CLEANUP_UNCONFIRMED"))
  }
  await context.close()
}
