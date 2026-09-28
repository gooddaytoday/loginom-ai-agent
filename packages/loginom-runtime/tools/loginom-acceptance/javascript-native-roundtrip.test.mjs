import {javascriptNamedCase} from './javascript-native-named-cases.mjs';
import {createHash} from 'node:crypto';
import {javascriptNativeFixture,javascriptNativeReadFixture} from './javascript-native-fixtures.mjs';
import vm from 'node:vm';
import {javascriptProbeFailure} from './javascript-mismatch-probe.mjs';
import {createRedactor} from '../../client/lib/redact.mjs';
import {nativeInputProvenance} from './javascript-native-input-contract.mjs';
import {adaptRead} from '../../client/lib/variant-native-values.mjs';
import {nativeRuntimePins} from '../../client/lib/collapse-native-runtime-pins.mjs';
import {nativeFrontendPins} from '../../client/lib/collapse-native-output.mjs';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readNativeRoundtrip} from './javascript-native-roundtrip-driver.mjs';
import {verifyNativeRoundtripRead,verifyNativeRoundtripExecution,verifyNativeRoundtripProvenance,verifyNativeRoundtripAddPortRuntime} from './javascript-native-roundtrip-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fake,sourceEvidence} from './javascript-native-input.test.mjs';
import {readJavascriptNativeInput} from './javascript-native-input-read.mjs';
import {decodeVariantFrame} from '../../client/lib/variant-native-decode.mjs';
import {javascriptCalibrationCase} from './javascript-calibration-cases.mjs';
import {nativeRoundtripProbe,javascriptNativeRoundtripProbe} from './javascript-native-roundtrip-contract.mjs';
import {armJavascriptNativeRoundtrip,bindJavascriptNativeRoundtripGraph,bindJavascriptNativeRoundtripSource,bindJavascriptNativeRoundtripSchema,completeJavascriptNativeRoundtrip,prepareJavascriptNativeRoundtripWizard,sealJavascriptNativeRoundtripDone} from './javascript-native-roundtrip-owner.mjs';
import {javascriptNativeRoundtripCode} from './javascript-native-roundtrip-binding.mjs';
import {readJavascriptNativeRoundtrip,javascriptNativeRoundtripStatus,cancelJavascriptNativeRoundtrip} from './javascript-native-roundtrip-read.mjs';
const clone=v=>JSON.parse(JSON.stringify(v));
export async function roundtrip({change,deferred=false,beforeGraph,afterRelease,wizardOnly=false,fixtureId='real',namedCaseId,calibrationId,reply,sharedPortGuid,beforeSchema,beforeSource,coercionOutput,deferCompletion=false}={}){
  const nativeRoundtripProbe=calibrationId!==undefined?javascriptCalibrationCase(calibrationId):javascriptNativeRoundtripProbe(fixtureId,namedCaseId);
  let mutate,mutateAfter,defer=false;
  const f=await fake({fixtureId,coercionOutput,beforeBind:f=>{if(namedCaseId!==undefined||calibrationId!==undefined)f.b.completed_child={...sourceEvidence('integer-safe').execution};if(sharedPortGuid){f.port.FGuid=sharedPortGuid;f.b.port_guid=sharedPortGuid;}},change:(fixture,response,request)=>{mutate?.();reply?.(fixture,response,request);},deferred:()=>defer,afterRelease:()=>mutateAfter?.()});
  const initialRead=await readJavascriptNativeInput(f.page,f.b,decodeVariantFrame,{operationId:'before'});
  f.model.FPreviewManager.FPreviewVisible=false;
  await f.page.evaluate(armJavascriptNativeRoundtrip,{binding:{...f.b,read_id:'before'},...nativeRoundtripProbe});
  const js={FGuid:'js',FIconCls:'bg-vendor-icon-javascript',FStatus:1,FRunning:false,data:{$S:f.session}};
  const target={parent:js,FGuid:'js-input',FType:0,FSubType:1,FParam:3,FStatus:1};
  const output={parent:js,FGuid:sharedPortGuid??'js-output',FType:1,FSubType:1,FParam:2,FStatus:2,FPortIndex:0};
  // Exact constructor text from pinned fix66 AddPort.js; never invoked here.
  const addPortSource='function AddPort(parent, graph, type) {\n            var _this = _super.call(this, parent, graph, type, 0, 10) || this;\n            _this.FReachedMaxOccurs = [];\n            _this.FVerifiedPortsForConnection = {};\n            _this.FHasHoverState = true;\n            return _this;\n        }';
  const addPortClass=vm.runInNewContext('('+addPortSource+')');f.env.mx={AddPort:addPortClass};
  const service=Object.assign(Object.create(addPortClass.prototype),{parent:js,FType:1,FSubType:10,FParam:undefined,FStatus:0,FPortIndex:undefined});
  js.FPorts=[{FCollection:[target]},{FCollection:[output,service]}];f.model.FDiagram.FNodes.FCollection.push(js);
  const edge={FGuid:'edge',FSourcePort:f.port,FTargetPort:target};f.model.FDiagram.FLinks.FCollection.push(edge);
  beforeGraph?.({f,js,edge,target,output,service,addPortClass});
  const graphProof=await f.page.evaluate(bindJavascriptNativeRoundtripGraph,{node:{node_id:'js'},inputPortGuid:'js-input'});
  const lines=nativeRoundtripProbe.source.split('\n'),doc={firstLine:()=>0,lineCount:()=>lines.length,getLine:i=>lines[i]};
  const generation={id:'generation'},generationControl={el:{dom:generation},checked:nativeRoundtripProbe.schema_mode==='code'};
  const declaredRecord={isModel:true,internalId:'declared-1',data:{Name:'Value',DisplayName:'Value',DataType:4,Index:0,Required:false,Broken:false}};
  const declaredData={items:[declaredRecord]},declaredStore={$className:'Ext.data.Store',getData:()=>declaredData,isLoading:()=>false,getCount:()=>declaredData.items.length,getTotalCount:()=>declaredData.items.length};
  const declaredElement={id:'declared-grid'},declaredView={el:{dom:declaredElement},getStore:()=>declaredStore};
  const oldGet=f.env.Ext.getCmp;f.env.Ext.getCmp=id=>id==='generation'?generationControl:id==='declared-grid'?declaredView:oldGet(id);
  const currentPage={isConnected:true,getBoundingClientRect:()=>({width:1,height:1})};
  const root={isConnected:true,getBoundingClientRect:()=>({width:1,height:1}),querySelectorAll:q=>q==='.CodeMirror'
    ?[{getBoundingClientRect:()=>({width:1,height:1}),CodeMirror:{getDoc:()=>doc}}]:q.includes('DoneWizard')?[currentPage]:q.includes('grdTargetColumns')?[declaredElement]:[generation]};
  const card=f.env.bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab(),native={};
  const previousNode=card.Controller.Node.data.node;card.Controller.Node.data.node=native;card.Controller.FController={FView:{el:{dom:root}}};
  const declaration={fixture_id:'cardinality-empty',schema_mode:'declared',generation:false,apply_verified:true,page_tid:'p;WizrdMCF;JavaScriptColumnsWizard',
    field:{record_id:'declared-1',name:'Value',label:'Value',type:4,index:0,required:false}};
  const declaration_sha256=createHash('sha256').update(JSON.stringify(declaration)).digest('hex');
  const schema={verified:true,generation:{checked:generationControl.checked,tid:'generation;DisplayEl'},
    ...(fixtureId==='cardinality-empty'?{form:'JavaScriptColumnsWizard',inventory_complete:true,page_tid:declaration.page_tid,declaration,declaration_sha256,
      grids:[{tid:declaration.page_tid+';grdTargetColumns;tbl',count:1,total:1,fields:[{record_id:'declared-1',...declaredRecord.data}]}]}:{})};
  beforeSchema?.({schema,generationControl,declaredRecord,declaredStore,declaredData,declaredView});
  await f.page.evaluate(bindJavascriptNativeRoundtripSchema,{root,native,binding:{native:js,nodeData:js.data},schema});
  beforeSource?.({schema,generationControl,declaredRecord,declaredStore,declaredData,declaredView});
  await f.page.evaluate(bindJavascriptNativeRoundtripSource,{root,native,binding:{native:js,nodeData:js.data},schema});
  const context={root,native,binding:{native:js,nodeData:js.data},prefix:'p'};
  const identity={effect_id:'own-done',node_id:'js',source_sha256:nativeRoundtripProbe.source_sha256};
  const before={owner_verified:true,wizard_visible:true,pending:false,page_tid:'p;WizrdMCF;DoneWizard'};
  const prepare=(overrides={})=>f.page.evaluate(prepareJavascriptNativeRoundtripWizard,{context,before,identity,stage:'done',deadline:f.b.deadline,...overrides});
  const dispose=(destroy=true)=>{card.Controller.Node.data.node=previousNode;card.Controller.FController=f.model;root.isConnected=false;if(destroy)generationControl.el=null;};
  const confirmation={effect_settled:true,terminal:true,after:{wizard_visible:false,pending:false},no_new_messages:true};
  const seal=(overrides={})=>f.page.evaluate(sealJavascriptNativeRoundtripDone,{identity,confirmation,...overrides});
  if(wizardOnly)return {f,inputRaw:initialRead,js,target,output,service,lines,generationControl,declaredRecord,declaredStore,declaredData,declaredView,schema,context,identity,before,prepare,dispose,seal,confirmation,root};
  await prepare();dispose();await seal();
  const child={internalId:5,data:{id:'4.1',Status:3,ErrorDetails:'',ModelNode:js.data},childNodes:[]};
  f.root.childNodes.push({internalId:4,data:{id:'4',Status:3,ErrorDetails:'',loaded:true},childNodes:[child]});
  const execution={verified:true,owner_verified:true,status:'completed',execution_id:'d:1:4',group_id:'4',process_id:'4.1',process_record_id:'5',trial:{source_sha256:nativeRoundtripProbe.source_sha256}};
  if(namedCaseId!==undefined||fixtureId==='civil-datetime'||javascriptNativeFixture(fixtureId).output_input_rows||javascriptNativeFixture(fixtureId).coercion)Object.assign(execution,{cleanup_complete:true,
    trial:{...execution.trial,phase:'initial',node_id:'js'},fresh_baseline:{node:{document_id:'d',workflow_id:'w',node_id:'js'},roots:[],root_id:'root'},
    launch_identity:{execution_id:execution.execution_id,group_id:execution.group_id,root_id:'root',group_record_id:'4',node:{document_id:'d',workflow_id:'w',node_id:'js'}}});
  if(!deferCompletion)await f.page.evaluate(completeJavascriptNativeRoundtrip,{execution,source_sha256:nativeRoundtripProbe.source_sha256});
  output.FStatus=1;
  const source=f.dc.FDataSource,outputHelper={...f.helper,$FData:{},$FRowCount:namedCaseId!==undefined?(javascriptNamedCase(namedCaseId).output_rows??4):javascriptNativeReadFixture(fixtureId,'output').rows},outputDs={...source,$:{...source.$},$FHelper:outputHelper};outputHelper.FBaseProxy=outputDs;
  if(fixtureId==='cardinality-empty')Object.assign(outputHelper,{$FCacheInitialized:false,$FData:null,$FDataChangeCookie:null,$FStateChangeCookie:null});
  const inputFields=f.dc.FColumnInfosStore.data.items;
  const outputFields=javascriptNativeFixture(fixtureId).coercion?[{data:{Name:'Value',DisplayName:'Value',DataType:4}}]:inputFields;
  const bind=async role=>{
    const slice={...javascriptNativeReadFixture(fixtureId,role),...(namedCaseId!==undefined&&role==='output'?{rows:javascriptNamedCase(namedCaseId).output_rows??4}:{})};
    f.dt.FTotalRowCount=slice.rows;f.dc.FColumnInfosStore.data.items=role==='output'?outputFields:inputFields;
    if(fixtureId==='cardinality-empty'){
      f.dc.FTotalRowCount=slice.rows;f.store.totalCount=slice.rows;f.store.pageRequests={};
      Object.assign(f.store.proxy,{FTotalRowCount:slice.rows,FDataFieldNames:['Value'],FValueGetters:[()=>{}],pendingOperations:{}});
    }
    f.model.FPreviewManager.FPreviewVisible=true;
    const node=role==='output'?js:f.node,port=role==='output'?output:f.port,ds=role==='output'?outputDs:source;
    Object.assign(f.model.FPreviewManager.FPreviewForm,{FCurrentPreviewNode:node,FCurrentPreviewPort:port});
    Object.assign(f.model.FPreviewManager.FShowDataLastCall,{Node:node,Port:port});
    f.dc.FModelNode=node.data;f.dc.FDataSource=ds;f.dt.FDataSource=ds;f.store.proxy.dataSource=ds;
    return f.execute(javascriptNativeRoundtripCode({...f.b,...(namedCaseId!==undefined?{named_case_id:namedCaseId,input_fixture_id:'integer-safe'}:{}),binding_id:role,roundtrip_role:role,source_sha256:nativeRoundtripProbe.source_sha256,
      node_id:role==='output'?'js':'n',port_guid:port.FGuid,rows:slice.rows,row_count:slice.rows,schema:[{name:'Value',label:'Value',type:slice.native_type}],
      execution:role==='output'?execution:f.b.execution,completed_child:role==='output'?execution:f.b.completed_child}));
  };
  const result={f,before:initialRead,js,edge,target,output,service,outputDs,outputHelper,source,child,execution,lines,generationControl,declaredRecord,declaredStore,declaredData,declaredView,schema,graphProof,bind,closeOutput:()=>{f.model.FPreviewManager.FPreviewVisible=false;const entry=f.env.__loginomJavascriptNativeRoundtripV1.bindings.get('output'),facts=entry.zeroCheck();entry.zeroAcknowledge({phase:'javascript_native_zero_graph_verified',read_id:entry.readId,declaration_sha256:entry.initial.declaration_sha256,facts});return facts;}};
  mutate=change?()=>change(result):null;mutateAfter=afterRelease?()=>afterRelease(result):null;defer=deferred;return result;
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
  sameOptionalInput:x=>x.f.node.FPorts[0].FCollection[0]={...x.f.node.FPorts[0].FCollection[0]},sealedMode:x=>{const s=x.f.env.__loginomJavascriptNativeRoundtripV1;s.done={...s.done,schema_mode:'declared'};},edge:x=>x.edge.FTargetPort={...x.target},edgeGuid:x=>x.edge.FGuid='other',node:x=>x.js.data={...x.js.data},
  sameGuidNode:x=>x.f.model.FDiagram.FNodes.FCollection[1]={...x.js},inputCache:x=>x.f.helper.$FData={},inputSource:x=>x.source.$.$O++,
  inputSubscription:x=>x.f.helper.$FDataChangeCookie.$.$RRC++,source:x=>x.f.env.__loginomJavascriptNativeRoundtripV1.source+=' ',outputCache:x=>x.outputHelper.$FData={},
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
for(const fixtureId of ['real','boolean','string','integer-safe','integer-outside-safe','cardinality-keep2','cardinality-odd','cardinality-duplicate','cardinality-empty'])for(const mode of (fixtureId==='cardinality-empty'?['ok','wrong-ack','lost-preview','graph-ack','graph-drift']:['ok','wrong-ack','lost-preview']))test(fixtureId+' roundtrip production journal ACK/disk across actual serialized native read: '+mode,async t=>{
  const wrongAck=mode==='wrong-ack';
  const fixture=javascriptNativeFixture(fixtureId),slice=javascriptNativeReadFixture(fixtureId,'output'),x=await roundtrip({fixtureId}),f=x.f;
  f.dt.FTotalRowCount=slice.rows;
  if(fixtureId==='cardinality-empty'){f.dc.FTotalRowCount=0;f.store.totalCount=0;f.store.pageRequests={};Object.assign(f.store.proxy,{FTotalRowCount:0,FDataFieldNames:['Value'],FValueGetters:[()=>{}],pendingOperations:{}});}
  if(fixture.output_input_rows){f.b.package_id='d:w';x.before.package_id='d:w';}
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
    ui:{elements:[{tid:'output',ref:'output',allowed_actions:[]},{tid:'preview;p.h;close',ref:'close',allowed_actions:['click']}]},
    node_preview_schema:{verified:true,port_guid:'js-output',port:0,root_tid:'preview',fields:[{name:'Value',label:'Value',type:fixture.type}]}};
  const actions=[],records=[],states=[],operation={id:'roundtrip-test'};
  const run=()=>readNativeRoundtrip({options:{operation,execute:f.execute,now:Date.now,exclusiveNodeOperation:()=>true,receiptOptions:()=>({}),
    onRecord:async event=>{const saved=await journal(event);records.push(event);if(wrongAck&&event.proof)saved.proof.lifecycle.releasedResponses=slice.rows-1;if(mode==='graph-ack'&&event.phase==='javascript_native_zero_graph_verified')saved.phase='wrong';return saved;}},ctx,input,role:'output',targetOrigin:'http://test',targetBuild:'7.4.2',onState:async state=>states.push(state)},
    {openPreview:async args=>{assert.equal(args.port.port_guid,'js-output');assert.deepEqual(args.state.ui.elements[0].allowed_actions,[]);actions.push({ref:'private-F3'});},verifyFrontends:async()=>Object.entries(nativeFrontendPins).map(([name,sha256])=>({name,url:'http://test/'+name,sha256})),verifyCountLoaders:()=>fixtureId==='cardinality-empty'?{PrepareColumnInfoAndRowCount:'d952415558676c3caf569a51d88bf026e661abdaaf08842d870ddba139730e3f',InitOutput:'c01544ac551e88997f9cea9b62314234ad435bc7632357861cdfc6013e89960e',DataSourceProxyRead:'6206671eaf111d80459c3ed1d5878125ef37918fb1abacc1cd19ce42c7fdf91d'}:{fixture:'count-loader-source'},
      createProcedure:()=>({observe:async({ready,condition})=>{if(mode==='lost-preview'&&condition==='native roundtrip Preview schema')throw Error('lost Preview observation');assert.equal(ready(state),true);return state;},perform:async({ready,resolve,identity})=>{assert.equal(ready(state),true);assert.ok(identity());actions.push(resolve(state));if(fixtureId==='cardinality-empty'){f.model.FPreviewManager.FPreviewVisible=false;if(mode==='graph-drift')x.outputHelper.$FCacheInitialized=true;}}})});
  if(mode==='lost-preview'){
    await assert.rejects(run,/lost Preview observation/);assert.equal(operation.transportUncertain,true);
    assert.equal(states.at(-1).uncertain,true);assert.deepEqual(actions,[{ref:'private-F3'}]);
    assert.equal(f.counters.sent,fixture.rows);assert.equal(records.some(e=>e.proof),false);return;
  }
  if(wrongAck)await assert.rejects(run,/acknowledgement/);
  if(mode==='graph-ack'||mode==='graph-drift'){await assert.rejects(run,/zero|Zero/);assert.equal(operation.transportUncertain,true);assert.equal(f.env.__loginomJavascriptNativeRoundtripV1.bindings.get('output').zeroGraphVerified,undefined);assert.equal(f.counters.sent,3);return;}
  if(!wrongAck){const proof=await run();assert.equal(proof.exact.role,'output');
    assert.equal(proof.binding.fixture_id,fixtureId);assert.equal(proof.lifecycle.releasedRequests,slice.rows);assert.equal(proof.lifecycle.releasedResponses,slice.rows);
    const bad=clone(proof.raw);if(fixtureId==='cardinality-empty'){bad.zero_admission.final.facts.counts.dc=1;assert.equal(f.env.__loginomJavascriptNativeRoundtripV1.bindings.get('output').zeroGraphVerified,true);assert.equal(f.counters.sent,3);}else bad.cells[0].payload[0]=fixture.values[0]===null?5:1;
    assert.throws(()=>verifyNativeRoundtripRead(bad,{binding:proof.binding,lifecycle:proof.lifecycle,input,role:'output'}));}
  if(fixtureId==='cardinality-empty'&&wrongAck)assert.equal(f.env.__loginomJavascriptNativeRoundtripV1.bindings.get('output').zeroGraphVerified,undefined);
  const lines=(await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(lines.find(e=>e.proof).proof,clone(records.find(e=>e.proof).proof));assert.deepEqual(actions.map(a=>a.ref),['private-F3','close']);
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

for(const fixtureId of ['real','integer-safe','integer-outside-safe'])for(const mode of ['cancel','timeout'])test(fixtureId+' roundtrip '+mode+' retains pending buffers until late response and prohibits replay',async()=>{
  const rows=javascriptNativeFixture(fixtureId).rows,x=await roundtrip({fixtureId,deferred:true}),b=await x.bind('output');
  const running=readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:mode,timeoutMs:mode==='timeout'?10:1000});
  const rejected=assert.rejects(running,/cancellation unproven/);
  await new Promise(resolve=>setImmediate(resolve));
  if(mode==='cancel')assert.equal((await cancelJavascriptNativeRoundtrip(x.f.page,mode)).cancelled,true);
  await rejected;
  const pending=await javascriptNativeRoundtripStatus(x.f.page);assert.equal(pending.pending,1);assert.equal(pending.retired,true);
  assert.deepEqual(x.f.counters,{sent:rows+1,requests:rows,responses:rows});
  x.f.callbacks.shift()();
  const settled=await javascriptNativeRoundtripStatus(x.f.page);assert.equal(settled.pending,0);assert.equal(settled.lateResponses,1);assert.equal(settled.published,false);
  assert.deepEqual(x.f.counters,{sent:rows+1,requests:rows+1,responses:rows+1});
  await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'retry'}),/retired/);
});

