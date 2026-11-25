import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { writePrivateJson } from './private-json.mjs';

const requireProof = (valid, code) => { if (!valid) throw Error('MANUAL_EDIT_' + code); };
const locator = (page, tid) => page.locator('[data-tid=' + JSON.stringify(tid) + ']');
const editId = 'manual-edit';

export function resolveManualNode(graph, selector) {
  const matches = graph.nodes.filter(node => node.label === selector.label && (!selector.type || node.type === selector.type));
  requireProof(matches.length === 1, 'NODE_ABSENT_OR_AMBIGUOUS: ' + JSON.stringify(selector));
  return matches[0];
}

export function manualGraphDelta(before, after) {
  requireProof(before.complete && after.complete, 'GRAPH_INCOMPLETE');
  const index = graph => new Map(graph.nodes.map(({ref, dom_epoch, ...node}) => [ref.node_id, node]));
  const original = index(before), current = index(after);
  requireProof(original.size === before.nodes.length && current.size === after.nodes.length, 'DUPLICATE_NODE_ID');
  const added_nodes = [...current].filter(([id]) => !original.has(id)).map(([node_id, node]) => ({node_id, ...node}));
  const removed_nodes = [...original].filter(([id]) => !current.has(id)).map(([node_id, node]) => ({node_id, ...node}));
  const changed_nodes = [...original].flatMap(([node_id, node]) => current.has(node_id) && !isDeepStrictEqual(node, current.get(node_id))
    ? [{node_id, before:node, after:current.get(node_id)}] : []);
  const edges = graph => [...graph.links, ...graph.variable_links ?? [], ...graph.foreign_links ?? []];
  const difference = (a,b) => edges(a).filter(edge => !edges(b).some(other => isDeepStrictEqual(edge, other)));
  return {added_nodes, removed_nodes, changed_nodes, added_links:difference(after, before), removed_links:difference(before, after)};
}

export async function applyManualEdit(edit, {adapter, request, verifyEffect, editFilter, record, deadline}) {
  const before = await adapter.observe(request, deadline);
  await record({phase:'before', graph:before});
  const effect = {id:editId, kind:edit.kind, before, parameters:{}};
  const parameters = effect.parameters;
  if (edit.node) parameters.ref = resolveManualNode(before, edit.node).ref;
  if (edit.kind === 'create') {
    const placement = {...request, target:{kind:'new', type:edit.type}};
    parameters.type = edit.type;
    parameters.position = edit.position ?? await adapter.choosePosition(placement, before, deadline);
    await adapter.preflight({...placement, inputs:[]}, before, deadline);
    // Scrolling the palette can redraw the SVG. Refresh drawing epochs only.
    const refreshed = await adapter.observe(request, deadline);
    requireProof(refreshed.document_id === before.document_id && refreshed.dom_epoch === before.dom_epoch
      && isDeepStrictEqual(refreshed.workflow_ref, before.workflow_ref)
      && Object.values(manualGraphDelta(before, refreshed)).every(items => items.length === 0), 'PALETTE_GRAPH_CHANGED');
    effect.before = refreshed;
  }
  if (edit.kind === 'rename') {
    parameters.label = edit.label;
    requireProof(!before.nodes.some(node => node.label === edit.label), 'RENAME_LABEL_ALREADY_PRESENT');
  }
  if (edit.kind === 'move') parameters.position = edit.position;
  if (edit.kind === 'connect' || edit.kind === 'remove_link') {
    const source = resolveManualNode(before, edit.source), target = resolveManualNode(before, edit.target);
    const edge = {source:source.ref.node_id, output:edit.output, target:target.ref.node_id, input:edit.input};
    requireProof(source.outputs.includes(edge.output) && target.inputs.includes(edge.input), 'PORT_MISSING');
    const exists = before.links.some(link => isDeepStrictEqual(link, edge));
    requireProof(exists === (edit.kind === 'remove_link'), 'LINK_PRECONDITION');
    parameters.edge = edge;
    if (edit.kind === 'connect') await adapter.preflight({...request, target:{kind:'existing', ref:target.ref},
      inputs:[{source:source.ref, output:edge.output, input:edge.input}]}, before, deadline);
  }
  if (edit.kind === 'filter_threshold') {
    effect.receipt = await editFilter(parameters.ref, edit, deadline);
  } else {
    effect.receipt = await adapter.mutate(effect, deadline);
  }
  await record({phase:'gesture', kind:edit.kind, parameters, receipt:effect.receipt});
  const after = await adapter.observe(request, deadline);
  const delta = manualGraphDelta(before, after);
  await record({phase:'after', graph:after, delta});
  requireProof(effect.receipt?.status === 'SUCCEEDED' && effect.receipt.cleanup_complete === true, 'GESTURE_UNCONFIRMED');
  if (edit.kind === 'filter_threshold') {
    requireProof(after.document_id === before.document_id && isDeepStrictEqual(after.workflow_ref, before.workflow_ref)
      && Object.values(delta).every(items => items.length === 0) && after.interaction_ready, 'FILTER_GRAPH_CHANGED');
    return {delta:{...delta, filter_threshold:effect.receipt.change}, after};
  }
  const verified = verifyEffect(effect, after, adapter.positionMatches);
  requireProof(verified, 'EFFECT_UNCONFIRMED');
  requireProof(edit.kind !== 'create' || delta.added_links.length === 0, 'NODE_MUST_BE_UNCONNECTED');
  requireProof(edit.kind !== 'move' || delta.changed_nodes.length === 1, 'MOVE_MUST_CHANGE_POSITION');
  return {delta, after};
}

