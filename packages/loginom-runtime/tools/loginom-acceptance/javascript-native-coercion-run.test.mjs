import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,constants} from 'node:fs';
import {mkdtemp,rm,readFile,open,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRedactor} from '../../client/lib/redact.mjs';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';
import {javascriptCoercionIds,javascriptCoercionCase} from './javascript-native-coercion-cases.mjs';
import {javascriptNativeRoundtripProbe,verifyNativeRoundtripRead,verifyNativeRoundtripOutcome} from './javascript-native-roundtrip-contract.mjs';
import {nativeInputProvenance,verifyNativeInputRead,verifyNativeInputFixture} from './javascript-native-input-contract.mjs';
import {verifyCoercionFailureOutcome} from './javascript-native-coercion-failure.mjs';
import {readJavascriptNativeRoundtrip,javascriptNativeRoundtripStatus} from './javascript-native-roundtrip-read.mjs';
import {decodeVariantFrame} from '../../client/lib/variant-native-decode.mjs';
import {sourceEvidence} from './javascript-native-input.test.mjs';
import {roundtrip} from './javascript-native-roundtrip.test.mjs';
import {fixture} from './javascript-native-coercion-failure.test.mjs';
import {createJavascriptCoercionTrial,writeJavascriptCoercionReport} from './javascript-native-coercion-run.mjs';
import {runJavascriptOperator} from './javascript-live.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const clean={package_closed:true,logged_out:true,browser_closed:true};
async function stages(id,value){
 const x=await roundtrip({fixtureId:id,coercionOutput:value}),binding={...x.f.b,read_id:'before'},lifecycle={...clone(x.f.env.__loginomJavascriptNativeInputReadV1.last),retired:false};
 const provenance=nativeInputProvenance(sourceEvidence(id));
 const before={binding,raw:x.before,lifecycle,exact:verifyNativeInputRead(x.before,{binding,lifecycle,provenance})},results={before};
 for(const role of ['output','upstream']){
  const binding=await x.bind(role),raw=await readJavascriptNativeRoundtrip(x.f.page,binding,decodeVariantFrame,{operationId:role});
  const lifecycle=await javascriptNativeRoundtripStatus(x.f.page),expected={...binding,read_id:role};
  results[role]={binding:expected,raw,lifecycle,exact:verifyNativeRoundtripRead(raw,{binding:expected,lifecycle,input:before,role})};
 }
 results.outcome=verifyNativeRoundtripOutcome(results,id);return {results,execution:x.execution};
}
async function terminal(id,kind){
 if(kind!=='failed')return stages(id,kind==='null'?null:'9007199254740993');
 const s=await fixture(id),failed=await s.seal(),upstream=await s.read(failed);
 const results={before:s.before,failed,upstream,output:{status:'not_read_failed_execution'}};
 results.outcome=verifyCoercionFailureOutcome(results,id);return {results,execution:s.execution};
}
function runtime(receipt,calls){
 return {checkNativeRoundtripBeforeExecute:async()=>calls.push('check'),captureExecutionBoundary:async()=>({native:{dispose:async()=>calls.push('dispose')}}),
  verifyExecutionBoundary:async()=>calls.push('boundary'),executeNode:async()=>{calls.push('execute');return receipt.execution;},
  readNativeRoundtrip:async()=>{calls.push('output+upstream');assert.equal(receipt.execution.status,'completed');return receipt.results;},
  readNativeCoercionFailure:async()=>{calls.push('upstream-only');assert.equal(receipt.execution.status,'failed');return receipt.results;}};
}
for(const id of javascriptCoercionIds)for(const kind of ['integer','null','failed'])test(id+' actual native proofs through live coercion dispatch '+kind,async t=>{
 const receipt=await terminal(id,kind),calls=[],trial=createJavascriptCoercionTrial(id);
 const directory=await mkdtemp(join(tmpdir(),'js-coercion-run-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const journal=createExecutionJournal({directory,metadata:{sessionId:'test',clientRevision:'source82'}});
 const report={execution_probe:{},gates_closed:[]};
 const source=readFileSync(new URL('./javascript-live.mjs',import.meta.url),'utf8');
 const start=source.indexOf('    if(coercionTrial){'),end=source.indexOf('    await executionRuntime.checkNativeRoundtripBeforeExecute();',start);
 const run=vm.runInNewContext('(async()=>{'+source.slice(start,end)+'})',{
  report,coercionTrial:trial,executionRuntime:runtime(receipt,calls),executionInput:{},executionNode:{node_id:'js'},
  probe:javascriptNativeRoundtripProbe(id),deadline:Date.now()+30000,executionRecord:journal,save:async()=>writeJavascriptCoercionReport(directory,{...report,native_coercion:trial.coverage})
 });
 await run();assert.equal(report.native_roundtrip,receipt.results);
 assert.equal(calls.filter(x=>x==='execute').length,1);assert.equal(calls.includes('output+upstream'),kind!=='failed');
 assert.equal(trial.coverage.cases.find(c=>c.id===id).status,'unresolved');
 const status=await trial.finish({cleanup:clean,record:journal,persist:async status=>writeJavascriptCoercionReport(directory,{...report,status,native_coercion:trial.coverage})});
 assert.equal(status,kind==='failed'?'UNRESOLVED':'CHARACTERIZED');
 const saved=JSON.parse(await readFile(join(directory,'report.json'),'utf8'));
 assert.equal(saved.native_coercion.cases.length,7);assert.equal(saved.native_coercion.coverage_complete,false);assert.equal(saved.native_coercion.exact_pass,false);
 assert.equal(saved.native_coercion.cases.filter(c=>c.status==='not_run').length,6);
 assert.equal(saved.native_coercion.cases.find(c=>c.id===id).case_complete,kind!=='failed');
 assert.ok(Object.isFrozen(receipt.results));
 const records=(await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
 assert.deepEqual(records.map(r=>r.phase),['native_coercion_dispatch_reserved','native_coercion_terminal_verified','native_coercion_finalized']);
 await assert.rejects(run,/no replay/);assert.equal(calls.filter(x=>x==='execute').length,1);
});
for(const fault of ['source','hash','schema','probe-id','dispatch-ack','terminal-ack','unknown-terminal','different-execution','bad-result','boundary','dispose','deadline'])test('coercion orchestration refuses '+fault,async()=>{
 const id=javascriptCoercionIds[0],receipt=await stages(id,'0'),calls=[],trial=createJavascriptCoercionTrial(id),probe=clone(javascriptNativeRoundtripProbe(id));
 const rt=runtime(receipt,calls);
 if(fault==='source')probe.source+=' ';if(fault==='hash')probe.source_sha256='0'.repeat(64);
 if(fault==='schema')probe.output_schema[0].type=3;if(fault==='probe-id')probe.id+='-other';
 if(fault==='unknown-terminal')receipt.execution.status='cancelled';
 if(fault==='different-execution')rt.executeNode=async()=>({...receipt.execution,process_id:'4.9'});
 if(fault==='bad-result')receipt.results.outcome.exact_pass=true;
 if(fault==='boundary')rt.verifyExecutionBoundary=async()=>{throw Error('boundary changed');};
 if(fault==='dispose')rt.captureExecutionBoundary=async()=>({native:{dispose:async()=>{throw Error('dispose failed');}}});
 const record=async e=>fault==='dispatch-ack'&&e.phase==='native_coercion_dispatch_reserved'||fault==='terminal-ack'&&e.phase==='native_coercion_terminal_verified'?{}:clone(e);
 const run=()=>trial.run({runtime:rt,input:{},node:{node_id:'js'},sourceProbe:probe,deadline:fault==='deadline'?0:Date.now()+30000,record,onExecution:async()=>{}});
 await assert.rejects(run);await assert.rejects(run,/no replay/);
 let saved;await trial.finish({cleanup:clean,failure:{message:fault},record:async e=>e,persist:async status=>{saved=status;}});
 assert.equal(saved,'FAILED');assert.equal(trial.coverage.cases[0].status,'unresolved');assert.equal(trial.coverage.coverage_complete,false);
 assert.equal(calls.filter(c=>c==='execute').length<=1,true);
});
for(const fault of ['package_closed','logged_out','browser_closed','cleanup-error','work-failure','final-ack','report-fsync'])test('successful native result cannot bypass final '+fault,async()=>{
 const id=javascriptCoercionIds[0],receipt=await stages(id,'42'),trial=createJavascriptCoercionTrial(id),cleanup={...clean};
 await trial.run({runtime:runtime(receipt,[]),input:{},node:{node_id:'js'},sourceProbe:javascriptNativeRoundtripProbe(id),deadline:Date.now()+30000,record:async e=>e,onExecution:async()=>{}});
 if(Object.hasOwn(cleanup,fault))cleanup[fault]=false;if(fault==='cleanup-error')cleanup.failure='logout uncertain';
 const finish=()=>trial.finish({cleanup,failure:fault==='work-failure'?{message:'failed'}:undefined,
  record:async e=>{assert.equal(trial.coverage.cases[0].status,'unresolved');return fault==='final-ack'?{}:e;},
  persist:async()=>{if(fault==='report-fsync')throw Error('fsync failed');}});
 if(['final-ack','report-fsync'].includes(fault))await assert.rejects(finish);else assert.notEqual(await finish(),'CHARACTERIZED');
 assert.equal(trial.coverage.cases[0].case_complete,false);assert.equal(trial.coverage.cases.filter(c=>c.status==='not_run').length,6);
 await assert.rejects(finish,/no replay/);
});
for(const mode of ['file-sync','directory-sync','readback'])test('actual report filesystem publication refuses '+mode,async t=>{
 const directory=await mkdtemp(join(tmpdir(),'js-coercion-fsync-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let opened=0,closed=0;
 await assert.rejects(()=>writeJavascriptCoercionReport(directory,{status:'PENDING_EVIDENCE'},{
  openFile:async(...args)=>{const file=await open(...args),index=++opened;return {writeFile:text=>file.writeFile(text),
   sync:async()=>{if(mode==='file-sync'&&index===1||mode==='directory-sync'&&index===2)throw Error('injected fsync failure');await file.sync();},
   close:async()=>{closed++;await file.close();}};},
  read:async(...args)=>mode==='readback'?'changed':readFile(...args)
 }));
 assert.equal(closed,opened);
 if(mode==='file-sync')assert.equal((await readdir(directory)).includes('report.json'),false);
});
test('actual journal fsync rejection prevents Execute and cannot be retried',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'js-coercion-journal-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const create=vm.runInNewContext('('+createExecutionJournal.toString()+')',{constants,join,createRedactor,
  open:async(...args)=>{const file=await open(...args);return {writeFile:text=>file.writeFile(text),sync:async()=>{throw Error('injected journal fsync failure');},close:()=>file.close()};}});
 const id=javascriptCoercionIds[0],trial=createJavascriptCoercionTrial(id),calls=[];
 const run=()=>trial.run({runtime:runtime({},calls),input:{},node:{node_id:'js'},sourceProbe:javascriptNativeRoundtripProbe(id),deadline:Date.now()+30000,
  record:create({directory,metadata:{sessionId:'test',clientRevision:'82'}}),onExecution:async()=>{}});
 await assert.rejects(run,/fsync failure/);await assert.rejects(run,/no replay/);assert.deepEqual(calls,[]);
});
test('fixed enum/one-case private entrypoint refuses batch, duplicate, public, arbitrary source/count options before browser',async()=>{
 for(const id of ['integer-coercion-all','integer-coercion-custom',javascriptCoercionIds.join(',')])assert.throws(()=>createJavascriptCoercionTrial(id));
 for(const args of [
  ['--native-fixture',javascriptCoercionIds.join(',')],['--native-fixture','integer-coercion-custom'],
  ['--native-fixture',javascriptCoercionIds[0],'--native-fixture',javascriptCoercionIds[1]],
  ['--native-fixture',javascriptCoercionIds[0],'--source','custom'],['--native-fixture',javascriptCoercionIds[0],'--count','2'],
 ])await assert.rejects(()=>runJavascriptOperator(args,{nativeRoundtrip:true}));
 await assert.rejects(()=>runJavascriptOperator(['--native-fixture',javascriptCoercionIds[0]]));
 await assert.rejects(()=>runJavascriptOperator(['--native-fixture',javascriptCoercionIds[0]],{nativeRoundtrip:true,batchCases:['code-table-execute']}));
});

for(const mode of ['integer','failed','package_closed','logged_out','browser_closed','evidence'])test('production final cleanup block publishes only justified coercion status: '+mode,async()=>{
 const id=javascriptCoercionIds[0],receipt=await terminal(id,mode==='failed'?'failed':'integer'),trial=createJavascriptCoercionTrial(id);
 await trial.run({runtime:runtime(receipt,[]),input:{},node:{node_id:'js'},sourceProbe:javascriptNativeRoundtripProbe(id),deadline:Date.now()+30000,record:async e=>e,onExecution:async()=>{}});
 const report={status:'PENDING_EVIDENCE',cleanup:{...clean}};if(Object.hasOwn(report.cleanup,mode))report.cleanup[mode]=false;
 const source=readFileSync(new URL('./javascript-live.mjs',import.meta.url),'utf8');
 const start=source.lastIndexOf('  if (!report.cleanup.package_closed'),end=source.indexOf('  console.log(JSON.stringify({status:report.status',start);
 const publish=vm.runInNewContext('(async()=>{'+source.slice(start,end)+'})',{report,calibrationTrial:null,coercionTrial:trial,executionRecord:async e=>e,Date,
  save:async()=>{if(mode==='evidence')throw Error('fsync');},redactor:{text:x=>x}});
 await publish();
 assert.equal(report.status,mode==='integer'?'CHARACTERIZED':mode==='failed'?'UNRESOLVED':mode==='evidence'?'EVIDENCE_UNCONFIRMED':'CLEANUP_UNCONFIRMED');
 assert.equal(trial.coverage.cases[0].case_complete,mode==='integer');assert.equal(trial.coverage.coverage_complete,false);
});
for(const id of javascriptCoercionIds)test(id+' production prepareInput resolves and verifies real pinned CSV before storage',async()=>{
 const source=readFileSync(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
 const start=source.indexOf('      const fixture=nativeInputOnly?'),end=source.indexOf("      const folder='js-g2-'",start);
 const run=vm.runInNewContext('(async()=>{'+source.slice(start,end).replaceAll('import.meta.url','runtimeModuleUrl')+'return {fixture,pin};})',{
  nativeInputOnly:true,nativeInputFixture:javascriptCoercionCase(id),nativeFixtureId:id,URL,readFile,verifyNativeInputFixture,
  runtimeModuleUrl:new URL('./javascript-execution-runtime.mjs',import.meta.url).href});
 const result=await run();assert.equal(result.pin.id,id);assert.ok(result.fixture.pathname.includes('/fixtures/operator-only/'));
});
for(const id of javascriptCoercionIds)test(id+' fixed source reaches single Set with exact candidate and rejects wrong input',()=>{
 const f=javascriptCoercionCase(id),source=f.source.replace(/^import[^\n]+\n/,'');
 const run=value=>{
  const calls=[];
  vm.runInNewContext(source,{InputTable:{RowCount:1,ColumnCount:1,IsNull:()=>value===null,Get:()=>value},DataType:{Integer:4},
   OutputTable:{AssignColumns:cols=>{assert.equal(JSON.stringify(cols),'[{"Name":"Value","DataType":4}]');calls.push('schema');},
    Append:()=>calls.push('append'),Set:(name,value)=>{assert.equal(name,'Value');calls.push(value);}}});return calls;
 };
 const calls=run(f.values[0]);assert.equal(calls.length,3);assert.deepEqual(calls.slice(0,2),['schema','append']);
 if(id.endsWith('-nan'))assert.equal(Number.isNaN(calls[2]),true);
 else if(id.endsWith('-positive-infinity'))assert.equal(calls[2],Infinity);
 else if(id.endsWith('-negative-infinity'))assert.equal(calls[2],-Infinity);
 else assert.equal(calls[2],f.values[0]);
 for(const invalid of [null,true,{},'wrong',99])assert.throws(()=>run(invalid),/JS_INT_COERCION_INPUT/);
});

test('failed boundary disposal cannot characterize even without caller failure flag',async()=>{
 const id=javascriptCoercionIds[0],receipt=await stages(id,'0'),trial=createJavascriptCoercionTrial(id),rt=runtime(receipt,[]);
 rt.captureExecutionBoundary=async()=>({native:{dispose:async()=>{throw Error('release failed');}}});
 await assert.rejects(()=>trial.run({runtime:rt,input:{},node:{node_id:'js'},sourceProbe:javascriptNativeRoundtripProbe(id),deadline:Date.now()+30000,record:async e=>e,onExecution:async()=>{}}));
 assert.equal(await trial.finish({cleanup:clean,record:async e=>e,persist:async()=>{}}),'UNRESOLVED');
 assert.equal(trial.coverage.cases[0].case_complete,false);
});
