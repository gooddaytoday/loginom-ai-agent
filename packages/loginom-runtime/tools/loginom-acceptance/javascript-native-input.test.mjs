import {javascriptNativeFixture} from './javascript-native-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createActionRuntime,parseCapabilityResult} from '../../client/lib/executor.mjs';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';
import {runJavascriptOperator} from './javascript-live.mjs';
import {javascriptNativeInputCode,javascriptNativeRuntimeCode,verifyNativeInputCookieRuntime} from './javascript-native-input-binding.mjs';
import {readJavascriptNativeInput,cancelJavascriptNativeInput,javascriptNativeInputStatus} from './javascript-native-input-read.mjs';
import {nativeInputFixture,verifyNativeInputFixture,nativeInputRequest,verifyNativeInputUi,nativeInputProvenance,verifyNativeInputRead} from './javascript-native-input-contract.mjs';
import {createJavascriptNativeInputSupport,readNativeInputDuringImport,verifyNativeInputCountLoaders} from './javascript-native-input-driver.mjs';
import {createHash} from 'node:crypto';
import {decodeVariantFrame} from '../../client/lib/variant-native-decode.mjs';
import {nativeRuntimePins} from '../../client/lib/collapse-native-runtime-pins.mjs';
import {nativeFrontendPins} from '../../client/lib/collapse-native-output.mjs';
import {verifyLoadedNativeRuntime} from '../../client/lib/collapse-native-runtime.mjs';

// Exact function text from pinned bg.rtl.rpc.js, lines9810/47244.
const cookieSources={constructor:'function(objectOwnerID, objectID) {\n\t\trpc.TBGObjectProxy.call(this, objectOwnerID, objectID);\n\t}',
  interface:'function() {\n\t\t\treturn 206;\n\t\t}'};
const values=[null,0,-1.25,10.125];
const clone=x=>JSON.parse(JSON.stringify(x));
export function sourceEvidence(fixtureId='real'){
  const nativeInputFixture=javascriptNativeFixture(fixtureId);
  const prepared={document_id:'d',workflow_ref:{workflow_id:'w'}},artifact={artifact_id:'a',...nativeInputFixture};
  const request=nativeInputRequest({prepared,artifact,storage:'/jsteach/js-g2-00000000-0000-0000-0000-000000000000',uploadOperationId:'u',totalMs:600000,fixtureId});
  const destination=request.parameters.settings.source.source_path;
  const proof={status:'SUCCEEDED',bytes_verified:true,upload_completion_verified:true,verification_id:'v',destination,bytes:artifact.bytes,sha256:artifact.sha256};
  const upload={operation_id:'u',artifact,outcome:{operation_id:'u',action_key:'artifact.upload',status:'SUCCEEDED',cleanup_complete:true,
    output:{artifact_id:'a',bytes:artifact.bytes,sha256:artifact.sha256,destination,server_copy_verification:proof}}};
  const history={complete:true,records:[{...upload,sequence:1,destination,cleanup_confirmed:true,transport_uncertain:false}]};
  const fields=x=>({fields:Object.fromEntries(Object.entries(x).map(([k,value])=>[k,{status:'observed',value}]))});
  const column={index:0,name:'Value',label:'Value',type:nativeInputFixture.type,data_kind:nativeInputFixture.data_kind,used:true,status:'observed'};
  const source={record_id:'s',...column};
  const receipts={configure:{source:fields({source_path:destination,connection:'Локальное',encoding:'UTF-8 (65001)',rows_to_skip:'0',first_line_as_title:true}),
    format:fields(request.parameters.settings.format),columns:[column]},
    output_mapping:{source_identity_verified:true,native_mapping:{verified:true,source_identity_verified:true,inventory_complete:true,autosync:true,source_fields:[source],target_fields:[{...column,source}]}},
    finish:{settings_applied:true,mode:'execute',execution_started:true,execution_id:'d:1:2'}};
  const operation={id:request.operation_id,nodeApply:{request,pending:{phase:'read'},phases:Object.entries(receipts).map(([phase,value])=>({phase,status:'verified',receipt_id:request.operation_id+':'+phase,value:{verified:true,cleanup_complete:true,...value}}))}};
  const execution={verified:true,owner_verified:true,cleanup_complete:true,status:'completed',execution_id:'d:1:2',group_id:'2',process_id:'2.1',process_record_id:'3'};
  const ctx={document_id:'d',workflow_ref:prepared.workflow_ref,node:{document_id:'d',workflow_id:'w',node_id:'n'},execution:{status:'completed',execution_id:execution.execution_id}};
  return {fixtureId,operation,ctx,execution,upload,history,verifiedUploads:()=>[upload],uploadHistory:()=>history,exclusiveNodeOperation:()=>true};
}
function ui(){return {row_count:4,sample_rows:4,sample_complete:true,filter_enabled:false,precision:{numbers_verified:true,limitations:[]},limitations:[],
  schema:[{name:'Value',label:'Value',type:'real'}],sample:values.map((value,i)=>[{type:'real',value,is_null:i===0,precision:i===0?'exact_null':'17_significant_digits'}])};}

