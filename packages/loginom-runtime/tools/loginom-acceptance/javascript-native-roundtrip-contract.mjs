import {verifyTextImportSource} from '../../client/lib/text-import-node.mjs';
import {textImportConfigurationReadback} from '../../client/lib/text-import-readback.mjs';
import {createHash} from 'node:crypto';
import {adaptRead} from '../../client/lib/variant-native-values.mjs';
import {nativeInputFixture} from './javascript-native-input-contract.mjs';

const need=(v,m)=>{if(!v)throw Error('Native roundtrip: '+m);};
const source='import {InputTable,OutputTable,DataType} from "builtIn/Data";\n'
  +'OutputTable.AssignColumns([{Name:"Value",DataType:DataType.Float}]);\n'
  +'for (let row=0;row<InputTable.RowCount;row++) {\n  OutputTable.Append();\n  OutputTable.Set("Value",InputTable.Get(row,"Value"));\n}\n';
export const nativeRoundtripProbe=Object.freeze({id:'native-real-identity-copy',schema_mode:'code',source,
  source_sha256:createHash('sha256').update(source).digest('hex')});

export function verifyNativeRoundtripInput(input){
  const proof=input?.native_input?.native;
  need(proof?.exact.contract==='javascript-native-input-real-1'&&proof.exact.native_bytes_verified===true
    &&proof.exact.js_created===false&&proof.exact.js_executed===false&&proof.exact.provenance.source.sha256===nativeInputFixture.sha256,
    'input-before-JS attestation required');
  need(proof.lifecycle.status==='completed'&&!proof.lifecycle.retired&&proof.lifecycle.pending===0
    &&proof.lifecycle.releasedRequests===4&&proof.lifecycle.releasedResponses===4,'input release required');
  need(proof.binding.node_id===input.node.node_id&&proof.binding.port_guid===input.table.port_guid,'input owner differs');
  return proof;
}
export function verifyNativeRoundtripMapping(mapping,node){
  const context=mapping?.node_context,port=context?.input_port;
  need(mapping?.verified===true&&mapping.inventory_complete===true&&mapping.source_identity_verified===true
    &&mapping.mapping_wizard==='TuneDataSourceMappingWizard'&&typeof mapping.autosync==='boolean'
    &&context?.verified===true&&context.surface==='wizard'&&['document_id','workflow_id','node_id'].every(k=>context[k]===node[k])
    &&port?.direction==='input'&&port.port===0&&typeof port.port_guid==='string'&&port.port_guid
    &&mapping.source_fields?.length===1&&mapping.target_fields?.length===1,'complete owned input mapping required');
  const a=mapping.source_fields[0],b=mapping.target_fields[0];
  need([a,b].every(f=>f.name==='Value'&&f.type==='real'&&typeof f.required==='boolean')
    &&b.source?.record_id===a.record_id&&b.source?.field_id===a.field_id&&b.source?.name==='Value'&&b.source?.type==='real','Value identity mapping required');
  return {verified:true,node:{...node},port:0,port_guid:port.port_guid,columns:1,input_technical_name:'Value'};
}
export function verifyNativeRoundtripRead(raw,{binding,lifecycle,input,role}){
  need(['output','upstream'].includes(role)&&binding.roundtrip_role===role,'private read role');
  need(binding.source_sha256===nativeRoundtripProbe.source_sha256,'identity script digest');
  const exact=adaptRead(raw,{expected:binding,lifecycle,consistency:{kind:'observed_local',changed:false,
    exclusive_operation:true,stability_basis:'owned_static_completed_fixture'}});
  need(exact.coverage.table_complete&&exact.row_count===4&&exact.cells.length===4&&exact.schema.length===1
    &&exact.schema[0].name==='Value'&&exact.schema[0].label==='Value'&&exact.schema[0].type==='real','full real4x1');
  need(exact.cells.every((cell,i)=>{const before=input.exact.cells[i];return cell.row===i&&cell.column===0
    &&cell.is_null===before.is_null&&cell.native.tag===before.native.tag
    &&(cell.is_null?cell.value===null:cell.native.bytes_le===before.native.bytes_le);}), 'roundtrip significant bytes differ');
  return {...exact,contract:'javascript-native-real-roundtrip-read-1',role,source_sha256:nativeRoundtripProbe.source_sha256,
    input_read_id:input.raw.read_id,g5_complete:false};
}

export function verifyNativeRoundtripExecution(execution,node){
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
