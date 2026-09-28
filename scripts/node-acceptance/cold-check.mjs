import { parseArgs } from "node:util"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { randomUUID } from "node:crypto"

// Независимый oracle приёмки узла. Ожидания берутся из --expected, а не из
// захардкоженных Alpha/Beta. Существующий cold-readback.mjs не меняется.
process.umask(0o077)
const args = parseArgs({
  options: {
    config: { type: "string" },
    resources: { type: "string" },
    saved: { type: "string" },
    expected: { type: "string" },
    output: { type: "string" },
  },
  strict: true,
}).values
if (!args.config || !args.resources || !args.saved || !args.expected || !args.output)
  throw Error("Required: --config --resources --saved --expected --output")

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
const loginPassword = config.workflow_profile?.password ?? ""
if (config.workflow_profile?.passwordless_login === true && loginPassword !== "") throw Error("TEST_PASSWORD_UNAVAILABLE")
if (config.workflow_profile?.passwordless_login !== true && loginPassword === "") throw Error("TEST_PASSWORD_UNAVAILABLE")
const expected = JSON.parse(await readFile(args.expected, "utf8"))
if (typeof expected.package_path !== "string" || !expected.package_path.endsWith(".lgp"))
  throw Error("EXPECTED_PACKAGE_PATH_REQUIRED")
if (!Array.isArray(expected.nodes) || !expected.output_node_type || !Array.isArray(expected.columns) || !Array.isArray(expected.rows))
  throw Error("EXPECTED_SHAPE_INVALID")

const saved = await loadSaved(args.saved)
if (saved.path !== expected.package_path) throw Error("PACKAGE_PATH_MISMATCH")

await mkdir(args.output, { recursive: true, mode: 0o700 })
const session = randomUUID()
const metadata = {
  sessionId: session,
  clientRevision: resources.manifestHash,
  actionManifestDigest: resources.manifest.actionManifestSha256,
}
const record = createExecutionJournal({
  directory: args.output,
  metadata,
  knownSecrets: [config.api_key, loginPassword].filter(Boolean),
})
const { context } = await loginBrowser({
  browserPath: resources.browserPath,
  profile: join(args.output, "browser"),
  candidate: { url: config.loginom_url, username: config.workflow_profile.loginom_user, password: loginPassword },
  headless: process.env.LOGINOM_AI_AGENT_TEST_HEADLESS !== "0",
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

  for (const want of expected.nodes) {
    if (!graph.nodes.some((node) => node.type === want.type)) throw Error(`COLD_NODE_TYPE_MISSING:${want.type}`)
  }

  const matches = graph.nodes.filter((node) => {
    if (node.type !== expected.output_node_type) return false
    if (saved.node && node.ref.node_id !== saved.node) return false
    return true
  })
  if (matches.length !== 1) throw Error("COLD_OUTPUT_NODE_NOT_UNIQUE")
  const node = matches[0].ref

  const operation = {
    id: "cold-read-expected",
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
      const raw = await readTableOutputPages(channel, opened.table, {
        sampleRows: Math.max(10, expected.rows.length),
      })
      const expectedColumns = new Map(
        expected.columns.map((column) => [column.name, { name: column.name, label: column.name, type: column.type }]),
      )
      if (
        raw.columns.length !== expected.columns.length ||
        new Set(raw.columns.map((column) => column.name)).size !== expected.columns.length ||
        raw.columns.some((column) => !expectedColumns.has(column.name))
      )
        throw Error("COLD_COLUMN_SET_CHANGED")
      return decodeTableOutput(raw, {
        formatProof: precision,
        readSettings,
        expectedColumns: raw.columns.map((column) => expectedColumns.get(column.name)),
        requireExactNumbers: true,
      })
    } finally {
      await restoreTablePrecision(channel, precision)
    }
  })()
  await returnFromOutputTable(channel, opened.table)

  if (data.row_count !== expected.rows.length || !data.sample_complete || !data.precision.numbers_verified)
    throw Error("COLD_VALUES_MISMATCH")
  const schema = data.schema
  const actualRows = data.sample.map((row) => {
    const object = Object.create(null)
    for (const column of expected.columns) {
      const cell = row[schema.findIndex((item) => item.name === column.name)]
      object[column.name] = column.type === "real" || column.type === "integer" ? Number(cell.value) : cell.value
    }
    return object
  })
  const unused = actualRows.slice()
  for (const want of expected.rows) {
    const index = unused.findIndex((row) => expected.columns.every((column) => row[column.name] === want[column.name]))
    if (index < 0) throw Error("COLD_VALUES_MISMATCH")
    unused.splice(index, 1)
  }

  // Независимый reader создаёт временные визуализаторы; Loginom помечает пакет dirty.
  // Cleanup проверяет точное владение пакетом/аккаунтом перед discard.
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
    path: saved.path,
    node,
    execution,
    output: { ports: [data] },
    settingsReapplied: false,
    cleanup: {
      package_closed: cleanup.package_closed === true,
      logged_out: cleanup.logged_out === true,
    },
  }
  const body = JSON.stringify(result, null, 2)
  if (body.includes(config.api_key) || (loginPassword && body.includes(loginPassword))) throw Error("SECRET_IN_RESULT")
  await writeFile(join(args.output, "result.json"), body + "\n")
  console.log(
    JSON.stringify({
      status: result.status,
      phase: result.phase,
      path: saved.path,
      settingsReapplied: false,
      cleanup: result.cleanup,
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

async function loadSaved(value) {
  // Путь пакета Loginom передаётся напрямую; локальный JSON — {path, node?}.
  if (value.endsWith(".lgp")) return { path: value }
  const parsed = JSON.parse(await readFile(resolve(value), "utf8"))
  if (typeof parsed === "string" && parsed.endsWith(".lgp")) return { path: parsed }
  if (parsed && typeof parsed.path === "string") return { path: parsed.path, node: parsed.node }
  throw Error("SAVED_SHAPE_INVALID")
}
