import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {alignReadSchema,buildNodeReadRequest} from '../lib/node-read-contract.mjs';
import {releasePendingNode,NODE_RELEASE_BUDGET_MS} from '../lib/node-pending-release.mjs';
import {createNodeReadDrivers} from '../lib/node-read-driver.mjs';
import {Page,runtime,build} from './support/executor-fixture.mjs';

const node={document_id:'doc',workflow_id:'wf',node_id:'sorting'};
const workflow={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:"path",label:"Scenario"}]};
const schema=[{index:0,name:'Region',label:'Регион',type:'string'}];
const source={parameters:{contract_revision:'1.0.0',target:{type:'transform.sorting'},workflow_ref:workflow},
 outcome:{status:'SUCCEEDED',cleanup_complete:true,output:{node,cleanup_complete:true,execution:{status:'completed'},output:{ports:[{port:0,schema}]}}}};
const request=()=>buildNodeReadRequest({operation_id:'read-ru',source_operation_id:'rename-ru'},source);
const refused={operation_id:'read-ru:n19',action_key:'ui.act',status:'NOT_APPLIED',phase:'preconditions',effect_possible:false,
 cleanup_complete:true,error:{code:'GRAPH_EXECUTION_CONTEXT_CHANGED'},trace:[{event:'ui_observation_started'}]};

async function fixture(fault,phase='finish'){
 const page=new Page();page.addNode('Report',104,104,[]);const calls=[],records=[];let operation,reads=0;
 const graph=()=>({complete:true,document_id:'doc',workflow_ref:workflow,nodes:[{ref:node,type:'transform.sorting',label:'Report',inputs:[],outputs:[0]}],
  links:fault==='graph-drift'&&reads++%2===1?[{source:'other',target:'sorting',output:0,input:0}]:[],foreign_links:[]});
 const snapshot=()=>({origin:'https://loginom.invalid',loginom_build:build,workflow_ref:workflow,dom_epoch:{document:'browser',revision:1},
  scan:{complete:true},wizard:{status:'absent'},prepared_node_context:{...node,node_id:fault==='foreign-node'?'foreign':node.node_id,
   verified:true,surface:'graph',locked:false},ui:{elements:[],dialogs:[],masks:[],truncated:{elements:false,dialogs:false,masks:false}}});
 const ok=async()=>({verified:true,cleanup_complete:true});
 const f=runtime(page,{onRecord:async e=>{records.push(e);return e;},
  nodeApplyHandlers:new Map([['transform.sorting',{revision:'1',modes:['keys'],validate:()=>{},configure:ok}]]),
  nodeTargetAdapterFactory:()=>({observe:async()=>structuredClone(graph()),preflight:ok}),
  nodeApplyDriverFactory:options=>{
   operation=options.operation;
   const readReceipt=async ref=>{calls.push('receipt:'+ref.id);return fault==='unsettled'?{state:'pending'}:
     {state:'completed',receipt:{...refused,cleanup_complete:fault!=='cleanup'}};};
   const channel={async observe({ready}){calls.push('observe');const value=snapshot();if(!ready(value))throw Error('Readiness refused');return value;},
    async readOutputPort({port}){
     calls.push('read');
     if(fault?.startsWith('second-')&&port===0){operation.cleanupConfirmed=true;return {output:{port,port_guid:'p0',
      fresh:true,execution_id:'fresh',freshness_basis:'completed_execution_port_source',schema,row_count:0,sample_rows:0,sample_complete:true,sample:[]}};}
     if(['unstarted','second-unstarted'].includes(fault))throw Error('Read refused before dispatch');
     operation.cleanupConfirmed=!['port-cleanup','second-port-cleanup'].includes(fault);operation.transportUncertain=fault==='transport';
     throw Error('The owned port read was refused after cleanup');
    }};
   const create=vm.runInNewContext('('+createNodeReadDrivers.toString()+')',{
    createNodeProcedure:()=>channel,createNodeExecutionProcedure:()=>({async prepare(){},async waitCompleted(){return {
     verified:true,owner_verified:true,cleanup_complete:true,status:'completed',execution_id:'fresh',process_id:'1.1',process_record_id:'child'};}}),
    finishConfiguredGraph:async()=>{calls.push('finish');operation.lastReceipt={id:'read-ru:n19'};
     return {verified:true,cleanup_complete:true,mode:'execute',execution_id:'fresh'};},
    need:(ok,message)=>{if(!ok)throw Error(message);},verified:value=>({verified:true,cleanup_complete:true,...value}),
    alignReadSchema,releasePendingNode,NODE_RELEASE_BUDGET_MS,
   });
   const drivers=create({...options,readReceipt},{targetOrigin:'https://loginom.invalid',targetBuild:build});
   if(phase==='read')return drivers;
   return {...drivers,finishGraph:async()=>{
    calls.push('finish');operation.cleanupConfirmed=true;operation.transportUncertain=fault==='transport';
    operation.lastReceipt={id:'read-ru:n19'};
    // Observed R1.7: known deactivation succeeded, both Execute gestures were
    // refused before effect. Releasing must not repeat any of these gestures.
    throw Error('The selected node or launch button changed before execution');
   }};
  }});
 const planned=request();
 if(fault?.startsWith('second-')){planned.read.ports=[0,1];planned.parameters.schemas.push({port:1,schema});}
 f.startNodeApply(planned);const job=await f.waitNodeApply('read-ru',{timeoutMs:1000});
 assert.equal(job.outcome?.status,'AMBIGUOUS',JSON.stringify(job));
 assert.equal(job.outcome.output.pending_phase,phase);
 return {f,page,operation,calls,records};
}

