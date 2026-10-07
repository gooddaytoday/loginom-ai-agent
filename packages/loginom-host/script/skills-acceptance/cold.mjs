import { mkdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { randomUUID } from "node:crypto"
import { observeProcesses } from "./processes.mjs"

// Independent acceptance reader. Only fixed, local, hash-verified helpers produce code;
// this entrypoint is not packaged or exposed as a model tool.
process.umask(0o077)
const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const input = JSON.parse(Buffer.concat(chunks).toString())
const args = { resources: input.resources, output: input.output }
const expectedPath = `/${input.connection.username}/skills-acceptance-${input.outputDigest?.slice(0, 12)}-${input.case}-${input.attempt}.lgp`
if (
  !/^[a-f0-9]{64}$/.test(input.outputDigest) ||
  !/^[a-z0-9-]+$/.test(input.case) ||
  !Number.isSafeInteger(input.attempt) ||
  input.attempt < 1 ||
  !/^[A-Za-z0-9_-]+$/.test(input.connection.username) ||
  input.package.path !== expectedPath
)
  throw Error("COLD_PACKAGE_OWNERSHIP_INVALID")
if (![args.resources, args.output].every((path) => typeof path === "string" && path.startsWith("/")))
  throw Error("COLD_PATHS_ABSOLUTE_REQUIRED")
const address = new URL(input.connection.url)
if (!["localhost", "127.0.0.1"].includes(address.hostname) || address.username || address.password)
  throw Error("COLD_LOCAL_ENDPOINT_REQUIRED")
const config = { loginom_url: input.connection.url, workflow_profile: { loginom_user: input.connection.username } }
const saved = { ...input.package, expected: { Alpha: 35, Beta: 20 } }
const secrets = [input.connection.password].filter(Boolean)
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
await mkdir(args.output, { mode: 0o700 })
const observer = observeProcesses()
const session = randomUUID()
const metadata = {
  sessionId: session,
  clientRevision: resources.manifestHash,
  actionManifestDigest: resources.manifest.actionManifestSha256,
}
const record = createExecutionJournal({ directory: args.output, metadata, knownSecrets: secrets })
const { context } = await loginBrowser({
  browserPath: resources.browserPath,
  profile: join(args.output, "browser"),
  candidate: {
    url: config.loginom_url,
    username: config.workflow_profile.loginom_user,
    password: input.connection.password,
  },
  headless: process.env.LOGINOM_AI_AGENT_TEST_HEADLESS !== "0",
  keepOpen: true,
})
const page = context.pages()[0]
const execute = (code) => new Function("page", `return (${code})(page)`)(page)
const state = { prepared: undefined, closed: false }
let result
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
    (node) => node.ref.node_id === saved.node && node.type === "transform.group_data" && node.label === saved.label,
  )
  if (matches.length !== 1) throw Error("COLD_NODE_IDENTITY_CHANGED")
  const node = matches[0].ref
  const operation = {
    id: "cold-read",
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
      if (
        raw.columns.length !== 2 ||
        raw.columns.filter((c) => c.name === "Category" && c.type === "string").length !== 1 ||
        raw.columns.filter((c) => c.name !== "Category" && ["integer", "real"].includes(c.type)).length !== 1
      )
        throw Error("COLD_COLUMN_SET_CHANGED")
      return decodeTableOutput(raw, {
        formatProof: precision,
        readSettings,
        expectedColumns: raw.columns.map((column) => ({ name: column.name, label: column.label, type: column.type })),
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
      Number(row[data.schema.findIndex((column) => column.name !== "Category")].value),
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
  result = {
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
  if (secrets.some((secret) => body.includes(secret))) throw Error("SECRET_IN_RESULT")
  await writeFile(
    join(args.output, "readback.json"),
    JSON.stringify({ ...result, status: "VALUES_VERIFIED_PROCESS_CLEANUP_PENDING" }, null, 2) + "\n",
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
  const processes = await observer.close()
  await writeFile(join(args.output, "processes.json"), JSON.stringify(processes, null, 2) + "\n")
  if (processes.remaining.length) throw Error("COLD_OWNED_PROCESS_SURVIVED")
}

await writeFile(
  join(args.output, "result.json"),
  JSON.stringify({ ...result, processCleanupVerified: true }, null, 2) + "\n",
)
console.log(
  JSON.stringify({
    status: result.status,
    phase: result.phase,
    total: result.total,
    settingsReapplied: false,
    processCleanupVerified: true,
  }),
)
