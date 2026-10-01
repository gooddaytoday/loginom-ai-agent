import { parseArgs } from "node:util"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { randomUUID } from "node:crypto"
import { compareMultiOutput, MULTI_OUTPUT_VERSION, validateExpected } from "./multi-output-oracle.mjs"
import { coldScenarios, verifyColdGraph, observationPort, coldSettings } from "./cold-contract.mjs"

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
const {openPreparedWizard} = await load("client/lib/node-wizard-open.mjs")
const {closePreparedWizard} = await load("client/lib/node-wizard-close.mjs")
const {readImportDefinitionPages} = await load("client/lib/import-definition-pages.mjs")
const {selectPreparedGraphNode} = await load("client/lib/node-graph-selection.mjs")
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
const scenarios = coldScenarios(expected)
if(expected.version){
  const manifest=JSON.parse(await readFile(join(root,"..","..","cli-manifest.json"),"utf8"))
  if(manifest.metadata.sourceDirty!==false||scenarios.some(s=>s.oracle.owner.source_sha!==manifest.metadata.sourceCommit))
    throw Error("COLD_SOURCE_SHA_OR_DIRTY")
}
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

  const observations = []
  for (const scenario of scenarios) {
  const expected = scenario
  verifyColdGraph(graph, scenario.graph)
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
    deadline: Date.now() + 540_000,
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
  const settingsEvidence=[]
  for(const settings of scenario.settings??[]){
    if(settings.node_id!==node.node_id)throw Error("COLD_SETTINGS_NODE")
    const inspect=settings.kind==="crosstable-ui-v1"?{readCrossTable:true}:settings.kind==="grouping-ui-v1"?{readGrouping:true}:settings.kind==="text-import-ui-v1"?{}:null
    if(!inspect)throw Error("COLD_SETTINGS_KIND")
    const selection=await channel.observe({condition:"saved node settings audit",ready:s=>s.prepared_node_context?.surface==="graph"})
    await selectPreparedGraphNode(channel,selection,"select saved node for settings audit")
    await openPreparedWizard(channel)
    const observed = await (async()=>{
      if(settings.kind!=="text-import-ui-v1"){
        const state=await channel.observe({condition:"saved effective settings",...inspect,
          ready:s=> (s.node_cross_table??s.node_grouping)?.verified===true})
        return state.node_cross_table??state.node_grouping
      }
      const state=await channel.observe({condition:"saved import source",ready:s=>s.wizard?.stage==="text_import_file"&&s.wizard.import_source?.status==="draft_ui_values"})
      const source=observedSettingsFields(state.wizard.import_source,["source_path","connection","encoding","rows_to_skip","first_line_as_title"])
      await channel.perform({condition:"inspect saved import format",initialObservation:state,
        ready:s=>s.wizard?.stage==="text_import_file",identity:s=>s.prepared_node_context,
        resolve:s=>({verb:"wizard_step",ref:s.ui.elements.find(e=>e.tid===s.wizard.root_tid+";btnNext"&&e.allowed_actions.includes("wizard_step")).ref,expected_stage:"text_import_format"})})
      const formatted=await channel.observe({condition:"saved import format",ready:s=>s.wizard?.stage==="text_import_format"&&s.wizard.settings?.status==="draft_ui_values"})
      const format=observedSettingsFields(formatted.wizard.settings,["delimiter","text_qualifier","null_marker","decimal_separator"])
      const definition=await readImportDefinitionPages(channel)
      return {source,format,columns:definition.fields.map(f=>Object.fromEntries(["index","name","label","type","data_kind","used"].map(k=>[k,f[k]])))}
    })()
    const values=coldSettings(observed,settings)
    const closed=await closePreparedWizard(channel)
    if(closed.settings_applied!==false||closed.draft_discarded!==true)throw Error("COLD_SETTINGS_MUTATED")
    settingsEvidence.push({node_id:node.node_id,kind:settings.kind,values,settings_applied:false})
  }
  const driver = createNodeExecutionProcedure(channel, node)
  await driver.prepare()
  await driver.launchGraph()
  await driver.identify()
  const execution = await driver.waitCompleted({})
  if (execution.status !== "completed" || !execution.verified || !execution.owner_verified)
    throw Error("COLD_EXECUTION_NOT_VERIFIED")

  const outputs = []
  for (const want of expected.oracle?.ports ?? [{index:0, rows:expected.rows}]) {
  const opened = await openNewOutputTable(channel, want.index)
  const precision = await configureTablePrecision(channel, opened.table)
  const data = await (async () => {
    try {
      const readSettings = await prepareTableRead(channel, opened.table, {requireUnfiltered:true})
      const raw = await readTableOutputPages(channel, opened.table, {
        sampleRows: expected.oracle ? 100 : Math.max(10, expected.rows.length),
      })
      const expectedColumns = new Map(
        (want.schema ?? expected.columns).map((column) => [column.name, { name: column.name, label: column.label ?? column.name, type: column.type }]),
      )
      if (
        raw.columns.length !== (want.schema ?? expected.columns).length ||
        new Set(raw.columns.map((column) => column.name)).size !== (want.schema ?? expected.columns).length ||
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

  outputs.push({port:want.index,port_guid:opened.port_guid,...data})
  }
  if (expected.oracle) {
    validateExpected(expected.oracle)
    if (expected.oracle.owner.package_path !== saved.path
      || expected.oracle.owner.node_id !== node.node_id) throw Error("COLD_OWNER_CHANGED")
    const observation = {version:MULTI_OUTPUT_VERSION,owner:expected.oracle.owner,
      execution:{id:execution.execution_id,status:execution.status,fresh:true,owner_verified:execution.owner_verified},
      ports:outputs.map(data=>observationPort(data,expected.oracle.ports.find(p=>p.index===data.port),execution.execution_id))}
    const comparison = compareMultiOutput(expected.oracle,observation)
    await writeFile(join(args.output,scenario.id+"-observation.json"),JSON.stringify(observation,null,2)+"\n")
    if(comparison.status!=="PASS")throw Error("COLD_ORACLE:"+comparison.error)
    observations.push({id:scenario.id,node,execution,settings:settingsEvidence,output:{ports:outputs},comparison})
    continue
  }
  const data=outputs[0]
  if (data.row_count !== expected.rows.length || !data.sample_complete || !data.precision.numbers_verified)
    throw Error("COLD_VALUES_MISMATCH")
  const schema = data.schema
  const actualRows = data.sample.map((row) => {
    const object = Object.create(null)
    for (const column of expected.columns) {
      const cell = row[schema.findIndex((item) => item.name === column.name)]
      object[column.name] = cell.value === null ? null : column.type === "real" ? Number(cell.value) : cell.value
    }
    return object
  })
  const unused = actualRows.slice()
  for (const want of expected.rows) {
    const index = unused.findIndex((row) => expected.columns.every((column) => (row[column.name] === (column.type === "integer" && want[column.name] !== null ? String(want[column.name]) : want[column.name]))))
    if (index < 0) throw Error("COLD_VALUES_MISMATCH")
    unused.splice(index, 1)
  }

  observations.push({id:scenario.id,node,execution,output:{ports:outputs},comparison:{status:"PASS",version:"legacy"}})
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
    scenarios: observations,
    ...(observations.length===1?{node:observations[0].node,execution:observations[0].execution,output:observations[0].output}:{}),
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

function observedSettingsFields(group,names){
  return Object.fromEntries(names.map(name=>{
    const field=group.fields?.[name]
    if(field?.status!=="observed"||field.truncated===true||!["string","boolean"].includes(typeof field.value))throw Error("COLD_SETTINGS_PARTIAL")
    return [name,field.value]
  }))
}
