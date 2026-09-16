import test from 'node:test';import assert from 'node:assert/strict';
import {verifyJoinOutputSync} from '../lib/join-output-sync.mjs';
function fixture(){
 const source_fields=['L','Part','RKey'].map((name,i)=>({record_id:'s'+i,field_id:String(i),index:i,name,label:name,type:'string',required:false}));
 const field=(i,index=i)=>({record_id:'t'+i,field_id:'f'+i,index,name:source_fields[i].name,label:source_fields[i].label,type:'string',required:false,excluded:false,source:source_fields[i],exclusion_source:null});
 const excluded={...field(1),excluded:true,source:null,exclusion_source:source_fields[1]};
 const before={source_fields,target_fields:[field(0),excluded],autosync:false,node_context:{node_id:'owned'}};
 const after=structuredClone({...before,target_fields:[field(0),field(2,1),{...excluded,index:2}]});
 after.source_fields.forEach(s=>s.record_id='new'+s.field_id);after.target_fields.forEach(f=>{for(const k of ['source','exclusion_source'])if(f[k])f[k].record_id='new'+f[k].field_id;f.record_id='new'+f.record_id;});
 return {before,after};
}
test('Join synchronization retains aliases and exclusions across rebuilt local IDs',()=>{const {before,after}=fixture();assert.equal(verifyJoinOutputSync(before,after),true);});
test('Join synchronization rejects changed owner, existing values, exclusions and inventory',()=>{
 for(const change of [a=>a.node_context.node_id='other',a=>a.autosync=true,a=>a.target_fields[0].name='renamed',a=>a.target_fields[2].excluded=false,a=>a.source_fields[0].field_id='other',a=>a.target_fields.pop(),a=>a.target_fields[1].source=a.target_fields[0].source]){
  const {before,after}=fixture();change(after);assert.throws(()=>verifyJoinOutputSync(before,after));
 }
});
