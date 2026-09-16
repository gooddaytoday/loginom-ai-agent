import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readNativeVariant,cancelNativeVariant,nativeVariantStatus} from '../lib/variant-native-read.mjs';import {decodeVariantFrame} from '../lib/variant-native-decode.mjs';
function fake(mode){
 class Workflow{} class Package{};const pack=new Package(),workflow=new Workflow();workflow.ParentNode=pack;
 const node={FGuid:'n',data:{},FStatus:1,FRunning:false},port={parent:node,FGuid:'p',FType:1,FSubType:1,FParam:0,FStatus:1};
 const process={data:{id:'2.1',Status:3,ErrorDetails:'',ModelNode:node.data},internalId:3,childNodes:[]},group={data:{id:'2',Status:3,ErrorDetails:'',loaded:true},internalId:2,childNodes:[process]},root={data:{loaded:true},internalId:1,childNodes:[group]};
 const counters={sent:0,released:0};let finish;const bytes=new Uint8Array(60);new DataView(bytes.buffer).setInt16(12,5,true);new DataView(bytes.buffer).setFloat64(14,1,true);
 const response={$FData:bytes,$FDataSize:60,get_MessageType:()=>1,get_MessageID:()=>mode==='stale-response'?999:101,set_StaticDataSize:()=>{},Release:()=>counters.released++};
 const request={set_StaticDataSize:()=>{},InitializeMethodCallMessage:(o,id,m,t)=>assert.deepEqual([o,id,m,t],[0,9,321,0]),WriteParameter:(o,r)=>assert.deepEqual([o,r],[0,0]),WriteParameter$a:(o,c)=>assert.deepEqual([o,c],[8,0]),get_MessageID:()=>101,Release:()=>counters.released++};
 const helper={$FCacheInitialized:true,$FData:{},$FDataChangeCookie:{},$FStateChangeCookie:{},$FRowCount:1};
 const session={$M:{GetDynamicData:()=>request},DispatchMessageAsync:(r,exceptions)=>{assert.equal(exceptions,false);counters.sent++;return {continueWith:callback=>{if(mode==='deferred'){finish=error=>callback({getAwaitedResult:()=>{if(error)throw Error('transport error');return response;}});return;}if(mode==='changed-cache')helper.$FData={};if(mode==='new-execution')root.childNodes.push({internalId:4,data:{id:'3.1',Status:3,ErrorDetails:'',ModelNode:node.data},childNodes:[]});callback({getAwaitedResult:()=>response});}};}};
 const ds={$:{'$I':116,'$OW':0,'$O':9},$S:session,$FHelper:helper};helper.FBaseProxy=ds;
 const schema=[{Name:'Scalar',DisplayName:'Scalar',DataType:6}];const store={proxy:{dataSource:ds},loading:false};
 const dt={FDataSource:ds,FDataSourceStore:store,FTotalRowCount:1};const dc={FModelNode:node.data,FDataSource:ds,FDataTable:dt,FColumnInfosStore:{data:{items:schema.map(data=>({data}))}}};
 const tab={classList:{contains:()=>true}},preview={id:'preview',checkVisibility:()=>true},tree={id:'tree'};
 const document={querySelector:q=>q.includes('ConsoleForm')?tree:q.includes('DataSetForm')?preview:tab};
 const manager={FPreviewVisible:true,FPreviewForm:{FCurrentPreviewNode:node,FCurrentPreviewPort:port},FShowDataLastCall:{Node:node,Port:port}};
 const sourceNode={FGuid:'source',data:{},FStatus:1,FRunning:false,FIconCls:'bg-vendor-icon-importtextfile',FLabel:{FRawValue:'Source'}};
 node.FLabel={FRawValue:'Target'};node.FIconCls='bg-vendor-icon-columnflipping';
 const sourcePort={parent:sourceNode,FGuid:'sp',FType:1,FSubType:1,FParam:0,FPortIndex:0},inputPort={parent:node,FGuid:'ip',FType:0,FSubType:1,FParam:0,FPortIndex:0};
 sourceNode.FPorts=[{FCollection:[]},{FCollection:[sourcePort]}];node.FPorts=[{FCollection:[inputPort]},{FCollection:[port]}];
 const links=[{FGuid:'edge',FSourcePort:sourcePort,FTargetPort:inputPort}];
 root.childNodes.unshift({internalId:0,data:{id:'1',Status:3,ErrorDetails:'',loaded:true},childNodes:[{internalId:10,data:{id:'1.1',Status:3,ErrorDetails:'',ModelNode:sourceNode.data},childNodes:[]}]});
 const card={Controller:{Node:{data:{node:workflow}},FController:{FPreviewManager:manager,FCreateDraggedNodeStarted:false,FDraggingOverGraph:false,FDiagram:{FNodes:{FCollection:[node,sourceNode]},FLinks:{FCollection:links},FmxGraph:{container:{querySelectorAll:()=>[{dataset:{tid:'TF;Graph;Source|Output_Data-0|Target|Input_Data-0'}}]}}}}}};
 const env={document,location:{origin:'http://test'},bg:{app:{Version:'7.4.2',WorkFlowTreeNode:Workflow,PackageTreeNode:Package,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>card}}}}}}},Ext:{getCmp:id=>id==='preview'?{Controller:dc}:{getStore:()=>({getRoot:()=>root,isLoading:()=>false})}},Uint8Array,DataView,TextDecoder,TextEncoder,setTimeout,clearTimeout};
 env.__loginomDockPreparationV1={document,id:'d',receipts:new Map([['r',{phase:'verified',workflowId:'w',tab,nodeTargetWorkflowNode:workflow,packageNode:pack}]])};
 const b={runtime_binding_id:'test-binding_id',package_id:'pkg',static_source:{node_id:'source',execution_id:'d:1:1'},method:321,interface:116,port:0,offset:0,rows:1,columns:[0],execution:{status:'completed',execution_id:'d:1:2'},document_id:'d',workflow_id:'w',tab_tid:'tab',prefix:'TF',node_id:'n',port_guid:'p',origin:'http://test',source:{owner:0,object:9},schema:[{name:'Scalar',label:'Scalar',type:6}],row_count:1};
 env.__loginomDockCollapseRuntimeV1={document,binding_id:'test-binding_id',check:s=>assert.equal(s,session)};
 const context=vm.createContext(env);
 return {page:{evaluate:(fn,arg)=>{context.arg=arg;return vm.runInContext('('+fn.toString()+')(arg)',context);}},b,counters,sourceNode,node,links,sourcePort,inputPort,root,helper,dc,dt,store,finish:error=>finish(error)};
}
test('fixed321 only and local buffers released',async()=>{const f=fake();const r=await readNativeVariant(f.page,f.b,decodeVariantFrame);assert.equal(r.cells[0].decoded.type,'real');assert.deepEqual(f.counters,{sent:1,released:2});});
for(const mode of ['changed-cache','new-execution','stale-response'])test('reject '+mode+' after response and release buffers',async()=>{const f=fake(mode);await assert.rejects(()=>readNativeVariant(f.page,f.b,decodeVariantFrame));assert.deepEqual(f.counters,{sent:1,released:2});});

