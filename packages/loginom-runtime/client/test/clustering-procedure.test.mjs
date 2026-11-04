import test from 'node:test';
import assert from 'node:assert/strict';
import {configureClustering} from '../lib/clustering-procedure.mjs';

// Native selector observed at lab717-integrated-norm-1/main journal:475.
// The browser transport alone is replaced; production configuration and its
// ownership/readback guards decide every gesture and stage transition.
function fixture(initial=[5,5],kind='existing'){
 const node={verified:true,document_id:'doc',workflow_id:'wf',node_id:'cluster'};
 const fields=['X','Y'].map((name,index)=>({name,label:name,type:'real',data_kind:'Непрерывный',index,field_id:String(index),record_id:'role-'+index,usage_type:3}));
 const source_fields=fields.map(f=>({record_id:'src-'+f.index,field_id:f.field_id,name:f.name,label:f.label,type:f.type}));
 const inputMapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',node_context:{...node,input_port:{port:0}},source_fields,target_fields:fields.map((f,i)=>({...f,source:source_fields[i]}))};
 const norms=fields.map((f,i)=>({...f,norm_type:initial[i],importance:1,irremovable:false})),actions=[];
 const labels={'Нет':0,'Масштабирование [-1;1]':2,'Масштабирование [0;1]':3,'Абсолютное масштабирование':4,'Стандартизация':5};
 let stage='input_mapping',selected=[],editor=null,picker=false;
 const element=(tid,verb='click',label)=>({tid,ref:tid,allowed_actions:[verb],label});
 const state=()=>({prepared_node_context:node,wizard:{stage,root_tid:'W',root_ref:'wizard'},
  node_clustering:{verified:true,node_context:node,inventory_complete:true,...(stage==='input_mapping'?{fields}:stage==='normalization'?{kind:'normalization',fields:structuredClone(norms),selected,editor,source_status:'Вход активирован'}:{kind:'parameters',auto:false,clusters:3,seed:42,switches:{},values:{pedClustersMin:1,pedClustersMax:10,pedThreshold:1}})},
  ui:{elements:[element('W;btnNext','wizard_step'),...fields.map(f=>element('W;NormTuneWizard;colDisplayName_'+f.name)),element('W;NormTuneWizard;btnEdit'),
   ...(editor?[element('W;ColumnsEditForm;cbxNormType;trg_picker'),element('W;ColumnsEditForm;btnApply')]:[]),
   ...(picker?Object.keys(labels).map(label=>element('W;ColumnsEditForm;cbxNormType;boundlist;'+label,'click',label)):[])]}});
 const channel={async observe({ready}){const s=state();assert.equal(ready(s),true);return s;},async perform({ready,resolve}){
  const s=state();assert.equal(ready(s),true);const a=resolve(s);actions.push(a);
  if(a.verb==='wizard_step'){stage=a.expected_stage;return;}
  if(a.ref.includes('colDisplayName_'))selected=[norms.find(f=>a.ref.endsWith('_'+f.name)).record_id];
  if(a.ref.endsWith(';btnEdit'))editor={root_tid:'W;ColumnsEditForm',record_ids:selected,norm_type:norms.find(f=>selected.includes(f.record_id)).norm_type};
  if(a.ref.endsWith(';trg_picker'))picker=true;
  if(a.ref.includes(';boundlist;')){editor.norm_type=labels[a.ref.split(';boundlist;')[1]];picker=false;}
  if(a.ref.endsWith(';btnApply')){norms.find(f=>selected.includes(f.record_id)).norm_type=editor.norm_type;editor=null;}
 }};
 return {actions,norms,run:p=>configureClustering(channel,p,{request:{target:{kind}},inputMapping})};
}

for(const [method,id,label] of [['scale_minus_one_one',2,'Масштабирование [-1;1]'],['scale_zero_one',3,'Масштабирование [0;1]'],['absolute_scale',4,'Абсолютное масштабирование']]){
 test('production wizard sets each feature to '+method,async()=>{
  const f=fixture(),r=await f.run({normalization:method});
  assert.deepEqual(r.configuration.normalization.map(n=>n.norm_type),[id,id]);
  assert.equal(f.actions.filter(a=>a.ref?.endsWith(';boundlist;'+label)).length,2);
  assert.ok(f.norms.every(n=>n.importance===1&&n.irremovable===false));
 });
 test('existing omission preserves '+method+' without opening editors',async()=>{
  const f=fixture([id,id]);await f.run({});
  assert.ok(f.actions.every(a=>a.verb==='wizard_step'));
 });
}
test('mixed and unsupported methods require explicit choice before normalizer edits',async()=>{
 for(const ids of [[2,3],[1,1],[6,6]]){
  const f=fixture(ids);await assert.rejects(f.run({}),/explicit/);
  assert.equal(f.actions.length,1);
 }
 const f=fixture([2,3]);await f.run({normalization:'absolute_scale'});
 assert.deepEqual(f.norms.map(n=>n.norm_type),[4,4]);
});
test('new omission still chooses none; existing standardize still remains',async()=>{
 const fresh=fixture([5,5],'new');await fresh.run({});assert.deepEqual(fresh.norms.map(n=>n.norm_type),[0,0]);
 const saved=fixture();await saved.run({});assert.ok(saved.actions.every(a=>a.verb==='wizard_step'));
});