test('production roundtrip trial revalidates before one Execute and never retries a failed read',async()=>{
  const {default:vm}=await import('node:vm');
  const source=await readFile(new URL('./javascript-live.mjs',import.meta.url),'utf8');
  const start=source.indexOf('const runExecutionTrial=async probe=>'),end=source.indexOf('const verifyBatchInputIdentity=',start);
  for(const failure of ['none','characterized','admission','read','done-lost','done-unconfirmed','preflight-ack','seal-ack']){
    const steps=[],report={execution_probe:{}},deadline=Date.now()+10000;
    const runner=vm.runInNewContext(source.slice(start,end)+'\nrunExecutionTrial',{
      nativeRoundtrip:true,calibrationTrial:null,coercionTrial:null,namedTrial:null,discoveryProbe:null,phaseDeadline:()=>deadline,executionCase:'code-table-execute',report,owner:{prefix:'p'},executionNode:{node_id:'js'},executionInput:{},
      executionRuntime:{checkNativeRoundtripBeforeExecute:async()=>{steps.push('admission');if(failure==='admission')throw Error('changed input');},
        captureExecutionBoundary:async()=>({native:{dispose:async()=>steps.push('dispose')}}),verifyExecutionBoundary:async()=>steps.push('boundary'),
        executeNode:async(node,limit,trial)=>{assert.equal(limit,deadline);assert.equal(trial.source_sha256,nativeRoundtripProbe.source_sha256);steps.push('execute');return {};},
        readNativeRoundtrip:async()=>{steps.push('native');if(failure==='read')throw Error('lost read');return {before:{},output:{},upstream:{},...(failure==='characterized'?{outcome:{characterization_only:true,exact_pass:false}}:{})};},once:async(id,args,perform)=>perform()},
      page:{evaluate:async fn=>fn===prepareJavascriptNativeRoundtripWizard||fn===sealJavascriptNativeRoundtripDone?{verified:true}:{owner_verified:true,messages:[]},mouse:{click:async()=>{steps.push('done');if(failure==='done-lost')throw Error('lost Done');}}},
      prepareJavascriptNativeRoundtripWizard,sealJavascriptNativeRoundtripDone,schemaContext:()=>({}),readJavascriptStage:()=>{},
      guard:async()=>{},digest:s=>s,caseEffect:(id,effect)=>effect,requireJavascriptStageAdmission:async()=>{},
      exact:()=>({filter:()=>({evaluate:async()=>({x:1,y:1})}),waitFor:async()=>{}}),executionRecord:async event=>failure==='preflight-ack'&&event.phase==='native_roundtrip_wizard_preflight'||failure==='seal-ack'&&event.phase==='native_roundtrip_done_sealed'?{}:event,
      waitJavascriptStageObservation:async()=>({messages:[],wizard_visible:false,pending:false}),javascriptStageTerminal:()=>failure!=='done-unconfirmed',javascriptSentinelOutcome:()=>({sentinel_observed:false}),
      waitWizardReady:async()=>({page:{tid:'p;DoneWizard'}}),waitGraphReady:async()=>{},openedWizard:true,save:async()=>{},Date
    });
    if(failure==='none'){await runner(nativeRoundtripProbe);assert.equal(report.stage,'native-roundtrip-observed');}
    if(failure==='characterized'){await runner(nativeRoundtripProbe);assert.equal(report.stage,'native-roundtrip-characterized');assert.equal(report.native_roundtrip.outcome.exact_pass,false);}
    if(!['none','characterized'].includes(failure))await assert.rejects(()=>runner(nativeRoundtripProbe),{admission:/changed input/,read:/lost read/,'done-lost':/lost Done/,'done-unconfirmed':/unconfirmed/,'preflight-ack':/preflight journal ACK/,'seal-ack':/Done seal journal ACK/}[failure]);
    assert.deepEqual(steps,failure==='preflight-ack'?[]:['done-lost','done-unconfirmed','seal-ack'].includes(failure)?['done']:failure==='admission'?['done','admission']:failure==='read'?['done','admission','execute','boundary','native','dispose']:['done','admission','execute','boundary','native','boundary','dispose']);
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

const graphRefusals={
  source:x=>x.edge.FSourcePort={...x.f.port},parent:x=>x.target.parent={},
  collection:x=>x.js.FPorts[0].FCollection=[],guid:x=>x.target.FGuid='private-guid',
  type:x=>x.target.FType=1,subtype:x=>x.target.FSubType=3,param:x=>x.target.FParam=1,
  edge_guid:x=>x.edge.FGuid='',
};
for(const [predicate,change]of Object.entries(graphRefusals))test('serialized graph admission identifies only '+predicate+' and does not dispatch JS/native output',async()=>{
  let fixture;
  await assert.rejects(()=>roundtrip({beforeGraph:x=>{fixture=x;change(x);}}),error=>{
    const diagnostic=JSON.parse(error.message.split('RG1 ')[1]);
    assert.deepEqual(diagnostic.f,[predicate]);assert.equal(diagnostic.c[predicate],false);
    assert.equal(Object.values(diagnostic.c).filter(Boolean).length,7);
    assert.ok(error.message.length<400);assert.ok(!error.message.includes('private-guid'));
    if(predicate==='param')assert.deepEqual(diagnostic.v,['0','1','1']);
    return true;
  });
  assert.equal(fixture.f.counters.sent,4);assert.equal(fixture.f.env.__loginomJavascriptNativeRoundtripV1.stage,'graph-reserved');
  assert.throws(()=>fixture.f.page.evaluate(bindJavascriptNativeRoundtripGraph,{node:{node_id:'js'},inputPortGuid:'js-input'}),/one graph admission/);
});
for(const value of [undefined,null,-1,17,NaN,Infinity,'private-value',{secret:'private-value'}])test('graph param diagnostic uses bounded classes for '+String(value),async()=>{
  await assert.rejects(()=>roundtrip({beforeGraph:x=>{x.target.FParam=value;}}),error=>{
    const d=JSON.parse(error.message.split('RG1 ')[1]);assert.deepEqual(d.f,['param']);assert.equal(d.v[2],'other');
    assert.ok(!error.message.includes('private-value'));return true;
  });
});
test('all graph predicates survive real operator error serialization and production journal redaction',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'js-roundtrip-graph-diagnostic-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const journal=createExecutionJournal({directory,metadata:{sessionId:'test',clientRevision:'test'},knownSecrets:['private-value']});
  const error=await roundtrip({beforeGraph:x=>{
    for(const change of Object.values(graphRefusals))change(x);
    x.target.FType='private-value';x.target.FSubType={secret:'private-value'};delete x.target.FParam;
  }}).then(()=>assert.fail('Graph must refuse'),error=>error);
  // Playwright adds its prefix/stack; use the same report failure serializer and
  // redactor as the operator, followed by the real durable journal and disk read.
  const transported=Error('page.evaluate: Error: '+error.message+'\n    at bindJavascriptNativeRoundtripGraph'.repeat(50));
  const failure=createRedactor(['private-value']).redact(javascriptProbeFailure(transported));
  const saved=await journal({phase:'roundtrip_graph_refused',failure});
  const first=saved.failure.message.split('\n')[0];assert.ok(first.length<500);
  const diagnostic=JSON.parse(first.split('RG1 ')[1]);assert.deepEqual(diagnostic.f,Object.keys(graphRefusals));
  assert.deepEqual(diagnostic.v,['other','other','missing']);assert.ok(Object.values(diagnostic.c).every(v=>v===false));
  assert.equal(saved.failure.message.length,1200);
  const disk=await readFile(join(directory,'execution-events.jsonl'),'utf8');assert.ok(!disk.includes('private-value'));
  assert.deepEqual(JSON.parse(disk).failure,clone(failure));
});

for(const param of [0,1,2,4,16])test('observed JS input requires exact param3 and rejects '+param+' before graph binding',async()=>{
  let f;
  await assert.rejects(()=>roundtrip({beforeGraph:x=>{f=x.f;x.target.FParam=param;}}),error=>{
    const d=JSON.parse(error.message.split('RG1 ')[1]);assert.deepEqual(d.f,['param']);assert.deepEqual(d.v,['0','1',String(param)]);return true;
  });assert.equal(f.counters.sent,4);
});
for(const param of [0,1,2,4])for(const stage of ['before-binding','before-read','after-response','between-cells','final-publication'])
  test('JS input param3 mutation to '+param+' at '+stage+' refuses native publication',async()=>{
    const change=x=>{x.target.FParam=param;};
    const x=await roundtrip({change:stage==='after-response'?change:undefined,
      afterRelease:stage==='between-cells'?change:stage==='final-publication'?x=>{if(x.f.counters.requests===8)change(x);}:undefined});
    if(stage==='before-binding'){
      change(x);await assert.rejects(()=>x.bind('output'),/port identity/);assert.equal(x.f.counters.sent,4);return;
    }
    const b=await x.bind('output');if(stage==='before-read')change(x);
    await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'changed-param'}),/port identity/);
    const count=stage==='before-read'?4:stage==='final-publication'?8:5;
    assert.deepEqual(x.f.counters,{sent:count,requests:count,responses:count});
    if(stage!=='before-read'){const state=await javascriptNativeRoundtripStatus(x.f.page);assert.equal(state.published,false);assert.equal(state.retired,true);}
  });
