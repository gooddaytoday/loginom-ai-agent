import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { applyManualEdit, manualGraphDelta, runManualEdit } from '../manual-edit.mjs';
import { checkCasePorts } from '../case-ports.mjs';
import { verifyNodeTargetEffect } from '../../../packages/loginom-runtime/client/lib/node-target.mjs';

const source = {label:'Продажи'}, target = {label:'Фильтр строк'};
const edge = {source:'sales', output:0, target:'filter', input:0};
const link = {source, target, output:0, input:0};
const position = {x:192, y:192};
const node = (node_id, label, type) => ({ref:{node_id}, label, type, position:{x:128,y:128}, inputs:[0], outputs:[0]});
const nodes = [node('sales', source.label, 'imports.text'), node('filter', target.label, 'transform.filter_data')];
const graph = (nodes, links = []) => ({complete:true, interaction_ready:true, document_id:'doc', dom_epoch:1,
  workflow_ref:{workflow_id:'workflow'}, nodes, links, foreign_links:[]});
const sorted = node('sort','Сортировка','transform.sorting');

function fixture(before, after, receipt = {status:'SUCCEEDED', cleanup_complete:true}) {
  const events = [], mutations = [];
  const adapter = {
    observe:async () => mutations.length ? after : before,
    choosePosition:async () => position,
    preflight:async () => {},
    positionMatches:(node, wanted) => node.position.x === wanted.x && node.position.y === wanted.y,
    mutate:async effect => {mutations.push(effect); return receipt;},
  };
  const run = edit => applyManualEdit(edit, {adapter, verifyEffect:verifyNodeTargetEffect, request:{},
    record:event => events.push(event), deadline:Infinity,
    editFilter:async (ref, edit) => {
      mutations.push({ref, edit});
      return {...receipt, change:{node_id:ref.node_id, field:edit.field, before:100, after:edit.value}};
    },
  });
  return {events, mutations, run};
}

const examples = [
  {edit:{kind:'create', type:sorted.type}, before:graph(nodes), after:graph([...nodes, sorted]), evidence:'added_nodes'},
  {edit:{kind:'rename', node:target, label:'Итоги'}, before:graph(nodes,[edge]),
    after:graph([nodes[0], {...nodes[1],label:'Итоги'}],[edge]), evidence:'changed_nodes'},
  {edit:{kind:'move', node:target, position}, before:graph(nodes,[edge]),
    after:graph([nodes[0], {...nodes[1],position}],[edge]), evidence:'changed_nodes'},
  {edit:{kind:'remove_link', ...link}, before:graph(nodes,[edge]), after:graph(nodes), evidence:'removed_links'},
  {edit:{kind:'connect', ...link}, before:graph(nodes), after:graph(nodes,[edge]), evidence:'added_links'},
  {edit:{kind:'filter_threshold', node:target, field:'Revenue', value:200}, before:graph(nodes,[edge]),
    after:graph(nodes,[edge]), evidence:'filter_threshold'},
  {edit:{kind:'delete_node', node:target}, before:graph(nodes,[edge]), after:graph([nodes[0]]), evidence:'removed_nodes'},
];

for (const {edit, before, after, evidence} of examples) {
  test(edit.kind + ' performs one edit and journals the observed delta', async () => {
    const {events, mutations, run} = fixture(before, after);
    const result = await run(edit);
    assert.equal(mutations.length, 1);
    assert.deepEqual(events.map(e => e.phase), ['before','gesture','after']);
    assert.deepEqual(result.after, after);
    if (edit.kind === 'filter_threshold') {
      assert.deepEqual(result.delta[evidence], {node_id:'filter', field:'Revenue', before:100, after:200});
    } else {
      assert.equal(result.delta[evidence].length, 1);
      assert.deepEqual(result.delta, events[2].delta);
    }
  });
}