for(const kind of ['cancelled','deadline_exceeded'])test(kind+' rejects once, retires session and releases late response',async()=>{
 const f=fake('deferred'),promise=readNativeVariant(f.page,f.b,decodeVariantFrame,{operationId:'x',timeoutMs:kind==='cancelled'?1000:5});
 const rejected=assert.rejects(promise,new RegExp(kind));
 if(kind==='cancelled')assert.equal((await cancelNativeVariant(f.page,'x')).cancelled,true);
 await rejected;
 assert.equal((await nativeVariantStatus(f.page)).pending,1);assert.equal(f.counters.released,0);
 await assert.rejects(()=>readNativeVariant(f.page,f.b,decodeVariantFrame),/retired/);
 f.finish();await new Promise(r=>setTimeout(r,0));
 const status=await nativeVariantStatus(f.page);
 assert.equal(status.status,kind);assert.equal(status.published,false);assert.equal(status.nativeCancelled,false);
 assert.equal(status.pending,0);assert.equal(status.lateResponses,1);assert.equal(status.releasedRequests,1);assert.equal(status.releasedResponses,1);
 assert.deepEqual(f.counters,{sent:1,released:2});
});
test('hung response retains native buffers; cancellation is never cleanup proof',async()=>{
 const f=fake('deferred'),p=readNativeVariant(f.page,f.b,decodeVariantFrame,{timeoutMs:5});await assert.rejects(p,/deadline/);
 const s=await nativeVariantStatus(f.page);assert.equal(s.pending,1);assert.equal(s.releasedRequests,0);assert.equal(s.retired,true);assert.equal(s.nativeCancelled,false);
 f.finish(true);await new Promise(r=>setTimeout(r,0));assert.equal((await nativeVariantStatus(f.page)).pending,0);assert.equal(f.counters.released,1);
});
test('wrong cancellation id and overlapping reader cannot affect current operation',async()=>{
 const f=fake('deferred'),p=readNativeVariant(f.page,f.b,decodeVariantFrame,{operationId:'owned'});
 assert.equal((await cancelNativeVariant(f.page,'foreign')).cancelled,false);
 await assert.rejects(()=>readNativeVariant(f.page,f.b,decodeVariantFrame),/busy/);f.finish();await p;
 assert.equal((await nativeVariantStatus(f.page)).published,true);assert.equal(f.counters.sent,1);
});
test('strong atomic contract fails before fixed RPC',async()=>{
 const f=fake();await assert.rejects(()=>readNativeVariant(f.page,f.b,decodeVariantFrame,{requireAtomicSnapshot:true}),/atomic snapshot unavailable/);assert.equal(f.counters.sent,0);
});
test('completed operation IDs cannot be reused for a new cancellation target',async()=>{
 const f=fake();await readNativeVariant(f.page,f.b,decodeVariantFrame,{operationId:'once'});
 await assert.rejects(()=>readNativeVariant(f.page,f.b,decodeVariantFrame,{operationId:'once'}),/reused/);assert.equal(f.counters.sent,1);
});
test('a native transport failure retires the diagnostic session without claiming server cancellation',async()=>{
 const f=fake('deferred'),p=readNativeVariant(f.page,f.b,decodeVariantFrame);const rejected=assert.rejects(p,/transport error/);f.finish(true);await rejected;
 const s=await nativeVariantStatus(f.page);assert.equal(s.retired,true);assert.equal(s.pending,0);assert.equal(s.nativeCancelled,false);assert.equal(s.releasedRequests,1);assert.equal(s.releasedResponses,0);
 await assert.rejects(()=>readNativeVariant(f.page,f.b,decodeVariantFrame),/retired/);
});