test('graph-bound port inventory is bounded, descriptor-only and does not admit output param changes',async()=>{
  let getters=0;
  const x=await roundtrip({beforeGraph:x=>{
    Object.defineProperty(x.target,'FPortIndex',{get:()=>{getters++;return 'private-index';}});
    x.output.FPortIndex=999;x.output.FStatus='private-status';
  }});
  assert.deepEqual(clone(x.graphProof.ports),{input:{count:'1',values:[['0','1','3','1','accessor']]},output:{count:'2',values:[['1','1','2','other','other'],['1','10','other','0','other']]}});
  assert.equal(getters,0);assert.ok(!JSON.stringify(x.graphProof).includes('private-'));
  x.output.FStatus=1;x.output.FParam=3;
  await assert.rejects(()=>x.bind('output'),/port identity/);
});
test('graph-bound observation caps per-port enum inventory at eight without admitting a wider output read',async()=>{
  const x=await roundtrip({beforeGraph:x=>{
    x.js.FPorts[1].FCollection.push(...Array.from({length:9},(_,i)=>({...x.output,FGuid:'private-output-'+i,FPortIndex:i+1})));
  }});
  assert.equal(x.graphProof.ports.output.count,'>8');assert.equal(x.graphProof.ports.output.values.length,8);
  assert.ok(!JSON.stringify(x.graphProof.ports).includes('private-output'));
  await assert.rejects(()=>x.bind('output'),/AddPort service layout/);
  assert.equal(x.f.counters.sent,4);
});

