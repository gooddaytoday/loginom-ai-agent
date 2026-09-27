import {verifyNativeCivil,nativeCivilExpectation} from './javascript-native-datetime-civil.mjs';
import {verifyTextImportSource} from '../../client/lib/text-import-node.mjs';
import {textImportConfigurationReadback} from '../../client/lib/text-import-readback.mjs';
import {createHash} from 'node:crypto';
import {adaptRead,temporalProfile} from '../../client/lib/variant-native-values.mjs';
import {verifyNativeFixtureCells,verifyNativeInputRead} from './javascript-native-input-contract.mjs';
import {javascriptNativeFixture} from './javascript-native-fixtures.mjs';

const need=(v,m)=>{if(!v)throw Error('Native roundtrip: '+m);};
export function javascriptNativeRoundtripProbe(fixtureId='real'){
 const f=javascriptNativeFixture(fixtureId);
 const source='import {InputTable,OutputTable,DataType} from "builtIn/Data";\n'
  +'OutputTable.AssignColumns([{Name:"Value",DataType:DataType.'+f.js_type+'}]);\n'
  +'for (let row=0;row<InputTable.RowCount;row++) {\n  OutputTable.Append();\n  OutputTable.Set("Value",InputTable.Get(row,"Value"));\n}\n';
return Object.freeze({id:'native-'+f.id+'-identity-copy',schema_mode:'code',source,
  source_sha256:createHash('sha256').update(source).digest('hex')});
}
export const nativeRoundtripProbe=javascriptNativeRoundtripProbe();

export function verifyNativeRoundtripInput(input,fixtureId='real'){
  const nativeInputFixture=javascriptNativeFixture(fixtureId);
  const proof=input?.native_input?.native;
  need(proof?.exact.contract==='javascript-native-input-'+nativeInputFixture.id+'-1'&&proof.exact.native_bytes_verified===true
    &&proof.exact.js_created===false&&proof.exact.js_executed===false&&proof.exact.provenance.source.sha256===nativeInputFixture.sha256,
    'input-before-JS attestation required');
  need(proof.lifecycle.status==='completed'&&!proof.lifecycle.retired&&proof.lifecycle.pending===0
    &&proof.lifecycle.releasedRequests===nativeInputFixture.rows&&proof.lifecycle.releasedResponses===nativeInputFixture.rows,'input release required');
  need((proof.binding.fixture_id??'real')===nativeInputFixture.id&&proof.binding.node_id===input.node.node_id&&proof.binding.port_guid===input.table.port_guid,'input owner differs');
  verifyNativeFixtureCells(proof.exact,nativeInputFixture.id);
  if(nativeInputFixture.type==='datetime'){
    const checked=verifyNativeInputRead(proof.raw,{binding:proof.binding,lifecycle:proof.lifecycle,provenance:proof.exact.provenance});
    need(JSON.stringify(checked)===JSON.stringify(proof.exact),'frozen civil/native baseline differs');
  }
  return proof;
}
export function verifyNativeRoundtripMapping(mapping,node,fixtureId='real'){
  const fixture=javascriptNativeFixture(fixtureId);
  const context=mapping?.node_context,port=context?.input_port;
  need(mapping?.verified===true&&mapping.inventory_complete===true&&mapping.source_identity_verified===true
    &&mapping.mapping_wizard==='TuneDataSourceMappingWizard'&&typeof mapping.autosync==='boolean'
    &&context?.verified===true&&context.surface==='wizard'&&['document_id','workflow_id','node_id'].every(k=>context[k]===node[k])
    &&port?.direction==='input'&&port.port===0&&typeof port.port_guid==='string'&&port.port_guid
    &&mapping.source_fields?.length===1&&mapping.target_fields?.length===1,'complete owned input mapping required');
  const a=mapping.source_fields[0],b=mapping.target_fields[0];
  need([a,b].every(f=>f.name==='Value'&&f.type===fixture.type&&typeof f.required==='boolean')
    &&b.source?.record_id===a.record_id&&b.source?.field_id===a.field_id&&b.source?.name==='Value'&&b.source?.type===fixture.type,'Value identity mapping required');
  return {verified:true,node:{...node},port:0,port_guid:port.port_guid,columns:1,input_technical_name:'Value'};
}
export function verifyNativeRoundtripRead(raw,{binding,lifecycle,input,role,civil}){
  const fixture=javascriptNativeFixture(binding.fixture_id),nativeRoundtripProbe=javascriptNativeRoundtripProbe(fixture.id);
  need((input.binding.fixture_id??'real')===fixture.id,'input fixture differs');
  need(['output','upstream'].includes(role)&&binding.roundtrip_role===role,'private read role');
  need(binding.source_sha256===nativeRoundtripProbe.source_sha256,'identity script digest');
  if(fixture.type==='datetime'){
    verifyNativeCivil(civil,nativeCivilExpectation(binding,role,fixture.sha256));
    need(['document_id','workflow_id','package_id'].every(k=>binding[k]===input.binding[k]),'civil roundtrip scope differs');
    if(role==='upstream')need(['node_id','port_guid'].every(k=>binding[k]===input.binding[k])
      &&JSON.stringify(binding.source)===JSON.stringify(input.binding.source)
      &&['execution_id','group_id','process_id','process_record_id'].every(k=>binding.completed_child[k]===input.binding.completed_child[k]),'original civil upstream differs');
    if(role==='output'){
      // Loginom output0 GUIDs can repeat across nodes. The bound node/port pair,
      // native source and completed child establish ownership, not GUID inequality.
      need(binding.node_id!==input.binding.node_id,'civil output must belong to JS');
      verifyNativeRoundtripExecution(binding.completed_child,binding,fixture.id);
    }
  }
  const exact=adaptRead(raw,{expected:binding,lifecycle,...(fixture.type==='datetime'?{dateProfile:temporalProfile}:{}),consistency:{kind:'observed_local',changed:false,
    exclusive_operation:true,stability_basis:'owned_static_completed_fixture'}});
  verifyNativeFixtureCells(input.exact,fixture.id);
  const characterization=fixture.id==='integer-outside-safe'&&role==='output'?characterizeOutsideSafeIntegers(exact,input.exact):null;
  if(!characterization){
    verifyNativeFixtureCells(exact,fixture.id);
    need(exact.cells.every((cell,i)=>{const before=input.exact.cells[i];return cell.row===i&&cell.column===0
      &&cell.is_null===before.is_null&&JSON.stringify(cell.native)===JSON.stringify(before.native)
      &&cell.value===before.value;}), 'roundtrip significant bytes differ');
  }
  return {...exact,contract:'javascript-native-'+fixture.id+'-roundtrip-read-1',fixture_id:fixture.id,role,source_sha256:nativeRoundtripProbe.source_sha256,
    input_read_id:input.raw.read_id,g5_complete:false,...(characterization?{integer_characterization:characterization}:{})};
}