test('byte budget refuses before dispatch/append and never publishes over limit',async()=>{
 const tiny=fake();await assert.rejects(()=>readNativeVariant(tiny.page,tiny.b,decodeVariantFrame,{maxBytes:60}),/byte budget/);assert.equal(tiny.counters.sent,0);
 const append=fake();await assert.rejects(()=>readNativeVariant(append.page,append.b,decodeVariantFrame,{maxBytes:JSON.stringify(append.b).length+10}),/byte budget/);const s=await nativeVariantStatus(append.page);assert.equal(s.published,false);assert.equal(s.pending,0);assert.equal(append.counters.released,2);
});

for(const [name,change] of [['source deactivated',f=>f.sourceNode.FStatus=0],['source running',f=>f.sourceNode.FRunning=true],['source execution newer',f=>f.root.childNodes.push({internalId:11,data:{id:'4.1',Status:3,ErrorDetails:'',ModelNode:f.sourceNode.data},childNodes:[]})],['foreign source proof',f=>f.b.static_source.node_id='foreign']])test('private static guard rejects '+name+' before native dispatch',async()=>{const f=fake();change(f);await assert.rejects(()=>readNativeVariant(f.page,f.b,decodeVariantFrame));assert.equal(f.counters.sent,0);});

function empty(){const f=fake();Object.assign(f.b,{rows:0,row_count:0});f.helper.$FRowCount=0;f.helper.$FCacheInitialized=false;f.helper.$FData=null;f.dc.FTotalRowCount=0;f.dt.FTotalRowCount=0;Object.assign(f.store,{totalCount:0,pageRequests:{}});Object.assign(f.store.proxy,{FTotalRowCount:0,FDataFieldNames:['Scalar'],FValueGetters:[()=>{}],pendingOperations:{}});return f;}
test('zero native read requires completed count plus all schema fields, makes no RPC',async()=>{const f=empty(),r=await readNativeVariant(f.page,f.b,decodeVariantFrame);assert.equal(r.empty_count_attested,true);assert.equal(r.cells.length,0);assert.equal(f.counters.sent,0);assert.equal((await nativeVariantStatus(f.page)).published,true);});
for(const [name,change] of [['missing fetched count',f=>delete f.store.proxy.FTotalRowCount],['pending count',f=>f.store.proxy.pendingOperations.x={}],['pending page',f=>f.store.pageRequests.x={}],['unknown field mapping',f=>f.store.proxy.FDataFieldNames=[]],['nonzero server count',f=>f.dc.FTotalRowCount=1]])test('zero native read rejects '+name,async()=>{const f=empty();change(f);await assert.rejects(()=>readNativeVariant(f.page,f.b,decodeVariantFrame));assert.equal(f.counters.sent,0);});

