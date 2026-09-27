import {nativeInputProvenance} from './javascript-native-input-contract.mjs';
import {adaptRead} from '../../client/lib/variant-native-values.mjs';
import {nativeRuntimePins} from '../../client/lib/collapse-native-runtime-pins.mjs';
import {nativeFrontendPins} from '../../client/lib/collapse-native-output.mjs';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readNativeRoundtrip} from './javascript-native-roundtrip-driver.mjs';
import {verifyNativeRoundtripRead,verifyNativeRoundtripExecution,verifyNativeRoundtripProvenance} from './javascript-native-roundtrip-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fake,sourceEvidence} from './javascript-native-input.test.mjs';
import {readJavascriptNativeInput} from './javascript-native-input-read.mjs';
import {decodeVariantFrame} from '../../client/lib/variant-native-decode.mjs';
import {nativeRoundtripProbe} from './javascript-native-roundtrip-contract.mjs';
import {armJavascriptNativeRoundtrip,bindJavascriptNativeRoundtripGraph,bindJavascriptNativeRoundtripSource,bindJavascriptNativeRoundtripSchema,completeJavascriptNativeRoundtrip} from './javascript-native-roundtrip-owner.mjs';
import {javascriptNativeRoundtripCode} from './javascript-native-roundtrip-binding.mjs';
import {readJavascriptNativeRoundtrip,javascriptNativeRoundtripStatus,cancelJavascriptNativeRoundtrip} from './javascript-native-roundtrip-read.mjs';
const clone=v=>JSON.parse(JSON.stringify(v));
async function roundtrip({change,deferred=false}={}){
  let mutate,defer=false;
  const f=await fake({change:()=>mutate?.(),deferred:()=>defer});
  const before=await readJavascriptNativeInput(f.page,f.b,decodeVariantFrame,{operationId:'before'});
  f.model.FPreviewManager.FPreviewVisible=false;
  await f.page.evaluate(armJavascriptNativeRoundtrip,{binding:{...f.b,read_id:'before'},...nativeRoundtripProbe});
  const js={FGuid:'js',FIconCls:'bg-vendor-icon-javascript',FStatus:1,FRunning:false,data:{$S:f.session}};
  const target={parent:js,FGuid:'js-input',FType:0,FSubType:1,FParam:0,FStatus:1};
  const output={parent:js,FGuid:'js-output',FType:1,FSubType:1,FParam:0,FStatus:1};
  js.FPorts=[{FCollection:[target]},{FCollection:[output]}];f.model.FDiagram.FNodes.FCollection.push(js);
  const edge={FGuid:'edge',FSourcePort:f.port,FTargetPort:target};f.model.FDiagram.FLinks.FCollection.push(edge);
  await f.page.evaluate(bindJavascriptNativeRoundtripGraph,{node:{node_id:'js'},inputPortGuid:'js-input'});
  const lines=nativeRoundtripProbe.source.split('\n'),doc={firstLine:()=>0,lineCount:()=>lines.length,getLine:i=>lines[i]};
  const generation={id:'generation'},generationControl={el:{dom:generation},checked:true};
  const oldGet=f.env.Ext.getCmp;f.env.Ext.getCmp=id=>id==='generation'?generationControl:oldGet(id);
  const root={querySelectorAll:q=>q==='.CodeMirror'?[{getBoundingClientRect:()=>({width:1,height:1}),CodeMirror:{getDoc:()=>doc}}]:[generation]};
  const card=f.env.bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab(),native={};
  const previousNode=card.Controller.Node.data.node;card.Controller.Node.data.node=native;card.Controller.FController={FView:{el:{dom:root}}};
  await f.page.evaluate(bindJavascriptNativeRoundtripSchema,{root,native,binding:{native:js,nodeData:js.data},schema:{verified:true,generation:{checked:true,tid:'generation;DisplayEl'}}});
  await f.page.evaluate(bindJavascriptNativeRoundtripSource,{root,native,binding:{native:js,nodeData:js.data},schema:{verified:true,generation:{checked:true,tid:'generation;DisplayEl'}}});
  card.Controller.Node.data.node=previousNode;card.Controller.FController=f.model;
  const child={internalId:5,data:{id:'4.1',Status:3,ErrorDetails:'',ModelNode:js.data},childNodes:[]};
  f.root.childNodes.push({internalId:4,data:{id:'4',Status:3,ErrorDetails:'',loaded:true},childNodes:[child]});
  const execution={verified:true,owner_verified:true,status:'completed',execution_id:'d:1:4',group_id:'4',process_id:'4.1',process_record_id:'5',trial:{source_sha256:nativeRoundtripProbe.source_sha256}};
  await f.page.evaluate(completeJavascriptNativeRoundtrip,{execution,source_sha256:nativeRoundtripProbe.source_sha256});
  const source=f.dc.FDataSource,outputHelper={...f.helper,$FData:{}},outputDs={...source,$:{...source.$},$FHelper:outputHelper};outputHelper.FBaseProxy=outputDs;
  const bind=async role=>{
    f.model.FPreviewManager.FPreviewVisible=true;
    const node=role==='output'?js:f.node,port=role==='output'?output:f.port,ds=role==='output'?outputDs:source;
    Object.assign(f.model.FPreviewManager.FPreviewForm,{FCurrentPreviewNode:node,FCurrentPreviewPort:port});
    Object.assign(f.model.FPreviewManager.FShowDataLastCall,{Node:node,Port:port});
    f.dc.FModelNode=node.data;f.dc.FDataSource=ds;f.dt.FDataSource=ds;f.store.proxy.dataSource=ds;
    return f.execute(javascriptNativeRoundtripCode({...f.b,binding_id:role,roundtrip_role:role,source_sha256:nativeRoundtripProbe.source_sha256,
      node_id:role==='output'?'js':'n',port_guid:role==='output'?'js-output':'p',
      execution:role==='output'?execution:f.b.execution,completed_child:role==='output'?execution:f.b.completed_child}));
  };
  const result={f,before,js,edge,target,output,outputDs,outputHelper,source,child,execution,lines,generationControl,bind};
  mutate=change?()=>change(result):null;defer=deferred;return result;
}
test('separate native output and upstream bindings read twelve real/NULL cells without replay',async()=>{
  const x=await roundtrip();
  for(const role of ['output','upstream']){
    const b=await x.bind(role),raw=await readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:role});
    assert.equal(raw.cells.length,4);assert.deepEqual(clone(raw.cells.map(c=>c.payload)),clone(x.before.cells.map(c=>c.payload)));
    const state=await javascriptNativeRoundtripStatus(x.f.page);assert.equal(state.releasedResponses,4);assert.equal(state.retired,false);
    await assert.rejects(()=>x.bind(role),/already reserved/);
    await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:role}),/reused/);
  }
  assert.deepEqual(x.f.counters,{sent:12,requests:12,responses:12});
});
const mutations={sameSubscriptionIdentity:x=>x.f.helper.$FDataChangeCookie.$={...x.f.helper.$FDataChangeCookie.$},
  sameOptionalInput:x=>x.f.node.FPorts[0].FCollection[0]={...x.f.node.FPorts[0].FCollection[0]},generation:x=>x.generationControl.checked=false,edge:x=>x.edge.FTargetPort={...x.target},edgeGuid:x=>x.edge.FGuid='other',node:x=>x.js.data={...x.js.data},
  sameGuidNode:x=>x.f.model.FDiagram.FNodes.FCollection[1]={...x.js},inputCache:x=>x.f.helper.$FData={},inputSource:x=>x.source.$.$O++,
  inputSubscription:x=>x.f.helper.$FDataChangeCookie.$.$RRC++,source:x=>x.lines[0]+=' ',outputCache:x=>x.outputHelper.$FData={},
  outputSchema:x=>x.f.dc.FColumnInfosStore.data.items[0].data.DataType=4,outputProcess:x=>x.child.data.Status=2,
  upstreamExecution:x=>x.f.root.childNodes.push({internalId:9,data:{id:'9.1',ModelNode:x.f.node.data,Status:3,ErrorDetails:''},childNodes:[]}),outputPort:x=>x.output.data={}};
