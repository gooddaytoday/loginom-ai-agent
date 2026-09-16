import test from 'node:test';import assert from 'node:assert/strict';
import {verifyCollapseSourceFetch,collapseObsoleteFields} from '../lib/collapse-output-reconcile.mjs';
function fixture(){const sources=[{name:'Zone',label:'Зона',type:'string',record_id:'s0'}],stale={name:'Id',label:'Key',type:'integer',record_id:'t0',field_id:'f0',index:0,source:null,excluded:false,inherited:false,required:false};const after={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',node_context:{node_id:'n'},autosync:false,source_fields:sources,target_fields:[stale,{name:'Zone',label:'Зона',type:'string',record_id:'t1',field_id:'f1',index:1,source:sources[0],excluded:false,inherited:false,required:false}]};const before=structuredClone(after);before.source_fields=[];before.target_fields[1].source=null;return {before,after,sources};}
test('collapse source fetch retains an obsolete output until separately verified pruning',()=>{const f=fixture();assert.equal(verifyCollapseSourceFetch(f.before,f.after),undefined);assert.equal(collapseObsoleteFields(f.after,f.sources)[0].name,'Id');});
test('collapse pruning refuses mismatched schemas and any non-optional or still-valid target',()=>{for(const change of [f=>f.after.node_context.node_id='other',f=>f.after.target_fields[0].label='different',f=>f.after.autosync=true]){const f=fixture();change(f);assert.throws(()=>verifyCollapseSourceFetch(f.before,f.after));}for(const change of [f=>f.after.source_fields[0].type='variant',f=>f.after.target_fields[0].excluded=true,f=>f.after.target_fields[0].required=true,f=>f.after.target_fields[0].inherited=true,f=>f.after.target_fields[0].name='Zone']){const f=fixture();const sources=structuredClone(f.sources);change(f);assert.throws(()=>collapseObsoleteFields(f.after,sources));}});

test('conditional collapse output preserves a verified exclusion while identifying only stale active fields',async()=>{
 const {validateCollapseInlineSources}=await import('../lib/collapse-inline-mapping.mjs');
 const {collapseOutputSources}=await import('../lib/collapse-output-sources.mjs');
 const configuration={information:[{name:'Zone',label:'Zone',type:'string'}]};
 const source_fields=collapseOutputSources(configuration).map((f,i)=>({...f,record_id:'s'+i,field_id:String(i),index:i,required:false}));
 const native={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceMappingEngineOutputPortWizard',source_fields,target_fields:[{name:'Id',source:null,excluded:false,inherited:false,required:false},...source_fields.map(s=>({name:s.name,source:s,excluded:false,inherited:false,required:false}))]};
 const excluded=native.target_fields.at(-1);excluded.exclusion_source=excluded.source;excluded.source=null;excluded.excluded=true;
 assert.deepEqual(validateCollapseInlineSources(configuration,native).map(f=>f.name),['Id']);
 excluded.exclusion_source={...excluded.exclusion_source,record_id:'foreign'};assert.throws(()=>validateCollapseInlineSources(configuration,native));
});
