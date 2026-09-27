import {createHash} from 'node:crypto';
import {verifyTextImportSource} from '../../client/lib/text-import-node.mjs';
import {textImportConfigurationReadback} from '../../client/lib/text-import-readback.mjs';
import {adaptRead} from '../../client/lib/variant-native-values.mjs';

const need=(v,m)=>{if(!v)throw Error('Native input: '+m);};
export const nativeInputFixture=Object.freeze({bytes:33,sha256:'4d731645c25b4aafbdd4c96a477341fcc5ef086ad2bda3dc9a2bfcce7966df84',
  file:'javascript-native-input-real.csv',rows:4,columns:1});
// Independently fixed root typed-native-oracle encodings. These are an oracle,
// never fabricated native evidence; only significant payload bytes are compared.
const expectedBytes=[null,'0000000000000000','000000000000f4bf','0000000000402440'];
const expectedValues=[null,0,-1.25,10.125];

export function verifyNativeInputFixture(bytes){
  need(bytes.length===nativeInputFixture.bytes&&createHash('sha256').update(bytes).digest('hex')===nativeInputFixture.sha256,
    'immutable fixture differs');return {...nativeInputFixture};
}

export function nativeInputRequest({prepared,storage,artifact,uploadOperationId,totalMs}){
  need(/^\/jsteach\/js-g2-[a-f0-9-]{36}$/.test(storage),'owned UUID storage required');
  need(artifact.bytes===nativeInputFixture.bytes&&artifact.sha256===nativeInputFixture.sha256,'artifact pin differs');
  return {operation_id:'js-native-input-import',contract_revision:'1.0.0',document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,
    target:{kind:'new',type:'imports.text',label:'NativeInput',position:{x:96,y:80}},inputs:[],mode:'delimited',parameters:{
      settings:{source:{source_path:storage+'/'+nativeInputFixture.file,encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},
        format:{delimiter:';',decimal_separator:'.',null_marker:'__JS_NULL__',text_qualifier:'"'},
        columns:[{name:'Value',label:'Value',type:'real',data_kind:'Непрерывный',used:true}]},
      source:{artifact_id:artifact.artifact_id,upload_operation_id:uploadOperationId,bytes:artifact.bytes,sha256:artifact.sha256}},
    mappings:[],finish:'execute',read:{ports:[0],sample_rows:4,require_exact_numbers:true},
    budgets:{configure_ms:240000,execute_ms:60000,total_ms:Math.min(600000,totalMs)}};
}

export function verifyNativeInputUi(table){
  need(table?.row_count===4&&table.sample_rows===4&&table.sample_complete===true&&table.filter_enabled===false
    &&table.precision?.numbers_verified===true&&table.precision.limitations?.length===0&&!table.limitations?.length
    &&table.schema?.length===1&&table.schema[0].name==='Value'&&table.schema[0].label==='Value'&&table.schema[0].type==='real'
    &&table.sample?.length===4&&table.sample.every((row,i)=>row.length===1&&row[0].type==='real'
      &&row[0].is_null===(i===0)&&Object.is(row[0].value,expectedValues[i])
      &&row[0].precision===(i===0?'exact_null':'17_significant_digits')),'complete typed UI oracle differs');
  return {verified:true,rows:4,columns:1,native_bytes_verified:false};
}

