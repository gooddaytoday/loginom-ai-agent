import test from 'node:test';import assert from 'node:assert/strict';
import {createAssnRulesNodeSupport} from '../lib/assn-rules-node.mjs';
import {configureAssnRules} from '../lib/assn-rules-procedure.mjs';
function fixture(kind,values){
 const owner={verified:true,document_id:'doc',workflow_id:'flow',node_id:'rules'},roles={transaction:5,item:6};
 const fields=['T','I'].map((name,index)=>({index,name,label:name,record_id:'r'+index,field_id:String(index),type:'string',data_kind:'Дискретный',usage_type:index?roles.item:roles.transaction}));
 const sources=fields.map(f=>({...f,record_id:'source:'+f.record_id}));
 const inputMapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',node_context:{...owner,input_port:{port:0}},source_fields:sources,target_fields:sources.map(f=>({...f,record_id:'input:'+f.record_id,source:f}))};
 const native={pedMaxSupport:90,pedMinSupport:5,pedMinConfidence:50,pedNItemsMax:2,pedMinLift:1,pedNConsequentMax:1,pedExcludeLargeSupportItems:false,pedSelectColumn:false,pedExcludeSingleItems:false,...values};
 const pending={},actions=[];let stage='input_mapping';
 const snapshot=()=>{
  const control=stage==='assn_rules'?[{tid:'root;AssnRulesWizard;cntExcludeLargeSupportItems;cnt;chb;InputEl',ref:'exclude',allowed_actions:['click']},...Object.keys(native).map(k=>({tid:'root;AssnRulesWizard;'+k+';ValueControl',ref:'value:'+k,allowed_actions:['fill','press']}))]:[];
  const node_assn_rules=stage==='input_mapping'?{verified:true,inventory_complete:true,node_context:owner,fields:structuredClone(fields),roles}
   :stage==='assn_rules_auxiliary'?{verified:true,kind:'auxiliary',field_count:0}
   :stage==='assn_rules'?{verified:true,kind:'parameters',switches:{pedMinLift:false},values:structuredClone(native)}:undefined;
  return {prepared_node_context:{...owner,surface:stage==='closed'?'graph':'wizard',locked:false},wizard:stage==='closed'?{status:'absent'}:{status:'observed',owner_context:{status:'observed'},stage,root_tid:'root',root_ref:'wizard'},node_assn_rules,ui:{dialogs:[],masks:[],elements:[{tid:'root;btnClose',ref:'close',allowed_actions:['click']},{tid:'root;btnNext',ref:'next',allowed_actions:['wizard_step']},...control]}};
 };
 const channel={async observe({ready}){const s=snapshot();assert.equal(ready(s),true);return s;},
  async perform({ready,resolve}){const s=snapshot();assert.equal(ready(s),true);const a=resolve(s);actions.push(a);
   if(a.verb==='click'&&a.ref==='exclude')native.pedExcludeLargeSupportItems=!native.pedExcludeLargeSupportItems;
   else if(a.verb==='click'&&a.ref==='close')stage='closed';
   else if(a.verb==='wizard_step')stage=a.expected_stage;
   else if(a.verb==='fill')pending[a.ref.slice(6)]=Number(a.text);
   else if(a.verb==='press'){const k=a.ref.slice(6);native[k]=pending[k];}}};
 return {actions,run:(p,mode='fp_growth')=>configureAssnRules(channel,p===undefined?{}:{transaction_field:'T',item_field:'I',...p},{request:{target:{kind},mode},inputMapping})};
}
test('new association rules node without min_lift replaces native lift 1 with documented 0',async()=>{
 const f=fixture('new',{pedMinLift:1});
 const result=await f.run({min_support_pct:5,min_confidence_pct:50,max_items:2});
 assert.equal(result.configuration.min_lift,0);
 assert.deepEqual(f.actions.filter(a=>a.ref==='value:pedMinLift'),[{verb:'fill',text:'0',ref:'value:pedMinLift'},{verb:'press',key:'Tab',ref:'value:pedMinLift'}]);
});
test('apply inspects saved roles and parameters without any field or parameter edits',async()=>{
 const f=fixture('existing',{pedMinLift:1.5,pedNItemsMax:3,pedNConsequentMax:2});
 const result=await f.run(undefined,'apply');
 assert.equal(result.configuration.mode,'apply');assert.equal(result.configuration.min_lift,1.5);
 assert.equal(result.configuration.max_items,3);assert.equal(result.configuration.max_consequents,2);
 assert.equal(result.settings_applied,false);assert.equal(result.effect_possible,false);
 assert.deepEqual(f.actions.map(a=>a.verb),['wizard_step','wizard_step','wizard_step']);
});
test('existing association rules node without min_lift keeps its saved lift',async()=>{
 const f=fixture('existing',{pedMinLift:1.5});
 const result=await f.run({});
 assert.equal(result.configuration.min_lift,1.5);
 assert.deepEqual(f.actions.filter(a=>a.ref==='value:pedMinLift'),[]);
});

