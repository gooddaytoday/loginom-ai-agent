import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readFixedVariant,cancelFixedVariant,variantDiagnosticStatus} from './raw-read.mjs';import {decodeVariantFrame} from './decode.mjs';
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
 const card={Controller:{Node:{data:{node:workflow}},FController:{FPreviewManager:manager}}};
 const env={document,location:{origin:'http://test'},bg:{app:{Version:'7.4.2',WorkFlowTreeNode:Workflow,PackageTreeNode:Package,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>card}}}}}}},Ext:{getCmp:id=>id==='preview'?{Controller:dc}:{getStore:()=>({getRoot:()=>root,isLoading:()=>false})}},Uint8Array,DataView,TextDecoder,TextEncoder,setTimeout,clearTimeout};
 env.__loginomDockPreparationV1={document,id:'d',receipts:new Map([['r',{phase:'verified',workflowId:'w',tab,nodeTargetWorkflowNode:workflow,packageNode:pack}]])};
 const b={method:321,interface:116,port:0,offset:0,rows:1,columns:[0],execution:{status:'completed',execution_id:'d:1:2'},document_id:'d',workflow_id:'w',tab_tid:'tab',prefix:'TF',node_id:'n',port_guid:'p',origin:'http://test',source:{owner:0,object:9},schema:[{name:'Scalar',label:'Scalar',type:6}],row_count:1};
 const context=vm.createContext(env);
 return {page:{evaluate:(fn,arg)=>{context.arg=arg;return vm.runInContext('('+fn.toString()+')(arg)',context);}},b,counters,finish:error=>finish(error)};
}
test('fixed321 only and local buffers released',async()=>{const f=fake();const r=await readFixedVariant(f.page,f.b,decodeVariantFrame);assert.equal(r.cells[0].decoded.type,'real');assert.deepEqual(f.counters,{sent:1,released:2});});
for(const mode of ['changed-cache','new-execution','stale-response'])test('reject '+mode+' after response and release buffers',async()=>{const f=fake(mode);await assert.rejects(()=>readFixedVariant(f.page,f.b,decodeVariantFrame));assert.deepEqual(f.counters,{sent:1,released:2});});

for(const kind of ['cancelled','deadline_exceeded'])test(kind+' rejects once, retires session and releases late response',async()=>{
 const f=fake('deferred'),promise=readFixedVariant(f.page,f.b,decodeVariantFrame,{operationId:'x',timeoutMs:kind==='cancelled'?1000:5});
 const rejected=assert.rejects(promise,new RegExp(kind));
 if(kind==='cancelled')assert.equal((await cancelFixedVariant(f.page,'x')).cancelled,true);
 await rejected;
 assert.equal((await variantDiagnosticStatus(f.page)).pending,1);assert.equal(f.counters.released,0);
 await assert.rejects(()=>readFixedVariant(f.page,f.b,decodeVariantFrame),/retired/);
 f.finish();await new Promise(r=>setTimeout(r,0));
 const status=await variantDiagnosticStatus(f.page);
 assert.equal(status.status,kind);assert.equal(status.published,false);assert.equal(status.nativeCancelled,false);
 assert.equal(status.pending,0);assert.equal(status.lateResponses,1);assert.equal(status.releasedRequests,1);assert.equal(status.releasedResponses,1);
 assert.deepEqual(f.counters,{sent:1,released:2});
});
test('hung response retains native buffers; cancellation is never cleanup proof',async()=>{
 const f=fake('deferred'),p=readFixedVariant(f.page,f.b,decodeVariantFrame,{timeoutMs:5});await assert.rejects(p,/deadline/);
 const s=await variantDiagnosticStatus(f.page);assert.equal(s.pending,1);assert.equal(s.releasedRequests,0);assert.equal(s.retired,true);assert.equal(s.nativeCancelled,false);
 f.finish(true);await new Promise(r=>setTimeout(r,0));assert.equal((await variantDiagnosticStatus(f.page)).pending,0);assert.equal(f.counters.released,1);
});
test('wrong cancellation id and overlapping reader cannot affect current operation',async()=>{
 const f=fake('deferred'),p=readFixedVariant(f.page,f.b,decodeVariantFrame,{operationId:'owned'});
 assert.equal((await cancelFixedVariant(f.page,'foreign')).cancelled,false);
 await assert.rejects(()=>readFixedVariant(f.page,f.b,decodeVariantFrame),/busy/);f.finish();await p;
 assert.equal((await variantDiagnosticStatus(f.page)).published,true);assert.equal(f.counters.sent,1);
});
test('strong atomic contract fails before fixed RPC',async()=>{
 const f=fake();await assert.rejects(()=>readFixedVariant(f.page,f.b,decodeVariantFrame,{requireAtomicSnapshot:true}),/atomic snapshot unavailable/);assert.equal(f.counters.sent,0);
});
test('completed operation IDs cannot be reused for a new cancellation target',async()=>{
 const f=fake();await readFixedVariant(f.page,f.b,decodeVariantFrame,{operationId:'once'});
 await assert.rejects(()=>readFixedVariant(f.page,f.b,decodeVariantFrame,{operationId:'once'}),/reused/);assert.equal(f.counters.sent,1);
});
test('a native transport failure retires the diagnostic session without claiming server cancellation',async()=>{
 const f=fake('deferred'),p=readFixedVariant(f.page,f.b,decodeVariantFrame);const rejected=assert.rejects(p,/transport error/);f.finish(true);await rejected;
 const s=await variantDiagnosticStatus(f.page);assert.equal(s.retired,true);assert.equal(s.pending,0);assert.equal(s.nativeCancelled,false);assert.equal(s.releasedRequests,1);assert.equal(s.releasedResponses,0);
 await assert.rejects(()=>readFixedVariant(f.page,f.b,decodeVariantFrame),/retired/);
});

test('byte budget refuses before dispatch/append and never publishes over limit',async()=>{
 const tiny=fake();await assert.rejects(()=>readFixedVariant(tiny.page,tiny.b,decodeVariantFrame,{maxBytes:60}),/byte budget/);assert.equal(tiny.counters.sent,0);
 const append=fake();await assert.rejects(()=>readFixedVariant(append.page,append.b,decodeVariantFrame,{maxBytes:600}),/byte budget/);const s=await variantDiagnosticStatus(append.page);assert.equal(s.published,false);assert.equal(s.pending,0);assert.equal(append.counters.released,2);
});
