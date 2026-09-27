import {javascriptNativeFixture} from './javascript-native-fixtures.mjs';
import {createHash} from 'node:crypto';
import {verifyTextImportSource} from '../../client/lib/text-import-node.mjs';
import {textImportConfigurationReadback} from '../../client/lib/text-import-readback.mjs';
import {adaptRead} from '../../client/lib/variant-native-values.mjs';

const need=(v,m)=>{if(!v)throw Error('Native input: '+m);};
export const nativeInputFixture=javascriptNativeFixture();

export function verifyNativeInputFixture(bytes,fixtureId='real'){
  const nativeInputFixture=javascriptNativeFixture(fixtureId);
  need(bytes.length===nativeInputFixture.bytes&&createHash('sha256').update(bytes).digest('hex')===nativeInputFixture.sha256,
    'immutable fixture differs');return {...nativeInputFixture};
}

export function nativeInputRequest({prepared,storage,artifact,uploadOperationId,totalMs,fixtureId='real'}){
  const nativeInputFixture=javascriptNativeFixture(fixtureId);
  need(/^\/jsteach\/js-g2-[a-f0-9-]{36}$/.test(storage),'owned UUID storage required');
  need(artifact.bytes===nativeInputFixture.bytes&&artifact.sha256===nativeInputFixture.sha256,'artifact pin differs');
  return {operation_id:'js-native-input-import',contract_revision:'1.0.0',document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,
    target:{kind:'new',type:'imports.text',label:'NativeInput',position:{x:96,y:80}},inputs:[],mode:'delimited',parameters:{
      settings:{source:{source_path:storage+'/'+nativeInputFixture.file,encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},
        format:{delimiter:';',decimal_separator:'.',null_marker:'__JS_NULL__',text_qualifier:'"'},
        columns:[{name:'Value',label:'Value',type:nativeInputFixture.type,data_kind:nativeInputFixture.data_kind,used:true}]},
      source:{artifact_id:artifact.artifact_id,upload_operation_id:uploadOperationId,bytes:artifact.bytes,sha256:artifact.sha256}},
    mappings:[],finish:'execute',read:{ports:[0],sample_rows:nativeInputFixture.rows,require_exact_numbers:true},
    budgets:{configure_ms:240000,execute_ms:60000,total_ms:Math.min(600000,totalMs)}};
}

export function verifyNativeInputUi(table,fixtureId='real'){
  const fixture=javascriptNativeFixture(fixtureId),expectedValues=fixture.values;
  need(table?.row_count===fixture.rows&&table.sample_rows===fixture.rows&&table.sample_complete===true&&table.filter_enabled===false
    &&table.precision?.numbers_verified===true&&table.precision.limitations?.length===0&&!table.limitations?.length
    &&table.schema?.length===1&&table.schema[0].name==='Value'&&table.schema[0].label==='Value'&&table.schema[0].type===fixture.type
    &&table.sample?.length===fixture.rows&&table.sample.every((row,i)=>row.length===1&&row[0].type===fixture.type
      &&row[0].is_null===(i===0)&&Object.is(row[0].value,expectedValues[i])
      &&row[0].precision===(i===0?'exact_null':fixture.id==='real'?'17_significant_digits':fixture.id==='boolean'?'exact_boolean':'display_text')),'complete typed UI oracle differs');
  return {verified:true,rows:fixture.rows,columns:1,native_bytes_verified:false};
}

