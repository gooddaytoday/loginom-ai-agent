import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {javascriptMappingState} from './javascript-mapping-state.mjs';
const node={document_id:'doc',workflow_id:'workflow',node_id:'js'};
const base='MF;TF-1;WizrdMCF;DataSetOutputSocketWizard;';
const make=()=>({verified:false,source_identity_verified:false,configured_inventory_verified:true,reason:'mapping_source_pending',
  inventory_complete:true,state_source:'cached_mapping_stores',autosync:true,settings_applied:false,package_saved:false,
  mapping_wizard:'DataSetOutputSocketWizard',node_context:{...node,verified:true,surface:'wizard',tid:'MF;TF-1;WizrdMCF',output_port:{direction:'output',port:0,port_guid:'port'}},
  source_fields:[],target_fields:[{name:'ObservedID',source:null,exclusion_source:null,excluded:false}],rendered_indices:[0],
  source_pending:{kind:'hidden_source_column',native_header_verified:true,header_tid:base+'grdTargetColumns;headercontainer',
    column_tid:base+'colSourceDisplayName',data_index:'SourceDisplayName',item_id:'colSourceDisplayName',hidden:true,visible:false,source_count:0,target_count:1}});
test('configured state requires explicit output-only admission and remains unverified',()=>{
 const m=make();assert.throws(()=>javascriptMappingState(m,node,{direction:'output'}));
 assert.throws(()=>javascriptMappingState(m,node,{direction:'input',allowConfiguredOnly:true}));
 assert.equal(javascriptMappingState(m,node,{direction:'output',allowConfiguredOnly:true}),'configured_only');assert.equal(m.verified,false);
});
for(const [name,change] of Object.entries({
 owner:m=>{m.node_context.node_id='foreign';},surface:m=>{m.node_context.surface='graph';},
 wizard:m=>{m.mapping_wizard='Other';},header:m=>{m.source_pending.header_tid='foreign';},
 column:m=>{m.source_pending.column_tid='foreign';},hidden:m=>{m.source_pending.hidden=false;},
 visible:m=>{m.source_pending.visible=true;},native:m=>{m.source_pending.native_header_verified=false;},
 source:m=>{m.source_fields.push({});},connected:m=>{m.target_fields[0].source={};},
 excluded:m=>{m.target_fields[0].excluded=true;},partial:m=>{m.inventory_complete=false;},
 rendered:m=>{m.rendered_indices=[];},count:m=>{m.source_pending.target_count=2;},
 mixed:m=>{m.verified=true;},applied:m=>{m.settings_applied=true;},port:m=>{m.node_context.output_port.port=1;},
 saved:m=>{m.package_saved=true;},reason:m=>{m.reason='mapping_render_value';}
}))test('configured proof refuses '+name,()=>{
 const m=make();change(m);assert.throws(()=>javascriptMappingState(m,node,{direction:'output',allowConfiguredOnly:true}));
});
test('complete source mapping stays complete without opt-in',()=>{
 const m=make();m.verified=true;m.source_identity_verified=true;m.source_fields=[{name:'ObservedID'}];
 delete m.configured_inventory_verified;delete m.source_pending;delete m.reason;
 assert.equal(javascriptMappingState(m,node,{direction:'output'}),'complete');
 m.source_identity_verified=false;assert.throws(()=>javascriptMappingState(m,node,{direction:'output',allowConfiguredOnly:true}));
});

for(const mode of ['default','allowed','foreign','input','mixed'])test('actual runtime configured admission is explicit: '+mode,async()=>{
 const source=await readFile(new URL('./javascript-execution-runtime.mjs',import.meta.url),'utf8');
 const start=source.indexOf('    async readPortMapping('),end=source.indexOf('    async prepareInput()',start);
 assert.ok(start>0&&end>start);const mapping=make(),calls=[];
 if(mode==='foreign')mapping.node_context.node_id='other';
 const method=vm.runInNewContext('({'+source.slice(start,end)+'}).readPortMapping',{
  Math,Date,Error,AggregateError,structuredClone,javascriptMappingState,
  deadline:Date.now()+2000,prepared:{document_id:'doc',workflow_ref:{workflow_id:'workflow'}},
  graph:async()=>({}),requireJavascriptTopology:()=>{},requireJavascriptGraphUnchanged:()=>{},captureJavascriptNativeTopology:()=>{},
  page:{evaluateHandle:async()=>({dispose:async()=>calls.push('dispose')}),evaluate:async()=>true},
  channel:()=>({openPort:async()=>calls.push('open'),observe:async options=>{
   const state={node_mapping:mapping,prepared_node_context:{verified:true}};
   if(!options.ready(state))throw Error('Not ready');return state;
  }}),record:async()=>{},closeJavascriptPortMapping:async({verifyGraph})=>{calls.push('close');await verifyGraph();}
 });
 const options={allowConfiguredOnly:mode!=='default',characterize:mode==='mixed'};
 const run=()=>method(node,mode==='input'?'input':'output',options);
 if(mode==='allowed'){const result=await run();assert.equal(result.configured_inventory_verified,true);assert.equal(result.verified,false);}
 if(mode!=='allowed')await assert.rejects(run());
 assert.deepEqual(calls,['input','mixed'].includes(mode)?[]:['open','close','dispose']);
});
