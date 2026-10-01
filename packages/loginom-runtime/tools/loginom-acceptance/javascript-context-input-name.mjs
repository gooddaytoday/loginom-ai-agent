// Closed operator fixture. This is not a public mapping API or model tool.
import {configureOutputField} from '../../client/lib/port-mapping-procedure.mjs';
import {inputMappingOrigin,verifyInputMappingFinish} from '../../client/lib/node-input-mapping-recovery.mjs';

const need=(value,message)=>{if(!value)throw Error('Context input name: '+message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const semantic=({rendered_indices,...value})=>value;
export const javascriptContextInputName='CustomerNow';

export async function renameJavascriptContextInput({reader,node,inputPortGuid,targetOrigin,deadline,record,lifecycle,verifyGraph}) {
  need(Number.isSafeInteger(deadline)&&deadline>Date.now()&&typeof record==='function'
    &&typeof inputPortGuid==='string'&&inputPortGuid.length>0
    &&typeof verifyGraph==='function'&&lifecycle&&!lifecycle.started,'dependencies/deadline or one-flight differs');
  lifecycle.started=true;
  const timely=()=>need(Date.now()<deadline,'original deadline expired');
  timely();lifecycle.opening=await reader.openPort('input',0);timely();
  const opening=lifecycle.opening,port=opening?.output;
  need(opening?.status==='SUCCEEDED'&&opening.cleanup_complete===true&&port?.verified===true
    &&opening.action_key==='node.input_port.open.internal'&&port.direction==='input'&&port.port===0
    &&port.port_guid===inputPortGuid
    &&port.opening_operation_id===opening.operation_id
    &&['document_id','workflow_id','node_id'].every(k=>port[k]===node[k]),'original input opening unconfirmed');
  const ready=s=>s.wizard?.status==='observed'&&s.wizard.stage==='input_mapping'
    &&s.node_mapping?.verified===true&&s.node_mapping.inventory_complete===true
    &&s.node_mapping.source_identity_verified===true&&s.node_mapping.mapping_wizard==='TuneDataSourceMappingWizard';
  const initial=await reader.observe({condition:'fixed context input name baseline',readMappings:true,ready});timely();
  const owner=structuredClone(initial.prepared_node_context),root=initial.wizard.root_ref,before=structuredClone(initial.node_mapping);
  const bound=s=>{
    need(s.wizard?.root_ref===root&&s.wizard.status==='observed'&&s.wizard.stage==='input_mapping'
      &&same(s.prepared_node_context,owner),'original input root/owner changed');
    timely();return true;
  };
  need(owner?.verified===true&&owner.surface==='wizard'&&owner.input_port?.direction==='input'
    &&['document_id','workflow_id','node_id'].every(k=>owner[k]===node[k])
    &&['port','port_guid','native_index','opening_operation_id'].every(k=>owner.input_port[k]===port[k])
    &&same(before.node_context,owner)&&before.state_source==='cached_mapping_stores'
    &&before.settings_applied===false&&before.package_saved===false&&before.autosync===true,'native input port binding differs');
  const names=['RowID','Customer','Qty','UnitPriceCents','DiscountPct'],types=['integer','string','integer','integer','integer'];
  need(before.source_fields?.length===5&&before.target_fields?.length===5
    &&new Set(before.source_fields.map(f=>f.record_id)).size===5&&new Set(before.target_fields.map(f=>f.record_id)).size===5
    &&names.every((name,i)=>{
      const source=before.source_fields[i],target=before.target_fields[i];
      return source.index===i&&target.index===i&&source.name===name&&target.name===name
        &&source.label===name&&target.label===name&&source.type===types[i]&&target.type===types[i]
        &&source.required===false&&target.required===false&&target.origin_type===0&&target.usage_type===0
        &&typeof source.field_id==='string'&&typeof target.field_id==='string'&&same(target.source,source);
    }),'fixed full input mapping differs');
  const acknowledge=async proof=>{
    timely();const saved=structuredClone(proof),ack=await record(saved);timely();
    need(Object.keys(saved).every(k=>same(saved[k],ack?.[k])),'journal ACK differs');
  };
  await acknowledge({phase:'javascript_context_input_name_prepared',node,deadline,opening,before,
    field_record_id:before.target_fields[1].record_id,name:javascriptContextInputName,label:'Customer'});
  const expected={...before,target_fields:before.target_fields.map((field,i)=>i===1
    ?{...field,name:javascriptContextInputName,origin_type:1}:field)};
  const mappingBound=s=>{
    bound(s);need(same(semantic(s.node_mapping),semantic(lifecycle.fieldApplied?expected:before)),
      'original full input mapping changed');return true;
  };
  const tracked={...reader,
    async observe(options){const state=await reader.observe({...options,readMappings:true,
      mappingEditor:{opening_operation_id:port.opening_operation_id,port_guid:port.port_guid,record_id:before.target_fields[1].record_id}});mappingBound(state);return state;},
    async perform(options){
      const result=await reader.perform({...options,ready:s=>mappingBound(s)&&options.ready(s),
        identity:s=>({owner,root,definition:s.node_mapping,field:options.identity(s)}),
        resolve:s=>{mappingBound(s);return options.resolve(s);}});
      const gestures=result?.trace?.filter(e=>e.event==='ui_gesture_applied');
      need(result?.status==='SUCCEEDED'&&result.cleanup_complete===true&&gestures?.length===1,'sole field gesture unconfirmed');
      if(gestures[0].verb==='apply_output_column')lifecycle.fieldApplied=true;
      return result;
    }
  };
  const edited=await configureOutputField(tracked,{current:before.target_fields[1],source:before.source_fields[1],
    name:javascriptContextInputName,label:'Customer'});timely();
  need(edited.verified===true&&edited.cleanup_complete===true&&edited.settings_applied===false,'field Apply unconfirmed');
  const state=await tracked.observe({condition:'fixed renamed input before Done',readMappings:true,ready});
  need(same(semantic(state.node_mapping),semantic(expected)),'unrelated input metadata changed');
  await acknowledge({phase:'javascript_context_input_name_done_prepared',node,deadline,root,definition:state.node_mapping});
  const done=await tracked.perform({condition:'finish fixed renamed own input port',initialObservation:state,
    ready:s=>ready(s)&&!s.wizard.column_parameters&&same(semantic(s.node_mapping),semantic(expected)),
    identity:()=>({owner,definition:expected}),resolve:s=>{
      const controls=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnDone'
        &&e.wizard_finish?.mode==='input_port'&&e.allowed_actions.includes('finish_wizard'));
      need(controls.length===1,'unique input Done unavailable');return {verb:'finish_wizard',ref:controls[0].ref};
    }});timely();
  verifyInputMappingFinish({node,origin:inputMappingOrigin(targetOrigin),build:'7.4.2',wizard_root_ref:root,
    finish_reference:{id:done.operation_id}},{state:'completed',receipt:done});
  await reader.observe({condition:'same graph after fixed input Name Done',ready:s=>s.wizard?.status==='absent'
    &&s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='graph'
    &&s.prepared_node_context.locked===false&&['document_id','workflow_id','node_id'].every(k=>s.prepared_node_context[k]===node[k])});
  await verifyGraph();timely();
  const proof={verified:true,cleanup_complete:true,settings_applied:true,package_saved:false,explicit_execute_requested:false,
    node,deadline,opening,before,after:expected,field:edited,done};
  await acknowledge({phase:'javascript_context_input_name_committed',proof});lifecycle.closed=true;return proof;
}