for(const [name,change]of Object.entries(mutations))test('roundtrip refuses '+name+' mutation after response and releases buffers',async()=>{
  const x=await roundtrip({change}),b=await x.bind('output');
  await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'output'}));
  assert.deepEqual(x.f.counters,{sent:5,requests:5,responses:5});
  const state=await javascriptNativeRoundtripStatus(x.f.page);assert.equal(state.retired,true);assert.equal(state.published,false);
  await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'retry'}),/retired/);
});
test('completed import-only binding cannot read changed topology',async()=>{
  const x=await roundtrip();await assert.rejects(()=>readJavascriptNativeInput(x.f.page,x.f.b,decodeVariantFrame,{operationId:'not-roundtrip'}),/input-only topology/);assert.equal(x.f.counters.sent,4);
});
test('roundtrip binds source digest and selected execution before dispatch',async()=>{
  const x=await roundtrip(),b=await x.bind('output');
  await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,{...b,source_sha256:'0'.repeat(64)},decodeVariantFrame,{operationId:'wrong-source'}),/capability/);
  await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,{...b,execution:x.f.b.execution},decodeVariantFrame,{operationId:'wrong-execution'}),/execution differs/);assert.equal(x.f.counters.sent,4);
});

test('private roundtrip entrypoint rejects mixed modes before config or browser access',async()=>{
  const {runJavascriptOperator}=await import('./javascript-live.mjs');
  for(const args of [['--execution-case','code-table-execute'],['--discovery-probe','g5-real'],['--create-node']])
    await assert.rejects(()=>runJavascriptOperator(args,{nativeRoundtrip:true}),/separate private entrypoint/);
});
test('roundtrip rejects expired deadline and insufficient bytes without cell dispatch',async()=>{
  const x=await roundtrip(),b=await x.bind('output');
  await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,{...b,deadline:Date.now()-1},decodeVariantFrame,{operationId:'expired'}),/deadline/);
  await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'small',maxBytes:60}),/byte budget/);
  assert.equal(x.f.counters.sent,4);
});
for(const wrongAck of [false,true])test('roundtrip production journal ACK/disk across actual serialized native read: '+wrongAck,async t=>{
  const x=await roundtrip(),f=x.f;
  f.model.FPreviewManager.FPreviewVisible=true;
  // Select the completed JS Preview without consuming a native role binding.
  Object.assign(f.model.FPreviewManager.FPreviewForm,{FCurrentPreviewNode:x.js,FCurrentPreviewPort:x.output});
  Object.assign(f.model.FPreviewManager.FShowDataLastCall,{Node:x.js,Port:x.output});
  f.dc.FModelNode=x.js.data;f.dc.FDataSource=x.outputDs;f.dt.FDataSource=x.outputDs;f.store.proxy.dataSource=x.outputDs;
  const lifecycle={...clone(f.env.__loginomJavascriptNativeInputReadV1.last),retired:false};
  const input={binding:f.b,raw:x.before,exact:adaptRead(x.before,{expected:{...f.b,read_id:'before'},lifecycle,
    consistency:{kind:'observed_local',changed:false,exclusive_operation:true,stability_basis:'owned_static_completed_fixture'}}),
    runtime:{binding_id:'binding',document_id:'d',functions:nativeRuntimePins.functions,constants:nativeRuntimePins.constants}};
  const directory=await mkdtemp(join(tmpdir(),'js-roundtrip-journal-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const journal=createExecutionJournal({directory,metadata:{sessionId:'test',clientRevision:'test'},knownSecrets:['secret-sentinel']});
  const node={document_id:'d',workflow_id:'w',node_id:'js'},ctx={document_id:'d',node,workflow_ref:{workflow_id:'w',tab_tid:'tab',prefix:'TF'},execution:x.execution,deadline:Date.now()+30000};
  const state={prepared_node_context:{...node,verified:true,surface:'graph'},wizard:{status:'absent'},node_outputs:{verified:true,ports:[{index:0,active:true,tid:'output',port_guid:'js-output'}]},
    ui:{elements:[{tid:'output',ref:'output',allowed_actions:['click','press']},{tid:'preview;p.h;close',ref:'close',allowed_actions:['click']}]},
    node_preview_schema:{verified:true,port_guid:'js-output',port:0,root_tid:'preview',fields:[{name:'Value',label:'Value',type:'real'}]}};
  const actions=[],records=[];
  const run=()=>readNativeRoundtrip({options:{operation:{id:'roundtrip-test'},execute:f.execute,now:Date.now,exclusiveNodeOperation:()=>true,receiptOptions:()=>({}),
    onRecord:async event=>{const saved=await journal(event);records.push(event);if(wrongAck&&event.proof)saved.proof.lifecycle.releasedResponses=3;return saved;}},ctx,input,role:'output',targetOrigin:'http://test',targetBuild:'7.4.2',onState:async()=>{}},
    {verifyFrontends:async()=>Object.entries(nativeFrontendPins).map(([name,sha256])=>({name,url:'http://test/'+name,sha256})),verifyCountLoaders:()=>({fixture:'count-loader-source'}),
      createProcedure:()=>({observe:async({ready})=>{assert.equal(ready(state),true);return state;},perform:async({ready,resolve,identity})=>{assert.equal(ready(state),true);assert.ok(identity());actions.push(resolve(state));}})});
  if(wrongAck)await assert.rejects(run,/acknowledgement/);
  if(!wrongAck){const proof=await run();assert.equal(proof.exact.role,'output');
    const bad=clone(proof.raw);bad.cells[1].payload[2]=1;
    assert.throws(()=>verifyNativeRoundtripRead(bad,{binding:proof.binding,lifecycle:proof.lifecycle,input,role:'output'}));}
  const lines=(await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(lines.find(e=>e.proof).proof,clone(records.find(e=>e.proof).proof));assert.equal(actions.at(-1).ref,'close');
  const saved=await journal({authorization:'secret-sentinel'});assert.equal(saved.authorization,'[redacted]');
});
test('fresh process contract refuses replay, stale baseline, wrong launch or source',()=>{
  const node={document_id:'d',workflow_id:'w',node_id:'js'};
  const good={verified:true,owner_verified:true,cleanup_complete:true,status:'completed',execution_id:'d:1:4',group_id:'4',process_id:'4.1',process_record_id:'5',
    trial:{phase:'initial',node_id:'js',source_sha256:nativeRoundtripProbe.source_sha256},fresh_baseline:{node,root_id:'1',roots:[]},
    launch_identity:{node,execution_id:'d:1:4',group_id:'4',root_id:'1',group_record_id:'4'}};
  assert.equal(verifyNativeRoundtripExecution(good,node),good);
  for(const mutate of [x=>x.status='failed',x=>x.cleanup_complete=false,x=>x.trial.source_sha256='wrong',x=>x.fresh_baseline.roots.push({process_id:'4'}),x=>x.launch_identity.root_id='9',x=>x.trial.node_id='foreign']){
    const bad=clone(good);mutate(bad);assert.throws(()=>verifyNativeRoundtripExecution(bad,node));
  }
});

for(const mode of ['cancel','timeout'])test('roundtrip '+mode+' retains pending buffers until late response and prohibits replay',async()=>{
  const x=await roundtrip({deferred:true}),b=await x.bind('output');
  const running=readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:mode,timeoutMs:mode==='timeout'?10:1000});
  const rejected=assert.rejects(running,/cancellation unproven/);
  await new Promise(resolve=>setImmediate(resolve));
  if(mode==='cancel')assert.equal((await cancelJavascriptNativeRoundtrip(x.f.page,mode)).cancelled,true);
  await rejected;
  const pending=await javascriptNativeRoundtripStatus(x.f.page);assert.equal(pending.pending,1);assert.equal(pending.retired,true);
  assert.deepEqual(x.f.counters,{sent:5,requests:4,responses:4});
  x.f.callbacks.shift()();
  const settled=await javascriptNativeRoundtripStatus(x.f.page);assert.equal(settled.pending,0);assert.equal(settled.lateResponses,1);assert.equal(settled.published,false);
  assert.deepEqual(x.f.counters,{sent:5,requests:5,responses:5});
  await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'retry'}),/retired/);
});