test('apply beforeGraphExecute skips graph inspection and native training',async()=>{
 const node={document_id:'doc',workflow_id:'wf',node_id:'cluster'};
 const workflow={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'scenario',label:'Scenario'}]};
 const deadline=Date.now()+10000,continued=Error('graph continuation reached without training');
 const tid='MF;TF-1;Graph;Cluster';
 const state={origin:'https://loginom.test',loginom_build:'7.4.2',workflow_ref:workflow,
  dom_epoch:{document:'dom',revision:1},scan:{complete:true},wizard:{status:'absent'},
  prepared_node_context:{...node,verified:true,surface:'graph',locked:false,tid},
  ui:{dialogs:[],masks:[],truncated:{dialogs:false,masks:false},elements:[{tid,ref:'body',scope:'graph',graph_node:{part:'body'},signature:{tag:'g'},
   bounding_box:{x:100,y:100,width:56,height:104},allowed_actions:['click'],interaction:{state:'point_observed'}}]}};
 const support=createAssnRulesNodeSupport({targetOrigin:'https://loginom.test',targetBuild:'7.4.2'});
 const driver=support.nodeApplyDriverFactory({now:Date.now,receiptOptions:()=>({}),
  operation:{id:'apply',deadline,action:{action_key:'node.apply',revision:'1'},parameters:{mode:'apply'},nodeApply:{request:{mode:'apply'},node},
   nodeTargetAdapter:{async observe(){assert.fail('apply must not inspect the training graph');}}},
  execute:async()=>({status:'SUCCEEDED',output:state}),
  onRecord:async row=>{
   if(row.phase==='node_observation_sample'){
    // Training starts with process-console observations. Only the first graph
    // continuation after the production hook may reach this test boundary.
    assert.equal(row.readiness.condition,'calculator graph ready after port commit','apply must not enter native training');
    assert.equal(row.readiness.satisfied,true);
    throw continued;
   }
   return structuredClone(row);
  }});
 await assert.rejects(driver.finishGraph('execute',{document_id:node.document_id,workflow_ref:workflow,node,deadline}),error=>error===continued);
});

for(const values of [{pedSelectColumn:true},{pedExcludeSingleItems:true},{pedNItemsMax:4},{pedNConsequentMax:3},{pedMinSupport:101},{pedMaxSupport:101}])
 test('apply refuses unsupported saved settings and discards its draft: '+JSON.stringify(values),async()=>{
  const f=fixture('existing',values);
  await assert.rejects(f.run(undefined,'apply'),error=>{
   assert.equal(error.nodePhaseRefusal?.verification,'assn_rules_apply_preserved');
   assert.equal(error.nodePhaseRefusal.proof.closed.draft_discarded,true);return true;
  });
  assert.equal(f.actions.at(-1).ref,'close');
  assert.ok(f.actions.every(a=>['wizard_step','click'].includes(a.verb)));
 });

test('support exclusion toggles the visible native group, preserves omitted state and disables explicitly',async()=>{
 const enabled=fixture('new',{});const result=await enabled.run({exclude_support_above_pct:90});
 assert.equal(result.configuration.exclude_support_above_pct,90);
 assert.equal(enabled.actions.filter(a=>a.ref==='exclude').length,1);
 const saved=fixture('existing',{pedExcludeLargeSupportItems:true,pedMaxSupport:90});
 assert.equal((await saved.run({})).configuration.exclude_support_above_pct,90);
 assert.equal(saved.actions.filter(a=>a.ref==='exclude').length,0);
 const disabled=fixture('existing',{pedExcludeLargeSupportItems:true,pedMaxSupport:90});
 assert.equal((await disabled.run({exclude_support_above_pct:null})).configuration.exclude_support_above_pct,null);
 assert.equal(disabled.actions.filter(a=>a.ref==='exclude').length,1);
});
test('apply preserves saved maximum support exclusion without parameter edits',async()=>{
 const f=fixture('existing',{pedExcludeLargeSupportItems:true,pedMaxSupport:90});
 assert.equal((await f.run(undefined,'apply')).configuration.exclude_support_above_pct,90);
 assert.ok(f.actions.every(a=>a.verb==='wizard_step'));
});

test('an exclusion threshold patch commits the observed numeric percentage',async()=>{
 const f=fixture('existing',{pedExcludeLargeSupportItems:true,pedMaxSupport:90});
 assert.equal((await f.run({exclude_support_above_pct:80})).configuration.exclude_support_above_pct,80);
 assert.deepEqual(f.actions.filter(a=>a.ref==='value:pedMaxSupport'),[{verb:'fill',text:'80',ref:'value:pedMaxSupport'},{verb:'press',key:'Tab',ref:'value:pedMaxSupport'}]);
});