export async function fake({deferred=false,change,beforeBind,bind=true,afterRelease,fixtureId='real'}={}){
  const fixture=javascriptNativeFixture(fixtureId),values=fixture.values;
  class Workflow{} class Package{}
  const pack=new Package(),workflow=new Workflow();workflow.ParentNode=pack;
  const node={FGuid:'n',FIconCls:'bg-vendor-icon-importtextfile',FStatus:1,FRunning:false,data:{}},port={parent:node,FGuid:'p',FType:1,FSubType:1,FParam:0,FStatus:1};
  node.FPorts=[{FCollection:[6,3].map(FSubType=>({parent:node,FType:0,FSubType,FParam:1,FStatus:1}))},{FCollection:[port]}];
  const child={internalId:3,data:{id:'2.1',Status:3,ErrorDetails:'',ModelNode:node.data},childNodes:[]};
  const group={internalId:2,data:{id:'2',Status:3,ErrorDetails:'',loaded:true},childNodes:[child]};
  const root={internalId:1,data:{loaded:true},childNodes:[group]},processStore={isLoading:()=>false,getRoot:()=>root};
  const counters={sent:0,requests:0,responses:0},callbacks=[];
  let nextId=100;
  const cookieClass=vm.runInNewContext('('+cookieSources.constructor+')');
  Object.defineProperty(cookieClass,'name',{value:'$bg_rpc_TIBGDelegateConnectionCookie_Proxy'});
  cookieClass.prototype.$II=vm.runInNewContext('('+cookieSources.interface+')');
  const helper={$FCacheInitialized:true,$FData:{},$FRowCount:fixture.rows};
  const session={$M:{GetDynamicData:()=>{
    const id=++nextId;return {set_StaticDataSize:()=>{},InitializeMethodCallMessage:(...a)=>assert.deepEqual(a,[0,9,321,0]),
      WriteParameter(offset,row){assert.equal(offset,0);this.row=row;},WriteParameter$a:(offset,column)=>assert.deepEqual([offset,column],[8,0]),
      get_MessageID:()=>id,Release:()=>{counters.requests++;afterRelease?.(result);}};}},
    DispatchMessageAsync(request,exceptions){assert.equal(exceptions,false);counters.sent++;
      const value=values[request.row],utf8=typeof value==='string'?new TextEncoder().encode(value):null;
      const bytes=new Uint8Array(Math.max(60,utf8?.length?28+utf8.length:60)),view=new DataView(bytes.buffer);
      view.setInt16(12,value===null?1:fixtureId==='real'?5:fixtureId==='boolean'?11:8,true);
      if(value!==null){
        if(fixtureId==='real')view.setFloat64(14,value,true);
        if(fixtureId==='boolean')bytes[14]=value?1:0;
        if(fixtureId==='string'){view.setInt32(22,utf8.length,true);if(utf8.length){view.setUint16(26,65001,true);bytes.set(utf8,28);}}
      }
      const response={$FData:bytes,$FDataSize:bytes.length,get_MessageType:()=>1,get_MessageID:()=>request.get_MessageID(),set_StaticDataSize:()=>{},Release:()=>counters.responses++};
      return {continueWith:callback=>{
        const complete=error=>{change?.(result,response);callback({getAwaitedResult:()=>{if(error)throw Error('transport lost');return response;}});};
        if(typeof deferred==='function'?deferred():deferred)callbacks.push(complete);else complete();
      }};
    }};
  node.data.$S=session;
  helper.$FDataChangeCookie=Object.assign(Object.create(cookieClass.prototype),{$S:session,$FRefCount:1,$:{$OW:0,$O:10,$I:206,$RRC:1}});
  helper.$FStateChangeCookie=Object.assign(Object.create(cookieClass.prototype),{$S:session,$FRefCount:1,$:{$OW:0,$O:11,$I:206,$RRC:1}});
  const ds={$S:session,$:{'$I':116,'$OW':0,'$O':9},$FHelper:helper};helper.FBaseProxy=ds;
  const store={loading:false,proxy:{dataSource:ds,read(){}}},dt={FDataSource:ds,FDataSourceStore:store,FTotalRowCount:fixture.rows};
  const dc={FModelNode:node.data,FDataSource:ds,FDataTable:dt,FColumnInfosStore:{data:{items:[{data:{Name:'Value',DisplayName:'Value',DataType:fixture.native_type}}]}},PrepareColumnInfoAndRowCount(){},InitOutput(){}};
  const tab={classList:{contains:()=>true}},preview={id:'preview',checkVisibility:()=>true},tree={id:'tree'};
  const document={querySelector:q=>q.includes('ConsoleForm')?tree:q.includes('DataSetForm')?preview:tab};
  const manager={FPreviewVisible:true,FPreviewForm:{FCurrentPreviewNode:node,FCurrentPreviewPort:port},FShowDataLastCall:{Node:node,Port:port}};
  const model={FPreviewManager:manager,FCreateDraggedNodeStarted:false,FDraggingOverGraph:false,FDiagram:{FNodes:{FCollection:[node]},FLinks:{FCollection:[]}}};
  const card={Controller:{Node:{data:{node:workflow}},FController:model}};
  const env={Object,document,location:{origin:'http://test'},bg:{rpc:{TIBGDelegateConnectionCookie_Proxy:cookieClass},app:{Version:'7.4.2',WorkFlowTreeNode:Workflow,PackageTreeNode:Package,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>card}}}}}}},
    Ext:{getCmp:id=>id==='preview'?{Controller:dc}:{getStore:()=>processStore}},Uint8Array,DataView,TextDecoder,TextEncoder,setTimeout,clearTimeout};
  env.__loginomDockPreparationV1={document,id:'d',receipts:new Map([['r',{phase:'verified',workflowId:'w',tab,nodeTargetWorkflowNode:workflow,packageNode:pack}]])};
  env.__loginomJavascriptNativeRuntimeV1={document,binding_id:'binding',check:s=>assert.equal(s,session)};
  const context=vm.createContext(env),page={evaluate:(fn,arg)=>{context.arg=arg;return vm.runInContext('('+fn.toString()+')(arg)',context);}};
  // A separate executor realm deliberately has no module imports/closures.
  const execute=code=>vm.runInNewContext('('+code+')(page)',{page});
  const b={...(fixtureId==='real'?{}:{fixture_id:fixtureId}),binding_id:'binding',runtime_binding_id:'binding',package_id:'pkg',method:321,interface:116,port:0,offset:0,rows:fixture.rows,columns:[0],
    execution:{status:'completed',execution_id:'d:1:2'},completed_child:{group_id:'2',process_id:'2.1',process_record_id:'3'},document_id:'d',workflow_id:'w',tab_tid:'tab',prefix:'TF',node_id:'n',port_guid:'p',origin:'http://test',
    schema:[{name:'Value',label:'Value',type:fixture.native_type}],row_count:fixture.rows,deadline:Date.now()+30000};
  const result={page,execute,env,context,b,node,port,root,group,child,helper,dc,dt,store,model,session,counters,callbacks};
  beforeBind?.(result);
  if(bind)result.b=await execute(javascriptNativeInputCode(b));
  return result;
}

