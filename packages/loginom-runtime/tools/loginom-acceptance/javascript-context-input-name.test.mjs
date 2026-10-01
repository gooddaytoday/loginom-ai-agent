import test from 'node:test';
import assert from 'node:assert/strict';
import {renameJavascriptContextInput,javascriptContextInputName} from './javascript-context-input-name.mjs';

function fixture() {
  const node={document_id:'doc',workflow_id:'workflow',node_id:'node'},origin='http://logi-test-plan.bg.local';
  const owner={...node,verified:true,surface:'wizard',input_port:{direction:'input',port:0,native_index:0,
    port_guid:'port',opening_operation_id:'rename:open'}};
  const names=['RowID','Customer','Qty','UnitPriceCents','DiscountPct'];
  const sources=names.map((name,index)=>({index,name,label:name,type:index===1?'string':'integer',required:false,
    record_id:'s'+index,field_id:String(index)}));
  const mapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',
    state_source:'cached_mapping_stores',autosync:true,settings_applied:false,package_saved:false,node_context:owner,
    source_fields:sources,target_fields:sources.map((source,index)=>({...source,record_id:'t'+index,source,
      origin_type:0,usage_type:0,data_kind:index===1?'Дискретный':'Непрерывный'})),rendered_indices:[0,1,2,3,4]};
  const calls=[],events=[],lifecycle={};
  let editor=false,draft={},closed=false;
  const state=()=>({prepared_node_context:closed?{...node,verified:true,surface:'graph',locked:false}:owner,
    node_mapping:mapping,wizard:closed?{status:'absent'}:{status:'observed',stage:'input_mapping',root_ref:f.rootRef??'wizard',root_tid:'W',
      column_parameters:editor?{status:'observed',root_ref:'editor',selected_column:{...mapping.target_fields[1]},
        fields:{name:{value:draft.name,input_ref:'name'},label:{value:draft.label,input_ref:'label'}}}:undefined,
      output_columns:{fields:mapping.target_fields.map(f=>({...f,status:'observed',name_ref:'cell'+f.index,selected:editor&&f.index===1})),
        page:{status:'complete_definition_page',schema_id:'schema',offset:0,limit:8,returned:5,total_columns:5,next_offset:null}}},
    ui:{elements:editor?[...['name','label'].map(k=>({ref:k,wizard_field:{scope:'output_column',name:k},allowed_actions:['set_wizard_field']})),
      {ref:'apply',column_close:{scope:'output'},allowed_actions:['apply_output_column']}]:[
      ...mapping.target_fields.map(f=>({ref:'cell'+f.index,allowed_actions:['double_click']})),
      {ref:'done',tid:'W;btnDone',wizard_finish:{mode:'input_port'},allowed_actions:['finish_wizard']}]}});
  const reader={
    async openPort(direction,index){calls.push('open');assert.equal(direction,'input');assert.equal(index,0);
      return {status:'SUCCEEDED',cleanup_complete:true,action_key:'node.input_port.open.internal',operation_id:'rename:open',
        output:{...node,...owner.input_port,verified:true}};},
    async observe(options){if(options.mappingEditor)f.bindings.push(structuredClone(options.mappingEditor));const s=structuredClone(state());assert.ok(options.ready(s),options.condition);return s;},
    async perform(options){
      f.beforeGesture?.();const s=structuredClone(state());assert.ok(options.ready(s),options.condition);options.identity(s);
      const action=options.resolve(s);calls.push(action);
      if(action.verb==='double_click'){editor=true;draft={name:mapping.target_fields[1].name,label:mapping.target_fields[1].label};}
      if(action.verb==='set_wizard_field')draft[action.ref]=action.text;
      if(action.verb==='apply_output_column'){mapping.target_fields[1]={...mapping.target_fields[1],...draft,origin_type:1};editor=false;}
      if(action.verb==='finish_wizard')closed=true;
      const result={status:'SUCCEEDED',cleanup_complete:true,action_key:'ui.act',operation_id:'rename:'+calls.length,
        output:{origin,loginom_build:'7.4.2',...structuredClone(state())},trace:[{event:'ui_gesture_applied',verb:action.verb},
          ...(action.verb==='finish_wizard'?[{event:'input_port_finish_verified',wizard_root_ref:'wizard'}]:[])]};
      await f.afterGesture?.(action,result);return result;
    }
  };
  const options={reader,node,inputPortGuid:'port',targetOrigin:origin,deadline:Date.now()+60000,lifecycle,
    record:async event=>{events.push(structuredClone(event));return await f.afterRecord?.(event)??event;},
    verifyGraph:async()=>{calls.push('graph');f.afterGraph?.();}};
  const f={options,reader,node,owner,mapping,calls,events,lifecycle,bindings:[]};return f;
}

test('fixed input name helper runs the actual shared field procedure and exact input Done without Execute',async()=>{
  const f=fixture(),proof=await renameJavascriptContextInput(f.options);
  assert.equal(proof.verified,true);assert.equal(proof.explicit_execute_requested,false);assert.equal(proof.package_saved,false);
  assert.equal(proof.after.target_fields[1].name,javascriptContextInputName);assert.equal(proof.after.target_fields[1].label,'Customer');
  assert.equal(proof.after.target_fields[1].source.name,'Customer');assert.equal(proof.after.target_fields[1].origin_type,1);
  assert.deepEqual(f.calls.filter(c=>typeof c==='object').map(a=>a.verb),['double_click','set_wizard_field','apply_output_column','finish_wizard']);
  assert.equal(f.calls.find(c=>c?.verb==='set_wizard_field').text,'CustomerNow');assert.equal(f.lifecycle.closed,true);
  assert.ok(f.bindings.length>0);assert.ok(f.bindings.every(b=>JSON.stringify(b)===JSON.stringify({
    opening_operation_id:proof.opening.output.opening_operation_id,port_guid:proof.opening.output.port_guid,
    record_id:proof.before.target_fields[1].record_id})));
  assert.deepEqual(f.events.map(e=>e.phase),['javascript_context_input_name_prepared','javascript_context_input_name_done_prepared',
    'javascript_context_input_name_committed']);
  await assert.rejects(renameJavascriptContextInput(f.options),/one-flight/);assert.equal(f.calls.length,6);
});