test('a refused read finish exposes release, retains its source and admits an actual save without replay',async()=>{
 const {f,page,operation,calls,records}=await fixture();
 const inspected=(await f.inspect({operationId:'read-ru'})).output;
 assert.deepEqual(inspected.recovery_options,['abandon_operation']);
 assert.equal(inspected.next_steps[0].tool,'dock_operation_recover');
 const blocked=await f.run('package.save_checkpoint',{path:'/user/data/packages/report.lgp',conflict_policy:'fail'},{operationId:'blocked-save'});
 assert.equal(blocked.operation_id,'read-ru');
 const release=await f.recover('read-ru',{strategy:'abandon_operation',recoveryOperationId:'release-ru'});
 assert.equal(release.status,'SUCCEEDED',JSON.stringify(release));
 const result=release.output.original_outcome.output;
 assert.equal(result.status,'FAILED');assert.equal(result.cleanup_complete,true);assert.equal(result.pending_phase,null);
 assert.equal(result.execution.status,'unknown');assert.deepEqual(result.configuration,{status:'not_requested'});
 assert.equal(result.next_step.tool,'dock_node_read');assert.match(result.next_step.instruction,/NEW operation_id.*source_operation_id:"rename-ru"/);
 assert.match(result.next_step.instruction,/Saving the package/);assert.equal(operation.nodeApply.pending,null);
 assert.equal(calls.filter(c=>c==='finish').length,1);assert.ok(calls.includes('receipt:read-ru:n19'));
 assert.ok(records.some(r=>r.phase==='node_operation_released'));assert.equal(f.hasUnsettledWork(),false);
 const saved=await f.run('package.save_checkpoint',{path:'/user/data/packages/report.lgp',conflict_policy:'fail'},{operationId:'save-after-release'});
 assert.equal(saved.status,'SUCCEEDED',JSON.stringify(saved));assert.equal(page.storage.has('/user/data/packages/report.lgp'),true);
 assert.deepEqual(await f.recover('read-ru',{strategy:'abandon_operation',recoveryOperationId:'release-ru'}),release);
 assert.equal(calls.filter(c=>c==='finish').length,1);
});

for(const fault of ['transport','unsettled','cleanup','foreign-node','graph-drift'])test('read finish release retains uncertainty: '+fault,async()=>{
 const {f,operation,page}=await fixture(fault);
 const released=await f.recover('read-ru',{strategy:'abandon_operation',recoveryOperationId:'unsafe-release'}).catch(e=>e);
 assert.notEqual(released.status,'SUCCEEDED');assert.equal(operation.nodeApply.pending.phase,'finish');
 const save=await f.run('package.save_checkpoint',{path:'/user/data/packages/unsafe.lgp',conflict_policy:'fail'},{operationId:'unsafe-save'});
 assert.equal(save.status,'AMBIGUOUS');assert.equal(save.operation_id,'read-ru');assert.equal(page.storage.size,0);
});
test('a settled refused read releases after its own cleanup and the same quiet graph without replay',async()=>{
 const {f,operation,calls}=await fixture(undefined,'read');
 assert.equal(operation.cleanupConfirmed,false,'Executor overwrites phase cleanup before release');
 const settledRelease=await f.recover('read-ru',{strategy:'abandon_operation',recoveryOperationId:'release-read'});
 assert.equal(settledRelease.status,'SUCCEEDED',JSON.stringify(settledRelease));
 assert.equal(settledRelease.output.original_outcome.output.cleanup_complete,true);
 assert.equal(settledRelease.output.original_outcome.output.execution.status,'completed');
 assert.equal(operation.nodeApply.pending,null);assert.equal(f.hasUnsettledWork(),false);
 assert.deepEqual(calls.filter(c=>['read','finish'].includes(c)),['finish','read']);
 const before=calls.filter(c=>c==='finish').length;
 await f.recover('read-ru',{strategy:'abandon_operation',recoveryOperationId:'release-read'});
 const repeatedExecuteCount=calls.filter(c=>c==='finish').length-before;
 assert.equal(repeatedExecuteCount,0);
});
for(const fault of ['transport','unsettled','cleanup','port-cleanup','unstarted','second-port-cleanup','second-unstarted','foreign-node','graph-drift'])test('read release retains unknown cleanup or context: '+fault,async()=>{
 const {f,operation,calls}=await fixture(fault,'read');
 if(fault==='transport')assert.equal(operation.transportUncertain,true);
 const unknownRelease=await f.recover('read-ru',{strategy:'abandon_operation',recoveryOperationId:'unknown-read'}).catch(error=>error);
 assert.notEqual(unknownRelease.status,'SUCCEEDED');assert.equal(operation.nodeApply.pending.phase,'read');
 assert.equal(f.hasUnsettledWork(),true);assert.equal(calls.filter(c=>c==='finish').length,1);
 if(fault.startsWith('second-'))assert.equal(calls.filter(c=>c==='read').length,2);
});
test('browser recovery read release also requires the last actual port cleanup',async()=>{
 const settled=await fixture(undefined,'read');
 const proof=await settled.operation.nodeApplyDrivers.recoveryReleasePending(settled.operation.nodeApply);
 assert.equal(proof.cleanup_complete,true);assert.equal(settled.calls.filter(c=>c==='finish').length,1);
 for(const fault of ['port-cleanup','unstarted','second-port-cleanup','second-unstarted']){
  const unknown=await fixture(fault,'read');
  await assert.rejects(()=>unknown.operation.nodeApplyDrivers.recoveryReleasePending(unknown.operation.nodeApply),/no confirmed settled cleanup/);
  assert.equal(unknown.calls.filter(c=>c==='finish').length,1);
 }
});