test('matched own Done seals live source/mode before legitimate widget disposal and permits graph checks',async()=>{
  const x=await roundtrip({wizardOnly:true});x.prepare();x.dispose();
  assert.equal(x.generationControl.el,null);const proof=x.seal();assert.equal(proof.verified,true);assert.equal(proof.execution_from_wizard,'ambiguous');
  const s=x.f.env.__loginomJavascriptNativeRoundtripV1;assert.equal(s.stage,'done-sealed');assert.equal(s.sourceWitness.verify(),nativeRoundtripProbe.source);
  s.sourceWitness.doc.getLine=()=>{throw Error('disposed editor');};s.check();
  assert.throws(()=>x.seal(),/one pending Done/);assert.equal(x.f.counters.sent,4);
});
for(const mode of ['disposed-control','disposed-wizard','source','mode','wizard-root','wizard-native'])test('wizard preflight refuses '+mode+' before Done reservation',async()=>{
  const x=await roundtrip({wizardOnly:true});
  if(mode==='disposed-control')x.generationControl.el=null;
  if(mode==='disposed-wizard')x.dispose();
  if(mode==='source')x.lines[0]+=' ';
  if(mode==='mode')x.generationControl.checked=false;
  const context={...x.context,...(mode==='wizard-root'?{root:{}}:{}),...(mode==='wizard-native'?{native:{}}:{})};
  assert.throws(()=>x.prepare({context}));assert.equal(x.f.env.__loginomJavascriptNativeRoundtripV1.stage,'source-bound');assert.equal(x.f.counters.sent,4);
});
for(const mode of ['lost-done','nonterminal','pending','visible','foreign-dialog','new-message','wrong-effect','wrong-digest','wrong-node'])
  test('disposed widget cannot seal '+mode+' Done or permit Execute',async()=>{
    const x=await roundtrip({wizardOnly:true});x.prepare();x.dispose();
    const confirmation=clone(x.confirmation),identity={...x.identity};
    if(mode==='lost-done')confirmation.effect_settled=false;if(mode==='nonterminal')confirmation.terminal=false;
    if(mode==='pending')confirmation.after.pending=true;if(mode==='visible')confirmation.after.wizard_visible=true;
    if(mode==='foreign-dialog')confirmation.after.boundary_refusal='foreign_dialog';if(mode==='new-message')confirmation.no_new_messages=false;
    if(mode==='wrong-effect')identity.effect_id='foreign';if(mode==='wrong-digest')identity.source_sha256='foreign';if(mode==='wrong-node')identity.node_id='foreign';
    assert.throws(()=>x.seal({confirmation,identity}));
    assert.throws(()=>x.f.page.evaluate(completeJavascriptNativeRoundtrip,{execution:{},source_sha256:nativeRoundtripProbe.source_sha256}));
    assert.equal(x.f.env.__loginomJavascriptNativeRoundtripV1.stage,'done-prepared');assert.equal(x.f.counters.sent,4);
  });