const optionalInputMutations={
  missingConnection:f=>f.node.FPorts[0].FCollection.shift(),
  missingVariables:f=>f.node.FPorts[0].FCollection.pop(),
  missingAll:f=>f.node.FPorts[0].FCollection=[],
  extra:f=>f.node.FPorts[0].FCollection.push({...f.node.FPorts[0].FCollection[0]}),
  duplicate:f=>f.node.FPorts[0].FCollection[1]=f.node.FPorts[0].FCollection[0],
  dataInput:f=>f.node.FPorts[0].FCollection[0].FSubType=1,
  reordered:f=>f.node.FPorts[0].FCollection.reverse(),
  foreignGroup:f=>f.node.FPorts.push({FCollection:[]}),
  notArray:f=>f.node.FPorts[0].FCollection={length:2},
  sparse:f=>delete f.node.FPorts[0].FCollection[1],
  ...Object.fromEntries([0,1].flatMap(i=>[
    ['foreign'+i,f=>f.node.FPorts[0].FCollection[i].parent={}],
    ...Object.entries({FType:1,FSubType:0,FParam:0,FStatus:0}).map(([key,value])=>[key+i,f=>f.node.FPorts[0].FCollection[i][key]=value]),
    ['missingStatus'+i,f=>delete f.node.FPorts[0].FCollection[i].FStatus]
  ]))
};
const optionalInputReplacements={
  connection:f=>f.node.FPorts[0].FCollection[0]={...f.node.FPorts[0].FCollection[0]},
  variables:f=>f.node.FPorts[0].FCollection[1]={...f.node.FPorts[0].FCollection[1]},
  inventory:f=>f.node.FPorts[0].FCollection=[...f.node.FPorts[0].FCollection],
  collection:f=>f.node.FPorts[0]={...f.node.FPorts[0]},
  groups:f=>f.node.FPorts=[...f.node.FPorts]
};
for(const [name,change]of Object.entries(optionalInputMutations))test('initial admission refuses optional input '+name,async()=>{
  let fixture;
  await assert.rejects(()=>fake({beforeBind:f=>{fixture=f;change(f);}}),error=>{
    assert.deepEqual(JSON.parse(error.message.split('NI1 ')[1]).f,['inputs']);return true;
  });
  assert.equal(fixture.counters.sent,0);assert.equal(fixture.env.__loginomJavascriptNativeInputBindingV1,undefined);
});
for(const [name,change]of Object.entries({...optionalInputMutations,...optionalInputReplacements})){
  test('before native dispatch refuses optional input '+name,async()=>{
    const f=await fake();change(f);await assert.rejects(()=>readJavascriptNativeInput(f.page,f.b,decodeVariantFrame));
    assert.deepEqual(f.counters,{sent:0,requests:0,responses:0});
  });
  test('after native response refuses optional input '+name+' and releases buffers',async()=>{
    const f=await fake({change});await assert.rejects(()=>readJavascriptNativeInput(f.page,f.b,decodeVariantFrame));
    assert.deepEqual(f.counters,{sent:1,requests:1,responses:1});
    const status=await javascriptNativeInputStatus(f.page);
    assert.equal(status.retired,true);assert.equal(status.pending,0);assert.equal(status.published,false);
    await assert.rejects(()=>readJavascriptNativeInput(f.page,f.b,decodeVariantFrame),/retired/);
    assert.equal(f.counters.sent,1);
  });
}
for(const [name,afterRelease]of Object.entries(optionalInputReplacements))test('same-value optional input replacement between cells refuses '+name,async()=>{
  const f=await fake({afterRelease});await assert.rejects(()=>readJavascriptNativeInput(f.page,f.b,decodeVariantFrame),/stale owner\/schema\/cache before read/);
  assert.deepEqual(f.counters,{sent:1,requests:1,responses:1});
  const status=await javascriptNativeInputStatus(f.page);assert.equal(status.retired,true);assert.equal(status.published,false);
});
test('observed optional port statuses do not permit any graph link at initial admission',async()=>{
  let fixture;
  await assert.rejects(()=>fake({beforeBind:f=>{fixture=f;f.model.FDiagram.FLinks.FCollection.push({});}}),/input-only topology/);
  assert.equal(fixture.counters.sent,0);assert.equal(fixture.env.__loginomJavascriptNativeInputBindingV1,undefined);
});

for(const [check,change]of Object.entries({
  visible:f=>f.model.FPreviewManager.FPreviewVisible=false,
  node:f=>f.model.FPreviewManager.FPreviewForm.FCurrentPreviewNode={},
  parent:f=>f.port.parent={},
  guid:f=>f.port.FGuid='foreign-private-guid',
  outputs:f=>f.node.FPorts[1].FCollection.push({}),
  output:f=>f.node.FPorts[1].FCollection[0]={...f.port},
  inputs:f=>f.node.FPorts[0].FCollection.push({parent:f.node}),
  type:f=>f.port.FType=0,
  subtype:f=>f.port.FSubType=2,
  param:f=>f.port.FParam=1,
  status:f=>f.port.FStatus=0,
  last_node:f=>f.model.FPreviewManager.FShowDataLastCall.Node={},
  last_port:f=>f.model.FPreviewManager.FShowDataLastCall.Port={}
}))test('serialized binder preserves refusal and identifies '+check,async()=>{
  let fixture;
  await assert.rejects(()=>fake({beforeBind:f=>{fixture=f;change(f);}}),error=>{
    const diagnostic=JSON.parse(error.message.split('NI1 ')[1]);
    assert.deepEqual(diagnostic.f,[check]);
    assert.ok(error.message.length<400);assert.ok(!error.message.includes('foreign-private-guid'));return true;
  });
  assert.deepEqual(fixture.counters,{sent:0,requests:0,responses:0});
  assert.equal(fixture.env.__loginomJavascriptNativeInputBindingV1,undefined);
});
test('refused inventory diagnostic is bounded, contains no data or getter evaluation',async()=>{
  let getterCalls=0;
  await assert.rejects(()=>fake({beforeBind:f=>{
    f.node.FPorts[0].FCollection=Array.from({length:100},(_,i)=>({parent:i?{}:f.node,FType:i?999:0,
      FSubType:i===0?2:i===1?3:'private payload',FParam:0,data:{secret:'private payload'}}));
    Object.defineProperty(f.node.FPorts[0].FCollection[2],'FSubType',{get(){getterCalls++;return 1;}});
    f.port.FParam='private payload';
  }}),error=>{
    const diagnostic=JSON.parse(error.message.split('NI1 ')[1]);
    assert.equal(diagnostic.n,'>4');assert.equal(diagnostic.i.length,4);
    assert.deepEqual(diagnostic.i.map(p=>p[2]),['2','3','missing','other']);
    assert.equal(diagnostic.o,'other');assert.ok(!error.message.includes('private payload'));
    assert.ok(error.message.length<400);return true;
  });
  assert.equal(getterCalls,0);
});

