// Node-specific acceptance: reuse exact-build procedures without changing generic cold-check.
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {parseArgs} from 'node:util';
import {auditPorts} from './audit-ports.mjs';
process.umask(0o077);
const args = parseArgs({options: Object.fromEntries(['config', 'resources', 'saved', 'expected', 'output']
  .map(name => [name, {type: 'string'}])), strict: true}).values;
if (Object.values(args).length !== 5) throw Error('REQUIRED_ACCEPTANCE_ARGUMENTS');
const root = resolve(args.resources);
const load = name => import(pathToFileURL(join(root, 'runtime', name)).href);
const {verifyResources} = await load('src/resources.mjs');
const resources = await verifyResources(root);
const {loginBrowser} = await load('src/connection-check.mjs');
const {makeWorkspacePrepareCode} = await load('client/lib/workspace.mjs');
const {createNodeTargetBrowserAdapter} = await load('client/lib/node-target-browser.mjs');
const {createNodeProcedure} = await load('client/lib/node-procedure.mjs');
const {createNodeExecutionProcedure} = await load('client/lib/node-execution-procedure.mjs');
const {createExecutionJournal} = await load('client/lib/execution-journal.mjs');
const {withBrowserReceipt} = await load('client/lib/executor.mjs');
const {makePackageCleanupCode} = await load('client/lib/package-cleanup.mjs');
const {openPreparedWizard} = await load('client/lib/node-wizard-open.mjs');
const {closePreparedWizard} = await load('client/lib/node-wizard-close.mjs');
const {selectPreparedGraphNode} = await load('client/lib/node-graph-selection.mjs');
const {filterGroupsFromNative} = await load('client/lib/filter-parameters.mjs');
const {showMissingValuesMappingTable} = await load('client/lib/missing-values-output.mjs');
const {openNewOutputTable, configureTablePrecision, prepareTableRead, returnFromOutputTable} =
  await load('client/lib/node-output-procedure.mjs');
const {readTableOutputPages} = await load('client/lib/table-output-pages.mjs');
const {decodeTableOutput} = await load('client/lib/table-output-values.mjs');
const config = JSON.parse(await readFile(args.config, 'utf8'));
const expected = JSON.parse(await readFile(args.expected, 'utf8'));
const password = config.workflow_profile.password;
if (args.saved !== expected.package_path || !password) throw Error('OWNED_PACKAGE_CONFIG_REQUIRED');
await mkdir(args.output, {recursive: true, mode: 0o700});
const session = randomUUID();
const record = createExecutionJournal({directory: args.output,
  metadata: {sessionId: session, clientRevision: resources.manifestHash,
    actionManifestDigest: resources.manifest.actionManifestSha256}, knownSecrets: [config.api_key, password]});
const {context} = await loginBrowser({browserPath: resources.browserPath, profile: join(args.output, 'browser'),
  candidate: {url: config.loginom_url, username: config.workflow_profile.loginom_user, password}, headless: true, keepOpen: true});
