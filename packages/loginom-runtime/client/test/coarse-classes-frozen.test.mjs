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