function characterizeOutsideSafeIntegers(exact,input){
  need(exact.coverage.table_complete&&exact.row_count===3&&exact.cells.length===3&&exact.schema.length===1
    &&exact.schema[0].name==='Value'&&exact.schema[0].label==='Value'&&exact.schema[0].type==='integer','full outside-safe integer output required');
  const cells=exact.cells.map((cell,i)=>{
    need(cell.row===i&&cell.column===0&&cell.type==='integer'&&cell.cell_type==='integer'&&cell.is_null===false
      &&typeof cell.value==='string'&&/^(?:0|-?[1-9][0-9]*)$/.test(cell.value)&&cell.decimal===cell.value
      &&cell.native.tag===20&&cell.native.bits===64&&cell.native.encoding==='signed-int64-le'
      &&typeof cell.native.bytes_le==='string'&&/^[a-f0-9]{16}$/.test(cell.native.bytes_le)
      &&Buffer.from(cell.native.bytes_le,'hex').readBigInt64LE().toString()===cell.value,'outside-safe output is not a complete native int64 observation');
    const before=input.cells[i];
    return {row:i,input_decimal:before.value,output_decimal:cell.value,input_bytes_le:before.native.bytes_le,output_bytes_le:cell.native.bytes_le,
      unchanged:cell.value===before.value&&cell.native.bytes_le===before.native.bytes_le,delta_decimal:(BigInt(cell.value)-BigInt(before.value)).toString()};
  });
  const identityExact=cells.every(c=>c.unchanged);
  return {status:identityExact?'outside_safe_exact_observed':'outside_safe_value_change_observed',characterization_only:true,
    output_identity_exact:identityExact,exact_pass:false,general_integer_precision_guarantee:false,cells};
}

