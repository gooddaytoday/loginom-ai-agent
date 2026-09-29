import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createJavascriptSourceReader} from '../../client/lib/javascript-source-read.mjs';
import {observeJavascriptSource,observeJavascriptSourceProcesses} from '../../client/lib/javascript-source-browser.mjs';
import {createRedactor} from '../../client/lib/redact.mjs';
import {sourceFixture} from '../../client/test/support/javascript-source-fixture.mjs';
import {verifyJavascriptSourceCycle,javascriptSourceSettings} from './javascript-source-cycle.mjs';
import {runJavascriptOperator} from './javascript-live.mjs';
const owner={document_id:'document',workflow_id:'workflow',node_id:'node',operation_id:'cycle',ui_epoch:0};
const schema=()=>({verified:true,generation:{checked:true},grids:[{tid:'workflow;columns',fields:[{record_id:'r',Name:'Value',DisplayName:'Сумма ё',DataType:4,Index:0}]}]});
const mapping=()=>({autosync:true,source_fields:[{record_id:'s',field_id:'1',name:'Value'}],target_fields:[{record_id:'t',field_id:'2',name:'Value',source:{record_id:'s',field_id:'1',name:'Value'}}]});
const source='const text = "Сумма ё😀";';
function cycleFixture(fault) {
 const browser=sourceFixture(source),events=[],calls=[],processes=browser.processes({capture:true});let readers=0,mappings=0;
 const createReader=readerOwner=>{
  readers++;const settings=javascriptSourceSettings(schema());if(fault==='settings'&&readers===2)settings.grids[0].fields[0].DisplayName='changed';
  return createJavascriptSourceReader({owner:readerOwner,deadline:Date.now()+60000,chunkBytes:8,redactor:createRedactor(),record:async event=>{events.push(event);return event;},adapter:{
   open:async()=>{calls.push('open');return browser.observe({context:browser.context,owner:readerOwner,epoch:1,capture:true});},
   read:async held=>{if(fault==='source'&&readers===2)browser.setSource(source+' ');return {...browser.observe({context:browser.context,owner:readerOwner,epoch:1,held}),settings};},
   discard:async()=>{calls.push('close');if(fault==='execution')browser.processRecord.data.Status=1;return {owner:readerOwner,closed:true};}
  }});
 };
 const args={createReader,owner,readMappings:async()=>{const value={input:mapping(),output:mapping()};if(fault==='mapping'&&mappings++)value.output.target_fields[0].name='changed';return value;},checkBoundary:async()=>browser.processes({held:processes}),expectedSource:source,expectedGeneration:true,record:async event=>{events.push(event);return fault==='ack'?{}:event;}};
 return {args,calls,events};
}
test('source private verification actual reader procedure independent reopen and canonical evidence',async()=>{
 const f=cycleFixture(),result=await verifyJavascriptSourceCycle(f.args);assert.equal(result.rounds.length,2);assert.equal(result.no_server_commit_verified,false);assert.equal(result.public_source_read_enabled,false);
 assert.deepEqual(result.rounds[0].settings,result.rounds[1].settings);assert.ok(result.rounds.every(round=>round.chunks>1));
 for(const round of result.rounds)for(const receipt of round.receipts){const event=f.events.find(e=>e.phase==='source_delivery_verified'&&e.owner.operation_id===receipt.owner.operation_id&&e.receipt.offset_utf8_bytes===receipt.offset_utf8_bytes);assert.equal(event.receipt.chunk_sha256,receipt.chunk_sha256);}
 assert.equal(f.calls.filter(x=>x==='open').length,f.calls.filter(x=>x==='close').length);
});
for(const fault of ['settings','source','mapping','execution','ack'])test('source private cycle rejects '+fault,async()=>{const f=cycleFixture(fault);await assert.rejects(()=>verifyJavascriptSourceCycle(f.args));});
for(const args of [['--execution-case','code-table-execute'],['--probe-source'],['--schema-telemetry-case','T-schema-control'],['--create-node']])test('source operator refuses mixed modes '+args.join(' '),async()=>{await assert.rejects(()=>runJavascriptOperator(args,{sourceReadCycle:true}));});

