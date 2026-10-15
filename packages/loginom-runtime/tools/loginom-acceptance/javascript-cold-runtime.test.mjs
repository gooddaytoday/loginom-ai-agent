import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readdir, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture} from './javascript-package-binding.test.mjs';
import {createJavascriptExecutionRuntime, createJavascriptSavedExecutionRuntime} from './javascript-execution-runtime.mjs';

test('saved runtime binds the real constructor without input artifacts or mutation methods', async () => {
  const f=fixture(), directory=await mkdtemp(join(tmpdir(),'js-cold-runtime-'));
  try {
    const runtime=await createJavascriptSavedExecutionRuntime({page:f.page,prepared:f.prepared,account:'jsteach',directory,
      deadline:Date.now()+60000,savedPath:f.prepared.package_ref.path,record:async event=>event});
    assert.ok(Object.isFrozen(runtime));
    assert.deepEqual(Object.keys(runtime).sort(),['captureExecutionBoundary','executeNode','graph','handoffReopenedWizard',
      'prepareSourceProcessHistory','manualMappingPending','nativeReadUncertain','passiveSurfacePending','readOutput','readPortMapping','reopen',
      'restoreWorkflowForCleanup','settleClosedExecutionBoundary','verifyExecutionBoundary','wizardOpeningPending'].sort());
    for(const method of ['prepareInput','channel','once','savePersistenceCheckpoint','prepareManualMapping','connectInput'])
      assert.equal(method in runtime,false);
    assert.deepEqual(await readdir(directory),[]);
    assert.equal(runtime.nativeReadUncertain,false);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('draft constructor cannot admit saved packages or an injected cold mode',async()=>{
  const f=fixture();
  await assert.rejects(createJavascriptExecutionRuntime({page:f.page,prepared:f.prepared,account:'jsteach',deadline:Date.now()+60000}),/draft required/);
  await assert.rejects(createJavascriptExecutionRuntime({coldPackagePath:f.prepared.package_ref.path}),/cannot admit saved/);
});

for(const extra of [{source_text:''},{settings:{}},{expected_source_sha256:'a'.repeat(64)},
  {persistence:true},{nativeInputOnly:true},{effectScope:()=>null}])
  test('cold constructor refuses extra authority '+Object.keys(extra)[0],async()=>{
    const f=fixture();let calls=0;f.page.evaluateHandle=async()=>{calls++;throw Error('Unexpected browser call');};
    await assert.rejects(createJavascriptSavedExecutionRuntime({page:f.page,prepared:f.prepared,account:'jsteach',
      deadline:Date.now()+60000,savedPath:f.prepared.package_ref.path,...extra}),/technical assignment/);
    assert.equal(calls,0);
  });

test('cold constructor refuses absent path and expired deadline before browser observation',async()=>{
  const f=fixture(false);
  await assert.rejects(createJavascriptSavedExecutionRuntime({page:f.page,prepared:f.prepared,account:'jsteach',deadline:Date.now()+60000}),/requires saved/);
  await assert.rejects(createJavascriptSavedExecutionRuntime({deadline:Date.now()-1}),/technical assignment/);
});

for(const fault of ['ok','prepare','account','draft'])test('actual cold history method only prepares and never launches: '+fault,async()=>{
 const text=await readFile(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
 const start=text.indexOf('    async prepareSourceProcessHistory(node,operationDeadline=deadline) {');
 const method=text.slice(start,text.indexOf('    async captureExecutionBoundary()',start));
 const calls=[],node={node_id:'js'},deadline=Date.now()+60000,baseline={roots:[]};
 const env={Math,Error,deadline,coldPackagePath:fault==='draft'?null:'/jsteach/x.lgp',
  accountGuard:async()=>{calls.push('account');if(fault==='account')throw Error('owner changed');},
  channel:(n,until)=>{assert.equal(n,node);assert.equal(until,deadline);return 'channel';},
  once:async(id,identity,run)=>{assert.equal(id,'cold-source-process-history');assert.equal(identity.node,node);calls.push('once');return run();},
  createNodeExecutionProcedure:(channel,n)=>{assert.equal(channel,'channel');assert.equal(n,node);return {
   prepare:async()=>{calls.push('prepare');if(fault==='prepare')throw Error('lost preparation');return baseline;},
   launchGraph:async()=>{throw Error('Must not execute');}};},record:async event=>{assert.equal(event.execution_dispatched,false);calls.push('record');}};
 const run=vm.runInNewContext('({'+method+'}).prepareSourceProcessHistory',env);
 if(fault==='ok'){assert.equal(await run(node),baseline);assert.deepEqual(calls,['account','once','prepare','account','record']);}
 else{await assert.rejects(run(node));assert.equal(calls.includes('record'),false);}
});
