import { parseArgs } from "node:util"
import { readFile, mkdir, writeFile, open } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { createHash, randomUUID } from "node:crypto"

// Independent acceptance reader. Only fixed, local, hash-verified helpers produce code;
// this entrypoint is not packaged or exposed as a model tool.
process.umask(0o077)
async function main() {
const args = parseArgs({
  options: {
    config: { type: "string" },
    resources: { type: "string" },
    saved: { type: "string" },
    output: { type: "string" },
    managed: { type: "boolean", default: false },
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
if (!args.managed && config.workflow_profile?.passwordless_login !== true) throw Error("TEST_PASSWORD_UNAVAILABLE")
const saved = JSON.parse(await readFile(args.saved, "utf8"))
if (!saved.path.startsWith(`/${config.workflow_profile.loginom_user}/loginom-ai-agent-acceptance-`))
  throw Error("ACCEPTANCE_PACKAGE_REQUIRED")
await mkdir(args.output, { recursive: !args.managed, mode: 0o700 })
const session = randomUUID()
const metadata = {
  sessionId: session,
  clientRevision: resources.manifestHash,
  actionManifestDigest: resources.manifest.actionManifestSha256,
}
const managed = args.managed ? await managedLogin(config.workflow_profile.loginom_user, session, args.output) : undefined
const secrets = [config.api_key, managed?.password].filter(value => typeof value === "string" && value.length)
const record = createExecutionJournal({ directory: args.output, metadata, knownSecrets: secrets })
const { createRedactor } = await load("client/lib/redact.mjs")
const redactor = createRedactor(secrets)
const writeEvidence = async (name, value) => {
  const body = JSON.stringify(redactor.redact(value), null, 2) + "\n"
  if (secrets.some(secret => [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)]
      .some(variant => body.includes(variant)))) throw Error("SECRET_IN_RESULT")
  await writeFile(join(args.output, name), body)
}
const state = { prepared: undefined, closed: false, cleanupAttempted: false, context: undefined }
// Cleanup is allowed after a controller failure; new read/execution effects are not.
const execute = async code => {
  managed?.check()
  const result = await new Function("page", `return (${code})(page)`)(state.context.pages()[0])
  managed?.check()
  return result
}
const cleanup = async () => {
  state.cleanupAttempted = true
  const result = await new Function("page", `return (${makePackageCleanupCode({
    sessionId: session, documentId: state.prepared.document_id,
    account: config.workflow_profile.loginom_user, packagePath: saved.path,
    loginomUrl: config.loginom_url, loginomBuild: "7.4.2",
    tabTid: state.prepared.workflow_ref.tab_tid, diagnosticDiscard: true,
  })})(page)`)(state.context.pages()[0])
  await writeEvidence("cleanup.json", result)
  if (result.status !== "SUCCEEDED" || !result.package_closed || !result.logged_out)
    throw Error("COLD_CLEANUP_UNCONFIRMED")
  state.closed = true
}
try {
  managed?.check()
  const loggedIn = await loginBrowser({
    browserPath: resources.browserPath, profile: join(args.output, "browser"),
    candidate: { url: config.loginom_url, username: config.workflow_profile.loginom_user,
      password: managed?.password ?? "" },
    headless: process.env.LOGINOM_AI_AGENT_TEST_HEADLESS !== "0", keepOpen: true,
    ...(managed ? { loginBarrier: managed.barrier } : {}),
  })
  state.context = loggedIn.context
  if (managed) await managed.authenticated()
  const page = state.context.pages()[0]
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
  // Close only the exact independently opened package/account, once. A lost
  // cleanup reply remains unknown and must not automatically repeat mutations.
  await cleanup()
  managed?.check()
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
  // A PASS is not published until the owned browser context has closed.
  await state.context.close()
  state.context = undefined
  managed?.check()
  await writeEvidence("result.json", result)
  managed?.check()
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
  try {
    if (!state.closed && !state.cleanupAttempted && state.prepared?.status === "READY" &&
        state.prepared.package_ref?.path === saved.path) {
      await cleanup().catch(() => console.error("COLD_PACKAGE_CLEANUP_UNCONFIRMED"))
    }
  } finally {
    try { await state.context?.close() }
    finally { managed?.close() }
  }
}
}

// Opt in with --managed under Node fork({stdio:["pipe","pipe","pipe","ipc"]}).
// stdin is exactly {password,registration:{version:2,attemptId,loginBarrier:2}}
// (UTF-8 <=8192 bytes then EOF, <=30s; password 4..4096 non-control characters).
// The parent retains the SAME provisioning barrier across Desktop and reader;
// it responds to existing v2 login frames only after authority/inventory/fsync.
// This fresh reader owns generation 1, a new loginId and the journal's session
// hashed as chat. The output directory is create-only; intent is retained on
// every failure. An outer process/cgroup deadline and account reconciliation
// remain mandatory; context.close is not server logout or OS quiescence proof.
// Constructor-only child channel. The parent owns native authority and the
// retained provisioning barrier; neither stdin registration nor an ACK alone
// grants account ownership. No environment value carries a password.
async function managedLogin(account, session, directory) {
  if (typeof process.send !== "function" || !process.connected) throw Error("COLD_CONTROL_REQUIRED")
  const chunks = []
  let size = 0
  const timer = setTimeout(() => process.stdin.destroy(Error("COLD_INPUT_TIMEOUT")), 30_000)
  let input
  try {
    for await (const chunk of process.stdin) {
      size += chunk.length
      if (size > 8192) throw Error("COLD_INPUT_INVALID")
      chunks.push(chunk)
    }
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)))
  } finally { clearTimeout(timer) }
  if (!input || Object.keys(input).sort().join() !== "password,registration" ||
      typeof input.password !== "string" || input.password.length < 4 || input.password.length > 4096 ||
      /[\x00-\x1f\x7f]/.test(input.password) ||
      !input.registration || Object.keys(input.registration).sort().join() !== "attemptId,loginBarrier,version" ||
      input.registration.version !== 2 || input.registration.loginBarrier !== 2 ||
      typeof input.registration.attemptId !== "string" || !input.registration.attemptId.length ||
      input.registration.attemptId.length > 160 || /[^A-Za-z0-9_-]/.test(input.registration.attemptId) ||
      typeof account !== "string" || !account.length || account.length > 128 || /[\x00-\x1f\x7f]/.test(account))
    throw Error("COLD_INPUT_INVALID")
  const binding = Object.freeze({ attemptId: input.registration.attemptId, loginId: randomUUID(),
    generation: 1, purpose: "chat", chat: createHash("sha256").update(session).digest("hex"), account })
  const state = { failed: false, phase: "begin", waiting: undefined }
  const check = () => { if (state.failed || !process.connected) throw Error("COLD_LOGIN_UNKNOWN") }
  const fail = () => { state.failed = true; state.waiting?.reject(Error("COLD_LOGIN_UNKNOWN")); state.waiting = undefined }
  const message = value => {
    const pending = state.waiting
    if (!pending || !value || Object.keys(value).sort().join() !== "loginId,method,phase,version" ||
        value.version !== 2 || value.method !== "login-ack" || value.loginId !== binding.loginId ||
        value.phase !== state.phase) return fail()
    state.waiting = undefined
    state.phase = value.phase === "begin" ? "authenticated" : "done"
    pending.resolve()
  }
  process.on("message", message)
  process.on("disconnect", fail)
  const write = async (name, value) => {
    const fd = await open(join(directory, name), "wx", 0o600)
    try { await fd.writeFile(JSON.stringify(value) + "\n"); await fd.sync() } finally { await fd.close() }
    const dir = await open(directory, "r")
    try { await dir.sync() } finally { await dir.close() }
  }
  try { await write("login-intent.json", { version: 2, binding }) }
  catch { process.off("message", message); process.off("disconnect", fail); throw Error("COLD_LOGIN_UNKNOWN") }
  return {
    password: input.password,
    check,
    async barrier(phase) {
      try {
        check()
        if (state.waiting || !["begin", "authenticated"].includes(phase) || phase !== state.phase) throw Error()
        const deadline = setTimeout(fail, 60_000)
        try {
          await new Promise((resolve, reject) => {
            state.waiting = { resolve, reject }
            process.send({ version: 2, type: "login", phase, binding }, error => { if (error) fail() })
          })
          check()
        } finally { clearTimeout(deadline) }
      } catch { fail(); throw Error("COLD_LOGIN_UNKNOWN") }
    },
    async authenticated() {
      check()
      if (state.phase !== "done") { fail(); throw Error("COLD_LOGIN_UNKNOWN") }
      await write("login-result.json", { version: 2, binding, authenticated: true })
      check()
    },
    close() { process.off("message", message); process.off("disconnect", fail); if (process.connected) process.disconnect() },
  }
}

try { await main() }
catch {
  // External browser errors may embed a locator or supplied password. Never
  // stringify them, including errors thrown before a browser was returned.
  console.error("COLD_READBACK_FAILED")
  process.exitCode = 1
} finally { if (process.connected) process.disconnect() }
