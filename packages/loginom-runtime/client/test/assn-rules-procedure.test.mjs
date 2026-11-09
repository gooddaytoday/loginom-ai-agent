import test from 'node:test';import assert from 'node:assert/strict';
import {configureAssnRules} from '../lib/assn-rules-procedure.mjs';
function fixture(kind,values){
 const owner={verified:true,document_id:'doc',workflow_id:'flow',node_id:'rules'},roles={transaction:5,item:6};
 const fields=['T','I'].map((name,index)=>({index,name,label:name,record_id:'r'+index,field_id:String(index),type:'string',data_kind:'Дискретный',usage_type:index?roles.item:roles.transaction}));
 const sources=fields.map(f=>({...f,record_id:'source:'+f.record_id}));
 const inputMapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',node_context:{...owner,input_port:{port:0}},source_fields:sources,target_fields:sources.map(f=>({...f,record_id:'input:'+f.record_id,source:f}))};
 const native={pedMinSupport:5,pedMinConfidence:50,pedNItemsMax:2,pedMinLift:1,pedNConsequentMax:1,pedExcludeLargeSupportItems:false,pedSelectColumn:false,pedExcludeSingleItems:false,...values};
 const pending={},actions=[];let stage='input_mapping';
 const snapshot=()=>{
  const control=stage==='assn_rules'?Object.keys(native).map(k=>({tid:'root;AssnRulesWizard;'+k+';ValueControl',ref:'value:'+k,allowed_actions:['fill','press']})):[];
  const node_assn_rules=stage==='input_mapping'?{verified:true,inventory_complete:true,node_context:owner,fields:structuredClone(fields),roles}
   :stage==='assn_rules_auxiliary'?{verified:true,kind:'auxiliary',field_count:0}
   :stage==='assn_rules'?{verified:true,kind:'parameters',switches:{pedMinLift:false},values:structuredClone(native)}:undefined;
  return {prepared_node_context:owner,wizard:{stage,root_tid:'root',root_ref:'wizard'},node_assn_rules,ui:{elements:[{tid:'root;btnNext',ref:'next',allowed_actions:['wizard_step']},...control]}};
 };
 const channel={async observe({ready}){const s=snapshot();assert.equal(ready(s),true);return s;},
  async perform({ready,resolve}){const s=snapshot();assert.equal(ready(s),true);const a=resolve(s);actions.push(a);
   if(a.verb==='wizard_step')stage=a.expected_stage;
   else if(a.verb==='fill')pending[a.ref.slice(6)]=Number(a.text);
   else if(a.verb==='press'){const k=a.ref.slice(6);native[k]=pending[k];}}};
 return {actions,run:p=>configureAssnRules(channel,{transaction_field:'T',item_field:'I',...p},{request:{target:{kind}},inputMapping})};
}
test('new association rules node without min_lift replaces native lift 1 with documented 0',async()=>{
 const f=fixture('new',{pedMinLift:1});
 const result=await f.run({min_support_pct:5,min_confidence_pct:50,max_items:2});
 assert.equal(result.configuration.min_lift,0);
 assert.deepEqual(f.actions.filter(a=>a.ref==='value:pedMinLift'),[{verb:'fill',text:'0',ref:'value:pedMinLift'},{verb:'press',key:'Tab',ref:'value:pedMinLift'}]);
});
test('existing association rules node without min_lift keeps its saved lift',async()=>{
 const f=fixture('existing',{pedMinLift:1.5});
 const result=await f.run({});
 assert.equal(result.configuration.min_lift,1.5);
 assert.deepEqual(f.actions.filter(a=>a.ref==='value:pedMinLift'),[]);
});