test('adding a palette node refuses Loginom auto-wiring', async () => {
  const wired = {...edge, target:'sort'};
  const {run, mutations} = fixture(graph(nodes), graph([...nodes, sorted],[wired]));
  await assert.rejects(run({kind:'create', type:sorted.type}), /NODE_MUST_BE_UNCONNECTED/);
  assert.equal(mutations.length, 1);
});

test('ambiguous nodes and already existing connections are rejected before a gesture', async () => {
  const ambiguous = graph([...nodes, {...nodes[1],ref:{node_id:'other-filter'}}]);
  const same = fixture(ambiguous, ambiguous);
  await assert.rejects(same.run({kind:'delete_node', node:target}), /NODE_ABSENT_OR_AMBIGUOUS/);
  assert.equal(same.mutations.length, 0);
  const connected = fixture(graph(nodes,[edge]), graph(nodes,[edge]));
  await assert.rejects(connected.run({kind:'connect', ...link}), /LINK_PRECONDITION/);
  assert.equal(connected.mutations.length, 0);
});

test('an unconfirmed gesture or a collateral change fails without replay', async () => {
  const [rename] = examples.filter(x => x.edit.kind === 'rename');
  const unknown = fixture(rename.before, rename.after, {status:'AMBIGUOUS', cleanup_complete:false});
  await assert.rejects(unknown.run(rename.edit), /GESTURE_UNCONFIRMED/);
  assert.equal(unknown.mutations.length, 1);
  const collateral = fixture(rename.before, graph([{...nodes[0],position}, rename.after.nodes[1]],[edge]));
  await assert.rejects(collateral.run(rename.edit), /EFFECT_UNCONFIRMED/);
  const filter = fixture(rename.before, rename.after);
  await assert.rejects(filter.run(examples.find(x => x.edit.kind === 'filter_threshold').edit), /FILTER_GRAPH_CHANGED/);
});

test('persisted comparison tolerates rendering epochs and detects moved or recreated nodes', () => {
  const before = graph(nodes,[edge]);
  const reread = graph(nodes.map(n => ({...n, dom_epoch:2, ref:{...n.ref, document_id:'reopened'}})),[edge]);
  assert(Object.values(manualGraphDelta(before,reread)).every(items => items.length === 0));
  const moved = graph([{...nodes[0],position},nodes[1]],[edge]);
  assert.equal(manualGraphDelta(before,moved).changed_nodes.length, 1);
  const replaced = graph([{...nodes[0],ref:{node_id:'another'}},nodes[1]],[edge]);
  assert.equal(manualGraphDelta(before,replaced).removed_nodes[0].node_id, 'sales');
});