function filterRows(readback) {
  requireProof(readback.verified && readback.inventory_complete && !readback.dialogs.length, 'FILTER_SETTINGS_UNVERIFIED');
  return readback.rows.map(({record_id, cells, ...row}) => row);
}

async function filterThreshold({page, adapter, request, readFilterBrowser}, ref, edit, deadline, readOnly = false) {
  const remaining = () => Math.max(1, deadline - Date.now());
  const graph = await adapter.observe(request, deadline, {readBindings:true});
  const binding = graph.native_bindings.find(node => node.node_id === ref.node_id);
  requireProof(binding && graph.nodes.find(node => node.ref.node_id === ref.node_id)?.type === 'transform.filter_data', 'FILTER_NODE_REQUIRED');
  const prefix = request.workflow_ref.prefix;
  const nodeTid = prefix + ';Graph;' + binding.label;
  const wizard = prefix + ';WizrdMCF';
  const panel = locator(page, wizard + ';FilterDataWizard;FilterDataPanel');
  const canvas = locator(page, prefix + ';ModelForm;cmpDiagram');
  await canvas.locator('[data-tid=' + JSON.stringify(nodeTid) + ']').click({timeout:remaining()});
  await canvas.locator('[data-tid=' + JSON.stringify(nodeTid + ';Setting') + ']').click({timeout:remaining()});
  const ready = await Promise.race([
    panel.waitFor({state:'visible', timeout:remaining()}).then(() => 'panel'),
    locator(page, 'msgbox;tlb;yes').waitFor({state:'visible', timeout:remaining()}).then(() => 'confirm'),
  ]);
  if (ready === 'confirm') {
    requireProof((await locator(page, 'msgbox').innerText({timeout:remaining()})).includes('Настройка узла приведет к его деактивации'), 'FILTER_DIALOG_UNEXPECTED');
    await locator(page, 'msgbox;tlb;yes').click({timeout:remaining()});
    await panel.waitFor({state:'visible', timeout:remaining()});
  }
  const read = () => page.evaluate(readFilterBrowser, prefix);
  const before = await read();
  const rows = filterRows(before);
  const candidates = before.rows.filter(row => row.kind === 'condition' && row.field?.kind === 'input_field'
    && row.field.name === edit.field && ['integer', 'real'].includes(row.type)
    && row.variable_mode === 0 && Number.isFinite(row.value) && row.operator_code <= 5 && row.cells?.value);
  requireProof(candidates.length === 1, 'FILTER_CONDITION_ABSENT_OR_AMBIGUOUS');
  const row = candidates[0];
  if (readOnly) {
    await locator(page, wizard + ';btnClose').click({timeout:remaining()});
    await panel.waitFor({state:'hidden', timeout:remaining()});
    return rows;
  }
  requireProof(row.value !== edit.value && (row.type === 'real' || Number.isSafeInteger(edit.value)), 'FILTER_LITERAL_INVALID');
  await locator(page, row.cells.value).click({timeout:remaining()});
  const editor = page.locator('[data-tid^=' + JSON.stringify(wizard + ';FilterDataWizard;FilterDataPanel;VariantPropEdit;ValueContainer;') + '] input:visible');
  await editor.waitFor({state:'visible', timeout:remaining()});
  const editing = await read();
  requireProof(editing.verified && editing.editor?.record_id === row.record_id && editing.editor.field === 'CompareValue', 'FILTER_EDITOR_UNVERIFIED');
  const decimal = editing.numeric_inputs[0]?.decimal_separator ?? editing.decimal_separator;
  requireProof(['.', ','].includes(decimal), 'FILTER_NUMBER_LOCALE');
  await editor.fill(String(edit.value).replace('.', decimal), {timeout:remaining()});
  await editor.press('Tab', {timeout:remaining()});
  const actual = filterRows(await read());
  const expected = rows.map((item,i) => i === row.index ? {...item, value:edit.value} : item);
  requireProof(isDeepStrictEqual(actual, expected), 'FILTER_READBACK_MISMATCH');
  await locator(page, wizard + ';btnDone').click({timeout:remaining()});
  await panel.waitFor({state:'hidden', timeout:remaining()});
  return {status:'SUCCEEDED', cleanup_complete:true, change:{node_id:ref.node_id, field:edit.field, before:row.value, after:edit.value}, rows:expected};
}