test('fixed source cycle routes one owned draft write and preserves uncertainty on a lost reply',async()=>{
 const live=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8');
 const start=live.indexOf('const probeOwnedSource=async'),end=live.indexOf('  const handle=',start);
 assert.ok(start>=0&&end>start);
 const body=live.slice(start,end)+'  throw Error("Legacy source path reached");\n};\nglobalThis.probe=probeOwnedSource;';
 const baseline='old',target='const next=1;',source_sha256=createHash('sha256').update(target).digest('hex');
 for(const mode of ['source-cycle','persistence'])for(const lost of [false,true]){
  const calls=[],report={},env={sourceReadCycle:mode==='source-cycle',persistence:mode==='persistence'?{id:'fixed'}:null,sourceCycleUncertain:false,report,
   phaseDeadline:()=>Date.now()+60000,Date,Error,redactor:{text:value=>value},digest:value=>createHash('sha256').update(value).digest('hex'),
   save:async()=>calls.push('save'),waitWizardReady:async()=>calls.push('ready'),
   executionPrepared:{document_id:'document',workflow_ref:{workflow_id:'workflow'}},executionNode:{node_id:'node'},wizardAddressEpoch:3,
   page:{},schemaContext:()=>({build:'7.4.2'}),executionRecord:async event=>event,
   createJavascriptSourceWriter:options=>({replace:async request=>{
    calls.push({owner:options.owner,request});
    if(lost)throw Object.assign(Error('reply lost'),{code:'JAVASCRIPT_SOURCE_WRITE_UNCERTAIN'});
    return {source_sha256,draft_exact:true};
   }})};
  vm.runInNewContext(body,env);
  if(lost){
   await assert.rejects(()=>env.probe(baseline,target),error=>error.code==='JAVASCRIPT_SOURCE_WRITE_UNCERTAIN');
   assert.equal(env.sourceCycleUncertain,true);assert.equal(report.source_write,undefined);
  }else{
   await env.probe(baseline,target);
   assert.equal(env.sourceCycleUncertain,false);assert.deepEqual(report.source_write,{source_sha256,draft_exact:true});
  }
  assert.equal(calls.filter(x=>typeof x==='object').length,1);
  assert.equal(calls.find(x=>typeof x==='object').owner.ui_epoch,3);
  assert.equal(calls.find(x=>typeof x==='object').owner.operation_id,
   mode==='persistence'?'source99-draft-'+source_sha256.slice(0,12):'source97-draft');
 }
});

