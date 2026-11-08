import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readDeferredImportCounts} from '../lib/text-import-node.mjs';
import {readPreparedNodeContext} from '../lib/node-context.mjs';
import {compactNodeResult} from '../lib/user-results.mjs';

function fixture({count=17,process=true,stale=false,unbound=false,excel=false,hidden=false,chainGroup='6',duplicateImport=false}={}) {
 const node={document_id:'doc',workflow_id:'flow',node_id:'import'};
 const identity={canonical_path:'/cache/full.csv',size:3,file_id:'1:2'};
 const scan={basis:'backend_exact_scan',profile_id:'p',records:17,bytes:3,sha256:'a'.repeat(64),identity};
 const source={kind:'storage',server_source_ref:'storage-a',bytes:3,mtime:'original',sha256:scan.sha256,
  cache_binding:{server_source_ref:'storage-a',native_size:3,native_mtime:'original',copy_bytes:3,identity}};
 if(unbound)delete source.cache_binding;
 const switched={node,source,profile_id:'p',scan_receipt:scan,type:excel?'imports.excel':'imports.text'};
 if(excel){scan.xlsx={sheet_name:'Sales',sheet_index:1,header_rows:1,blank_rows:'import'};
  switched.configuration={source:{sheet_method:'По имени',sheet:'Sales',header_rows:1,blank_rows:'Импортировать',whole_sheet:true}};}
 const ctx={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]},execution:{execution_id:'doc:root:'+chainGroup},deadline:Date.now()+10000};
 const operation={id:'group-full',action:{action_key:'node.apply',revision:'1'},parameters:{},nodeApply:{phases:[{phase:'source',value:{switched_sources:[switched]}}]}};
 const calls=[],nativeReads=[];
 const processes={verified:true,inventory_complete:true,root_id:'root',node_context:{...node,verified:true,surface:'graph'},
  processes:process?[{process_id:'6',record_id:'group',parent_id:null,state:'completed',error:false,children_loaded:true},
   {process_id:'6.1',record_id:'child',parent_id:'6',state:'completed',error:false,
    owner:{verified:true,node_id:'import',source:'native_process_model_identity'}}]:[]};
 // E1 group 6 contains three sibling node processes. Group 7 only executes
 // Export: the import port still belongs to its completed group-6 process.
 const nativeNodes=['import','calculator','group','export'].map(id=>({FGuid:id,data:{}}));
 const record=(id,recordId,nodeIndex)=>({isModel:true,internalId:recordId,childNodes:[],data:{id,loaded:true,loading:false,
  Status:3,ErrorDetails:'',text:id,ProgressBarCls:'bg-progress-ptpsCompleted',CanCancelProcess:false,
  ...(nodeIndex===undefined?{expanded:true}:{ModelNode:nativeNodes[nodeIndex].data,loaded:false,expanded:false})}});
 const group=record('6','group');group.childNodes=[record('6.1','child',0),record('6.2','calculator',1),record('6.3','target',2)];
 group.childNodes.forEach((p,i)=>p.data.text=['Продажи по регионам','Регион для подсчета','Итоги по регионам'][i]);
 if(duplicateImport)group.childNodes.push(record('6.4','duplicate-import',0));
 const root=record('root','root');root.childNodes=[group];
 if(chainGroup==='7'){const exported=record('7','export-group');exported.childNodes=[record('7.1','export-child',3)];root.childNodes.push(exported);}
 const element=(id,tid)=>({id,getAttribute:()=>tid,getBoundingClientRect:()=>({width:0,height:0}),querySelectorAll:()=>[]});
 const left=element('left','ConsoleForm;ProgressForm;trpProgress;treepanel;tree'),right=element('right','ConsoleForm;ProgressForm;trpProgress;grd;tbl');
 const panel={getAttribute:()=> 'ConsoleForm',contains:e=>e===left||e===right};
 const store={$className:'Ext.data.TreeStore',isLoading:()=>false,getRoot:()=>root};
 const menu={classList:{contains:c=>c==='x-menu-item-checked'}};
 const elements=new Map([['ConsoleForm',panel],['ConsoleForm;ProgressForm;trpProgress;treepanel;tree',left],
  ['ConsoleForm;ProgressForm;trpProgress;grd;tbl',right],['mnContextMenu;mniShowCompletedProcesses',menu]]);
 const workspace={getActiveTab:()=>({Controller:{FController:{FDiagram:{FNodes:{FCollection:nativeNodes}}}}})};
 const context=vm.createContext({document:{querySelectorAll:q=>q==='.x-mask-msg,.bg-mask-message'?[]:
  elements.has(JSON.parse(q.slice(10,-1)))?[elements.get(JSON.parse(q.slice(10,-1)))]:[]},
  Ext:{getCmp:id=>({el:{dom:id==='left'?left:right},getStore:()=>store})},getComputedStyle:()=>({display:'none',visibility:'visible'}),
  bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:workspace}}}}}}});
 const page={evaluate:(fn,arg)=>{context.arg=arg;return structuredClone(vm.runInContext('('+fn.toString()+')(arg)',context));}};
 const run=async()=>{
  return readDeferredImportCounts({operation,execute:async code=>{
   if(!code.includes('readNodePortOutput')){
    if(!hidden)return processes;
    assert.ok(code.includes(readPreparedNodeContext.toString()));
    // Only the browser context boundary is substituted. Execute the serialized
    // production cache reader, including its hidden-console and owner guards.
    const bound=code.replace(readPreparedNodeContext.toString(),'async()=>('+JSON.stringify({...node,verified:true,surface:'graph'})+')');
    const result=await vm.runInNewContext('('+bound+')(page)',{page});nativeReads.push(result);return result;
   }
   calls.push(code);assert.ok(code.includes('"sampleRows":0'));assert.ok(code.includes('"process_id":"6.1"'));
   assert.ok(code.includes('"process_record_id":"child"'));
   return {verified:true,cleanup_complete:true,node_context:{...node,verified:true},
    output:{port:0,fresh:true,execution_id:stale?'doc:root:5':'doc:root:6',freshness_basis:'completed_execution_port_source',row_count:count}};
  },onRecord:async e=>e,now:Date.now},ctx,{targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 };
 return {run,calls,operation,switched,nativeReads};
}

test('chain receipt compares scan N with the completed import port, never group rows',async()=>{
 const f=fixture(),value=await f.run();
 assert.equal(value[0].status,'verified',JSON.stringify(value));assert.equal(value[0].expected_records,17);
 assert.equal(value[0].actual_records,17);assert.equal(value[0].matches_scan,true);
 assert.equal(value[0].execution_id,'doc:root:6');assert.equal(value[0].node.node_id,'import');
 assert.equal(f.calls.length,1);
});

test('E1 reads its completed import after the execution driver closes the three-node console',async()=>{
 const f=fixture({hidden:true}),proof=(await f.run())[0];
 assert.equal(proof.status,'verified',JSON.stringify({proof,nativeReads:f.nativeReads}));assert.equal(proof.actual_records,17);
 assert.ok(f.nativeReads[0].processes.every(p=>p.rendered===false));
 assert.equal(proof.matches_scan,true);assert.equal(f.calls.length,1);
});

test('E1 export reuses the latest completed import group rather than requiring a cached import to execute again',async()=>{
 const f=fixture({hidden:true,chainGroup:'7'}),proof=(await f.run())[0];
 assert.equal(proof.status,'verified',JSON.stringify(proof));assert.equal(proof.execution_id,'doc:root:6');
 assert.equal(proof.actual_records,17);assert.equal(f.calls.length,1);
});

test('hidden cache cannot certify two completed native owners for the same import group',async()=>{
 const f=fixture({hidden:true,duplicateImport:true}),proof=(await f.run())[0];
 assert.equal(proof.status,'not_verified');assert.match(proof.reason,/2 completed processes/);
 assert.equal(f.calls.length,0);
});

for(const options of [{count:16},{process:false},{unbound:true}])test('unverified full N is explicit: '+JSON.stringify(options),async()=>{
 const f=fixture(options),value=await f.run();
 assert.equal(value[0].status,'not_verified');assert.equal(value[0].message,'N не сверено');
 assert.ok(value[0].reason);assert.notEqual(value[0].matches_scan,true);
});

test('unconfirmed port identity fails the read instead of certifying full N',async()=>{
 const f=fixture({stale:true});await assert.rejects(f.run(),/Direct output read refused/);
 assert.equal(f.operation.cleanupConfirmed,false);
});

test('deferred Excel count also requires the exact scanned worksheet policy',async()=>{
 const f=fixture({excel:true});assert.equal((await f.run())[0].status,'verified');
 f.switched.configuration.source.header_rows=2;
 const proof=(await f.run())[0];assert.equal(proof.status,'not_verified');assert.match(proof.reason,/sheet\/header\/blank-row policy/);
});

test('ordinary executions do not read unrelated import metadata',async()=>{
 const f=fixture();f.operation.nodeApply.phases[0].value.switched_sources=[];
 assert.deepEqual(JSON.parse(JSON.stringify(await f.run())),[]);assert.equal(f.calls.length,0);
});

test('model-facing chain receipt preserves N verification and warns on unavailable N',()=>{
 const proof={status:'not_verified',node:{node_id:'import'},profile_id:'p',expected_records:17,actual_records:null,
  matches_scan:null,message:'N не сверено',reason:'Import has no completed process in this execution group'};
 const result=compactNodeResult({operation_id:'group-full',state:'settled',outcome:{status:'SUCCEEDED',output:{
  execution:{status:'completed',execution_id:'doc:root:6'},output:{status:'complete',ports:[],full_import_verification:[proof]}}}});
 assert.deepEqual(result.output.full_import_verification,[proof]);
 assert.ok(result.limitations.some(x=>x.includes('N не сверено')&&x.includes(proof.reason)));
});
