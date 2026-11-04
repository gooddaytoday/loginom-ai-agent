import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightDataToVarSource,preflightInactiveDataToVarSource} from '../lib/variables-datatovar-preflight.mjs';

const parameters={fields:[{field:{kind:'input_field',name:'X'},aggregations:['sum','count','min','max','avg']}]};

test('DataToVar preflight preserves the existing schema path and refuses a missing new-node input before browser calls',async()=>{
 const options={operation:{parameters:{target:{kind:'existing'},parameters,inputs:[],mappings:[]}},execute:()=>assert.fail('no browser call')};
 assert.equal((await preflightDataToVarSource(options,{},{})).validation_deferred,'input_mapping');
 options.operation.parameters.target.kind='new';
 await assert.rejects(preflightDataToVarSource(options,{},{}),e=>e.nodePhaseRefusal?.effect_possible===false&&e.nodePhaseRefusal.cleanup_complete===true);
});

function fixture({type='integer',name='X',foreign=false}={}){
 const node={document_id:'doc',workflow_id:'flow',node_id:'import'},tid='source';
 const port={index:0,port_guid:'port',tid:tid+';Output_Data-0',active:false};
 const owner={...node,verified:true,surface:'wizard',output_port:{direction:'output',port:0,native_index:0,opening_operation_id:'open',port_guid:'port',node_icon_class:'bg-vendor-icon-importtextfile'}};
 let closed=false;const events=[];
 const state=()=>({prepared_node_context:closed?{...node,verified:true,surface:'graph',locked:false,tid}:owner,
  wizard:closed?{status:'absent'}:{status:'observed',stage:'output_mapping',root_ref:'wizard',root_tid:'wizard',port_context:{status:'observed',kind:'output_data',node:{ref:'node'},port:{ref:'port'}}},
  ui:{dialogs:[],masks:[],elements:[{tid:'wizard;DataSetOutputSocketWizard;rbTable;DisplayEl',check_state:{checked:true},allowed_actions:['set_checked']},
   {tid:'wizard;DataSetOutputSocketWizard;btnGetSourceColumns',visible:true,enabled:false,allowed_actions:['click']},
   {tid:'wizard;btnClose',ref:'close',allowed_actions:['click']}]},
  node_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,target_fields:[{name,label:name,type,excluded:false}]},
  node_outputs:{verified:true,node_selected:true,ports:[port]}});
 const channel={openOutputPort:async()=>events.push('open'),observe:async o=>{const s=state();assert.ok(o.ready(s));return structuredClone(s);},
  perform:async o=>{const s=state();assert.ok(o.ready(s));assert.deepEqual(o.resolve(s),{verb:'click',ref:'close'});closed=true;events.push('cancel');}};
 const source={channel,binding:{node},port,state:{prepared_node_context:{...node,tid},ui:{elements:[{tid,signature:{native_graph:{status:'non_script',icon:foreign?'unknown':'bg-vendor-icon-importtextfile',node_id:node.node_id}}}]}}};
 const options={operation:{id:'op',parameters:{parameters,mappings:[]}},onRecord:async e=>{events.push('journal');return e;}};
 return {events,run:()=>preflightInactiveDataToVarSource(options,source)};
}

test('DataToVar validates the configured inactive source and cancels it without creating or executing the target',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.parameters_valid,true);assert.deepEqual(f.events,['open','cancel','journal']);
 assert.deepEqual(r.source_activity,{before:false,after:false,changed:false});
});

test('DataToVar closes the source inspection before refusing a nonnumeric or missing field',async()=>{
 for(const change of [{type:'string'},{name:'other'}]){
  const f=fixture(change);await assert.rejects(f.run(),e=>e.nodePhaseRefusal?.effect_possible===false&&e.nodePhaseRefusal.cleanup_complete===true);
  assert.deepEqual(f.events,['open','cancel','journal']);
 }
 const f=fixture({foreign:true});await assert.rejects(f.run());assert.deepEqual(f.events,[]);
});
