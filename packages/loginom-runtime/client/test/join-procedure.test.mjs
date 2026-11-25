import test from 'node:test';import assert from 'node:assert/strict';
import {configureJoin} from '../lib/join-procedure.mjs';
import {configureJoinInputs} from '../lib/join-mappings.mjs';
const p={keys:[{left:'A',right:'B'},{left:'C',right:'D'}],case_sensitive:true,include_joined_keys:false};

function inputFixture(){
 const node={document_id:'doc',workflow_id:'wf',node_id:'join'};
 const sources=['left','right'].map(node_id=>({...node,node_id}));
 const schemas=[['A','C'],['B','D']].map(names=>names.map((name,index)=>({index,name,label:name,type:'string',data_kind:'Дискретный'})));
 const request={target:{kind:'new'},mode:'inner',parameters:p,mappings:[],inputs:sources.map((source,input)=>({source,input,output:0}))};
 const preflight={verified:true,proofs:sources.map((source,port)=>({verified:true,cleanup_complete:true,parameters_valid:true,settings_changed:false,
  source,port:0,schema:structuredClone(schemas[port]),preview:{verified:true,inventory_complete:true,node_id:source.node_id,port:0},
  node_context:{...source,verified:true,surface:'graph'}}))};
 const opened=[],finished=[];
 let port=null;
 const graph={...node,verified:true,surface:'graph',locked:false,tid:'Graph;Join'};
 const channel={
  async openInputPort(input){assert.equal(port,null);port=input;opened.push(port);},
  async observe({ready}){
   const prepared_node_context=port===null?graph:{...node,verified:true,surface:'wizard',tid:'W',
    input_port:{direction:'input',port,native_index:port,port_guid:'port-'+port,opening_operation_id:'open-'+opened.length}};
   const ui={elements:[],dialogs:[],masks:[]};
   if(port===null){const s={prepared_node_context,wizard:{status:'absent'},ui};assert.ok(ready(s));return s;}
   ui.elements.push({tid:'W;btnClose',ref:'close',allowed_actions:['click']});
   const fields=schemas[port].map(f=>({...f,status:'observed'}));
   const source_fields=fields.map(f=>({...f,field_id:String(f.index),record_id:'s'+f.index}));
   const s={prepared_node_context,ui,wizard:{status:'observed',stage:'input_mapping',root_tid:'W',root_ref:'root-'+opened.length,
    output_columns:{page:{status:'complete_definition_page',schema_id:'input-'+port,offset:0,limit:8,total_columns:fields.length,returned:fields.length,next_offset:null},fields}},
    node_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,autosync:true,
     mapping_wizard:'TuneDataSourceMappingWizard',node_context:prepared_node_context,source_fields,
     target_fields:fields.map((f,i)=>({...f,source:source_fields[i]}))}};
   assert.ok(ready(s));return s;
  },
  async perform({resolve,initialObservation}){assert.deepEqual(resolve(initialObservation),{verb:'click',ref:'close'});port=null;},
 };
 const finish=async(mode,isPort)=>{
  assert.equal(mode,'done');assert.equal(isPort,true);finished.push(port);port=null;
  return {verified:true,cleanup_complete:true,mode,settings_applied:true,node_context:graph};
 };
 return {channel,node,request,preflight,opened,finished,finish,schemas};
}

test('new Join opens each input mapping once and commits both owned ports',async()=>{
 const f=inputFixture();
 const r=await configureJoinInputs(f.channel,[],{node:f.node},f.request,f.finish,{preflight:f.preflight});
 assert.deepEqual(f.opened,[1,0]);
 assert.deepEqual(f.finished,[1,0]);
 assert.deepEqual(r.ports.map(p=>p.native_mapping.node_context.input_port.port_guid),['port-0','port-1']);
});

test('new Join refuses a native input that differs from the verified source before Done',async()=>{
 const f=inputFixture();
 f.schemas[1][0].label='Changed after preflight';
 await assert.rejects(configureJoinInputs(f.channel,[],{node:f.node},f.request,f.finish,{preflight:f.preflight}),/Join input changed after validation/);
 assert.deepEqual(f.opened,[1]);
 assert.deepEqual(f.finished,[]);
});

test('new Join refuses another source receipt before opening either input',async()=>{
 const f=inputFixture();
 f.preflight.proofs.reverse();
 await assert.rejects(configureJoinInputs(f.channel,[],{node:f.node},f.request,f.finish,{preflight:f.preflight}),/Join source preflight receipt differs/);
 assert.deepEqual(f.opened,[]);
 assert.deepEqual(f.finished,[]);
});
function fixture(fault){
 const c={verified:true,input_fields:[['A','C'].map(name=>({name,type:'string',record_id:name})),['B','D'].map(name=>({name,type:'string',record_id:name}))],keys:[],mode:'inner',case_sensitive:true,include_joined_keys:false,node_context:{node_id:'owned'}};
 const s={wizard:{stage:'join',root_tid:'W',root_ref:'wizard'},node_join:c,ui:{elements:['colSourceName_A','colSourceName_C','colDisplayName_B','colDisplayName_D'].map(tid=>({tid:'W;JoinDataWizard;'+tid,ref:tid,signature:{join_field:{side:tid.startsWith('colSource')?'left':'right',field_key:tid.split('_').at(-1),record_id:tid.split('_').at(-1),wizard_root_ref:'wizard'}},allowed_actions:['drag']}))}};
 const actions=[];
 return {c,actions,channel:{observe:async({ready})=>{assert.ok(ready(s));return structuredClone(s);},perform:async({resolve})=>{const action=resolve(s);actions.push(action);const left=action.source_ref.split('_').at(-1),right=action.target_ref.split('_').at(-1);c.keys.push({left,right});if(fault)throw Error(fault);}}};
}
test('Join waits for each complete key-set observation before creating the next pair',async()=>{const f=fixture();const r=await configureJoin(f.channel,p,{request:{mode:'inner',finish:'execute'}});assert.deepEqual(r.keys,p.keys);assert.equal(f.actions.length,2);});
test('Join never retries a lost link response or proceeds to the next pair',async()=>{const f=fixture('lost response');await assert.rejects(configureJoin(f.channel,p,{request:{mode:'inner',finish:'execute'}}),/lost response/);assert.equal(f.actions.length,1);assert.deepEqual(f.c.keys,[p.keys[0]]);});
test('Close does not mutate any Join setting',async()=>{const f=fixture();const r=await configureJoin(f.channel,p,{request:{mode:'inner',finish:'close'}});assert.equal(r.effect_possible,false);assert.equal(f.actions.length,0);assert.equal(r.draft_edits_skipped,true);});
test('full preserves saved empty keys and explicitly configures an empty key set without gestures',async()=>{
 const f=fixture();f.c.mode='full';
 for(const parameters of [{},{...p,keys:[]}]){
  const r=await configureJoin(f.channel,parameters,{request:{mode:'full',finish:'execute'}});
  assert.deepEqual(r.keys,[]);assert.equal(r.effect_possible,false);
 }
 assert.equal(f.actions.length,0);
 for(const mode of ['inner','left','right','difference']){
  f.c.mode=mode;
  await assert.rejects(configureJoin(f.channel,{}, {request:{mode,finish:'execute'}}),/no keys/);
 }
});
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