export async function runManualEdit(root, output, {login, packagePath, edit}) {
  const load = name => import(pathToFileURL(join(root, 'runtime', name)).href);
  const {verifyResources} = await load('src/resources.mjs');
  const resources = await verifyResources(root);
  const {loginBrowser, loginomAddress} = await load('src/connection-check.mjs');
  const {makeWorkspacePrepareCode} = await load('client/lib/workspace.mjs');
  const {makePackageCleanupCode, makeFailedOpenCleanupCode} = await load('client/lib/package-cleanup.mjs');
  const {createNodeTargetBrowserAdapter} = await load('client/lib/node-target-browser.mjs');
  const {verifyNodeTargetEffect} = await load('client/lib/node-target.mjs');
  const {NODE_TYPES} = await load('client/lib/node-contracts.mjs');
  const {readFilterBrowser} = await load('client/lib/filter-context.mjs');
  const {createActionRuntime} = await load('client/lib/executor.mjs');
  const {createStorageBinding} = await load('client/lib/storage-policy.mjs');
  const {createExecutionJournal} = await load('client/lib/execution-journal.mjs');
  const {actions} = JSON.parse(await readFile(join(root,'runtime/executor/catalog/actions.json'),'utf8'));
  const {selectors} = JSON.parse(await readFile(join(root,'runtime/executor/catalog/selectors.json'),'utf8'));
  const directory = posix.dirname(packagePath);
  actions.find(action => action.action_key === 'package.save_checkpoint').effect.allowed_roots = [directory];
  const pinned = {actions:new Map(actions.map(action => [action.action_key, action])),
    selectors:new Map(selectors.map(selector => [selector.symbol, selector])), pins:{}};
  requireProof(edit.kind !== 'create' || Object.hasOwn(NODE_TYPES, edit.type), 'PALETTE_TYPE_UNKNOWN');
  const loginomUrl = loginomAddress(login.url), origin = new URL(loginomUrl).origin, build = '7.4.2';
  const compatibility = {loginom_build:build, platform:'linux', browser:'chromium'};
  const sessionId = randomUUID();
  const record = createExecutionJournal({directory:output, metadata:{sessionId}, knownSecrets:[login.password].filter(Boolean)});

  return withPackage('edit', async ({page, adapter, request, execute}) => {
    const deadline = Date.now() + 90_000;
    let filterReceipt;
    const editFilter = async (ref, value, end) => {
      filterReceipt = await filterThreshold({page, adapter, request, readFilterBrowser}, ref, value, end);
      return filterReceipt;
    };
    const effect = await applyManualEdit(edit, {adapter, request, verifyEffect:verifyNodeTargetEffect, deadline, editFilter, record});
    const binding = createStorageBinding({sessionId, origin, build, documentId:request.document_id, account:login.username,
      directories:{inputs:directory, packages:directory, exports:directory}});
    const runtime = createActionRuntime({pinned, execute, allowCandidate:true, targetOrigin:origin, targetBuild:build,
      onRecord:record, getStorageBinding:() => binding});
    const saved = await runtime.run('package.save_checkpoint', {path:packagePath, conflict_policy:'replace'}, {operationId:'manual-save'});
    await record({phase:'save', status:saved.status, save_completed:saved.output?.save_completed, error:saved.error});
    requireProof(saved.status === 'SUCCEEDED' && saved.output?.save_completed === true && saved.cleanup_complete === true, 'SAVE_UNCONFIRMED');
    return {effect, filterReceipt};
  }).then(async ({value:{effect, filterReceipt}, cleanup}) => {
    const {value:persisted, cleanup:reopen_cleanup} = await withPackage('reopen', async ({page, adapter, request}) => {
      const graph = await adapter.observe(request, Date.now() + 30_000);
      const delta = manualGraphDelta(effect.after, graph);
      await record({phase:'persisted', graph, delta});
      requireProof(Object.values(delta).every(items => items.length === 0), 'PERSISTED_GRAPH_MISMATCH');
      if (filterReceipt) {
        const ref = resolveManualNode(graph, edit.node).ref;
        const rows = await filterThreshold({page, adapter, request, readFilterBrowser}, ref, edit, Date.now() + 30_000, true);
        await record({phase:'persisted_filter', rows});
        requireProof(isDeepStrictEqual(rows, filterReceipt.rows), 'PERSISTED_FILTER_MISMATCH');
      }
      return graph;
    });
    return {status:'PASS', delta:effect.delta, persisted, cleanup, reopen_cleanup};
  });

  async function withPackage(phase, work) {
    const {context} = await loginBrowser({browserPath:resources.browserPath, profile:join(output, phase + '-browser'),
      candidate:login, keepOpen:true, headless:true});
    const page = context.pages()[0];
    const execute = code => new Function('page', 'return (' + code + ')(page)')(page);
    const operationId = 'manual-' + phase;
    const cleanupOptions = {sessionId, account:login.username, packagePath, loginomUrl, loginomBuild:build, operationId};
    let ready, value, failure, cleanup;
    try {
      ready = await execute(makeWorkspacePrepareCode({loginomUrl, compatibility, sessionId, operationId,
        intent:'open_package', packagePath}));
      await record({phase:phase + '_open', status:ready.status, reason:ready.reason});
      requireProof(ready.status === 'READY' && ready.package_ref?.path === packagePath
        && !ready.workflow_ref.navigation_path.some(item => item.label.endsWith('(только чтение)')), 'OPEN_UNCONFIRMED');
      value = await work({page, execute, request:{document_id:ready.document_id, workflow_ref:ready.workflow_ref},
        adapter:createNodeTargetBrowserAdapter({execute, origin, build, pinned, record})});
    } catch (error) {
      failure = error;
    } finally {
      try {
        const code = ready?.status === 'READY'
          ? makePackageCleanupCode({...cleanupOptions, documentId:ready.document_id, tabTid:ready.workflow_ref.tab_tid,
            diagnosticDiscard:phase === 'edit' && Boolean(failure)})
          : makeFailedOpenCleanupCode(cleanupOptions);
        cleanup = await execute(code);
        await record({phase:phase + '_cleanup', cleanup});
        requireProof(cleanup.package_closed === true && cleanup.logged_out === true && (failure || !cleanup.unsaved_changes_discarded), 'CLEANUP_UNCONFIRMED');
      } catch (error) {
        await record({phase:phase + '_cleanup_error', error:error.message});
        failure ??= error;
      } finally {
        await context.close();
      }
    }
    if (failure) throw failure;
    return {value, cleanup};
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [root, output] = process.argv.slice(2);
  process.umask(0o077);
  const config = JSON.parse(readFileSync(0,'utf8'));
  const result = await runManualEdit(root, output, config);
  await writePrivateJson(join(output, 'result.json'), result);
}