// Source-backed possible shape, deliberately NOT an observation of helper cookies.
// rtl.imp.js Out.$ -> rpc.js proxy {$S,$FRefCount,$}; no getters/native calls.
function cookieStructureFixture(f,kind){
  function Out(){}
  function $bg_rpc_TIBGDelegateConnectionCookie_Proxy(){}
  for(let i=0;i<20;i++)f.session['private-field-'+i]='private-cookie-value';
  const wrapper=new Out(),proxy=new $bg_rpc_TIBGDelegateConnectionCookie_Proxy();
  Object.assign(proxy,{$S:f.session,$FRefCount:1,$:{$OW:0,$O:10,$I:206,$RRC:1}});
  wrapper.$=proxy;f.helper[kind==='d'?'$FDataChangeCookie':'$FStateChangeCookie']=wrapper;
}
const cookieChanges={
  foreignSession:c=>c.$S={},missingSession:c=>delete c.$S,
  extraField:c=>c.extra='private-cookie-value',missingField:c=>delete c.$FRefCount,
  extraIdentity:c=>c.$.extra=0,missingIdentity:c=>delete c.$.$O,
  unknownClass:c=>Object.setPrototypeOf(c,{}),identityPrototype:c=>Object.setPrototypeOf(c.$,null),
  sessionAccessor:c=>Object.defineProperty(c,'$S',{get(){throw Error('getter invoked');}}),
  identityAccessor:c=>Object.defineProperty(c,'$',{get(){throw Error('getter invoked');}}),
  scalarAccessor:c=>Object.defineProperty(c.$,'$O',{get(){throw Error('getter invoked');}}),
  symbolField:c=>c[Symbol('private-cookie-value')]=1,
  symbolIdentity:c=>c.$[Symbol('private-cookie-value')]=1,
  unknownInterface:c=>c.$.$I=207,negativeOwner:c=>c.$.$OW=-1,
  overflowObject:c=>c.$.$O=2147483648,negativeRemoteRefs:c=>c.$.$RRC=-1,
  invalidLocalRefs:c=>c.$FRefCount=NaN,stringValue:c=>c.$.$O='10',fractionalValue:c=>c.$.$O=1.5,
  negativeZeroOwner:c=>c.$.$OW=-0,negativeZeroObject:c=>c.$.$O=-0,
  negativeZeroRemoteRefs:c=>c.$.$RRC=-0,negativeZeroLocalRefs:c=>c.$FRefCount=-0,
  ownerValue:c=>c.$.$OW++,objectValue:c=>c.$.$O++,remoteRefValue:c=>c.$.$RRC++,localRefValue:c=>c.$FRefCount++
};
const cookieReplacements={
  proxy:(c,f,key)=>f.helper[key]=Object.assign(Object.create(Object.getPrototypeOf(c)),c),
  identity:c=>c.$={...c.$},
  class:(c,f)=>f.env.bg.rpc.TIBGDelegateConnectionCookie_Proxy=function(){},
  interfaceFunction:(c,f)=>f.env.bg.rpc.TIBGDelegateConnectionCookie_Proxy.prototype.$II=function(){return 206;}
};
for(const key of ['$FDataChangeCookie','$FStateChangeCookie']){
  for(const [name,mutate]of Object.entries({...cookieChanges,...cookieReplacements})){
    const change=f=>mutate(f.helper[key],f,key);
    test('direct cookie before dispatch rejects '+key+'/'+name,async()=>{
      const f=await fake();change(f);
      await assert.rejects(()=>readJavascriptNativeInput(f.page,f.b,decodeVariantFrame),error=>{
        assert.ok(!error.message.includes('getter invoked'));return true;
      });
      assert.deepEqual(f.counters,{sent:0,requests:0,responses:0});
    });
    test('direct cookie after response rejects '+key+'/'+name+' and releases',async()=>{
      const f=await fake({change});
      await assert.rejects(()=>readJavascriptNativeInput(f.page,f.b,decodeVariantFrame),error=>{
        assert.ok(!error.message.includes('getter invoked'));return true;
      });
      assert.deepEqual(f.counters,{sent:1,requests:1,responses:1});
      const state=await javascriptNativeInputStatus(f.page);assert.equal(state.retired,true);assert.equal(state.pending,0);assert.equal(state.published,false);
    });
    if(name.endsWith('Value')||Object.hasOwn(cookieReplacements,name))continue;
    test('direct cookie initial admission rejects '+key+'/'+name,async()=>{
      await assert.rejects(()=>fake({beforeBind:change}),error=>{
        assert.match(error.message,/NC1 /);assert.ok(!error.message.includes('getter invoked'));return true;
      });
    });
  }
  for(const [name,mutate]of Object.entries(cookieReplacements))test('direct cookie same-value replacement between cells rejects '+key+'/'+name,async()=>{
    const f=await fake({afterRelease:f=>mutate(f.helper[key],f,key)});
    await assert.rejects(()=>readJavascriptNativeInput(f.page,f.b,decodeVariantFrame));
    assert.deepEqual(f.counters,{sent:1,requests:1,responses:1});assert.equal((await javascriptNativeInputStatus(f.page)).published,false);
  });
}
test('direct cookie binds loaded constructor/interface text without invoking either or walking session',async()=>{
  const f=await fake({beforeBind:f=>{
    Object.defineProperty(f.session,'unrelatedGetter',{get(){throw Error('session walked');}});
    f.session.cycle=f.session;
  }});
  assert.deepEqual(clone(f.b.cookie_sources),cookieSources);
  assert.equal(Object.keys(verifyNativeInputCookieRuntime(f.b.cookie_sources)).length,2);
  const result=await readJavascriptNativeInput(f.page,f.b,decodeVariantFrame);
  assert.equal(result.cells.length,4);assert.equal(result.consistency,'observed_local_only');assert.equal(result.atomic_snapshot_verified,false);
  assert.deepEqual(f.counters,{sent:4,requests:4,responses:4});
  for(const bad of [undefined,{}, {...cookieSources,extra:'x'}, {...cookieSources,interface:cookieSources.interface.replace('206','207')},
    {...cookieSources,constructor:cookieSources.constructor+' '}])assert.throws(()=>verifyNativeInputCookieRuntime(bad),/runtime changed/);
});
for(const mode of ['inactive-inputs','all-checks','oversized-control','cookie-data','cookie-state','cookie-both'])test('production node error transport and journal preserve compact inventory: '+mode,async t=>{
  const directory=await mkdtemp(join(tmpdir(),'javascript-native-error-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const journal=createExecutionJournal({directory,metadata:{sessionId:'test',clientRevision:'test'},knownSecrets:['private-secret']});
  const f=await fake({bind:false,beforeBind:f=>{
    // Default statuses are the observed 1; zero here is deliberately invalid.
    if(mode==='inactive-inputs')f.node.FPorts[0].FCollection.forEach(p=>p.FStatus=0);
    if(mode==='all-checks'){
      const manager=f.model.FPreviewManager;
      manager.FPreviewVisible=false;manager.FPreviewForm.FCurrentPreviewNode={};manager.FShowDataLastCall={};
      Object.assign(f.port,{parent:{},FGuid:'foreign',FType:0,FSubType:0,FParam:'private-secret',FStatus:0});
      f.node.FPorts[1].FCollection=[];
      f.node.FPorts[0].FCollection=Array.from({length:5},()=>({parent:{}}));
    }
    if(mode==='cookie-data'||mode==='cookie-both')cookieStructureFixture(f,'d');
    if(mode==='cookie-state'||mode==='cookie-both')cookieStructureFixture(f,'s');
  }});
  const evaluate=f.page.evaluate;
  f.page.evaluate=async(...args)=>{
    try{return await evaluate(...args);}catch(error){
      // Browser boundary only: actual production transport below must truncate
      // the Playwright-style prefix+message+stack, never a test copy of slice().
      throw Error('page.evaluate: Error: '+error.message+'\n    at javascriptNativeInputSnapshot (eval at <anonymous>)'.repeat(30));
    }
  };
  const workflow={workflow_id:'w',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]};
  Object.assign(f.b,{prefix:workflow.prefix,tab_tid:workflow.tab_tid});
  const graph={complete:true,document_id:'d',workflow_ref:workflow,nodes:[],links:[],foreign_links:[]};
  const adapter={observe:async()=>structuredClone(graph),preflight:async()=>{},
    positionMatches:(n,p)=>JSON.stringify(n.position)===JSON.stringify(p),reconcile:async()=>({verified:true,cleanup_complete:true}),
    mutate:async e=>{assert.equal(e.kind,'create');graph.nodes.push({ref:{document_id:'d',workflow_id:'w',node_id:'n'},
      type:e.parameters.type,label:'NativeInput',position:e.parameters.position,inputs:[],outputs:[0]});return {status:'SUCCEEDED',cleanup_complete:true};}};
  const ok=async()=>({verified:true,cleanup_complete:true,effect_possible:false});
  const transport=[];
  const runtime=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},
    execute:async code=>{
      const value=await f.execute(code);transport.push(clone(value));
      return parseCapabilityResult({content:[{type:'text',text:JSON.stringify(value)}]});
    },nodeTargetAdapterFactory:()=>adapter,
    nodeApplyHandlers:new Map([['imports.text',{revision:'1',modes:['delimited'],validate:()=>{},configure:ok}]]),
    nodeApplyDriverFactory:context=>({verifySource:ok,mapPorts:ok,openWizard:ok,verifyContinuation:async()=>true,
      finish:async()=>({...await ok(),mode:'execute',execution_started:true,execution_id:'d:1:2'}),
      waitExecution:async()=>({...await ok(),status:'completed',execution_id:'d:1:2'}),
      readOutput:()=>context.execute(mode==='oversized-control'
        ?'async page=>{throw Error("X".repeat(700))}' :javascriptNativeInputCode(f.b))}),onRecord:journal});
  const result=await runtime.runNodeApply({operation_id:'apply',contract_revision:'1.0.0',document_id:'d',workflow_ref:workflow,
    target:{kind:'new',type:'imports.text',label:'NativeInput',position:{x:320,y:280}},inputs:[],mode:'delimited',parameters:{},mappings:[],finish:'execute',
    read:{ports:[0],sample_rows:4,require_exact_numbers:true},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}});
  assert.equal(result.status,'AMBIGUOUS');assert.equal(result.output.pending_phase,'read');assert.equal(result.error.code,'NODE_APPLY_STOPPED');
  assert.equal(transport.length,1);assert.equal(transport[0].error.code,'NODE_APPLY_TRANSPORT');
  assert.equal(transport[0].error.message.length,500);assert.equal(result.error.message,transport[0].error.message);
  assert.equal(result.output.error.message,result.error.message);
  const recorded=readFileSync(join(directory,'execution-events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  const final=recorded.findLast(e=>e.phase==='completed');assert.equal(final.outcome.error.message,result.error.message);
  assert.equal(final.outcome.output.error.message,result.error.message);
  if(mode==='oversized-control'){assert.equal(result.error.message,'X'.repeat(500));return;}
  const marker=mode.startsWith('cookie-')?'NC1 ':'NI1 ';
  const message=result.error.message.split('\n')[0];assert.ok(message.startsWith('page.evaluate: Error: Native input binding: '+marker));
  assert.ok(message.length<400);assert.ok(!result.error.message.includes('private-secret'));
  const diagnostic=JSON.parse(message.split(marker)[1]);
  if(mode.startsWith('cookie-')){
    const kind=mode==='cookie-state'?'s':'d';
    assert.equal(diagnostic.k,kind);assert.equal(diagnostic.r,'class');assert.equal(diagnostic.z,0);assert.equal(diagnostic.n,'-');
    const expected=[['Out','-o------','1'],['DelegateProxy','-oon----','3'],['Object','----nnnn','4']];
    assert.deepEqual(diagnostic[kind],expected);
    if(mode==='cookie-both')assert.deepEqual(diagnostic.s,expected);
    assert.equal(diagnostic.h,'Object');
    assert.ok(!result.error.message.includes('private-cookie-value'));assert.ok(!result.error.message.includes('private-field'));
  }
  if(mode==='inactive-inputs')assert.deepEqual(diagnostic,{n:'2',i:[[true,'0','6','1','0'],[true,'0','3','1','0']],o:'0',f:['inputs']});
  if(mode==='all-checks'){
    assert.deepEqual(diagnostic,{n:'>4',i:Array.from({length:4},()=>[false,'missing','missing','missing','missing']),o:'other',
      f:['visible','node','parent','guid','outputs','output','inputs','type','subtype','param','status','last_node','last_port']});
  }
  assert.deepEqual(f.counters,{sent:0,requests:0,responses:0});assert.equal(f.env.__loginomJavascriptNativeInputBindingV1,undefined);
});
test('immutable33-byte fixture and explicit marker/request',()=>{
  const bytes=readFileSync(new URL('./fixtures/javascript-native-input-real.csv',import.meta.url));assert.deepEqual(verifyNativeInputFixture(bytes),nativeInputFixture);
  assert.throws(()=>verifyNativeInputFixture(Buffer.from(bytes.toString().replace('__JS_NULL__',''))));
  const p=sourceEvidence().operation.nodeApply.request;assert.equal(p.parameters.settings.columns[0].type,'real');assert.equal(p.finish,'execute');assert.deepEqual(p.inputs,[]);
  assert.equal(p.parameters.settings.format.null_marker,'__JS_NULL__');
});
test('complete typed UI evidence has no native precision claim',()=>assert.equal(verifyNativeInputUi(ui()).native_bytes_verified,false));
for(const [name,change]of Object.entries({partial:x=>x.sample.pop(),filter:x=>x.filter_enabled=true,negativeZero:x=>x.sample[1][0].value=-0,stringNull:x=>x.sample[0][0].value='__JS_NULL__',wrongType:x=>x.schema[0].type='integer',rounded:x=>x.sample[3][0].value=10.13}))
  test('UI rejects '+name,()=>{const x=ui();change(x);assert.throws(()=>verifyNativeInputUi(x));});