test('production roundtrip trial revalidates before one Execute and never retries a failed read',async()=>{
  const {default:vm}=await import('node:vm');
  const source=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8');
  const start=source.indexOf('const runExecutionTrial=async probe=>'),end=source.indexOf('const verifyBatchInputIdentity=',start);
  for(const failure of ['none','admission','read']){
    const steps=[],report={execution_probe:{}},deadline=Date.now()+10000;
    const runner=vm.runInNewContext(source.slice(start,end)+'\nrunExecutionTrial',{
      nativeRoundtrip:true,discoveryProbe:null,phaseDeadline:()=>deadline,executionCase:'code-table-execute',report,owner:{prefix:'p'},executionNode:{node_id:'js'},executionInput:{},
      executionRuntime:{checkNativeRoundtripBeforeExecute:async()=>{steps.push('admission');if(failure==='admission')throw Error('changed input');},
        captureExecutionBoundary:async()=>({native:{dispose:async()=>steps.push('dispose')}}),verifyExecutionBoundary:async()=>steps.push('boundary'),
        executeNode:async(node,limit,trial)=>{assert.equal(limit,deadline);assert.equal(trial.source_sha256,nativeRoundtripProbe.source_sha256);steps.push('execute');return {};},
        readNativeRoundtrip:async()=>{steps.push('native');if(failure==='read')throw Error('lost read');return {before:{},output:{},upstream:{}};},once:async(id,args,perform)=>perform()},
      page:{evaluate:async()=>({owner_verified:true,messages:[]}),mouse:{click:async()=>steps.push('done')}},schemaContext:()=>({}),readJavascriptStage:()=>{},
      guard:async()=>{},digest:s=>s,caseEffect:(id,effect)=>effect,requireJavascriptStageAdmission:async()=>{},
      exact:()=>({filter:()=>({evaluate:async()=>({x:1,y:1})}),waitFor:async()=>{}}),executionRecord:async()=>{},
      waitJavascriptStageObservation:async()=>({messages:[]}),javascriptStageTerminal:()=>true,javascriptSentinelOutcome:()=>({sentinel_observed:false}),
      waitWizardReady:async()=>({page:{tid:'p;DoneWizard'}}),waitGraphReady:async()=>{},openedWizard:true,save:async()=>{},Date
    });
    if(failure==='none'){await runner(nativeRoundtripProbe);assert.equal(report.stage,'native-roundtrip-observed');}
    if(failure!=='none')await assert.rejects(()=>runner(nativeRoundtripProbe),failure==='admission'?/changed input/:/lost read/);
    assert.deepEqual(steps,failure==='admission'?['done','admission']:failure==='read'?['done','admission','execute','boundary','native','dispose']:['done','admission','execute','boundary','native','boundary','dispose']);
  }
});

