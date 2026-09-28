import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {javascriptPersistenceCase} from './javascript-persistence-cases.mjs';
import {verifyJavascriptPersistenceOutput} from './javascript-persistence-oracle.mjs';
import {javascriptSourceSettings} from './javascript-source-cycle.mjs';
import {runJavascriptOperator} from './javascript-live.mjs';

const finalMarker = 'JS_G7_FINAL_V2 — Сумма & <tag> "quotes" \'single\' \\ backslash 😀';
const table = revision => ({row_count: 6, sample_rows: 6, sample_complete: true,
  schema: [{name: 'ObservedID', label: 'ObservedID', type: 'integer'}, {name: 'PhaseMarker', label: 'PhaseMarker', type: 'string'}],
  sample: ['1','2','3','4','5','6'].map(value => [
    {type: 'integer', is_null: false, precision: 'exact_integer', value},
    {type: 'string', is_null: false, value: revision === 1 ? 'JS_G2_TABLE_V1' : finalMarker},
  ])});

// Execute the real writer control flow. UI/transport are synthetic; source
// reader, save capability, schema observer and typed oracle have separate tests.
async function writerFixture(mode, fault) {
  const source = await readFile(new URL('./javascript-live.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('    if(persistence){\n      const first='), end = source.indexOf('\n    if(sourceReadCycle)', start);
  assert.ok(start > 0 && end > start);
  const persistence = javascriptPersistenceCase(mode), calls = [], deadline = Date.now() + 60000;
  const executionNode = {node_id: 'js', document_id: 'doc', workflow_id: 'workflow'};
  const executed = (revision, id) => ({status: 'completed', verified: true, owner_verified: true, cleanup_complete: true,
    execution_id: id, trial: {node_id: 'js', source_sha256: persistence.revisions[revision - 1].source_sha256}});
  const schema = {verified: true, generation: {checked: mode === 'code'}, grids: []};
  const settings = javascriptSourceSettings(schema), mappings = {input: {autosync: true}, output: {autosync: true}};
  const report = {execution_probe: {output: table(1)}}, execution = executed(1, 'first');
  let cycles = 0;
  const env = {persistence, probe: persistence.revisions[0], report, execution, executionNode, deadline,
    verifyJavascriptPersistenceOutput, javascriptSourceSettings, JSON, Date, Math, Error, structuredClone,
    executionPrepared: null, wizardAddressEpoch: 0, wizardHandle: null, wizardRoot: null, openedWizard: false,
    closeDispatched: false, closeConfirmed: false, closeDeadline: 0, wizardDeadline: 0, readingExisting: false,
    trialPhase: 'initial', sourceSha: persistence.revisions[0].source_sha256, owner: {prefix: 'MF;TF-1'},
    phaseDeadline: ms => Date.now() + ms, save: async () => {}, guard: async () => {}, waitWizardReady: async () => {},
    exact: () => ({waitFor: async () => { calls.push('done-hidden'); }}), waitGraphReady: async () => {},
    inspectWizardPages: async () => { report.execution_existing_schema = structuredClone(schema);
      if (fault === 'settings') report.execution_existing_schema.generation.checked = !schema.generation.checked; },
    probeOwnedSource: async (old, next) => {
      calls.push('replace');assert.equal(old, persistence.revisions[0].source);assert.equal(next, persistence.revisions[1].source);
      if (fault === 'old-source') throw Error('Expected old source differs');
    },
    dispatch: async stage => { calls.push(stage);return {sentinel_observed: fault === 'done-sentinel'}; },
    runSourceReadCycle: async (revision, until, expectedSettings) => {
      calls.push('cycle-' + revision.revision);assert.equal(until, deadline);cycles++;
      if (cycles > 1) assert.deepEqual(expectedSettings, settings);
      if (fault === 'source-before' && cycles === 2 || fault === 'source-final' && cycles === 3) throw Error('Actual source differs');
      return {rounds: [{settings: structuredClone(settings)}], mappings: {after: fault === 'mapping' && cycles === 2 ? {} : mappings}};
    },
    executionRuntime: {
      savePersistenceCheckpoint: async revision => {
        calls.push('save-' + revision);
        if (fault === 'save-' + revision) throw Error('Lost save response');
        return {path: '/owned.lgp', prepared: {document_id: 'doc'}, revision};
      },
      reopen: async () => { calls.push('reopen'); }, handoffReopenedWizard: async () => {},
      captureExecutionBoundary: async () => ({native: {dispose: async () => { calls.push('dispose-boundary'); }}}),
      verifyExecutionBoundary: async () => { if (fault === 'graph') throw Error('Graph changed'); },
      executeNode: async (node, until, trial) => {
        calls.push('execute-final');assert.equal(node, executionNode);assert.equal(until, deadline);
        assert.equal(trial.phase, 'persistence-final');assert.equal(trial.source_sha256, persistence.revisions[1].source_sha256);
        const result = executed(2, fault === 'stale-execution' ? 'first' : 'second');
        if (fault === 'missing-execution') delete result.execution_id;
        if (fault === 'foreign-execution') result.trial.node_id = 'foreign';
        return result;
      },
      readPassive: async (node, kind, until) => {
        calls.push('read-output');assert.equal(kind, 'persistence-final');assert.equal(until, deadline);
        return table(fault === 'stale-output' ? 1 : 2);
      },
    },
  };
  return {calls, report, run: vm.runInNewContext('(async()=>{' + source.slice(start, end) + '})', env)};
}

for (const mode of ['code','declared']) test('actual fixed writer performs two ordered saves: ' + mode, async () => {
  const f = await writerFixture(mode);await f.run();
  assert.deepEqual(f.calls, ['cycle-1','save-1','reopen','replace','done','done-hidden','cycle-2',
    'execute-final','read-output','dispose-boundary','save-2','cycle-2']);
  assert.equal(f.report.persistence.status, 'WRITER_OBSERVED');
  assert.equal(f.report.persistence.cold_persistence_verified, false);
  assert.equal(f.report.persistence.package_bytes_verified, false);
});

for (const fault of ['save-1','settings','old-source','done-sentinel','source-before','mapping','stale-execution',
  'missing-execution','foreign-execution','graph','stale-output','save-2','source-final'])
  test('actual writer stops on ' + fault + ' without replay', async () => {
    const f = await writerFixture('code', fault);await assert.rejects(f.run());
    assert.notEqual(f.report.persistence.status, 'WRITER_OBSERVED');
    for (const action of ['save-1','replace','execute-final','save-2']) assert.ok(f.calls.filter(x => x === action).length <= 1);
    if (['save-1','settings','old-source','done-sentinel','source-before','mapping'].includes(fault))
      assert.equal(f.calls.includes('execute-final'), false);
  });

for (const args of [['--execution-case','code-table-execute'],['--probe-source'],['--create-node']])
  test('private persistence entrypoint refuses mixed mode ' + args.join(' '), async () => {
    await assert.rejects(runJavascriptOperator(args, {persistenceMode: 'code'}), /separate fixed writer/);
  });

for (const saved of [false,true]) for (const fault of ['ok','account','path','name','prefix','native'])
  test('actual operator package guard ' + (saved ? 'saved ' : 'draft ') + fault, async () => {
    const source = await readFile(new URL('./javascript-live.mjs', import.meta.url), 'utf8');
    const helpers = source.slice(source.indexOf('const ownedPackageName='), source.indexOf('let browserLifecycle,'));
    const body = source.slice(source.indexOf('const guard=async()=>'), source.indexOf('const settlePackageMetadata='));
    const packageHandle = {}, path = '/jsteach/js-g2-owned/JavaScript-owned.lgp', name = saved ? 'Saved' : 'Draft';
    const surface = {connected:true,account:'jsteach',build:'7.4.2',packages:1,package_name:name,package_path:saved?path:'',prefix:'MF;TF-1'};
    if (fault === 'account') surface.account = 'foreign';
    if (fault === 'path') surface.package_path = '/foreign.lgp';
    if (fault === 'name') surface.package_name = 'Foreign';
    if (fault === 'prefix') surface.prefix = 'MF;TF-2';
    const native = vm.createContext({bg:{app:{Application:{FInstance:{FMainForm:{FMapTree:{PackageNodes:{Count:1,
      Items:()=>fault==='native'?{}:packageHandle}}}}}}}});
    const guard = vm.runInNewContext(helpers + body + '\nguard', {coldReader:false,owner:{package_name:'Draft',prefix:'MF;TF-1'},packageHandle,
      executionRuntime:{persistencePackage:saved?{path,prepared:{package_ref:{name}}}:null},
      config:{username:'jsteach'},remainingBatch:()=>1000,observe:async()=>surface,
      page:{evaluate:async(fn,arg)=>vm.runInContext('('+fn.toString()+')',native)(arg)}});
    if (fault === 'ok') assert.equal(await guard(), surface);
    if (fault !== 'ok') await assert.rejects(guard());
  });
