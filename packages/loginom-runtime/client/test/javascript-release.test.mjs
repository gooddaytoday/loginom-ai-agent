import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
import {releaseNodeApply} from '../lib/node-apply.mjs';
import {createRedactor} from '../lib/redact.mjs';

const node={document_id:'doc',workflow_id:'flow',node_id:'js'};
const validate=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema);
const workflow={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
 navigation_path:[{tid:'path',label:'Scenario'}]};
function fixture(phase='configure',fault){
 let open=phase!=='read',action,reads=0;const gestures=[],events=[];
 const request={operation_id:'apply-js',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
  target:{kind:'existing',type:'programming.javascript',ref:node},inputs:[],mode:'script',
  parameters:{source_text:'import {InputTable,OutputTable} from "builtIn/Data";\n',expected_source_sha256:'a'.repeat(64)},
  mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:false},
  budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 const operation={id:'apply-js',action:{action_key:'node.apply',revision:'1'},parameters:request,deadline:1,
  transportUncertain:fault==='transport',lastReceipt:{id:'apply-js:n1'},
  nodeApply:{request,node,pending:{phase},phases:[],signature:'signature',
   execution:phase==='read'?{status:'completed',execution_id:'own-execution'}:{status:'not_started',execution_id:null},output:{status:'not_refreshed',evidence_ref:null,ports:[]}},
  nodeTargetAdapter:{observe:async()=>({complete:true,document_id:'doc',workflow_ref:workflow,
   nodes:[{ref:node,type:'programming.javascript',label:'JS',position:{x:320+(fault==='graph'&&reads++?8:0),y:280},inputs:[0],outputs:[0]}],
   links:[],foreign_links:[]})}};
 const snapshot=()=>({origin:'http://test',loginom_build:'7.4.2',workflow_ref:workflow,dom_epoch:{document:'browser',revision:1},scan:{complete:true},
  prepared_node_context:{...node,node_id:fault==='foreign'?'other':'js',verified:true,surface:open?'wizard':'graph',locked:open,
   ...(open&&phase==='input_mapping'?{input_port:{direction:'input',port:0,native_index:0,port_guid:'input',opening_operation_id:'apply-js:n1'}}:{})},
  wizard:open?{status:'observed',root_ref:'ui-w',root_tid:'W',stage:phase==='input_mapping'?'input_mapping':'javascript',owner_context:{status:'observed',node:{tid:'owner'}}}:{status:'absent'},
  ui:{elements:open?[{tid:'W;btnClose',ref:'ui-close',allowed_actions:['click']}]:[],dialogs:[],masks:[],truncated:{elements:false,dialogs:false,masks:false}}});
 const record=async e=>{events.push(e);if(e.phase==='node_step_prepared')action=e;return structuredClone(e);};
 const support=createCandidateNodeSupport({targetOrigin:'http://test',targetBuild:'7.4.2',redactor:createRedactor()});
 const drivers=support.nodeApplyDriverFactory({operation,now:Date.now,onRecord:record,
  receiptOptions:(id,key,signature)=>({id,action_key:key,signature}),
  readReceipt:async()=>fault==='receipt'?{state:'pending'}:{state:'completed',receipt:{cleanup_complete:fault!=='cleanup'}},
  execute:async()=>{
   if(!action)return {status:'SUCCEEDED',output:snapshot()};
   const current=action;action=null;gestures.push(current.action);
   if(fault==='lost')throw Error('Lost Close reply');
   assert.deepEqual(current.action,{verb:'click',ref:'ui-close'});open=false;
   return {status:'SUCCEEDED',operation_id:current.internal_operation_id,action_key:'ui.act',cleanup_complete:true,effect_possible:true,output:snapshot()};
  }});
 return {operation,drivers,gestures,events,run:signal=>releaseNodeApply({operation,handlers:support.nodeApplyHandlers,drivers,record,signal})};
}

for(const phase of ['configure','open','input_mapping'])test('script JS releases stopped '+phase+' through Close without Done or Save',async()=>{
 const f=fixture(phase),r=await f.run();
 assert.equal(r.checkpoint_kind,'local_node_released');assert.equal(r.cleanup_complete,true);assert.equal(r.pending_phase,null);
 assert.deepEqual(r.configuration,{status:'unknown'});assert.equal(r.execution.status,'unknown');assert.equal(r.package_saved,false);
 const checked=validate(r);assert.equal(checked.valid,true,checked.errorMessage);
 assert.deepEqual(f.gestures,[{verb:'click',ref:'ui-close'}]);assert.equal(f.operation.nodeApply.pending,null);
 assert.ok(f.events.some(e=>e.phase==='node_operation_released'&&e.receipt.proof.cleanup.wizard_closed));
 assert.deepEqual(f.drivers.releasePendingPhases,['input_mapping','open','configure','read']);
});
for(const fault of ['foreign','graph','transport','receipt','cleanup','lost'])test('script JS release refuses '+fault+' and retains the pending operation',async()=>{
 const f=fixture('configure',fault);await assert.rejects(f.run());
 assert.equal(f.operation.nodeApply.pending.phase,'configure');
 assert.ok(f.gestures.every(g=>g.verb==='click'&&g.ref==='ui-close'));
 if(['foreign','transport','receipt','cleanup'].includes(fault))assert.deepEqual(f.gestures,[]);
 if(fault==='lost'){assert.equal(f.gestures.length,1);assert.equal(f.operation.transportUncertain,true);}
});
test('script JS release does not extend or replay unsupported execution phases',async()=>{
 for(const phase of ['target','node_finish','materialization_execute','finish']){
  const f=fixture(phase);await assert.rejects(f.run(),/stopped JavaScript draft/);
  assert.deepEqual(f.gestures,[]);assert.equal(f.operation.deadline,1);
 }
});
test('script JS releases a restored output read on the same quiet graph without Save or Execute',async()=>{
 const f=fixture('read'),r=await f.run();
 assert.equal(r.status,'FAILED');assert.equal(r.released_phase,'read');assert.equal(r.cleanup_complete,true);
 assert.equal(r.pending_phase,null);assert.equal(r.package_saved,false);assert.deepEqual(f.gestures,[]);
 assert.deepEqual(r.execution,{status:'completed',execution_id:'own-execution'});
 const checked=validate(r);assert.equal(checked.valid,true,checked.errorMessage);
 assert.ok(f.events.some(e=>e.phase==='node_operation_released'&&e.receipt.proof.verified));
});
test('script JS release honors cancellation before observing or closing',async()=>{
 const f=fixture(),c=new AbortController();c.abort(Error('release cancelled'));
 await assert.rejects(f.run(c.signal),/release cancelled/);assert.deepEqual(f.gestures,[]);
});