test('genuine owning read phases and upload lineage produce input provenance',()=>{const p=nativeInputProvenance(sourceEvidence());assert.equal(p.kind,'owned_import_read_phase');assert.equal(p.external_writers_excluded,false);});
for(const [name,change]of Object.entries({lock:x=>x.exclusiveNodeOperation=()=>false,phase:x=>x.operation.nodeApply.pending.phase='configure',bytes:x=>x.upload.artifact.bytes++,
  uncertainLaterWrite:x=>x.history.records.push({...x.history.records[0],sequence:2,operation_id:'later',transport_uncertain:true}),
  format:x=>{x.operation.nodeApply.request.parameters.settings.format.delimiter=',';x.operation.nodeApply.phases[0].value.format.fields.delimiter.value=',';},
  missingObserved:x=>x.operation.nodeApply.phases[0].value.source.fields.encoding.status='unknown',
  mappedSource:x=>x.operation.nodeApply.phases[1].value.native_mapping.target_fields[0].source={record_id:'foreign'},
  done:x=>x.operation.nodeApply.phases[2].value.mode='done',staleFinish:x=>x.operation.nodeApply.phases[2].value.execution_id='d:1:1',
  execution:x=>x.execution.execution_id='d:1:9',owner:x=>x.execution.owner_verified=false,cleanup:x=>x.execution.cleanup_complete=false}))
  test('private provenance rejects '+name,()=>{const x=sourceEvidence();change(x);assert.throws(()=>nativeInputProvenance(x));});