for(const mode of ['unprepared','wrong-graph','surviving-source','surviving-mode','still-visible'])test('Done seal refuses '+mode,async()=>{
  const x=await roundtrip({wizardOnly:true});if(mode!=='unprepared')x.prepare();x.dispose(!mode.startsWith('surviving-'));
  if(mode==='wrong-graph')x.f.model.FDiagram={};if(mode==='surviving-source')x.lines[0]+=' ';if(mode==='surviving-mode')x.generationControl.checked=false;
  if(mode==='still-visible')x.root.isConnected=true;
  assert.throws(()=>x.seal());assert.notEqual(x.f.env.__loginomJavascriptNativeRoundtripV1.stage,'done-sealed');assert.equal(x.f.counters.sent,4);
});
const outputRefusals={param0:x=>x.output.FParam=0,param1:x=>x.output.FParam=1,param3:x=>x.output.FParam=3,
  wrongIndex:x=>x.output.FPortIndex=1,extraActual:x=>x.js.FPorts[1].FCollection.push({...x.output}),
  missingService:x=>x.js.FPorts[1].FCollection.pop(),foreignService:x=>Object.setPrototypeOf(x.service,{}),
  wrongServiceParent:x=>x.service.parent={},wrongServiceType:x=>x.service.FType=0,wrongServiceSubtype:x=>x.service.FSubType=1,
  serviceParam:x=>x.service.FParam=0,missingServiceParam:x=>delete x.service.FParam,serviceIndex:x=>x.service.FPortIndex=1,
  serviceStatus:x=>x.service.FStatus=1};
