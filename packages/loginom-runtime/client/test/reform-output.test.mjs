import test from 'node:test';import assert from 'node:assert/strict';
import {reformOutputSources} from '../lib/reform-output.mjs';
const fixture=()=>{
 const owner={verified:true,document_id:'doc',workflow_id:'flow',node_id:'reform'};
 const configuration={verified:true,inventory_complete:true,source_identity_verified:true,node_context:owner,fields:[{field_id:'3',name:'Amount',label:'Same',type:'real',excluded:false},{field_id:'8',name:'Discard',label:'Same',type:'string',excluded:true}]};
 const native={verified:true,inventory_complete:true,source_identity_verified:true,node_context:owner,source_fields:[{field_id:'0',name:'Amount',label:'Same',type:'real'}]};
 return {configuration,native};
};
test('reform output uses converted nonexcluded fields without confusing socket and input IDs',()=>{
 const f=fixture(),sources=reformOutputSources(f.configuration,f.native);assert.equal(sources.length,1);assert.equal(sources[0].name,'Amount');assert.equal(sources[0].type,'real');assert.equal(sources[0].used,true);
});
test('reform refuses original, incomplete, duplicate or foreign output schemas',()=>{
 for(const mutate of [f=>f.configuration.source_identity_verified=false,f=>f.native.source_fields=[],f=>f.native.source_fields.push({...f.native.source_fields[0]}),
  f=>f.native.source_fields[0].name='UnitPrice',f=>f.native.source_fields[0].type='string',f=>f.native.node_context={...f.native.node_context,node_id:'other'},f=>f.native.source_fields[0].label='Other']){
  const f=fixture();mutate(f);assert.throws(()=>reformOutputSources(f.configuration,f.native));
 }
});

test('conditional sync propagates a requested inherited label and preserves custom labels and field identities',async()=>{
 const {verifyReformInlineSync}=await import('../lib/reform-output.mjs');
 const a={record_id:'s1',name:'Amount',label:'New label',type:'real'},b={record_id:'s2',name:'Added',label:'Added',type:'integer'};
 const f={record_id:'r1',field_id:'0',index:0,group_index:0,source:a,name:'Amount',label:'Old label',type:'real',excluded:false};
 const before={source_fields:[a,b],autosync:false,target_fields:[f]};
 const after={...before,target_fields:[{...f,record_id:'r2',label:'New label'},
  {record_id:'r3',field_id:'1',index:1,group_index:1,source:b,name:b.name,label:b.label,type:b.type,excluded:false}]};
 const baseline={fields:[{field_id:'input-0',name:'Amount',label:'Old label'}]},configuration={fields:[{field_id:'input-0',name:'Amount',label:'New label',excluded:false}]};
 assert.equal(verifyReformInlineSync(before,after,[b],baseline,configuration),true);
 for(const change of [v=>v.target_fields[0].label='Other',v=>v.target_fields[0].field_id='9',v=>v.target_fields[0].type='string']){
  const altered=structuredClone(after);change(altered);assert.throws(()=>verifyReformInlineSync(before,altered,[b],baseline,configuration));
 }
 const custom=structuredClone(before);custom.target_fields[0].label='Custom';
 assert.throws(()=>verifyReformInlineSync(custom,after,[b],baseline,configuration));
 const kept=structuredClone(after);kept.target_fields[0].label='Custom';
 assert.equal(verifyReformInlineSync(custom,kept,[b],baseline,configuration),true);
});