for(const [name,change] of [
  ['foreign port',f=>f.owner.input_port.port_guid='foreign'],
  ['foreign node',f=>f.owner.node_id='foreign'],
  ['target names',f=>f.mapping.target_fields[1].name='other'],
  ['source type',f=>f.mapping.source_fields[1].type='integer'],
  ['source connection',f=>f.mapping.target_fields[1].source={...f.mapping.source_fields[0]}],
  ['required flag',f=>f.mapping.target_fields[1].required=true],
  ['usage',f=>f.mapping.target_fields[1].usage_type=4],
  ['origin',f=>f.mapping.target_fields[1].origin_type=1],
  ['autosync',f=>f.mapping.autosync=false],
  ['incomplete',f=>f.mapping.target_fields.pop()],
])test('fixed input rename refuses '+name+' before field gestures',async()=>{
  const f=fixture();change(f);await assert.rejects(renameJavascriptContextInput(f.options),/binding|mapping differs|opening/);
  assert.deepEqual(f.calls,['open']);assert.equal(f.lifecycle.closed,undefined);
});

for(const phase of ['javascript_context_input_name_prepared','javascript_context_input_name_done_prepared','javascript_context_input_name_committed'])
test('changed '+phase+' ACK does not authorize a later gesture or replay',async()=>{
  const f=fixture();f.afterRecord=e=>e.phase===phase?{...e,...(phase.endsWith('committed')?{proof:{}}:{deadline:1})}:e;
  await assert.rejects(renameJavascriptContextInput(f.options),/ACK differs/);
  const gestures=f.calls.filter(c=>typeof c==='object');
  assert.equal(gestures.length,phase.endsWith('prepared')?(phase.includes('done_')?3:0):4);
  assert.equal(f.lifecycle.closed,undefined);await assert.rejects(renameJavascriptContextInput(f.options),/one-flight/);
});

for(const [name,change] of [['owner',f=>f.owner.input_port.port_guid='foreign'],['root',f=>f.rootRef='foreign'],
  ['other field',f=>f.mapping.target_fields[4].label='foreign'],['Customer label',f=>f.mapping.target_fields[1].label='foreign']])
test('fresh inspection after prepared ACK refuses '+name+' with no field gesture',async()=>{
  const f=fixture();f.afterRecord=e=>{if(e.phase==='javascript_context_input_name_prepared')change(f);return e;};
  await assert.rejects(renameJavascriptContextInput(f.options),/changed/);assert.deepEqual(f.calls,['open']);
});

for(const fault of ['connection','unknown','lost','wrong Done','two gestures'])test('post-Apply/Done '+fault+' remains unresolved without Close or replay',async()=>{
  const f=fixture();f.afterGesture=(action,result)=>{
    if(fault==='connection'&&action.verb==='apply_output_column')f.mapping.target_fields[0].source={};
    if(fault==='unknown'&&action.verb==='apply_output_column')result.status='AMBIGUOUS';
    if(fault==='lost'&&action.verb==='apply_output_column')throw Error('lost reply');
    if(fault==='wrong Done'&&action.verb==='finish_wizard')result.trace[1].event='output_port_finish_verified';
    if(fault==='two gestures'&&action.verb==='apply_output_column')result.trace.push({...result.trace[0]});
  };
  await assert.rejects(renameJavascriptContextInput(f.options),/changed|unconfirmed|lost reply|input Done/);
  assert.equal(f.lifecycle.closed,undefined);const count=f.calls.length;
  await assert.rejects(renameJavascriptContextInput(f.options),/one-flight/);assert.equal(f.calls.length,count);
  assert.ok(f.calls.every(c=>c?.verb!=='confirm_wizard_close'&&c?.verb!=='execute_wizard'));
});

test('initial expired deadline refuses before opening; caller cannot replace the admitted deadline',async()=>{
  const f=fixture();f.options.deadline=Date.now()-1;await assert.rejects(renameJavascriptContextInput(f.options),/deadline/);assert.deepEqual(f.calls,[]);
  const live=fixture();live.afterRecord=e=>{if(e.phase==='javascript_context_input_name_prepared')live.options.deadline=1;return e;};
  // The function owns its admitted deadline; changing the caller object cannot extend it.
  assert.equal((await renameJavascriptContextInput(live.options)).verified,true);
});

test('deadline expires during prepared ACK before a field gesture; original opening is not replayed or closed',async()=>{
  const f=fixture();f.options.deadline=Date.now()+1000;
  f.afterRecord=async event=>{
    if(event.phase==='javascript_context_input_name_prepared')await new Promise(resolve=>setTimeout(resolve,Math.max(1,event.deadline-Date.now()+2)));
    return event;
  };
  await assert.rejects(renameJavascriptContextInput(f.options),/original deadline expired/);
  assert.equal(f.events[0].phase,'javascript_context_input_name_prepared');assert.deepEqual(f.calls,['open']);
  assert.equal(f.lifecycle.closed,undefined);await assert.rejects(renameJavascriptContextInput(f.options));assert.deepEqual(f.calls,['open']);
});
