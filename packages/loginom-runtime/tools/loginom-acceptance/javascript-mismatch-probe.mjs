import {createHash} from 'node:crypto';

const need=(value,message)=>{if(!value)throw Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sha=source=>createHash('sha256').update(source,'utf8').digest('hex');

export function javascriptMismatchSource(probe){
  need(probe?.id==='code-table-v1'&&probe.schema_mode==='code'&&typeof probe.source==='string'
    &&sha(probe.source)===probe.source_sha256&&probe.source.split('PhaseMarker').length===3,'Exact code-table baseline required');
  const source=probe.source.replaceAll('PhaseMarker','GeneratedMarker');
  return {source,source_sha256:sha(source),baseline_source_sha256:probe.source_sha256,phase:'generated-mismatch'};
}

export function javascriptExecutionIdentity(node,trial){
  need(node?.node_id&&['initial','generated-mismatch'].includes(trial?.phase)
    &&/^[a-f0-9]{64}$/.test(trial.source_sha256??''),'Explicit JavaScript execution phase and source SHA required');
  return {effect_id:'execute-'+trial.phase+'-'+node.node_id,node_id:node.node_id,
    phase:trial.phase,source_sha256:trial.source_sha256};
}

// Unverified native state stays unverified. This bounded characterization is
// separate from readPortMapping's default strict source/schema contract.
export function characterizeJavascriptMapping(state,reference,{allowPending=false}={}){
  const owner=state?.prepared_node_context,mapping=state?.node_mapping,w=state?.wizard;
  // Missing/cache-loading evidence can settle without another gesture. Positive
  // evidence of another owner must never be hidden by the readiness poll.
  need(mapping?.reason!=='mapping_node_changed'
    &&[owner,mapping?.node_context].every(context=>!context||
      ['document_id','workflow_id','node_id'].every(k=>context[k]==null||context[k]===reference?.[k])
      &&(context.surface==null||context.surface==='wizard')
      &&(!context.output_port||(context.output_port.direction==null||context.output_port.direction==='output')
        &&(context.output_port.port==null||context.output_port.port===0)))
    &&(!mapping?.node_context?.output_port?.port_guid||!owner?.output_port?.port_guid
      ||mapping.node_context.output_port.port_guid===owner.output_port.port_guid)
    &&(w?.stage==null||w.stage==='output_mapping'),'Characterization output owner differs');
  const owned=owner?.verified===true&&owner.surface==='wizard'&&owner.output_port?.direction==='output'&&owner.output_port.port===0
    &&typeof owner.output_port.port_guid==='string'&&owner.output_port.port_guid
    &&['document_id','workflow_id','node_id'].every(k=>reference?.[k]&&owner[k]===reference[k])
    &&['document_id','workflow_id','node_id'].every(k=>mapping?.node_context?.[k]===owner[k])
    &&mapping.node_context.output_port?.port_guid===owner.output_port.port_guid
    &&w?.status==='observed'&&w.stage==='output_mapping';
  if(allowPending&&!owned)return null;
  need(owned,'Characterization output owner differs');
  const verified=mapping?.verified===true&&mapping.inventory_complete===true&&mapping.source_identity_verified===true;
  const supported=verified||mapping?.verified===false&&mapping.source_identity_verified===false&&mapping.reason==='mapping_render_value';
  if(allowPending&&!supported)return null;
  need(supported,'Unsupported native mapping characterization');
  const rendered=w.output_columns;
  const complete=rendered?.status==='rendered_rows'&&Array.isArray(rendered.fields)&&rendered.fields.length>0&&rendered.fields.length<=16
    &&rendered.fields.every(f=>f.status==='observed')&&rendered.auto_sync?.status==='observed'
    &&typeof rendered.auto_sync.value==='boolean';
  if(allowPending&&!complete)return null;
  need(complete,'Bounded rendered mapping unavailable');
  return {status:verified?'verified':'unverified',owner_verified:true,node_context:structuredClone(owner),
    mapping:structuredClone(mapping),rendered:structuredClone(rendered),rendered_is_native_schema:false};
}

export function verifyJavascriptPreviousExecution(fresh,initial){
  const previous=initial?.launch_identity;
  need(initial?.verified===true&&initial.owner_verified===true&&initial.status==='completed'
    &&previous&&typeof initial.execution_id==='string'&&initial.execution_id
    &&previous.execution_id===initial.execution_id&&previous.group_id===initial.group_id
    &&typeof previous.group_record_id==='string'&&previous.group_record_id
    &&typeof fresh?.root_id==='string'&&fresh.root_id===initial.fresh_baseline?.root_id&&fresh.root_id===previous.root_id
    &&['document_id','workflow_id','node_id'].every(k=>fresh.node?.[k]
      &&fresh.node[k]===initial.fresh_baseline.node?.[k]&&fresh.node[k]===previous.node?.[k])
    &&fresh.roots?.filter(root=>root.process_id===previous.group_id&&root.record_id===previous.group_record_id
      &&root.completed===true).length===1,'Previous execution identity disappeared or changed');
  return true;
}

export function verifyJavascriptMismatchTable(table){
  need(table?.sample_complete===true&&Number.isInteger(table.row_count)&&table.row_count>=0&&table.row_count<=10
    &&table.sample_rows===table.row_count&&table.sample?.length===table.row_count
    &&Array.isArray(table.schema)&&table.schema.length>0&&table.schema.length<=16
    &&table.schema.every(c=>typeof c.name==='string'&&c.name&&typeof c.label==='string'
      &&['integer','real','string','boolean','datetime'].includes(c.type))
    &&new Set(table.schema.map(c=>c.name)).size===table.schema.length
    &&table.precision?.numbers_verified===true&&table.precision.limitations?.length===0
    &&!table.limitations?.length&&table.filter_enabled===false
    &&table.sample.every(row=>row.length===table.schema.length&&row.every((cell,i)=>cell.type===table.schema[i].type
      &&typeof cell.is_null==='boolean'&&(cell.is_null?cell.value===null&&cell.precision==='exact_null':
        cell.type==='integer'?cell.precision==='exact_integer'&&typeof cell.value==='string'&&/^-?(?:0|[1-9][0-9]*)$/.test(cell.value):
        cell.type==='string'?typeof cell.value==='string'&&cell.precision==='display_text':
        cell.type==='real'?cell.precision==='17_significant_digits'&&Number.isFinite(cell.value):
        cell.type==='boolean'?cell.precision==='exact_boolean'&&typeof cell.value==='boolean':
          cell.precision==='millisecond'&&typeof cell.value==='string'))),
  'Complete bounded typed mismatch output required');
  return {verified:true,rows:table.row_count,columns:table.schema.length,oracle_applied:false};
}

export function javascriptMismatchOutputOracle(table){
  verifyJavascriptMismatchTable(table);
  const schema=table.schema.map(c=>[c.name,c.label,c.type]);
  const layout=same(schema,[['ObservedID','ObservedID','integer'],['GeneratedMarker','GeneratedMarker','string']])?'generated':
    same(schema,[['ObservedID','ObservedID','integer'],['ManualMarker','ManualMarker','string']])?'manual':
    same(schema,[['ObservedID','ObservedID','integer'],['PhaseMarker','PhaseMarker','string']])?'baseline':'unexpected';
  const rows=table.row_count===6&&table.sample.every((row,i)=>row[0]?.is_null===false&&row[0].value===String(i+1));
  const values=table.row_count===6&&table.sample.every(row=>row[1]?.is_null===false&&row[1].value==='JS_G2_TABLE_V1');
  return {layout,row_ids_verified:rows,marker_values_verified:values,
    changed_output_verified:['generated','manual'].includes(layout)&&rows&&values};
}

export function javascriptMismatchVerdict(trial,baseline){
  const execution=trial?.execution,identity=execution?.trial;
  need(trial?.status==='observed'&&trial.phase==='generated-mismatch'&&trial.execution_started===true
    &&trial.reset_dispatched===false&&trial.autosync_dispatched===false
    &&trial.source_proof?.verified===true&&trial.source_proof.owner_verified===true&&trial.source_proof.schema_mode==='code'
    &&trial.source_proof.source_sha256===trial.source_sha256&&trial.source_proof.node_id===identity?.node_id
    &&identity?.phase==='generated-mismatch'&&identity.source_sha256===trial.source_sha256
    &&identity.source_sha256!==baseline?.trial?.source_sha256&&baseline?.verified===true&&baseline.status==='completed'
    &&baseline.owner_verified===true&&baseline.trial?.phase==='initial'&&baseline.trial.node_id===identity.node_id
    &&execution?.verified===true&&execution.owner_verified===true&&execution.cleanup_complete===true
    &&execution.execution_id&&execution.execution_id!==baseline.execution_id
    &&execution.fresh_baseline?.node?.node_id===identity.node_id&&typeof execution.fresh_baseline.root_id==='string'
    &&Array.isArray(execution.fresh_baseline.roots)&&execution.group_id
    &&!execution.fresh_baseline.roots.some(root=>root.process_id===execution.group_id)
    &&trial.boundary_verified===true&&trial.post_done?.owner_verified===true&&trial.mapping?.owner_verified===true
    &&trial.post_done.node_context.node_id===identity.node_id&&trial.mapping.node_context.node_id===identity.node_id
    &&['document_id','workflow_id','node_id'].every(k=>trial.post_done.node_context[k]
      &&[trial.mapping.node_context,execution.fresh_baseline.node,baseline.fresh_baseline?.node,trial.source_proof]
        .every(owner=>owner?.[k]===trial.post_done.node_context[k])),
    'Fresh owned changed-source materialization proof incomplete');
  verifyJavascriptPreviousExecution(execution.fresh_baseline,baseline);
  need(['completed','failed'].includes(execution.status),'Mismatch execution is not terminal');
  if(execution.status==='failed')need(execution.ownership_source==='native_process_model_identity_and_show_node'
    &&execution.error_source==='native_child_error_details'&&typeof execution.error?.message==='string'&&execution.error.message,
    'Owned native mismatch failure required');
  if(execution.status==='completed'){
    verifyJavascriptMismatchTable(trial.output);
    need(trial.output.table?.port_guid===trial.mapping.node_context.output_port.port_guid,'Mismatch output port changed');
  }
  const native=trial.mapping.mapping;
  const materialized=native?.verified===true&&native.inventory_complete===true&&native.source_identity_verified===true
    &&same(native.source_fields?.map(f=>[f.name,f.label,f.type]),[['ObservedID','ObservedID','integer'],['GeneratedMarker','GeneratedMarker','string']]);
  const layout=m=>m?.target_fields?.map(f=>({name:f.name,label:f.label,type:f.type,excluded:f.excluded===true}));
  const expectedLayout=[{name:'ObservedID',label:'ObservedID',type:'integer',excluded:false},
    {name:'ManualMarker',label:'ManualMarker',type:'string',excluded:false}];
  const preserved=materialized&&native.autosync===false&&same(layout(native),expectedLayout)
    &&same(layout(trial.baseline_manual_mapping),expectedLayout);
  const sourcesBound=preserved&&native.target_fields.every((field,i)=>{
    const source=native.source_fields[i];
    return typeof source.record_id==='string'&&!!source.record_id&&typeof source.field_id==='string'&&!!source.field_id
      &&['record_id','field_id','name','label','type'].every(k=>field.source?.[k]===source[k]);
  });
  const outputOracle=execution.status==='completed'?javascriptMismatchOutputOracle(trial.output):null;
  return {safe_to_continue:true,gate_passed:execution.status==='completed'&&preserved&&sourcesBound
      &&outputOracle.layout==='manual'&&outputOracle.changed_output_verified,
    output_oracle:outputOracle,
    source_schema_materialized:materialized,manual_mapping_preserved:preserved,target_source_bindings_verified:sourcesBound,
    execution:'confirmed',absence_proves_no_execution:false};
}

export async function runJavascriptMismatchMaterialization({node,changed,sourceProof,manual,postDone,baseline,deadline,
  verifyBoundary,execute,readMapping,readOutput,record,now=Date.now}){
  const identity=javascriptExecutionIdentity(node,changed);
  need(changed.phase==='generated-mismatch'&&sha(changed.source)===changed.source_sha256
    &&changed.baseline_source_sha256===baseline?.trial?.source_sha256&&changed.source_sha256!==changed.baseline_source_sha256
    &&baseline.verified===true&&baseline.owner_verified===true&&baseline.status==='completed'&&baseline.execution_id
    &&baseline.trial.phase==='initial'&&baseline.trial.node_id===node.node_id
    &&sourceProof?.verified===true&&sourceProof.owner_verified===true&&sourceProof.schema_mode==='code'
    &&sourceProof.source_sha256===changed.source_sha256&&sourceProof.node_id===node.node_id
    &&manual?.settings_applied===true&&manual.definition?.verified===true&&manual.definition.source_identity_verified===true
    &&manual.definition.inventory_complete===true&&manual.definition.autosync===false
    &&manual.definition.target_fields?.some(f=>f.name==='ManualMarker'&&f.label==='ManualMarker')
    &&postDone?.owner_verified===true&&postDone.node_context.node_id===node.node_id,'Mismatch execution admission incomplete');
  need(['document_id','workflow_id','node_id'].every(k=>postDone.node_context[k]
    &&node[k]===postDone.node_context[k]&&sourceProof[k]===node[k]&&baseline.fresh_baseline?.node?.[k]===node[k]),
    'Mismatch admission document/workflow/node differs');
  const budget=()=>need(now()<deadline,'Original mismatch deadline expired');
  budget();await verifyBoundary();budget();
  await record({phase:'mismatch_materialization_admitted',identity,source_proof:sourceProof,post_done:postDone,baseline,reset_dispatched:false});
  budget();const execution=await execute(identity);budget();
  await record({phase:'mismatch_materialization_terminal',identity,execution});
  need(execution?.verified===true&&execution.owner_verified===true&&execution.cleanup_complete===true
    &&execution.execution_id!==baseline.execution_id&&same(execution.trial,identity)
    &&['completed','failed'].includes(execution.status)
    &&['document_id','workflow_id','node_id'].every(k=>execution.fresh_baseline?.node?.[k]===node[k]),
    'Mismatch execution ownership or freshness unconfirmed');
  verifyJavascriptPreviousExecution(execution.fresh_baseline,baseline);
  await verifyBoundary();budget();
  const mapping=await readMapping();budget();
  need(mapping?.owner_verified===true&&['document_id','workflow_id','node_id'].every(k=>mapping.node_context?.[k]===node[k])
    &&mapping.node_context.output_port?.port_guid===postDone.node_context.output_port.port_guid,'Materialized mapping owner changed');
  const output=execution.status==='completed'?await readOutput():null;budget();
  await verifyBoundary();budget();
  const trial={status:'observed',phase:changed.phase,source_sha256:changed.source_sha256,source_proof:sourceProof,
    baseline_manual_mapping:manual.definition,post_done:postDone,execution,mapping,output,
    boundary_verified:true,execution_started:true,reset_dispatched:false,autosync_dispatched:false};
  const verdict=javascriptMismatchVerdict(trial,baseline);
  await record({phase:'mismatch_materialization_observed',trial,verdict});return {...trial,...verdict,execution};
}