test('isolated input builder + full native4-cell result reaches host adapter with correct row_count',async()=>{
  const f=await fake(),raw=await readJavascriptNativeInput(f.page,f.b,decodeVariantFrame,{operationId:'read'}),lifecycle=await javascriptNativeInputStatus(f.page);
  assert.equal(raw.row_count,4);assert.equal(raw.cells.length,4);assert.deepEqual(f.counters,{sent:4,requests:4,responses:4});
  const exact=verifyNativeInputRead(raw,{binding:{...f.b,read_id:'read'},lifecycle,provenance:nativeInputProvenance(sourceEvidence())});
  assert.equal(exact.coverage.table_complete,true);assert.equal(exact.native_bytes_verified,true);assert.equal(exact.js_created,false);assert.equal(exact.g5_complete,false);
  assert.deepEqual(clone(exact.cells.map(c=>c.native.bytes_le??null)),[null,'0000000000000000','000000000000f4bf','0000000000402440']);
  assert.equal(exact.consistency.unobserved_aba_excluded,false);
  for(const mutate of [x=>x.cells.pop(),x=>x.cells[3].payload[2]=1,x=>x.cells[1].message_id=x.cells[0].message_id,x=>x.row_count=undefined]){
    const bad=clone(raw);mutate(bad);assert.throws(()=>verifyNativeInputRead(bad,{binding:{...f.b,read_id:'read'},lifecycle,provenance:nativeInputProvenance(sourceEvidence())}));
  }
});
test('serialized runtime builder invokes supplied collector in isolated executor/browser realms; host rejects fake hashes',async()=>{
  const f=await fake();delete f.env.__loginomJavascriptNativeRuntimeV1;
  const klass=function(){},task=function(){},completion=function(){};
  Object.assign(klass,nativeRuntimePins.constants);f.env.rpc={TBGMessageDynamicData:klass};f.env.BitConverter={};f.env.ss={Task:task,TaskCompletionSource:completion};
  Object.assign(f.session,{$FDisposed:false,$FPendingDisconnect:false,$FTransportStatus:0,$T:{FFinished:false,FDisconnected:false,$FSocket:{readyState:1}}});
  const owners={session:f.session,manager:f.session.$M,message:klass.prototype,class:klass,transport:f.session.$T,bit:f.env.BitConverter,task:task.prototype,completion:completion.prototype};
  for(const name of Object.keys(nativeRuntimePins.functions)){const [prefix,key]=name.split('.');owners[prefix][key]=function pinnedStub(){};}
  const proof=await f.execute(javascriptNativeRuntimeCode(f.b));assert.equal(proof.binding_id,'binding');
  assert.equal(Object.keys(proof.sources).length,Object.keys(nativeRuntimePins.functions).length);
  assert.throws(()=>verifyLoadedNativeRuntime(proof,f.b),/implementation differs/);
  await assert.rejects(()=>f.execute(javascriptNativeRuntimeCode(f.b)),/already bound/);
});

for(const [name,change]of Object.entries({extraJS:f=>f.model.FDiagram.FNodes.FCollection.push({FIconCls:'bg-vendor-icon-javascript'}),edge:f=>f.model.FDiagram.FLinks.FCollection.push({}),
  recreatedNode:f=>f.model.FDiagram.FNodes.FCollection[0]={...f.node},port:f=>f.port.FGuid='other',rows:f=>f.dt.FTotalRowCount=3,
  schema:f=>f.dc.FColumnInfosStore.data.items[0].data.DataType=4,session:f=>f.node.data.$S={},cache:f=>f.helper.$FData={},
  dataCookie:f=>f.helper.$FDataChangeCookie.$.$O++,stateCookie:f=>f.helper.$FStateChangeCookie.$.$O++,
  processHierarchy:f=>{f.group.childNodes=[];f.root.childNodes.push(f.child);},
  processRoot:f=>f.root.internalId=4,processRecord:f=>f.child.internalId=4,newExecution:f=>f.root.childNodes.push({internalId:7,data:{id:'3.1',ModelNode:f.node.data},childNodes:[]})})){
  test('before dispatch refuses '+name,async()=>{const f=await fake();change(f);await assert.rejects(()=>readJavascriptNativeInput(f.page,f.b,decodeVariantFrame));assert.equal(f.counters.sent,0);});
  test('after response refuses '+name+' and releases both buffers',async()=>{const f=await fake({change});await assert.rejects(()=>readJavascriptNativeInput(f.page,f.b,decodeVariantFrame));assert.deepEqual(f.counters,{sent:1,requests:1,responses:1});assert.equal((await javascriptNativeInputStatus(f.page)).retired,true);});
}
for(const cancelled of [true,false])test((cancelled?'cancel':'deadline')+' retires, forbids replay, releases late response',async()=>{
  const f=await fake({deferred:true}),p=readJavascriptNativeInput(f.page,f.b,decodeVariantFrame,{operationId:'once',timeoutMs:cancelled?1000:5});
  const rejection=assert.rejects(p,/native cancellation unproven/);
  if(cancelled)assert.equal((await cancelJavascriptNativeInput(f.page,'once')).cancelled,true);await rejection;
  assert.equal((await javascriptNativeInputStatus(f.page)).pending,1);assert.equal(f.counters.requests,0);
  await assert.rejects(()=>readJavascriptNativeInput(f.page,f.b,decodeVariantFrame),/retired/);
  f.callbacks.shift()();await new Promise(resolve=>setTimeout(resolve,0));const state=await javascriptNativeInputStatus(f.page);
  assert.equal(state.retired,true);assert.equal(state.pending,0);assert.equal(state.published,false);assert.equal(state.nativeCancelled,false);assert.equal(state.lateResponses,1);
  assert.deepEqual(f.counters,{sent:1,requests:1,responses:1});
});
test('overlap/foreign cancellation cannot take over native operation; transport failure retires',async()=>{
  const f=await fake({deferred:true}),p=readJavascriptNativeInput(f.page,f.b,decodeVariantFrame,{operationId:'owned'});const rejection=assert.rejects(p,/transport lost/);
  assert.equal((await cancelJavascriptNativeInput(f.page,'foreign')).cancelled,false);
  await assert.rejects(()=>readJavascriptNativeInput(f.page,f.b,decodeVariantFrame),/busy/);f.callbacks.shift()(true);await rejection;
  assert.equal((await javascriptNativeInputStatus(f.page)).retired,true);assert.deepEqual(f.counters,{sent:1,requests:1,responses:0});
});
test('completed ID cannot replay and tight byte budget dispatches nothing',async()=>{
  const f=await fake();await assert.rejects(()=>readJavascriptNativeInput(f.page,f.b,decodeVariantFrame,{maxBytes:60}),/byte budget/);assert.equal(f.counters.sent,0);
  await readJavascriptNativeInput(f.page,f.b,decodeVariantFrame,{operationId:'once'});
  await assert.rejects(()=>readJavascriptNativeInput(f.page,f.b,decodeVariantFrame,{operationId:'once'}),/reused/);assert.equal(f.counters.sent,4);
  await assert.rejects(()=>readJavascriptNativeInput(f.page,f.b,decodeVariantFrame,{operationId:'new-id'}),/binding reused/);assert.equal(f.counters.sent,4);
});
test('expired parent deadline cannot dispatch even with a fresh child timeout',async()=>{const f=await fake();f.b.deadline=Date.now()-1;await assert.rejects(()=>readJavascriptNativeInput(f.page,f.b,decodeVariantFrame,{timeoutMs:30000}),/deadline/);assert.equal(f.counters.sent,0);});