// Revalidate recorded bytes/lifecycles after the fresh upstream read. A changed
// outside-safe OUTPUT is never promoted to exact PASS by a successful cleanup.
export function verifyNativeRoundtripOutcome(results,fixtureId='real'){
  const fixture=javascriptNativeFixture(fixtureId),before=results.before;
  need((before.binding.fixture_id??'real')===fixture.id,'final fixture differs');
  const input={...before,exact:verifyNativeInputRead(before.raw,{binding:before.binding,lifecycle:before.lifecycle,provenance:before.exact.provenance})};
  const output=verifyNativeRoundtripRead(results.output.raw,{binding:results.output.binding,lifecycle:results.output.lifecycle,input,role:'output',civil:results.output.civil});
  verifyNativeRoundtripRead(results.upstream.raw,{binding:results.upstream.binding,lifecycle:results.upstream.lifecycle,input,role:'upstream',civil:results.upstream.civil});
  if(fixture.type==='datetime')need(JSON.stringify(input.exact)===JSON.stringify(before.exact),'final frozen civil/native baseline differs');
  const observation=output.integer_characterization;
  return {fixture_id:fixture.id,status:observation?.status??(fixture.type==='datetime'?'civil_and_native_identity_observed':'exact_fixture_identity_observed'),input_exact:true,upstream_exact:true,
    output_identity_exact:observation?.output_identity_exact??true,exact_pass:!observation,characterization_only:!!observation,
    general_integer_precision_guarantee:false,g5_complete:false,...(observation?{cells:observation.cells}:{})};
}

export function verifyNativeRoundtripExecution(execution,node,fixtureId='real'){
  const nativeRoundtripProbe=javascriptNativeRoundtripProbe(fixtureId);
  need(execution?.verified===true&&execution.owner_verified===true&&execution.cleanup_complete===true
    &&execution.status==='completed'&&execution.trial?.phase==='initial'
    &&execution.trial.source_sha256===nativeRoundtripProbe.source_sha256&&execution.trial.node_id===node.node_id
    &&['document_id','workflow_id','node_id'].every(k=>node[k]&&execution.fresh_baseline?.node?.[k]===node[k])
    &&execution.execution_id&&execution.group_id&&execution.process_id&&execution.process_record_id&&Array.isArray(execution.fresh_baseline.roots)
    &&execution.launch_identity?.execution_id===execution.execution_id&&execution.launch_identity.group_id===execution.group_id
    &&execution.launch_identity.root_id===execution.fresh_baseline.root_id
    &&typeof execution.launch_identity.group_record_id==='string'&&execution.launch_identity.group_record_id
    &&['document_id','workflow_id','node_id'].every(k=>execution.launch_identity.node?.[k]===node[k])
    &&!execution.fresh_baseline.roots.some(p=>p.process_id===execution.group_id),'fresh completed JS execution required');
  return execution;
}

export function verifyNativeRoundtripProvenance(owner){
  const state=owner?.options.operation.nodeApply,executionId=owner?.provenance.execution.execution_id;
  need(owner&&state.pending===null&&state.cleanup_complete===true&&state.result?.status==='SUCCEEDED'
    &&state.result.cleanup_complete===true&&state.result.execution?.execution_id===executionId
    &&state.phases.some(p=>p.phase==='read'&&p.status==='verified'&&p.value.execution_id===executionId)
    &&state.phases.some(p=>p.phase==='finish'&&p.status==='verified'&&p.value.execution_id===executionId),'completed import provenance required');
  const source=verifyTextImportSource(state.request.parameters,owner.options.verifiedUploads(),owner.options.uploadHistory()).source;
  const readback=textImportConfigurationReadback({node:owner.ctx.node,phases:state.phases,operation_id:owner.options.operation.id});
  need(JSON.stringify(source)===JSON.stringify(owner.provenance.source)&&JSON.stringify(readback)===JSON.stringify(owner.provenance.readback),'import lineage/configuration changed');
}

export function verifyNativeRoundtripAddPortRuntime(sources){
  const pin='38bbd3e2f5143859e0c963aeb9c1389304c140d32484a88af1b2ec8f6ba0a72c';
  need(sources&&Object.keys(sources).length===1&&typeof sources.constructor==='string'
    &&createHash('sha256').update(sources.constructor).digest('hex')===pin,'loaded AddPort constructor changed');
  return {constructor:pin};
}