test('manual browser saves once, closes and reopens to prove persistence', async t => {
  const root = await mkdtemp(join(tmpdir(), 'manual-edit-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  const modules = {
    'src/resources.mjs': "export const verifyResources = async () => ({browserPath:'browser'})",
    'src/connection-check.mjs': `
      export const state = {events:[]};
      export const loginomAddress = url => url;
      export async function loginBrowser({profile}) {
        const phase = profile.endsWith('edit-browser') ? 'edit' : 'reopen';
        state.events.push('login:'+phase);
        const page = {
          open:o => {
            state.events.push('open:'+phase);
            state.graph = structuredClone(state.saved);
            return {status:'READY', document_id:phase, workflow_ref:{workflow_id:'flow',tab_tid:'workflow',navigation_path:[]}, package_ref:{path:o.packagePath}};
          },
          clean:() => {state.events.push('logout:'+phase);return {package_closed:true,logged_out:true};},
        };
        return {context:{pages:() => [page],close:async () => state.events.push('close:'+phase)}};
      }`,
    'client/lib/workspace.mjs': "export const makeWorkspacePrepareCode = o => 'async page => page.open('+JSON.stringify(o)+')'",
    'client/lib/package-cleanup.mjs': `
      export const makePackageCleanupCode = () => 'async page => page.clean()';
      export const makeFailedOpenCleanupCode = makePackageCleanupCode;`,
    'client/lib/node-target-browser.mjs': `
      import {state} from '../../src/connection-check.mjs';
      export const createNodeTargetBrowserAdapter = () => ({
        observe:async request => ({...state.graph, ...request}),
        mutate:async () => {
          state.events.push('gesture');
          state.graph = structuredClone(state.edited);
          return {status:'SUCCEEDED', cleanup_complete:true};
        },
      });`,
    'client/lib/node-target.mjs': 'export {verifyNodeTargetEffect} from ' + JSON.stringify(
      new URL('../../../packages/loginom-runtime/client/lib/node-target.mjs', import.meta.url).href),
    'client/lib/node-contracts.mjs': 'export const NODE_TYPES = {}',
    'client/lib/filter-context.mjs': 'export const readFilterBrowser = undefined',
    'client/lib/execution-journal.mjs': 'export const createExecutionJournal = () => async event => event',
    'client/lib/storage-policy.mjs': 'export const createStorageBinding = () => ({})',
    'client/lib/executor.mjs': `
      import {state} from '../../src/connection-check.mjs';
      export const createActionRuntime = () => ({run:async () => {
        state.events.push('save');
        if (!state.dropSave) state.saved = structuredClone(state.graph);
        return {status:'SUCCEEDED', cleanup_complete:true, output:{save_completed:true}};
      }});`,
    'executor/catalog/actions.json': JSON.stringify({actions:[{action_key:'package.save_checkpoint',effect:{}}]}),
    'executor/catalog/selectors.json': JSON.stringify({selectors:[]}),
  };
  for (const [path, content] of Object.entries(modules)) {
    const file = join(root, 'runtime', path);
    await mkdir(dirname(file), {recursive:true});
    await writeFile(file, content);
  }
  const {state} = await import(pathToFileURL(join(root, 'runtime/src/connection-check.mjs')));
  const {edit, before, after} = examples.find(item => item.edit.kind === 'rename');
  const options = {login:{url:'https://example.invalid',username:'tester'}, packagePath:'/test/manual.lgp', edit};
  const run = () => runManualEdit(root, root, options);
  state.saved = before;
  state.edited = after;
  const result = await run();
  assert.equal(result.status,'PASS');
  assert.equal(result.persisted.nodes[1].label,edit.label);
  assert.deepEqual(state.events,['login:edit','open:edit','gesture','save','logout:edit','close:edit',
    'login:reopen','open:reopen','logout:reopen','close:reopen']);

  state.saved = before;
  state.events = [];
  state.dropSave = true;
  await assert.rejects(run(), /PERSISTED_GRAPH_MISMATCH/);
  assert.equal(state.events.filter(event => event === 'save').length, 1);
  assert.deepEqual(state.events.slice(-2), ['logout:reopen','close:reopen']);

  state.events = [];
  state.edited = before;
  await assert.rejects(run(), /EFFECT_UNCONFIRMED/);
  assert.deepEqual(state.events, ['login:edit','open:edit','gesture','logout:edit','close:edit']);
});

test('native turn output checks the final read on the exact port', () => {
  const output = {output_node_type:'transform.filter_data', output_node_label:target.label, output_port:1,
    ordered:true, column_order:'exact', columns:[{name:'Revenue',type:'integer'}],rows:[{Revenue:50}]};
  const sample = value => ({row_count:1,sample_complete:true,precision:{numbers_verified:true},
    schema:[{name:'Revenue',label:'Revenue',type:'integer'}],sample:[[{type:'integer',value:String(value),is_null:false,precision:'exact'}]]});
  const observed = {type:output.output_node_type,label:target.label,port:1,data:sample(50)};
  const expected = {package_path:'/test/manual.lgp',nodes:[],outputs:[output]};
  checkCasePorts(expected,[observed]);
  assert.throws(() => checkCasePorts(expected,[{...observed,port:0}]), /CASE_PORT_OUTPUT_MISSING/);
  assert.throws(() => checkCasePorts(expected,[observed,{...observed,data:sample(120)}]), /CASE_PORT_OUTPUT_MISMATCH/);
});
