import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCoarseClassesParameters} from '../lib/coarse-classes-parameters.mjs';
import {configureFrozenCoarseClasses} from '../lib/coarse-classes-manual.mjs';

test('frozen is an explicit Boolean for automatic discrete training',()=>{
 const c={input_field:'Segment',target_field:'Target',event_value:'yes',partition:'automatic',min_class_percent:5,max_classes:2,uniformity_percent:0,frozen:true};
 assert.doesNotThrow(()=>validateCoarseClassesParameters({coarse_classes:c},'internal'));
 for(const patch of [{frozen:'true'},{partition:'manual',cut:7}])assert.throws(()=>validateCoarseClassesParameters({coarse_classes:{...c,...patch}},'internal'));
});

test('frozen native editor verifies IsLocked and never toggles an already locked partition',async()=>{
 for(const initiallyLocked of [false,true]){
  let locked=initiallyLocked,clicks=0;
  const tid='wizard;CoarseClassesWizard-2;CoarseClassesEditor;colColumnUsePrevBinning_Segment';
  const state=()=>({wizard:{stage:'coarse_classes_model',root_tid:'wizard'},node_coarse_classes:{verified:true,model:{input_field:'Segment',locked,edited:false,classes:[{number:0,lower:null,upper:null},{number:1,lower:null,upper:null}]}},ui:{elements:[{tid,ref:'lock',allowed_actions:['click']}]}});
  const channel={observe:async o=>{const s=state();assert.ok(o.ready(s),o.condition);return s;},perform:async o=>{assert.deepEqual(o.resolve(state()),{verb:'click',ref:'lock'});locked=true;clicks++;}};
  const read=await configureFrozenCoarseClasses(channel,{input_field:'Segment'});
  assert.equal(read.locked,true);assert.equal(clicks,initiallyLocked?0:1);
 }
});

test('same-node frozen retraining preserves the saved input role without resetting analytic settings',async()=>{
 const {configureCoarseClasses}=await import('../lib/coarse-classes-procedure.mjs');
 const fields=[{name:'Segment',label:'Segment',type:'string',data_kind:'Дискретный',index:0,record_id:'s',role:'input',frozen:true},
  {name:'Target',label:'Target',type:'string',data_kind:'Дискретный',index:1,record_id:'t',role:'target',frozen:false}];
 let stage='coarse_classes',selected=fields[0];const gestures=[];
 const root='wizard',model={input_field:'Segment',locked:true,edited:false,classes:[{number:0,lower:null,upper:null},{number:1,lower:null,upper:null}]};
 const snapshot=()=>structuredClone({wizard:{stage,root_tid:root},prepared_node_context:{verified:true,node_id:'same-node'},
  node_coarse_classes:{verified:true,fields,selected,model,settings:{event_value:selected.name==='Target'?'yes':null,min_class_percent:5,max_classes:2,uniformity_percent:0,fine_classes:false}},
  ui:{elements:[{tid:root+';btnNext',ref:'next',allowed_actions:['wizard_step']},...fields.map(f=>({tid:root+';CoarseClassesWizard-1;colColumnDisplayName_'+f.name,ref:f.name,allowed_actions:['click']}))]}});
 const channel={observe:async o=>{const s=snapshot();assert.ok(o.ready(s),o.condition);return s;},perform:async o=>{
  const a=o.resolve(snapshot());gestures.push(a);
  if(a.verb==='wizard_step')stage=a.expected_stage;
  else {assert.ok(['Segment','Target'].includes(a.ref));selected=fields.find(f=>f.name===a.ref);}
 }};
 const result=await configureCoarseClasses(channel,{coarse_classes:{input_field:'Segment',target_field:'Target',event_value:'yes',partition:'automatic',min_class_percent:5,max_classes:2,uniformity_percent:0,frozen:true}},
  {request:{mode:'internal'},inputMapping:{target_fields:fields}});
 assert.deepEqual(result.configuration.frozen_partition,model);
 assert.equal(result.configuration.frozen,true);
 assert.equal(gestures.filter(a=>a.verb==='wizard_step').length,5);
 assert.ok(gestures.every(a=>a.verb==='wizard_step'||['Segment','Target'].includes(a.ref)));
});