const page = context.pages()[0];
const execute = code => new Function('page', `return (${code})(page)`)(page);
const need = (ok, message) => {if (!ok) throw Error(message);};
const persist = async (name, value) => {
  const body = JSON.stringify(value, null, 2);
  need(![config.api_key, password].filter(Boolean).some(secret => body.includes(secret)), 'SECRET_IN_RESULT');
  await writeFile(join(args.output, name), body + '\n', {mode: 0o600});
};
let prepared, cleanup, failure, actual, configuration;
try {
  prepared = await execute(makeWorkspacePrepareCode({loginomUrl: page.url(),
    compatibility: {loginom_build: '7.4.2', platform: 'linux', browser: 'chromium'},
    sessionId: session, operationId: 'row-filter-cold-open', intent: 'open_package', packagePath: args.saved}));
  need(prepared.status === 'READY' && prepared.package_ref.path === args.saved, 'COLD_PACKAGE_NOT_WRITABLE');
  const origin = new URL(config.loginom_url).origin;
  const adapter = createNodeTargetBrowserAdapter({execute, origin, build: '7.4.2'});
  const request = {document_id: prepared.document_id, workflow_ref: prepared.workflow_ref};
  const graph = await adapter.observe(request, Date.now() + 30000);
  need(graph.nodes.length === 2 && graph.links.length === 1, 'FILTER_EXACT_GRAPH_REQUIRED');
  const source = graph.nodes.find(node => node.type === 'imports.text' && node.label === 'Данные');
  const target = graph.nodes.find(node => node.type === 'transform.filter_data' && node.label === 'Отбор');
  need(source && target && graph.links[0].source === source.ref.node_id && graph.links[0].target === target.ref.node_id
    && graph.links[0].input === 0 && graph.links[0].output === 0, 'FILTER_LINK_IDENTITY');
  const operation = {id: 'row-filter-cold', action: {action_key: 'acceptance.row_filter', revision: '1'}, deadline: Date.now() + 720000};
  const channel = createNodeProcedure({operation, execute, record, targetOrigin: origin, targetBuild: '7.4.2', maxSteps: 4096,
    preparedNodeContext: {...request, node: target.ref}, wrapMutation: (code, receipt) => withBrowserReceipt(`(${code})(page)`,
      {receipt_namespace: session, receipt_id: receipt.id, receipt_signature: receipt.signature, operation_id: receipt.id})});
  const selected = await channel.observe({condition: 'cold select saved filter', ready: state => state.prepared_node_context?.surface === 'graph'
    && state.ui.elements.some(element => element.graph_node?.part === 'body' && element.allowed_actions.includes('click'))});
  await selectPreparedGraphNode(channel, selected, 'cold select saved filter', {refreshReplacedBody: true});
  await openPreparedWizard(channel);
  const settings = await channel.observe({condition: 'independent saved conditions', readFilter: true,
    ready: state => state.wizard?.stage === 'row_filter' && state.node_filter?.verified === true});
  configuration = {groups: filterGroupsFromNative(settings.node_filter), input_fields: settings.node_filter.input_fields};
  const normalize = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(value) ? value + '.000'
    : Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
  need(JSON.stringify(normalize(configuration.groups)) === JSON.stringify(normalize(expected.final_groups)), 'FILTER_SAVED_CONDITIONS_DIFFER');
  const cancelled = await closePreparedWizard(channel);
  need(cancelled.verified && cancelled.settings_applied === false, 'FILTER_READONLY_SETTINGS_CANCEL');
  configuration.outputs = [];
  for (const port of [0, 1]) {
    await channel.openOutputPort(port);
    await showMissingValuesMappingTable(channel);
    const state = await channel.observe({condition: 'independent saved output mapping ' + port, readMappings: true,
      ready: state => state.node_mapping?.verified === true && state.node_mapping.inventory_complete === true});
    const mapping = state.node_mapping;
    need(mapping.node_context.output_port.port === port && mapping.autosync === false, 'FILTER_SAVED_PORT_SETTINGS');
    need(mapping.target_fields.length === expected.columns.length && mapping.target_fields.every((field, index) =>
      field.excluded !== true && ['name', 'label', 'type'].every(key => field[key] === expected.columns[index][key])), 'FILTER_SAVED_SCHEMA_DIFFER');
    configuration.outputs.push({port, native: mapping});
    const result = await closePreparedWizard(channel);
    need(result.verified && result.settings_applied === false, 'FILTER_READONLY_MAPPING_CANCEL');
  }
  await persist('saved-settings.json', {graph, configuration, settingsReapplied: false});
  const driver = createNodeExecutionProcedure(channel, target.ref);
  await driver.prepare(); await driver.launchGraph(); await driver.identify();
  const execution = await driver.waitCompleted({});
  need(execution.status === 'completed' && execution.verified && execution.owner_verified, 'FILTER_EXECUTION_NOT_VERIFIED');
  const ports = [];
  for (const port of [0, 1]) {
    const opened = await openNewOutputTable(channel, port);
    const precision = await configureTablePrecision(channel, opened.table);
    const readSettings = await prepareTableRead(channel, opened.table);
    const raw = await readTableOutputPages(channel, opened.table, {sampleRows: 100});
    const data = decodeTableOutput(raw, {formatProof: precision, readSettings,
      expectedColumns: precision.fields.map(field => ({name: field.key, label: field.label, type: field.type})), requireExactNumbers: true});
    ports.push({port, port_guid: opened.port_guid, execution_id: execution.execution_id, fresh: true, ...data});
    await returnFromOutputTable(channel, opened.table);
  }
  actual = {node: target.ref, execution, ports};
  await persist('actual-readback.json', actual);
  auditPorts(actual, expected, {...target.ref, execution_id: execution.execution_id});
} catch (error) {
  failure = String(error.message);
  for (const secret of [config.api_key, password].filter(Boolean)) failure = failure.split(secret).join('[REDACTED]');
} finally {
  try {
    if (prepared?.status === 'READY' && prepared.package_ref.path === args.saved) {
      cleanup = await execute(makePackageCleanupCode({sessionId: session, documentId: prepared.document_id,
        account: config.workflow_profile.loginom_user, packagePath: args.saved, loginomUrl: config.loginom_url,
        loginomBuild: '7.4.2', tabTid: prepared.workflow_ref.tab_tid, diagnosticDiscard: true}));
      await persist('cleanup.json', cleanup);
    }
  } catch {failure ??= 'FILTER_CLEANUP_AMBIGUOUS';}
  await context.close();
}
const closed = cleanup?.status === 'SUCCEEDED' && cleanup.package_closed === true && cleanup.logged_out === true;
const result = {status: !failure && closed ? 'PASS' : 'FAIL', error: failure, settingsReapplied: false,
  package_closed: closed, logged_out: closed, node: actual?.node, execution: actual?.execution,
  row_counts: actual?.ports.map(port => port.row_count)};
await persist('result.json', result);
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