// Execute the actual private operator adapter around the production reader.
// Browser navigation/transport and schema UI are synthetic; reader/process
// browser functions execute unchanged in a separate realm, no browser launch.
for(const fault of ['ok','open-lost','close-lost','unlock-lost','process','settings','source','ack'])test('source actual operator helper '+fault,async()=>{
 const code=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8');
 const body=code.slice(code.indexOf('const runSourceReadCycle=async'),code.indexOf('const runExecutionTrial=async'));
 const f=sourceFixture(source),events=[],calls=[],report={execution_schema:schema()};let opens=0;
 const page={evaluateHandle:async(fn,args)=>{const held=fn===observeJavascriptSourceProcesses?f.processes(args):f.observe(args);held.dispose=async()=>{};return held;},evaluate:async(fn,args)=>fn===observeJavascriptSourceProcesses?f.processes(args):f.observe(args)};
 const env={persistence:null,coldReader:false,coldOpenPending:false,structuredClone,createJavascriptSourceReader,observeJavascriptSource,observeJavascriptSourceProcesses,verifyJavascriptSourceCycle,javascriptSourceSettings,Date,Error,Math,report,page,
  executionPrepared:{document_id:'document',workflow_ref:{workflow_id:'workflow'}},executionNode:{node_id:'node'},redactor:createRedactor(),phaseDeadline:ms=>Date.now()+ms,
  schemaContext:()=>f.context,wizardAddressEpoch:0,wizardHandle:null,wizardRoot:null,openedWizard:false,closeDispatched:false,closeConfirmed:false,closeDeadline:0,wizardDeadline:0,readingExisting:false,
  sourceReaders:[],sourceCycleUncertain:false,save:async()=>calls.push('save'),waitWizardReady:async()=>{},
  inspectWizardPages:async()=>{report.execution_existing_schema=schema();if(fault==='settings'&&opens===2)report.execution_existing_schema.grids[0].fields[0].DisplayName='changed';},
  closeWizardOnce:async()=>{calls.push('close');if(fault==='close-lost')throw Error('lost Close');if(fault==='process')f.processRecord.data.Status=1;},
  executionRecord:async event=>{events.push(event);return fault==='ack'&&event.phase==='source_delivery_verified'?{}:event;},
  executionRuntime:{captureExecutionBoundary:async()=>({native:{dispose:async()=>{}}}),verifyExecutionBoundary:async()=>{},settleClosedExecutionBoundary:async()=>{calls.push('unlock');if(fault==='unlock-lost')throw Error('Close unlock unconfirmed');},
   readPortMapping:async()=>mapping(),handoffReopenedWizard:async()=>{},reopen:async()=>{calls.push('open');opens++;f.binding.wizardAddress.epoch=opens;if(fault==='open-lost')throw Error('lost open');if(fault==='source'&&opens===2)f.setSource(source+' ');}}
 };
 const realm=vm.createContext(env);vm.runInContext(body+'\nglobalThis.run=runSourceReadCycle;',realm);
 if(fault==='ok'){await env.run({source},Date.now()+60000);assert.equal(report.source_read_cycle.rounds.length,2);assert.equal(env.sourceCycleUncertain,false);assert.equal(opens,2);for(const round of report.source_read_cycle.rounds){assert.equal(round.source_sha256,createHash('sha256').update(source).digest('hex'));assert.equal(round.receipts.length,1);}}
 if(fault!=='ok'){await assert.rejects(()=>env.run({source},Date.now()+60000));assert.equal(env.sourceCycleUncertain,true);assert.ok(opens<=2);if(fault==='open-lost')assert.equal(calls.includes('close'),false);}
});

test('source uncertain actual operator catch/finally only closes its browser',async()=>{
 const live=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8'),start=live.lastIndexOf('} catch(error) {\n  report.status='),end=live.indexOf('  console.log(JSON.stringify({status:report.status',start),calls=[];
 const forbidden=name=>()=>{calls.push(name);throw Error('unexpected '+name);};
 const report={stage:'source-read',cleanup:{package_closed:false,logged_out:false,browser_closed:false}};
 const cleanup=vm.runInNewContext('(async()=>{try{throw Error("lost source reply");'+live.slice(start,end)+'}})',{
  report,sourceCycleUncertain:true,sourceReaders:[],executionRuntime:{nativeReadUncertain:false,metadataReadUncertain:false},page:{},owner:{},session:{context:{close:async()=>calls.push('browser-close')}},browserLifecycle:null,focusGuard:null,
  nativeRoundtrip:false,nativeClassifierBinding:undefined,captureJavascriptNativeClassifierDiagnostic:forbidden('classifier'),javascriptProbeFailure:e=>({message:e.message}),redactor:createRedactor(),discoveryProbe:null,
  snapshot:forbidden('snapshot'),paletteSnapshot:forbidden('palette'),refusalEvidence:forbidden('refusal'),guard:forbidden('guard'),observe:forbidden('observe'),click:forbidden('click'),
  calibrationTrial:null,coercionTrial:null,namedTrial:null,telemetryTrial:null,executionRecord:async e=>e,save:async()=>{},Date,cleaning:false,persistence:null,coldReader:false,packageFile:false,packageFileReadUncertain:false,coldOpenPending:false,cleanupDeadline:Infinity
 });
 await cleanup();assert.deepEqual(calls,['browser-close']);assert.equal(report.cleanup.browser_closed,true);assert.equal(report.cleanup.package_closed,false);assert.equal(report.status,'CLEANUP_UNCONFIRMED');
});
