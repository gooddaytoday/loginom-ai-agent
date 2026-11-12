import test from 'node:test';import assert from 'node:assert/strict';
import {replacementSources,validateReplacementSources} from '../lib/replacement-output.mjs';
const config={input_fields:[{name:'A',label:'Same',type:'string'},{name:'B',label:'Same',type:'integer'}],rules:[{field:{name:'A'}}],requested_output_mode:'add'};
const native=()=>({verified:true,inventory_complete:true,source_identity_verified:true,produce_mode:'supplement',source_fields:replacementSources(config,'add'),target_fields:[]});
test('native nearest adds a real Delta for integer and real inputs, retaining precision zero schema',()=>{
 for(const type of ['integer','real'])for(const mode of ['add','replace']){
  const c={input_fields:[{name:'N',label:'Number',type}],rules:[{field:{name:'N'},precision:0.25}]};
  const fields=replacementSources(c,mode);
  assert.deepEqual(fields.at(-1),{name:'N_Delta',label:'Number Отклонение',type:'real'});
  const n={verified:true,inventory_complete:true,source_identity_verified:true,produce_mode:mode==='add'?'supplement':'replace',source_fields:fields,target_fields:[]};
  assert.doesNotThrow(()=>validateReplacementSources(c,n));
  n.source_fields=n.source_fields.slice(0,-1);assert.throws(()=>validateReplacementSources(c,n),/generated schema/);
  c.rules[0].precision=0;assert.equal(replacementSources(c,mode).at(-1).name,'N_Replaced');
 }
});
test('replacement result type changes only the derived value, retaining source and flag types',()=>{
 for(const result_type of ['integer','real','datetime']){
  const converted={...config,rules:[{field:{name:'A'},result_type}]};
  assert.deepEqual(replacementSources(converted,'add').map(f=>[f.name,f.type]),[['A','string'],['A_Replace',result_type],['A_Replaced','boolean'],['B','integer']]);
  assert.deepEqual(replacementSources(converted,'replace').map(f=>[f.name,f.type]),[['A',result_type],['A_Replaced','boolean'],['B','integer']]);
 }
});
test('Boolean result with other.keep generates a Variant value column and Boolean flag',()=>{
 const kept={...config,rules:[{field:{name:'A'},result_type:'boolean',other:{mode:'keep'}}]};
 assert.deepEqual(replacementSources(kept,'replace').map(f=>[f.name,f.type]),[['A','variant'],['A_Replaced','boolean'],['B','integer']]);
 assert.deepEqual(replacementSources(kept,'add').map(f=>[f.name,f.type]),[['A','string'],['A_Replace','variant'],['A_Replaced','boolean'],['B','integer']]);
 const nulled={...config,rules:[{field:{name:'A'},result_type:'boolean',other:{mode:'null'}}]};
 assert.equal(replacementSources(nulled,'replace')[0].type,'boolean');
});
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

test('external information adds the observed type and rejects missing or mistyped output',()=>{
 const c={input_fields:[{name:'Code',label:'Code',type:'string'},{name:'Keep',label:'Keep',type:'string'}],rules:[{field:{name:'Code'},external:{information:['Info']}}],external_input_fields:[{name:'Info',label:'Information',type:'string'}]};
 const source_fields=replacementSources(c,'replace');assert.deepEqual(source_fields.map(f=>[f.name,f.type]),[['Code','string'],['Code_Replaced','boolean'],['CodeInfo','string'],['Keep','string']]);
 const n={verified:true,inventory_complete:true,source_identity_verified:true,produce_mode:'replace',source_fields,target_fields:[]};assert.doesNotThrow(()=>validateReplacementSources(c,n));
 n.source_fields=structuredClone(source_fields);n.source_fields[2].type='integer';assert.throws(()=>validateReplacementSources(c,n),/generated schema/);
 n.source_fields=source_fields.filter(f=>f.name!=='CodeInfo');assert.throws(()=>validateReplacementSources(c,n),/generated schema/);
});

test('external readback binds observed roles to input 1 and both verified port receipts',async()=>{
 const {replacementConfigurationReadback}=await import('../lib/replacement-readback.mjs');
 const {nodeApplyResultSchema}=await import('../lib/node-result-schema.mjs');
 const {AjvJsonSchemaValidator}=await import('@modelcontextprotocol/sdk/validation/ajv');
 const node={document_id:'d',workflow_id:'w',node_id:'n'},owner={verified:true,...node},field={index:0,name:'Code',label:'Code',type:'string',data_kind:'Дискретный'},source={record_id:'s',name:'Code',label:'Code',type:'string'};
 const mapping=port=>({verified:true,inventory_complete:true,source_identity_verified:true,node_context:{...owner,input_port:{port,port_guid:port?'rules-guid':'main-guid'}},source_fields:[source],target_fields:[{...field,source}],autosync:false});
 const rule={field:{kind:'input_field',name:'Code'},type:'string',case_sensitive:true,other:{mode:'keep'},external:{port:1,value:'Value',replacement:'Replacement',information:['Info'],unused:['Ignored']}};
 const finish={verified:true,cleanup_complete:true,settings_applied:true,mode:'done',node_context:owner};
 const phases=[['input_mapping',{ports:[0,1].map(port=>({port,native_mapping:mapping(port),finish}))}],['configure',{configuration:{verified:true,inventory_complete:true,node_context:owner,mode:'external',rules:[rule],input_fields:[field],external_sources:[{field:'Code',source:'rules-guid'}]},validation:{status:'accepted_by_loginom_next',node_context:owner}}],['node_finish',finish],['output_mapping',{native_mapping:{...mapping(0),node_context:{...owner,output_port:{port:0}},produce_mode:'replace',target_fields:[{...field,source,excluded:false}]},finish}],['finish',finish]].map(([phase,value])=>({phase,receipt_id:'op:'+phase,status:'verified',value:{verified:true,cleanup_complete:true,...value}}));
 const readback=replacementConfigurationReadback({node,phases,operation_id:'op'});assert.equal(readback.kind,'replacement_external');assert.deepEqual(readback.input_mappings.map(m=>m.port),[0,1]);
 const result={operation_id:'op',status:'SUCCEEDED',effect_possible:true,phases:[],node,execution:{status:'not_requested',execution_id:null},output:{status:'not_refreshed',evidence_ref:null,ports:[]},package_saved:false,cleanup_complete:true,warnings:[],configuration:{status:'applied',readback}};
 const validation=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema)(result);assert.equal(validation.valid,true,JSON.stringify(validation));
 phases[0].value.ports[1].native_mapping.node_context.input_port.port_guid='foreign';assert.throws(()=>replacementConfigurationReadback({node,phases,operation_id:'op'}),/source differs/);
});
