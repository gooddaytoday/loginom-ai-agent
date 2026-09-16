import test from 'node:test';import assert from 'node:assert/strict';
import {replacementSources,validateReplacementSources} from '../lib/replacement-output.mjs';
const config={input_fields:[{name:'A',label:'Same',type:'string'},{name:'B',label:'Same',type:'integer'}],rules:[{field:{name:'A'}}],requested_output_mode:'add'};
const native=()=>({verified:true,inventory_complete:true,source_identity_verified:true,produce_mode:'supplement',source_fields:replacementSources(config,'add'),target_fields:[]});
test('generated fields retain original names and disambiguate duplicate labels',()=>{assert.deepEqual(replacementSources(config,'add').map(f=>[f.name,f.type]),[['A','string'],['A_Replace','string'],['A_Replaced','boolean'],['B','integer']]);assert.deepEqual(replacementSources(config,'replace').map(f=>f.name),['A','A_Replaced','B']);assert.deepEqual(validateReplacementSources(config,native()),[]);});
test('output proof refuses duplicated names, wrong types, wrong policy and incomplete sources',()=>{for(const edit of [n=>n.source_fields[1]=n.source_fields[0],n=>n.source_fields[2].type='string',n=>n.produce_mode='replace',n=>n.source_identity_verified=false,n=>n.source_fields.pop()]){const n=native();edit(n);assert.throws(()=>validateReplacementSources(config,n));}});

test('reconfiguring a derived output retains its excluded source and aliases',async()=>{
 const {configureReplacementInlineMapping}=await import('../lib/replacement-output.mjs');
 const n=native();n.mapping_wizard='DerivedDataSourceMappingEngineOutputPortWizard';n.autosync=false;
 n.source_fields=n.source_fields.map((f,i)=>({...f,record_id:'s'+i}));
 n.target_fields=n.source_fields.map((s,i)=>({record_id:'t'+i,index:i,name:'Alias'+i,label:'Same',type:s.type,source:i===3?null:s,exclusion_source:i===3?s:null,excluded:i===3,required:false,inherited:false}));
 const initial=structuredClone(n),actions=[];
 const state={wizard:{stage:'output_mapping',root_tid:'w'},node_mapping:n,ui:{elements:[{tid:'w;DerivedDataSourceMappingEngineOutputPortWizard;rbTable;DisplayEl',ref:'table',allowed_actions:['click']},{tid:'w;btnNext',ref:'next',allowed_actions:['wizard_step']}]}};
 const channel={observe:async()=>state,perform:async options=>{actions.push(options.resolve(state));return {};}};
 const result=await configureReplacementInlineMapping(channel,config);
 assert.deepEqual(result.after,initial);assert.deepEqual(result.added_sources,[]);assert.deepEqual(actions.map(a=>[a.verb,a.ref]),[['click','table'],['wizard_step','next']]);
 n.target_fields[3].exclusion_source=n.source_fields[0];
 await assert.rejects(()=>configureReplacementInlineMapping(channel,config),/unique source links/);
});
