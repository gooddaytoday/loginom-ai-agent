import {verifyTextImportSource} from '../../client/lib/text-import-node.mjs';
import {textImportConfigurationReadback} from '../../client/lib/text-import-readback.mjs';
import {createHash} from 'node:crypto';
import {adaptRead} from '../../client/lib/variant-native-values.mjs';
import {verifyNativeFixtureCells} from './javascript-native-input-contract.mjs';
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
export function verifyNativeRoundtripRead(raw,{binding,lifecycle,input,role}){
  const fixture=javascriptNativeFixture(binding.fixture_id),nativeRoundtripProbe=javascriptNativeRoundtripProbe(fixture.id);
  need((input.binding.fixture_id??'real')===fixture.id,'input fixture differs');
  need(['output','upstream'].includes(role)&&binding.roundtrip_role===role,'private read role');
  need(binding.source_sha256===nativeRoundtripProbe.source_sha256,'identity script digest');
  const exact=adaptRead(raw,{expected:binding,lifecycle,consistency:{kind:'observed_local',changed:false,
    exclusive_operation:true,stability_basis:'owned_static_completed_fixture'}});
  verifyNativeFixtureCells(input.exact,fixture.id);verifyNativeFixtureCells(exact,fixture.id);
  need(exact.cells.every((cell,i)=>{const before=input.exact.cells[i];return cell.row===i&&cell.column===0
    &&cell.is_null===before.is_null&&JSON.stringify(cell.native)===JSON.stringify(before.native)
    &&cell.value===before.value;}), 'roundtrip significant bytes differ');
  return {...exact,contract:'javascript-native-'+fixture.id+'-roundtrip-read-1',fixture_id:fixture.id,role,source_sha256:nativeRoundtripProbe.source_sha256,
    input_read_id:input.raw.read_id,g5_complete:false};
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