for(const [name,change]of Object.entries(outputRefusals))test('JS native output requires exact data0 param2 plus AddPort: '+name,async()=>{
  const x=await roundtrip({beforeGraph:change});await assert.rejects(()=>x.bind('output'));assert.equal(x.f.counters.sent,4);
});
for(const status of [0,2,3])test('pre-execution graph status '+status+' is not active native output',async()=>{
  const x=await roundtrip();x.output.FStatus=status;await assert.rejects(()=>x.bind('output'),/NI1/);assert.equal(x.f.counters.sent,4);
});
for(const [name,change]of Object.entries({service:x=>x.js.FPorts[1].FCollection[1]=Object.assign(Object.create(Object.getPrototypeOf(x.service)),x.service),
  serviceStatus:x=>x.service.FStatus=1,dataParam:x=>x.output.FParam=0,extraActual:x=>x.js.FPorts[1].FCollection.push({...x.output})}))
  test('native output rejects '+name+' change after response with buffer release',async()=>{
    const x=await roundtrip({change}),b=await x.bind('output');await assert.rejects(()=>readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'service-change'}));
    assert.deepEqual(x.f.counters,{sent:5,requests:5,responses:5});assert.equal((await javascriptNativeRoundtripStatus(x.f.page)).published,false);
  });
test('loaded AddPort constructor source must match pinned frontend constructor exactly',async()=>{
  const x=await roundtrip(),b=await x.bind('output');assert.equal(verifyNativeRoundtripAddPortRuntime(b.add_port_sources).constructor,'38bbd3e2f5143859e0c963aeb9c1389304c140d32484a88af1b2ec8f6ba0a72c');
  for(const sources of [undefined,{}, {...b.add_port_sources,extra:'x'},{constructor:b.add_port_sources.constructor+' '}])assert.throws(()=>verifyNativeRoundtripAddPortRuntime(sources));
});

for(const field of ['node','port'])test('upstream reread refuses '+field+' deactivation after native JS output',async()=>{
  const x=await roundtrip(),b=await x.bind('output');
  await readJavascriptNativeRoundtrip(x.f.page,b,decodeVariantFrame,{operationId:'output'});
  if(field==='node')x.js.FStatus=0;if(field==='port')x.output.FStatus=2;
  await assert.rejects(()=>x.bind('upstream'),/completed JS output inactive/);assert.equal(x.f.counters.sent,8);
});