// Called only from the private owning import driver, while executor's read-phase
// lock is held. The current import is not yet a completed historical operation.
export function nativeInputProvenance({operation,ctx,verifiedUploads,uploadHistory,exclusiveNodeOperation,execution,fixtureId='real'}){
  const nativeInputFixture=javascriptNativeFixture(fixtureId);
  need(exclusiveNodeOperation()===true&&operation.nodeApply?.pending?.phase==='read','exclusive owning read phase required');
  const request=operation.nodeApply.request;
  need(operation.id===request.operation_id&&request.operation_id==='js-native-input-import'&&request.target.kind==='new'&&request.target.type==='imports.text'
    &&request.finish==='execute'&&request.inputs.length===0&&request.mappings.length===0,'fixed input-only operation required');
  const source=verifyTextImportSource(request.parameters,verifiedUploads(),uploadHistory()).source;
  need(source.bytes===nativeInputFixture.bytes&&source.sha256===nativeInputFixture.sha256&&source.lineage?.basis==='private_ordered_upload_history',
    'pinned verified upload lineage required');
  const readback=textImportConfigurationReadback({node:ctx.node,phases:operation.nodeApply.phases,operation_id:operation.id});
  const finish=operation.nodeApply.phases.find(p=>p.phase==='finish').value;
  need(finish.mode==='execute'&&finish.execution_started===true&&finish.execution_id===ctx.execution.execution_id,'same import Execute receipt required');
  const aliases={';':'Точка с запятой','.':'Точка (.)','"':'Двойная кавычка (")'};
  const format={delimiter:';',decimal_separator:'.',null_marker:'__JS_NULL__',text_qualifier:'"'};
  need(Object.entries(format).every(([k,v])=>request.parameters.settings.format[k]===v)
    &&new RegExp('^/jsteach/js-g2-[a-f0-9-]{36}/'+nativeInputFixture.file.replace('.', '\\.')+'$').exec(source.destination)?.[0]===source.destination,'fixed fixture settings/path required');
  need(readback.source.connection==='Локальное'&&readback.source.source_path===source.destination
    &&['UTF-8','UTF-8 (65001)'].includes(readback.source.encoding)&&readback.source.rows_to_skip==='0'&&readback.source.first_line_as_title===true
    &&Object.entries(format).every(([k,v])=>readback.format[k]===v||readback.format[k]===aliases[v])
    &&readback.format.null_marker==='__JS_NULL__'&&readback.columns.length===1
    &&readback.columns[0].index===0&&readback.columns[0].name==='Value'&&readback.columns[0].label==='Value'
    &&readback.columns[0].type===nativeInputFixture.type&&readback.columns[0].data_kind===nativeInputFixture.data_kind&&readback.columns[0].used===true
    &&readback.output_mapping.fields.length===1&&readback.output_mapping.fields[0].source_name==='Value'
    &&['name','label'].every(k=>readback.output_mapping.fields[0][k]==='Value')&&readback.output_mapping.fields[0].type===nativeInputFixture.type,
    'observed applied input settings differ');
  need(execution?.verified===true&&execution.owner_verified===true&&execution.cleanup_complete===true
    &&execution.status==='completed'&&execution.execution_id===ctx.execution.execution_id
    &&execution.process_id&&execution.process_record_id&&execution.group_id,'owned completed import child required');
  return {kind:'owned_import_read_phase',fixture_id:nativeInputFixture.id,source,readback,execution:structuredClone(execution),operation_id:operation.id,
    node:structuredClone(ctx.node),external_writers_excluded:false};
}

export function verifyNativeInputRead(raw,{binding,lifecycle,provenance}){
  const fixture=javascriptNativeFixture(binding.fixture_id);
  need(provenance.kind==='owned_import_read_phase'&&(provenance.fixture_id??'real')===fixture.id&&provenance.source.sha256===fixture.sha256,'private provenance required');
  need(['document_id','workflow_id','node_id'].every(k=>provenance.node[k]===binding[k])
    &&provenance.execution.execution_id===binding.execution.execution_id,'provenance owner differs');
  const exact=adaptRead(raw,{expected:binding,lifecycle,
    consistency:{kind:'observed_local',changed:false,exclusive_operation:true,stability_basis:'owned_static_completed_fixture'}});
  verifyNativeFixtureCells(exact,fixture.id);
  return {...exact,contract:'javascript-native-input-'+fixture.id+'-1',fixture_id:fixture.id,native_bytes_verified:true,js_created:false,
    js_executed:false,g5_complete:false,provenance};
}

export function verifyNativeFixtureCells(exact,fixtureId='real'){
  const f=javascriptNativeFixture(fixtureId);
  need(exact.coverage.table_complete&&exact.row_count===f.rows&&exact.cells.length===f.rows&&exact.schema.length===1
    &&exact.schema[0].name==='Value'&&exact.schema[0].label==='Value'&&exact.schema[0].type===f.type,'full fixed native slice required');
  need(exact.cells.every((cell,i)=>cell.row===i&&cell.column===0&&cell.is_null===(i===0)
    &&cell.native.tag===(i===0?1:f.id==='real'?5:f.id==='boolean'?11:8)
    &&(i===0?cell.value===null:f.id==='string'?cell.value===f.values[i]&&cell.native.utf8_hex===f.expected_bytes[i]
      :cell.native.bytes_le===f.expected_bytes[i]&&(f.id==='real'||cell.value===f.values[i]))),
    'actual native values/bytes differ from independent oracle');
  return exact;
}