test('completed import provenance refuses pending/failed/new execution, changed config and later upload',()=>{
  const fixture=()=>{const options=sourceEvidence(),provenance=nativeInputProvenance(options),state=options.operation.nodeApply;
    state.pending=null;state.cleanup_complete=true;state.result={status:'SUCCEEDED',cleanup_complete:true,execution:options.execution};
    state.phases.push({phase:'read',status:'verified',value:{execution_id:options.execution.execution_id}});
    return {options,ctx:options.ctx,provenance};};
  verifyNativeRoundtripProvenance(fixture());
  for(const change of [o=>o.options.operation.nodeApply.pending={phase:'read'},o=>o.options.operation.nodeApply.result.status='FAILED',
    o=>o.options.operation.nodeApply.result.execution={execution_id:'d:1:3'},o=>o.options.operation.nodeApply.phases.find(p=>p.phase==='read').value.execution_id='d:1:3',
    o=>o.options.operation.nodeApply.phases.find(p=>p.phase==='configure').value.columns[0].type='integer',
    o=>o.options.history.records.push({...o.options.history.records[0],sequence:2,operation_id:'later',cleanup_confirmed:false,transport_uncertain:true})]){
    const owner=fixture();change(owner);assert.throws(()=>verifyNativeRoundtripProvenance(owner));
  }
});

test('upstream role cannot be admitted before a completed output read',async()=>{
  const x=await roundtrip();await assert.rejects(()=>x.bind('upstream'),/Completed output read required/);
  assert.equal(x.f.counters.sent,4);
});
