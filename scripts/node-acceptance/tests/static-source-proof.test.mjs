import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyGeneratedCollapseMapping,verifyStaticSourceBytes} from '../static-source-proof.mjs';
test('generated Collapse definition requires complete native canonical schema without mapping or exclusion',()=>{
 const schema=[{name:'Key',label:'Key',type:'string'},{name:'Values',label:'Значения',type:'variant'}];
 const mapping={verified:true,inventory_complete:true,source_fields:[],target_fields:schema.map(f=>({...f,source:null,inherited:false,excluded:false}))};
 assert.equal(verifyGeneratedCollapseMapping(mapping,schema),true);
 for(const mutate of [m=>m.verified=false,m=>m.inventory_complete=false,m=>m.source_fields.push({record_id:'other'}),
  m=>m.target_fields.pop(),m=>m.target_fields.reverse(),m=>m.target_fields[1].name='Other',
  m=>m.target_fields[1].label='Other',m=>m.target_fields[1].type='string',m=>m.target_fields[1].excluded=true,
  m=>m.target_fields[1].inherited=true,m=>m.target_fields[1].source={record_id:'other'}]){
  const bad=structuredClone(mapping);mutate(bad);assert.throws(()=>verifyGeneratedCollapseMapping(bad,schema));
 }
});

for(const initialDirectory of ['/','/account/previous'])test('source verification waits for the selected directory: '+initialDirectory,async()=>{
 const prefix='MF;TF-1',gestures=[];
 let directory=initialDirectory,previous=directory,reads=0,navigating=false;
 const snapshot=()=>{
  if(navigating&&++reads>2){directory=previous==='/'?'/account':'/';navigating=false;}
  return {observation_id:'obs',workflow_ref:{prefix},dom_epoch:{document:'doc'},
   file_storage:{status:'observed',directory},ui:{dialogs:[],masks:[],elements:[
    {ref:'storage',tid:prefix+';FileStorageForm;cntFileStorage'},
    {ref:'navigation',tid:prefix+';NavigationBar;NavigationPanel'},
    {ref:'root',tid:prefix+';cnrNaviMode;b.s_Сервер>Файлы',allowed_actions:['click']},
    {ref:'own',label:'account',storage_entry:{kind:'folder'},allowed_actions:['double_click']},
   ]}};
 };
 const runtime={observe:async()=>({status:'SUCCEEDED',output:snapshot()}),uiAct:async action=>{
  gestures.push(action);previous=directory;reads=0;navigating=true;
  return {status:'SUCCEEDED',cleanup_complete:true};
 }};
 const result=await verifyStaticSourceBytes({runtime,sources:{imports:[]},allowed:[],account:'account',
  load:async name=>name.includes('text-export-output')?{findNativeStorageRow:async()=>snapshot()}:{},
  execute:()=>assert.fail('navigation readiness must not dispatch a download')});
 assert.equal(result.size,0);
 assert.equal(directory,'/account');
 assert.deepEqual(gestures.map(({verb,ref})=>({verb,ref})),[
  ...(initialDirectory==='/'?[]:[{verb:'click',ref:'root'}]),{verb:'double_click',ref:'own'},
 ]);
});
