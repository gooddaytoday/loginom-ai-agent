import test from 'node:test';import assert from 'node:assert/strict';
import {configureJoin} from '../lib/join-procedure.mjs';
const p={keys:[{left:'A',right:'B'},{left:'C',right:'D'}],case_sensitive:true,include_joined_keys:false};
function fixture(fault){
 const c={verified:true,input_fields:[['A','C'].map(name=>({name,type:'string',record_id:name})),['B','D'].map(name=>({name,type:'string',record_id:name}))],keys:[],mode:'inner',case_sensitive:true,include_joined_keys:false,node_context:{node_id:'owned'}};
 const s={wizard:{stage:'join',root_tid:'W',root_ref:'wizard'},node_join:c,ui:{elements:['colSourceName_A','colSourceName_C','colDisplayName_B','colDisplayName_D'].map(tid=>({tid:'W;JoinDataWizard;'+tid,ref:tid,signature:{join_field:{side:tid.startsWith('colSource')?'left':'right',field_key:tid.split('_').at(-1),record_id:tid.split('_').at(-1),wizard_root_ref:'wizard'}},allowed_actions:['drag']}))}};
 const actions=[];
 return {c,actions,channel:{observe:async({ready})=>{assert.ok(ready(s));return structuredClone(s);},perform:async({resolve})=>{const action=resolve(s);actions.push(action);const left=action.source_ref.split('_').at(-1),right=action.target_ref.split('_').at(-1);c.keys.push({left,right});if(fault)throw Error(fault);}}};
}
test('Join waits for each complete key-set observation before creating the next pair',async()=>{const f=fixture();const r=await configureJoin(f.channel,p,{request:{mode:'inner',finish:'execute'}});assert.deepEqual(r.keys,p.keys);assert.equal(f.actions.length,2);});
test('Join never retries a lost link response or proceeds to the next pair',async()=>{const f=fixture('lost response');await assert.rejects(configureJoin(f.channel,p,{request:{mode:'inner',finish:'execute'}}),/lost response/);assert.equal(f.actions.length,1);assert.deepEqual(f.c.keys,[p.keys[0]]);});
test('Close does not mutate any Join setting',async()=>{const f=fixture();const r=await configureJoin(f.channel,p,{request:{mode:'inner',finish:'close'}});assert.equal(r.effect_possible,false);assert.equal(f.actions.length,0);assert.equal(r.draft_edits_skipped,true);});
for(const [mode,label] of [['inner','Внутреннее_соединение'],['left','Левое_соединение'],['right','Правое_соединение'],['full','Полное_соединение'],['difference','Разность']]){
 test('Join selects observed data-tid for '+mode+' and preserves keys and options',async()=>{
  const c={verified:true,input_fields:[['A','C'],['B','D']].map(ns=>ns.map(name=>({name,type:'string'}))),keys:structuredClone(p.keys),
   mode:mode==='inner'?'full':'inner',case_sensitive:true,include_joined_keys:false,node_context:{node_id:'owned'}};
  const s={wizard:{stage:'join',root_tid:'W'},node_join:c,ui:{elements:[]}},actions=[];
  const prefix='W;JoinDataWizard;pedJoinType;ValueControl;';
  const element=tid=>({tid:prefix+tid,ref:tid,allowed_actions:['click']});
  s.ui.elements=[element('trg_picker')];
  const channel={observe:async({ready})=>{assert.ok(ready(s));return structuredClone(s);},perform:async({resolve})=>{
   const action=resolve(s);actions.push(action.ref);
   if(action.ref==='trg_picker')s.ui.elements.push(element('boundlist;'+label));
   else{assert.equal(action.ref,'boundlist;'+label);c.mode=mode;}
  }};
  const result=await configureJoin(channel,p,{request:{mode,finish:'done'}});
  assert.deepEqual(actions,['trg_picker','boundlist;'+label]);assert.deepEqual(result.changes,['mode']);
  const preserved=await configureJoin(channel,{}, {request:{mode,finish:'execute'}});
  assert.equal(preserved.preserved,true);assert.deepEqual(preserved.keys,p.keys);assert.equal(actions.length,2);
 });
}
