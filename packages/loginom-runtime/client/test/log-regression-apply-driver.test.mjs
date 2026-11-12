import test from 'node:test';
import assert from 'node:assert/strict';
import {createLogRegressionNodeSupport} from '../lib/log-regression-node.mjs';
import {createFactorAnalysisNodeSupport} from '../lib/factor-analysis-node.mjs';

function applyGraphReplay(fault,createSupport=createLogRegressionNodeSupport) {
 const node={document_id:'doc',workflow_id:'flow',node_id:'regression'};
 const workflow={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'scenario',label:'Scenario'}]};
 const tid='MF;TF-1;Graph;Prediction',records=[],actions=[];
 let reads=0,pending,replaced=false;
 const lateReplacement=['replaced','foreign_replaced','uncertain_replaced'].includes(fault);
 const deadline=Date.now()+(fault==='unstable'?900:10000);
 const operation={id:'apply',deadline,action:{action_key:'node.apply',revision:'1'},parameters:{mode:'apply'},nodeApply:{request:{mode:'apply'},node}};
 const state=()=>({origin:'https://loginom.test',loginom_build:'7.4.2',workflow_ref:workflow,graph_identity:{status:'observed',container_ref:'graph'},
  dom_epoch:{document:'dom',revision:reads<2?1:2},scan:{complete:true},wizard:{status:'absent'},
  prepared_node_context:{...node,verified:true,surface:'graph',locked:false,tid,...(fault==='foreign'&&reads>2||fault==='foreign_replaced'&&replaced?{node_id:'foreign'}:{})},
  ui:{dialogs:[],masks:[],truncated:{dialogs:false,masks:false},elements:[{
   tid,ref:lateReplacement?(replaced?'ui-new-body':'ui-old-body'):reads<=2?'ui-old-body':fault==='unstable'?'ui-body-'+reads:'ui-new-body',scope:'graph',
   graph_node:{part:'body'},signature:{tag:'g'},bounding_box:{x:636,y:140,width:56,height:104},
   allowed_actions:['click'],interaction:{state:'point_observed'}}]}});
 const support=createSupport({targetOrigin:'https://loginom.test',targetBuild:'7.4.2'});
 const driver=support.nodeApplyDriverFactory({operation,now:Date.now,receiptOptions:()=>({}),
  onRecord:async row=>{records.push(structuredClone(row));if(row.phase==='node_step_prepared')pending=row;return structuredClone(row);},
  execute:async code=>{
   if(pending){const row=pending;pending=null;actions.push(row.action);
    const stale=row.action.ref==='ui-old-body';
    if(stale&&lateReplacement)replaced=true;
    return {operation_id:row.internal_operation_id,action_key:'ui.act',status:stale?(fault==='uncertain_replaced'?'AMBIGUOUS':'NOT_APPLIED'):'SUCCEEDED',
     phase:'preconditions',effect_possible:!stale||fault==='uncertain_replaced',cleanup_complete:true,trace:[],...(lateReplacement?{output:state()}:{}),
     ...(stale?{error:{code:'UI_REFERENCE_STALE',message:'Observed control is detached, hidden, disabled, or replaced'}}:{})};}
   if(code.includes('async function readOutputContext('))return {verified:true,node_context:state().prepared_node_context};
   reads++;return {status:'SUCCEEDED',output:state()};
  }});
 return {actions,records,operation,deadline,run:()=>driver.finishGraph('done',{document_id:node.document_id,workflow_ref:workflow,node,deadline})};
}
test('first logistic apply waits for the replaced post-Close body before its only selection',async()=>{
 const f=applyGraphReplay();await f.run();
 assert.deepEqual(f.actions,[{verb:'click',ref:'ui-new-body'}]);
 assert.ok(f.records.filter(r=>r.phase==='node_observation_sample'&&r.readiness.required_samples===2).length>=3);
 assert.equal(f.records.some(r=>r.phase==='node_step_refresh_authorized'),false);
 assert.equal(f.operation.deadline,f.deadline);
});
for(const fault of ['foreign','unstable'])test('apply graph settlement retains '+fault+' guard before selection',async()=>{
 const f=applyGraphReplay(fault);await assert.rejects(f.run());assert.deepEqual(f.actions,[]);
 assert.equal(f.operation.deadline,f.deadline);
});


test('factor apply settles the cancelled wizard body before graph selection',async()=>{
 const f=applyGraphReplay(undefined,createFactorAnalysisNodeSupport);await f.run();
 assert.deepEqual(f.actions,[{verb:'click',ref:'ui-new-body'}]);
 assert.equal(f.operation.deadline,f.deadline);
});

test('factor apply refreshes one proved late SVG replacement without extending its deadline',async()=>{
 const f=applyGraphReplay('replaced',createFactorAnalysisNodeSupport);await f.run();
 assert.deepEqual(f.actions,[{verb:'click',ref:'ui-old-body'},{verb:'click',ref:'ui-new-body'}]);
 assert.equal(f.records.filter(r=>r.phase==='node_step_refresh_authorized').length,1);
 assert.equal(f.operation.deadline,f.deadline);
});
for(const fault of ['foreign_replaced','uncertain_replaced'])test('factor apply never refreshes '+fault,async()=>{
 const f=applyGraphReplay(fault,createFactorAnalysisNodeSupport);await assert.rejects(f.run());
 assert.deepEqual(f.actions,[{verb:'click',ref:'ui-old-body'}]);
 assert.equal(f.records.some(r=>r.phase==='node_step_refresh_authorized'),false);
 assert.equal(f.operation.deadline,f.deadline);
});