test('private support executes/reads only once and publishes native proof after owning UI read',async()=>{
  const x=sourceEvidence(),calls=[];let output;
  const support=createJavascriptNativeInputSupport({onState:async()=>{},onProof:async p=>{calls.push('proof');output=p;},
    createSupport:()=>({nodeApplyDriverFactory:()=>({verifySource:async()=>calls.push('source'),finish:async()=>calls.push('execute'),waitExecution:async()=>x.execution,
      readOutput:async()=>{calls.push('ui');return {ports:[ui()]};}})}),
    readNative:async({options,provenance})=>{assert.equal(options,x);assert.equal(provenance.execution.execution_id,x.execution.execution_id);calls.push('native');return {verified:true};}});
  const driver=support.nodeApplyDriverFactory(x);await driver.verifySource(x.operation.nodeApply.request.parameters);await driver.finish('execute',x.ctx);await driver.waitExecution(x.ctx);
  const result=await driver.readOutput({ports:[0]},x.ctx);assert.deepEqual(calls,['source','execute','ui','native','proof']);assert.deepEqual(result,output.ui);
  await assert.rejects(()=>driver.finish('execute',x.ctx),/one import/);await assert.rejects(()=>driver.readOutput({},x.ctx),/no replay/);
});
test('lost native reply cannot publish proof or replay import/read',async()=>{
  const x=sourceEvidence();let published=false,attempts=0;
  const support=createJavascriptNativeInputSupport({onProof:async()=>{published=true;},createSupport:()=>({nodeApplyDriverFactory:()=>({finish:async()=>{},waitExecution:async()=>x.execution,readOutput:async()=>({ports:[ui()]})})}),
    readNative:async()=>{attempts++;throw Error('lost reply');}});
  const d=support.nodeApplyDriverFactory(x);await d.finish('execute',x.ctx);await d.waitExecution(x.ctx);await assert.rejects(()=>d.readOutput({},x.ctx),/lost reply/);
  await assert.rejects(()=>d.readOutput({},x.ctx),/no replay/);await assert.rejects(()=>d.finish('execute',x.ctx),/one import/);assert.equal(attempts,1);assert.equal(published,false);
});
test('production operator rejects incompatible JS flags/batch before browser/config access',async()=>{
  for(const args of [['--execution-case','code-table-execute'],['--create-node'],['--discovery-probe','engine-data-smoke']])
    await assert.rejects(()=>runJavascriptOperator(args,{nativeInputOnly:true}),/Native input-only/);
  await assert.rejects(()=>runJavascriptOperator([],{nativeInputOnly:true,batchCases:['code-table-execute']}),/Native input-only/);
});

