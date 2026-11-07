import test from 'node:test';
import assert from 'node:assert/strict';
import * as imports from '../lib/text-import-node.mjs';
import {compactNodeResult} from '../lib/user-results.mjs';

function fixture({count=17,process=true,stale=false,unbound=false,excel=false}={}) {
 const node={document_id:'doc',workflow_id:'flow',node_id:'import'};
 const identity={canonical_path:'/cache/full.csv',size:3,file_id:'1:2'};
 const scan={basis:'backend_exact_scan',profile_id:'p',records:17,bytes:3,sha256:'a'.repeat(64),identity};
 const source={kind:'storage',server_source_ref:'storage-a',bytes:3,mtime:'original',sha256:scan.sha256,
  cache_binding:{server_source_ref:'storage-a',native_size:3,native_mtime:'original',copy_bytes:3,identity}};
 if(unbound)delete source.cache_binding;
 const switched={node,source,profile_id:'p',scan_receipt:scan,type:excel?'imports.excel':'imports.text'};
 if(excel){scan.xlsx={sheet_name:'Sales',sheet_index:1,header_rows:1,blank_rows:'import'};
  switched.configuration={source:{sheet_method:'По имени',sheet:'Sales',header_rows:1,blank_rows:'Импортировать',whole_sheet:true}};}
 const ctx={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]},execution:{execution_id:'doc:root:6'},deadline:Date.now()+10000};
 const operation={id:'group-full',action:{action_key:'node.apply',revision:'1'},parameters:{},nodeApply:{phases:[{phase:'source',value:{switched_sources:[switched]}}]}};
 const calls=[];
 const processes={verified:true,inventory_complete:true,root_id:'root',node_context:{...node,verified:true,surface:'graph'},
  processes:process?[{process_id:'6',record_id:'group',parent_id:null,state:'completed',error:false,children_loaded:true},
   {process_id:'6.1',record_id:'child',parent_id:'6',state:'completed',error:false,
    owner:{verified:true,node_id:'import',source:'native_process_model_identity'}}]:[]};
 const run=async()=>{
  assert.equal(typeof imports.readDeferredImportCounts,'function','chain output must verify deferred import N');
  return imports.readDeferredImportCounts({operation,execute:async code=>{
   if(!code.includes('readNodePortOutput'))return processes;
   calls.push(code);assert.ok(code.includes('"sampleRows":0'));assert.ok(code.includes('"process_id":"6.1"'));
   assert.ok(code.includes('"process_record_id":"child"'));
   return {verified:true,cleanup_complete:true,node_context:{...node,verified:true},
    output:{port:0,fresh:true,execution_id:stale?'doc:root:5':'doc:root:6',freshness_basis:'completed_execution_port_source',row_count:count}};
  },onRecord:async e=>e,now:Date.now},ctx,{targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 };
 return {run,calls,operation,switched};
}

test('chain receipt compares scan N with the completed import port, never group rows',async()=>{
 const f=fixture(),value=await f.run();
 assert.equal(value[0].status,'verified',JSON.stringify(value));assert.equal(value[0].expected_records,17);
 assert.equal(value[0].actual_records,17);assert.equal(value[0].matches_scan,true);
 assert.equal(value[0].execution_id,'doc:root:6');assert.equal(value[0].node.node_id,'import');
 assert.equal(f.calls.length,1);
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