for(const [name,change] of [['51 rows',b=>{b.rows=51;b.row_count=51;}],['9 columns',b=>b.columns=Array.from({length:9},(_,i)=>i)],['incomplete row selection',b=>b.rows=0],['partial offset',b=>b.offset=1]])test('full bounds reject '+name+' before native dispatch',async()=>{const f=fake();change(f.b);await assert.rejects(()=>readNativeVariant(f.page,f.b,decodeVariantFrame));assert.equal(f.counters.sent,0);});

test('native link accepts labels whose test IDs normalize spaces and Unicode',async()=>{
 const f=fake();f.sourceNode.FLabel.FRawValue='Импорт mixed';f.node.FLabel.FRawValue='Свёртка mixed';
 const r=await readNativeVariant(f.page,f.b,decodeVariantFrame);assert.equal(r.cells.length,1);assert.equal(f.counters.sent,1);
});
for(const [name,change] of [
 ['extra edge',f=>f.links.push({...f.links[0]})],
 ['foreign parent',f=>f.sourcePort.parent={...f.sourceNode}],
 ['wrong input index',f=>f.node.FPorts[0].FCollection.unshift({})],
 ['variable link',f=>f.inputPort.FSubType=4],
 ['detached port',f=>f.sourceNode.FPorts[1].FCollection=[]],
 ['missing edge identity',f=>delete f.links[0].FGuid],
])test('native topology rejects '+name+' before dispatch',async()=>{
 const f=fake();change(f);await assert.rejects(()=>readNativeVariant(f.page,f.b,decodeVariantFrame),/static topology/);assert.equal(f.counters.sent,0);
});
for(const [name,change] of [
 ['edge replacement',f=>f.links[0]={...f.links[0]}],
 ['edge GUID change',f=>f.links[0].FGuid='new-edge'],
 ['port GUID change',f=>f.sourcePort.FGuid='new-port'],
])test('native topology rejects '+name+' across an awaited response',async()=>{
 const f=fake('deferred'),pending=readNativeVariant(f.page,f.b,decodeVariantFrame);change(f);f.finish();
 await assert.rejects(pending,/stale owner/);assert.deepEqual(f.counters,{sent:1,released:2});
});

test('reopened native ports need no transient FPortIndex property',async()=>{
 const f=fake();delete f.sourcePort.FPortIndex;delete f.inputPort.FPortIndex;
 const r=await readNativeVariant(f.page,f.b,decodeVariantFrame);assert.equal(r.cells.length,1);assert.equal(f.counters.sent,1);
});