// Called only from the private owning import driver, while executor's read-phase
// lock is held. The current import is not yet a completed historical operation.
export function nativeInputProvenance({operation,ctx,verifiedUploads,uploadHistory,exclusiveNodeOperation,execution}){
  need(exclusiveNodeOperation()===true&&operation.nodeApply?.pending?.phase==='read','exclusive owning read phase required');
  const request=operation.nodeApply.request;
  need(operation.id===request.operation_id&&request.operation_id==='js-native-input-import'&&request.target.kind==='new'&&request.target.type==='imports.text'
    &&request.finish==='execute'&&request.inputs.length===0&&request.mappings.length===0,'fixed input-only operation required');
  const source=verifyTextImportSource(request.parameters,verifiedUploads(),uploadHistory()).source;
  need(source.bytes===33&&source.sha256===nativeInputFixture.sha256&&source.lineage?.basis==='private_ordered_upload_history',
    'pinned verified upload lineage required');
  const readback=textImportConfigurationReadback({node:ctx.node,phases:operation.nodeApply.phases,operation_id:operation.id});
  const finish=operation.nodeApply.phases.find(p=>p.phase==='finish').value;
  need(finish.mode==='execute'&&finish.execution_started===true&&finish.execution_id===ctx.execution.execution_id,'same import Execute receipt required');
  const aliases={';':'Точка с запятой','.':'Точка (.)','"':'Двойная кавычка (")'};
  const format={delimiter:';',decimal_separator:'.',null_marker:'__JS_NULL__',text_qualifier:'"'};
  need(Object.entries(format).every(([k,v])=>request.parameters.settings.format[k]===v)
    &&/^\/jsteach\/js-g2-[a-f0-9-]{36}\/javascript-native-input-real\.csv$/.test(source.destination),'fixed fixture settings/path required');
  need(readback.source.connection==='Локальное'&&readback.source.source_path===source.destination
    &&['UTF-8','UTF-8 (65001)'].includes(readback.source.encoding)&&readback.source.rows_to_skip==='0'&&readback.source.first_line_as_title===true
    &&Object.entries(format).every(([k,v])=>readback.format[k]===v||readback.format[k]===aliases[v])
    &&readback.format.null_marker==='__JS_NULL__'&&readback.columns.length===1
    &&readback.columns[0].index===0&&readback.columns[0].name==='Value'&&readback.columns[0].label==='Value'
    &&readback.columns[0].type==='real'&&readback.columns[0].data_kind==='Непрерывный'&&readback.columns[0].used===true
    &&readback.output_mapping.fields.length===1&&readback.output_mapping.fields[0].source_name==='Value'
    &&['name','label'].every(k=>readback.output_mapping.fields[0][k]==='Value')&&readback.output_mapping.fields[0].type==='real',
    'observed applied input settings differ');
  need(execution?.verified===true&&execution.owner_verified===true&&execution.cleanup_complete===true
    &&execution.status==='completed'&&execution.execution_id===ctx.execution.execution_id
    &&execution.process_id&&execution.process_record_id&&execution.group_id,'owned completed import child required');
  return {kind:'owned_import_read_phase',source,readback,execution:structuredClone(execution),operation_id:operation.id,
    node:structuredClone(ctx.node),external_writers_excluded:false};
}

export function verifyNativeInputRead(raw,{binding,lifecycle,provenance}){
  need(provenance.kind==='owned_import_read_phase'&&provenance.source.sha256===nativeInputFixture.sha256,'private provenance required');
  need(['document_id','workflow_id','node_id'].every(k=>provenance.node[k]===binding[k])
    &&provenance.execution.execution_id===binding.execution.execution_id,'provenance owner differs');
  const exact=adaptRead(raw,{expected:binding,lifecycle,
    consistency:{kind:'observed_local',changed:false,exclusive_operation:true,stability_basis:'owned_static_completed_fixture'}});
  need(exact.coverage.table_complete&&exact.row_count===4&&exact.schema.length===1
    &&exact.schema[0].name==='Value'&&exact.schema[0].label==='Value'&&exact.schema[0].type==='real','full native4×1 required');
  need(exact.cells.every((cell,i)=>cell.row===i&&cell.column===0&&cell.is_null===(i===0)
    &&cell.native.tag===(i===0?1:5)&&(i===0?cell.value===null:cell.native.bytes_le===expectedBytes[i])),
    'actual native values/bytes differ from independent oracle');
  return {...exact,contract:'javascript-native-input-real-1',native_bytes_verified:true,js_created:false,
    js_executed:false,g5_complete:false,provenance};
}