// Orchestration tests replace only browser/network boundaries. Actual host
// provenance, native envelope adapter, journal acknowledgement and Close paths run.
async function driverFixture(mode,fixtureId='real'){
  const fixture=javascriptNativeFixture(fixtureId),x=sourceEvidence(fixtureId),f=await fake({fixtureId}),actions=[],events=[],states=[];
  const id='js-native-input-'+createHash('sha256').update(x.operation.id+':'+x.ctx.execution.execution_id).digest('hex').slice(0,40);
  const raw=clone(await readJavascriptNativeInput(f.page,f.b,decodeVariantFrame,{operationId:id}));
  const lifecycle=clone(await javascriptNativeInputStatus(f.page));raw.package_id='d:w';
  const binding={...clone(f.b),binding_id:id,runtime_binding_id:id,package_id:'d:w',count_loader_sources:{},cookie_sources:cookieSources};
  if(mode==='cookie-runtime')binding.cookie_sources={...cookieSources,interface:cookieSources.interface.replace('206','207')};
  Object.assign(x.ctx,{deadline:Date.now()+30000,signal:new AbortController().signal});
  Object.assign(x.ctx.workflow_ref,{tab_tid:'tab',prefix:'TF'});
  const graph={prepared_node_context:{...x.ctx.node,verified:true,surface:'graph'},wizard:{status:'absent'},node_outputs:{verified:true,ports:[{index:0,active:true,tid:'port',port_guid:'p'}]},
    ui:{elements:[{tid:'port',ref:'port',allowed_actions:['click','press']},{tid:'preview;p.h;close',ref:'close',allowed_actions:['click']}]},
    node_preview_schema:{verified:true,port_guid:'p',port:0,root_tid:'preview',fields:[{name:'Value',label:'Value',type:fixture.type}]}};
  Object.assign(x,{now:Date.now,receiptOptions:()=>({}),onRecord:async e=>{events.push(e);return mode==='journal'&&e.phase==='javascript_native_input_cells_verified'?{}:e;},execute:async code=>{
    if(code.includes('function bindJavascriptNativeRuntime'))return {};
    if(code.includes('function bindJavascriptNativeInput')){
      assert.ok(code.includes(JSON.stringify({fixture_id:fixtureId}).slice(1,-1)));
      assert.ok(code.includes('"rows":'+fixture.rows));
      assert.ok(code.includes('"type":'+fixture.native_type));
      if(mode==='binding')return fake({fixtureId,beforeBind:f=>{
        // Observed port kinds, deliberately no invented param/status values.
        f.node.FPorts[0].FCollection=[6,3].map(FSubType=>({parent:f.node,FType:0,FSubType}));
      }});
      return binding;
    }
    if(code.includes('function readJavascriptNativeInput')){actions.push('native');if(mode==='read-and-status')throw Error('lost native reply');return raw;}
    if(code.includes('function javascriptNativeInputStatus')){if(['status','read-and-status'].includes(mode))throw Error('lost status');return lifecycle;}
    throw Error('unexpected execute');
  }});
  const dependencies={verifyFrontends:async()=>Object.entries(nativeFrontendPins).map(([name,sha256])=>({name,url:new URL('/app/bg/'+(name==='SysUtils.js'?'ts/':'js/')+name,'http://test').href,sha256})),
    verifyRuntime:()=>({binding_id:id,document_id:binding.document_id,functions:nativeRuntimePins.functions,constants:nativeRuntimePins.constants}),
    verifyCountLoaders:()=>({PrepareColumnInfoAndRowCount:'d952415558676c3caf569a51d88bf026e661abdaaf08842d870ddba139730e3f',InitOutput:'c01544ac551e88997f9cea9b62314234ad435bc7632357861cdfc6013e89960e',DataSourceProxyRead:'6206671eaf111d80459c3ed1d5878125ef37918fb1abacc1cd19ce42c7fdf91d'}),createProcedure:()=>({
    observe:async({ready})=>{assert.equal(ready(graph),true);return graph;},
    perform:async({ready,resolve,identity})=>{assert.equal(ready(graph),true);assert.ok(identity());const action=resolve(graph);actions.push(action.ref==='close'?'close':action.verb);
      if(mode==='close'&&action.ref==='close')throw Error('close lost');}
  })};
  return {x,actions,events,states,run:()=>readNativeInputDuringImport({fixtureId,options:x,ctx:x.ctx,provenance:nativeInputProvenance(x),targetOrigin:'http://test',targetBuild:'7.4.2',onState:async s=>states.push(s)},dependencies)};
}
test('owning driver journal acknowledgement precedes scoped Close and proof return',async()=>{
  const f=await driverFixture(),proof=await f.run();assert.equal(proof.exact.native_bytes_verified,true);
  assert.deepEqual(f.actions,['click','press','native','close']);assert.deepEqual(f.events.map(e=>e.phase),['javascript_native_input_cells_verified','javascript_native_input_preview_closed']);
  assert.equal(f.states.at(-1).releasedResponses,4);
});
for(const fixtureId of ['real','boolean','string'])for(const wrongAck of [false,true])test(fixtureId+' production journal full proof, disk, secrets and exact ACK: '+wrongAck,async t=>{
  const directory=await mkdtemp(join(tmpdir(),'javascript-native-proof-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const journal=createExecutionJournal({directory,metadata:{sessionId:'test',clientRevision:'test'},knownSecrets:['private-secret']});
  const fixture=javascriptNativeFixture(fixtureId),f=await driverFixture(undefined,fixtureId),proofs=[];
  f.x.onRecord=async event=>{
    const saved=await journal(event);
    if(event.phase==='javascript_native_input_cells_verified'){
      assert.equal(JSON.stringify(saved.proof),JSON.stringify(event.proof));proofs.push(event.proof);
      if(wrongAck)saved.proof.lifecycle.releasedResponses=fixture.rows-1;
    }
    return saved;
  };
  if(wrongAck)await assert.rejects(f.run,/native journal acknowledgement differs/);
  if(!wrongAck)assert.deepEqual(await f.run(),proofs[0]);
  const proof=proofs[0];
  assert.deepEqual(Object.keys(proof),['exact','raw','binding','runtime','frontends','subscription_proxy_source_sha256','count_loader_sha256','lifecycle']);
  assert.deepEqual(proof.runtime.functions,nativeRuntimePins.functions);assert.deepEqual(proof.runtime.constants,nativeRuntimePins.constants);
  assert.equal(proof.frontends.length,Object.keys(nativeFrontendPins).length);assert.equal(Object.keys(proof.count_loader_sha256).length,3);
  assert.deepEqual(proof.subscription_proxy_source_sha256,verifyNativeInputCookieRuntime(cookieSources));
  assert.equal(proof.binding.origin,'http://test/');assert.equal(proof.raw.cells.length,fixture.rows);
  assert.equal(proof.lifecycle.releasedRequests,fixture.rows);assert.equal(proof.lifecycle.releasedResponses,fixture.rows);
  const sensitive=await journal({phase:'redaction_check',authorization:'Bearer credential-sentinel',password:'password-sentinel',cookie_runtime_sha256:'legacy-sensitive-key',message:'contains private-secret'});
  for(const key of ['authorization','password','cookie_runtime_sha256'])assert.equal(sensitive[key],'[redacted]');
  assert.ok(!sensitive.message.includes('private-secret'));
  const disk=readFileSync(join(directory,'execution-events.jsonl'),'utf8');
  const records=disk.trim().split('\n').map(line=>JSON.parse(line));
  assert.deepEqual(records.find(e=>e.phase==='javascript_native_input_cells_verified').proof,proof);
  for(const secret of ['credential-sentinel','password-sentinel','legacy-sensitive-key','private-secret'])assert.ok(!disk.includes(secret));
  assert.equal(f.actions.at(-1),'close');
});
test('actual serialized binder diagnostic survives driver refusal and owned Close without native dispatch',async()=>{
  const f=await driverFixture('binding');
  await assert.rejects(f.run,error=>{
    const diagnostic=JSON.parse(error.message.split('NI1 ')[1]);
    assert.deepEqual(diagnostic.f,['inputs']);assert.equal(diagnostic.n,'2');
    assert.deepEqual(diagnostic.i,[6,3].map(subtype=>[true,'0',String(subtype),'missing','missing']));
    return true;
  });
  assert.deepEqual(f.actions,['click','press','close']);assert.deepEqual(f.events.map(e=>e.phase),['javascript_native_input_preview_closed']);
  assert.deepEqual(f.states,[]);
});
test('lost journal acknowledgement refuses proof but still closes only owned Preview',async()=>{
  const f=await driverFixture('journal');await assert.rejects(f.run,/acknowledgement/);assert.equal(f.actions.at(-1),'close');
});
test('changed loaded cookie class source stops owning driver before cells and closes only owned Preview',async()=>{
  const f=await driverFixture('cookie-runtime');await assert.rejects(f.run,/cookie runtime changed/);
  assert.deepEqual(f.actions,['click','press','close']);assert.deepEqual(f.events.map(e=>e.phase),['javascript_native_input_preview_closed']);
});
test('lost Close refuses proof and marks cleanup uncertain',async()=>{
  const f=await driverFixture('close');await assert.rejects(f.run,/close lost/);assert.equal(f.x.operation.transportUncertain,true);assert.equal(f.states.at(-1).uncertain,true);
});
for(const fixtureId of ['real','boolean','string'])for(const mode of ['status','read-and-status'])test(fixtureId+' unknown native lifecycle blocks UI cleanup: '+mode,async()=>{
  const f=await driverFixture(mode,fixtureId);await assert.rejects(f.run,error=>{
    if(mode==='read-and-status'){assert.match(error.observationError.message,/lost native reply/);assert.match(error.cleanupError.message,/lost status/);}return true;
  });assert.ok(!f.actions.includes('close'));assert.equal(f.x.operation.transportUncertain,true);assert.equal(f.states.at(-1).uncertain,true);
});
test('count loader pin verification rejects missing/changed actual source',()=>{
  assert.throws(()=>verifyNativeInputCountLoaders({}),/count loader/);
  assert.throws(()=>verifyNativeInputCountLoaders({PrepareColumnInfoAndRowCount:'function changed(){}'}),/count loader/);
});
