import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writeJavascriptNamedReport} from './javascript-native-named-run.mjs';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';
import {armJavascriptNativeRoundtrip} from './javascript-native-roundtrip-owner.mjs';
import {readFileSync} from 'node:fs';
import {verifyJavascriptIntegerInput} from './javascript-native-named-contract.mjs';
import {verifyNativeRoundtripExecution} from './javascript-native-roundtrip-contract.mjs';
import {completeJavascriptNativeRoundtrip} from './javascript-native-roundtrip-owner.mjs';
import {freezeCivilEvidence} from './javascript-native-datetime-civil.mjs';
import {createJavascriptMetadataLifecycle} from './javascript-native-metadata.mjs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {javascriptTelemetryIds,javascriptTelemetryCase,javascriptTelemetryProbe,requireJavascriptTelemetryMode} from './javascript-schema-telemetry-cases.mjs';
import {parseJavascriptTelemetry,verifyJavascriptTelemetryRead,verifyJavascriptTelemetryOutcome} from './javascript-schema-telemetry-contract.mjs';
import {createJavascriptTelemetryTrial} from './javascript-schema-telemetry-run.mjs';
import {roundtrip} from './javascript-native-roundtrip.test.mjs';
import {inputProof} from './javascript-native-named.test.mjs';
import {readJavascriptNativeRoundtrip,javascriptNativeRoundtripStatus} from './javascript-native-roundtrip-read.mjs';
import {decodeVariantFrame} from '../../client/lib/variant-native-decode.mjs';
import {readNativeRoundtrip} from './javascript-native-roundtrip-driver.mjs';
import {runJavascriptOperator} from './javascript-live.mjs';
const id='T-schema-control',clone=x=>JSON.parse(JSON.stringify(x));
const fields=[{index:0,name:'observed_0',display_name:'observed label',data_type:4},{index:1,name:'observed_1',display_name:'metadata label',data_type:5}];
const telemetry=(caseId=id)=>({version:1,probe_id:caseId,column_count:2,before:clone(fields),after:clone(fields)});
async function fixture({caseId=id,text=JSON.stringify(telemetry(caseId)),tag=8,change,deferred=false,afterRelease}={}){
 const x=await roundtrip({fixtureId:'integer-safe',telemetryCaseId:caseId,change,deferred,afterRelease,reply:(f,response,request)=>{
  if(f.dc.FModelNode===f.node.data)return;
  const utf8=new TextEncoder().encode(text),bytes=new Uint8Array(request.column===1?Math.max(60,28+utf8.length):60),view=new DataView(bytes.buffer);
  view.setInt16(12,request.column===1?tag:20,true);
  if(request.column===1){view.setInt32(22,utf8.length,true);view.setUint16(26,65001,true);bytes.set(utf8,28);}
  if(request.column===0)view.setBigInt64(14,-9007199254740991n,true);
  response.$FData=bytes;response.$FDataSize=bytes.length;
 }});
 // Synthetic transport boundary only. Production emits real321 requests.
 const get=x.f.session.$M.GetDynamicData;
 x.f.session.$M.GetDynamicData=()=>{const request=get();request.WriteParameter$a=function(offset,column){assert.equal(offset,8);assert.ok([0,1].includes(column));this.column=column;};return request;};
 return x;
}
async function stages(options){
 const x=await fixture(options),results={before:inputProof(x).before};
 for(const role of ['output','upstream']){
  const b=await x.bind(role),raw=await readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:role}),lifecycle=await javascriptNativeRoundtripStatus(x.f.page),binding={...b,read_id:role};
  results[role]={binding,raw,lifecycle,exact:verifyJavascriptTelemetryRead(raw,{binding,lifecycle,input:results.before,role})};
 }
 results.outcome=verifyJavascriptTelemetryOutcome(results,options?.caseId??id);return {x,results};
}
for(const caseId of javascriptTelemetryIds)test('telemetry exact source and actual 1x2 reader '+caseId,async()=>{
 const c=javascriptTelemetryCase(caseId);assert.equal(createHash('sha256').update(c.source).digest('hex'),c.source_sha256);assert.equal(c.source.split('\n').length-1,20);
 const output=[],columns=[];
 const table={AssignColumns:xs=>columns.push(...xs),GetColumn:i=>({Index:i,...columns[i]}),get ColumnCount(){return columns.length;},Append:()=>output.push([]),Set:(i,v)=>output[0][i]=v};
 vm.runInNewContext(c.source.split('\n').slice(1).join('\n'),{InputTable:{RowCount:4,ColumnCount:1,Get:()=>-9007199254740991},OutputTable:table,DataType:{Integer:4,String:5}});
 const {x,results}=await stages({caseId,text:output[0][1]});assert.equal(results.output.exact.cells.length,2);assert.equal(results.upstream.exact.cells.length,4);
 assert.equal(results.output.exact.observation.bridge_verified,false);assert.equal(results.output.exact.observation.comparisons.after_physical_equal,false);
 assert.deepEqual(x.f.counters,{sent:10,requests:10,responses:10});
 assert.equal(Object.getOwnPropertyDescriptor(x.f.env.__loginomJavascriptNativeRoundtripV1,'telemetry_case_id').writable,false);await assert.rejects(()=>x.bind('output'),/reserved/);
});
test('telemetry comparison ignores property order and retains differences',async()=>{
 const t=telemetry();t.after=t.after.map(f=>({data_type:f.data_type,display_name:f.display_name,name:f.name,index:f.index}));
 const {results}=await stages({text:JSON.stringify(t)});assert.deepEqual(results.output.exact.observation.comparisons,{before_after_equal:true,before_physical_equal:true,after_physical_equal:true});
 t.after[0].name='changed';assert.equal((await stages({text:JSON.stringify(t)})).results.output.exact.observation.comparisons.before_after_equal,false);
});
for(const [name,mutate] of Object.entries({unknown:t=>t.extra=true,missing:t=>delete t.before,version:t=>t.version=2,case:t=>t.probe_id='foreign',count:t=>t.column_count=1,duplicateIndex:t=>t.after[1].index=0,type:t=>t.before[0].data_type=3,extraField:t=>t.after[0].x=1,missingName:t=>delete t.after[0].name,longString:t=>t.after[0].name='a'.repeat(129),null:t=>t.after[0]=null}))test('telemetry strict JSON '+name,()=>{const t=telemetry();mutate(t);assert.throws(()=>parseJavascriptTelemetry(JSON.stringify(t),id));});
for(const text of ['{','null',JSON.stringify(telemetry()).replace('"version":1','"version":1,"version":1'),JSON.stringify(telemetry()).replace('"name":"observed_0"','"name":"observed_0","na\\u006de":"observed_0"'),' '.repeat(8193)])test('telemetry malformed/repeated/oversized JSON '+text.slice(0,35),()=>assert.throws(()=>parseJavascriptTelemetry(text,id)));
for(const key of ['namedCaseId','calibrationId','metadataDiagnostic'])test('telemetry refuses combined mode '+key,()=>assert.throws(()=>requireJavascriptTelemetryMode(id,{[key]:key==='metadataDiagnostic'?true:'C-set-index'}),/conflict/));
for(const key of ['Name','DisplayName','DataType'])for(const index of [0,1])test('telemetry actual binding rejects field drift '+index+key,async()=>{
 const x=await fixture({change:x=>{x.outputFields[index].data[key]=key==='DataType'?6:'drift';}}),b=await x.bind('output');
 await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'output'}),/schema|metadata|stale/);assert.equal((await javascriptNativeRoundtripStatus(x.f.page)).retired,true);
});
for(const [name,change] of Object.entries({record:x=>x.outputFields[1]={data:{...x.outputFields[1].data}},data:x=>x.outputFields[1].data={...x.outputFields[1].data},reorder:x=>x.outputFields.reverse(),datasource:x=>x.f.dc.FDataSource={...x.outputDs},source:x=>x.f.env.__loginomJavascriptNativeRoundtripV1.source='foreign'}))test('telemetry held identity rejects '+name,async()=>{
 const x=await fixture({change}),b=await x.bind('output');await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'output'}));
});
for(const patch of [{telemetry_case_id:'T-schema-space'},{named_case_id:'C-set-index'},{source_sha256:'foreign'},{columns:[1,0]},{rows:4},{schema:[{name:'Value',label:'Value',type:4}]}])test('telemetry reader admission rejects '+JSON.stringify(patch),async()=>{
 const x=await fixture(),b=await x.bind('output');await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,{...b,...patch},decodeVariantFrame,{operationId:'output'}));assert.equal(x.f.counters.sent,4);
});
for(const tag of [1,5,20,100])test('telemetry refuses null/wrong native tag '+tag,async()=>{await assert.rejects(()=>stages({tag}));});
test('telemetry timeout retires and releases late response',async()=>{
 const x=await fixture({deferred:true}),b=await x.bind('output');await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'output',timeoutMs:2}),/deadline/);
 x.f.callbacks[0]();const status=await javascriptNativeRoundtripStatus(x.f.page);assert.equal(status.retired,true);assert.equal(status.published,false);assert.equal(status.releasedResponses,1);assert.equal(status.releasedRequests,1);await assert.rejects(()=>x.bind('upstream'),/Completed output/);
});
test('telemetry maximum UTF8 and escaped JSON retains native serialized budget',async()=>{
 const t=telemetry();for(const phase of ['before','after'])for(const field of t[phase])for(const key of ['name','display_name'])field[key]='\u0800'.repeat(128);
 const text=JSON.stringify(t);assert.ok(Buffer.byteLength(text)<8192);const {results}=await stages({text});assert.ok(Buffer.byteLength(JSON.stringify(results.output.raw))<=65536);
 const escaped=text.replaceAll('\u0800','\\u0800');assert.ok(Buffer.byteLength(escaped)<8192);await stages({text:escaped});
 const padded=text+' '.repeat(8192-Buffer.byteLength(text));assert.equal(Buffer.byteLength(padded),8192);parseJavascriptTelemetry(padded,id);await stages({text:padded});assert.throws(()=>parseJavascriptTelemetry(padded+' ',id),/bound/);
 const x=await fixture({text:padded}),b=await x.bind('output');await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'output',maxBytes:8192}),/budget/);
});
// Execute the production runtime method body and driver/binding/reader. Only UI,
// source attestation fixtures, and native response transport are synthetic.
for(const fault of ['ok','native-ack','final-ack','count','json','timeout'])test('telemetry actual runtime driver pipeline '+fault,async()=>{
 const x=await fixture({text:fault==='json'?'{}':JSON.stringify(telemetry()),deferred:fault==='timeout'}),f=x.f;
 // Runtime owns the completion transition, unlike the direct-reader fixture.
 f.env.__loginomJavascriptNativeRoundtripV1.stage='done-sealed';
 f.b.package_id='d:w';x.before.package_id='d:w';const input=inputProof(x).input;
 const inputFields=f.dc.FColumnInfosStore.data.items,roles=[],ui=[],events=[];
 const select=role=>{
  const out=role==='output',node=out?x.js:f.node,port=out?x.output:f.port,ds=out?x.outputDs:x.source;
  f.dt.FTotalRowCount=out?(fault==='count'?2:1):4;f.dc.FColumnInfosStore.data.items=out?x.outputFields:inputFields;
  f.model.FPreviewManager.FPreviewVisible=true;
  Object.assign(f.model.FPreviewManager.FPreviewForm,{FCurrentPreviewNode:node,FCurrentPreviewPort:port});
  Object.assign(f.model.FPreviewManager.FShowDataLastCall,{Node:node,Port:port});
  f.dc.FModelNode=node.data;f.dc.FDataSource=ds;f.dt.FDataSource=ds;f.store.proxy.dataSource=ds;
 };
 const source=readFileSync(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
 const start=source.indexOf('    async checkNativeTelemetryEvidence() {'),end=source.indexOf('    async readNativeCivil(',start);
 const context={nativeTelemetryCaseId:id,nativeNamedCaseId:undefined,nativeCalibrationId:undefined,nativeFixtureId:'integer-safe',nativeInputFixture:{rows:4},nativeRoundtripProbe:javascriptTelemetryProbe(id),
  verifyJavascriptIntegerInput,verifyJavascriptTelemetryOutcome,verifyNativeRoundtripExecution,freezeCivilEvidence,validateNativeSource:()=>{},page:f.page,completeJavascriptNativeRoundtrip,
  prepared:{document_id:'d',workflow_ref:{workflow_id:'w',tab_tid:'tab',prefix:'TF'}},deadline:f.b.deadline,randomUUID:()=>String(roles.length),
  execute:async(code,options)=>{
   if(fault==='timeout'&&code.includes('async function readJavascriptNativeRoundtrip'))return Function('return ('+code+')')()({evaluate:(fn,args)=>f.page.evaluate(fn,{...args,options:{...args.options,timeoutMs:2}})});
   return f.execute(code,options);
  },nativeReadUncertain:false,metadataDiagnostic:false,metadataLifecycle:createJavascriptMetadataLifecycle(),sessionId:'telemetry',origin:'http://test',build:'7.4.2',Date,
  record:async e=>{events.push(e);return fault==='final-ack'&&e.phase==='native_roundtrip_verified'?{}:e;},
  readNativeRoundtrip:async args=>{roles.push(args.role);return readNativeRoundtrip({...args,options:{...args.options,onRecord:async e=>{events.push(e);return fault==='native-ack'&&e.proof?{}:e;}}},
   {openPreview:async()=>{ui.push('open');select('output');},verifyFrontends:async()=>[],verifyCountLoaders:()=>({}),createProcedure:()=>{
    const out=args.role==='output',node=out?'js':'n',port=out?'js-output':'p';
    const state={prepared_node_context:{document_id:'d',workflow_id:'w',node_id:node,verified:true,surface:'graph'},wizard:{status:'absent'},node_outputs:{verified:true,ports:[{index:0,active:true,tid:'output',port_guid:port}]},
     ui:{elements:[{tid:'preview;p.h;close',ref:'close',allowed_actions:['click']},{tid:'output',ref:'output',allowed_actions:['click','press']}]},
     node_preview_schema:{verified:true,port_guid:port,port:0,root_tid:'preview',fields:out?[{name:'UI must not supply names',type:'integer'},{name:'UI metadata',type:'string'}]:[{name:'Value',label:'Value',type:'integer'}]}};
    return {observe:async({ready})=>{assert.equal(ready(state),true);return state;},perform:async({resolve})=>{const action=resolve(state);
     if(action.ref==='close'){ui.push('close');f.model.FPreviewManager.FPreviewVisible=false;}
     if(action.verb==='press')select('upstream');
    }};
   }});}
 };
 const runtime=vm.runInNewContext('({'+source.slice(start,end)+'})',context);
 if(fault==='ok'){
  const results=await runtime.readNativeRoundtrip(input,{document_id:'d',workflow_id:'w',node_id:'js'},x.execution);
  assert.deepEqual(roles,['output','upstream']);assert.equal(results.output.lifecycle.requests,2);assert.equal(results.upstream.lifecycle.requests,4);
  assert.equal(results.output.binding.schema[0].name,'observed_0');assert.equal(results.output.exact.observation.comparisons.after_physical_equal,true);
  assert.equal(ui.filter(x=>x==='close').length,2);assert.equal(context.nativeReadUncertain,false);assert.deepEqual(f.counters,{sent:10,requests:10,responses:10});
 }else{
  await assert.rejects(()=>runtime.readNativeRoundtrip(input,{document_id:'d',workflow_id:'w',node_id:'js'},x.execution));
  assert.equal(roles.length,fault==='final-ack'?2:1);
  if(fault==='timeout'){assert.equal(context.nativeReadUncertain,true);assert.equal(ui.includes('close'),false);f.callbacks[0]();}
 }
});
for(const fault of ['ok','dispatch-ack','terminal-ack','final-ack','persist','cleanup','failed'])test('telemetry trial finalization and no replay '+fault,async()=>{
 const {x,results}=await stages(),trial=createJavascriptTelemetryTrial(id),calls=[];
 const record=async event=>((fault==='dispatch-ack'&&event.phase==='schema_telemetry_dispatch_reserved')||(fault==='terminal-ack'&&event.phase==='schema_telemetry_terminal_verified')||(fault==='final-ack'&&event.phase==='schema_telemetry_finalized'))?{}:event;
 const runtime={checkNativeRoundtripBeforeExecute:async()=>{},captureExecutionBoundary:async()=>({native:{dispose:async()=>calls.push('dispose')}}),verifyExecutionBoundary:async()=>{},
  executeNode:async()=>{calls.push('execute');return fault==='failed'?{...x.execution,status:'failed'}:x.execution;},readNativeRoundtrip:async()=>results,checkNativeTelemetryEvidence:async()=>{}};
 const args={runtime,input:inputProof(x).input,node:{node_id:'js'},sourceProbe:javascriptTelemetryProbe(id),deadline:Date.now()+30000,record,onExecution:async()=>{}};
 if(['dispatch-ack','terminal-ack','failed'].includes(fault))await assert.rejects(()=>trial.run(args));else await trial.run(args);
 await assert.rejects(()=>trial.run(args),/no replay/);assert.ok(calls.filter(x=>x==='execute').length<=1);
 const finish=()=>trial.finish({cleanup:{package_closed:fault!=='cleanup',logged_out:true,browser_closed:true},record,persist:async()=>{if(fault==='persist')throw Error('disk failure');}});
 if(['final-ack','persist'].includes(fault))await assert.rejects(finish);else await finish();
 assert.equal(trial.coverage.cases[0].case_complete,fault==='ok');assert.equal(trial.coverage.cases.slice(1).every(c=>c.status==='not_run'),true);
});
for(const extra of [['--native-named-case','C-set-index'],['--error-calibration','K1-parse-v1'],['--metadata-diagnostic'],['--native-fixture','integer-safe']])test('telemetry actual operator rejects incompatible flags '+extra.join(' '),async()=>{
 await assert.rejects(()=>runJavascriptOperator(['--schema-telemetry-case',id,...extra],{nativeRoundtrip:true}),/conflict|immutable/);
});
test('telemetry full native budget refuses oversized wrapper without truncation',async()=>{
 const text=JSON.stringify(telemetry()),padded=text+' '.repeat(8192-Buffer.byteLength(text)),x=await fixture({text:padded}),b=await x.bind('output');
 // A large retained execution receipt competes with payload for the same 65K budget.
 b.execution={...b.execution,retained_context:'x'.repeat(64000)};
 await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'output',maxBytes:65536}),/budget/);
 assert.equal((await javascriptNativeRoundtripStatus(x.f.page)).published,false);
});
test('telemetry operator uncertain transport permits own browser close only',async()=>{
 const live=readFileSync(new URL('./javascript-live.mjs',import.meta.url),'utf8'),start=live.lastIndexOf('} catch(error) {\n  report.status='),end=live.indexOf('  console.log(JSON.stringify({status:report.status',start);
 const calls=[],report={stage:'telemetry',cleanup:{package_closed:false,logged_out:false,browser_closed:false}};
 const forbidden=name=>()=>{calls.push(name);throw Error('unexpected '+name);};
 const cleanup=vm.runInNewContext('(async()=>{try{throw Error("timeout");'+live.slice(start,end)+'}})',{
  report,executionRuntime:{nativeReadUncertain:true,metadataReadUncertain:false},page:{},owner:{},session:{context:{close:async()=>calls.push('close')}},browserLifecycle:null,
  sourceCycleUncertain:false,sourceReaders:[],nativeRoundtrip:true,nativeClassifierBinding:undefined,captureJavascriptNativeClassifierDiagnostic:forbidden('classifier'),javascriptProbeFailure:e=>({message:e.message}),redactor:{text:x=>x,redact:x=>x},discoveryProbe:null,
  snapshot:forbidden('snapshot'),paletteSnapshot:forbidden('palette'),refusalEvidence:forbidden('refusal'),guard:forbidden('guard'),observe:forbidden('observe'),click:forbidden('click'),
  calibrationTrial:null,coercionTrial:null,namedTrial:null,telemetryTrial:{finish:async()=>calls.push('finish')},executionRecord:async e=>e,save:async()=>{},Date,cleaning:false,persistence:null,coldReader:false,packageFile:false,packageFileReadUncertain:false,coldOpenPending:false,cleanupDeadline:Infinity
 });
 await cleanup();assert.deepEqual(calls,['close','finish']);assert.equal(report.cleanup.browser_closed,true);assert.equal(report.cleanup.package_closed,false);assert.equal(report.status,'CLEANUP_UNCONFIRMED');
});
for(const caseId of javascriptTelemetryIds)test('telemetry page owner rejects changed exact source bytes '+caseId,()=>{
 const probe=javascriptTelemetryProbe(caseId);
 for(const patch of [{source:probe.source+'\n'},{source_sha256:'foreign'},{telemetry_case_id:'T-unknown'},{named_case_id:'C-set-index'},{calibration_id:'K1-parse-v1'}]){
  assert.throws(()=>vm.runInNewContext('('+armJavascriptNativeRoundtrip.toString()+')(args)',{args:{binding:{fixture_id:'integer-safe'},...probe,...patch}}),/fixed telemetry/);
 }
});
test('telemetry durable journal and report preserve separate physical/code snapshots',async t=>{
 const {x,results}=await stages(),trial=createJavascriptTelemetryTrial(id),directory=await mkdtemp(join(tmpdir(),'js-telemetry-report-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const record=createExecutionJournal({directory,metadata:{sessionId:'telemetry',clientRevision:'source96'}});
 const runtime={checkNativeRoundtripBeforeExecute:async()=>{},captureExecutionBoundary:async()=>({native:{dispose:async()=>{}}}),verifyExecutionBoundary:async()=>{},executeNode:async()=>x.execution,readNativeRoundtrip:async()=>results,checkNativeTelemetryEvidence:async()=>{}};
 await trial.run({runtime,input:inputProof(x).input,node:{node_id:'js'},sourceProbe:javascriptTelemetryProbe(id),deadline:Date.now()+30000,record,onExecution:async()=>{}});
 await trial.finish({cleanup:{package_closed:true,logged_out:true,browser_closed:true},record,persist:async status=>writeJavascriptNamedReport(directory,{status,schema_telemetry:trial.coverage,native_roundtrip:results})});
 const saved=JSON.parse(await readFile(join(directory,'report.json'),'utf8'));
 assert.equal(saved.status,'CHARACTERIZED');assert.equal(saved.schema_telemetry.cases[0].case_complete,true);
 assert.deepEqual(saved.native_roundtrip.output.exact.observation.code_side,telemetry());assert.deepEqual(saved.native_roundtrip.output.exact.observation.physical_schema,fields);
 assert.equal(saved.native_roundtrip.outcome.g5_complete,false);
});
