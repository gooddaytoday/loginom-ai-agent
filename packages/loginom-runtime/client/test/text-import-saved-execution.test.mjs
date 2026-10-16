import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTextImportNodeSupport,isSavedTextImportExecution} from '../lib/text-import-node.mjs';
import {applyNode,validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {createExecutionJournal} from '../lib/execution-journal.mjs';

const request=()=>({operation_id:'saved-import',contract_revision:'1.0.0',document_id:'doc',
 workflow_ref:{workflow_id:'flow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Сервер',label:''}]},
 target:{kind:'existing',type:'imports.text',ref:{document_id:'doc',workflow_id:'flow',node_id:'import'}},
 inputs:[],mode:'delimited',parameters:{},mappings:[],finish:'execute',
 read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:600000}});
const support=()=>createTextImportNodeSupport({targetOrigin:'https://example.test',targetBuild:'7.4.2'});

test('saved import executes through the shell without configuring or claiming source integrity',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'saved-import-'));
 try{
  const r=request(),s=support(),events=[];
  const operation={id:r.operation_id,parameters:r};
  const drivers=s.nodeApplyDriverFactory({operation,verifiedUploads(){throw Error('must not inspect old uploads');}});
  const v=details=>({verified:true,cleanup_complete:true,effect_possible:false,...details});
  const record=createExecutionJournal({directory,metadata:{sessionId:'own'}});
  const result=await applyNode({request:r,operation,handlers:s.nodeApplyHandlers,record,now:()=>1,
   drivers:{...drivers,
    prepareTarget:async()=>{events.push('target');return v({node:r.target.ref});},
    finishGraph:async(mode,ctx)=>{events.push('execute');assert.deepEqual(ctx.node,r.target.ref);return v({mode,settings_applied:false,execution_started:true,execution_id:'execution'});},
    waitExecution:async()=>v({execution_id:'execution',status:'completed'}),
    readOutput:async read=>{assert.deepEqual(read.ports,[]);return v({execution_id:'execution',status:'complete',evidence_ref:'saved-import:read',ports:[]});}}});
  assert.equal(result.status,'SUCCEEDED');assert.equal(result.configuration.status,'not_requested');
  assert.equal(result.configuration.readback,undefined);assert.deepEqual(events,['target','execute']);
  const journal=(await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  const source=journal.find(e=>e.phase==='node_phase_completed'&&e.receipt.phase==='source').receipt.value;
  assert.equal(source.source_kind,'saved_import_configuration');assert.equal(source.source_integrity_verified,false);
  assert.equal(source.source,undefined);
  assert.equal(journal.some(e=>e.receipt&&['open','configure','input_mapping','output_mapping'].includes(e.receipt.phase)),false);
  const count=journal.length;
  assert.deepEqual(await applyNode({request:r,operation,handlers:s.nodeApplyHandlers,drivers:{},record,now:()=>1}),result);
  assert.equal((await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim().split('\n').length,count);
 }finally{await rm(directory,{recursive:true,force:true});}
});

for(const [name,change] of Object.entries({
 new:r=>{r.target={kind:'new',type:'imports.text',label:'New'};},done:r=>r.finish='done',close:r=>r.finish='close',
 source:r=>r.parameters={source:{artifact_id:'old',upload_operation_id:'old'}},
 settings:r=>r.parameters={settings:{}},path:r=>r.parameters={settings:{source:{source_path:'/own/replaced.csv'}}},
 columns:r=>r.parameters={settings:{columns:[{name:'A',used:true}]}},mapping:r=>r.mappings=[{direction:'output',port:0,autosync:true}],
 input:r=>r.inputs=[{source:r.target.ref,input:0,output:0}],read:r=>r.read.ports=[0],
 other:r=>r.target.type='transform.calculator',array:r=>r.parameters=[],primitive:r=>r.parameters=42,
}))test('saved execution cannot bypass '+name,()=>{
 const r=request();change(r);assert.equal(isSavedTextImportExecution(r),false);
 assert.throws(()=>validateNodeApplyRequest(r,support().nodeApplyHandlers));
});

test('explicit unverified source still uses the original upload proof boundary',async()=>{
 const r=request();r.parameters={source:{artifact_id:'old',upload_operation_id:'old'},settings:{}};
 const s=support();validateNodeApplyRequest(r,s.nodeApplyHandlers);
 const operation={id:r.operation_id,parameters:r};let lookups=0;
 const drivers=s.nodeApplyDriverFactory({operation,verifiedUploads:()=>{lookups++;return [];}});
 await assert.rejects(drivers.verifySource(r.parameters),/Verified upload operation/);assert.equal(lookups,1);
});
