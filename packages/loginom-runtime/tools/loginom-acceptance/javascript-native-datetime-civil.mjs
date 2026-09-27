import {createHash} from 'node:crypto';
import {decodeTableOutput} from '../../client/lib/table-output-values.mjs';
import {javascriptNativeFixture} from './javascript-native-fixtures.mjs';

const need=(v,m)=>{if(!v)throw Error('Native civil: '+m);};
const sameTable=(a,b)=>a&&b&&['view_guid','port_guid','table_tid'].every(k=>typeof a[k]==='string'&&a[k]&&a[k]===b[k]);
export const civilDigest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Re-decode original Table pages, including applied-format cache evidence. A
// stored verified flag or numbers_verified alone cannot admit civil values.
export function verifyNativeCivil(proof,{role,node,execution,portGuid,sourceSha256}){
  const fixture=javascriptNativeFixture('civil-datetime');
  need(['input','output','upstream'].includes(role)&&proof?.role===role,'fixed role');
  need(['document_id','workflow_id','node_id'].every(k=>node[k]&&proof.node?.[k]===node[k]),'owner');
  need(execution?.verified===true&&execution.owner_verified===true&&execution.cleanup_complete===true&&execution.status==='completed'
    &&['execution_id','process_id','process_record_id','group_id'].every(k=>typeof execution[k]==='string'&&execution[k]&&proof.execution?.[k]===execution[k])
    &&proof.execution.verified===true&&proof.execution.owner_verified===true&&proof.execution.cleanup_complete===true&&proof.execution.status==='completed','completed execution');
  need(sourceSha256===fixture.sha256&&proof.source_sha256===sourceSha256,'fixture source');
  const r=proof.receipts,t=r?.raw?.table;
  need(t&&t.port_guid===portGuid&&r.table_creation?.created===true&&r.table_creation.port===0
    &&r.table_creation.port_guid===portGuid&&sameTable(t,r.table_creation.table),'new bound Table');
  need(r.workflow_return?.verified===true&&r.workflow_return.execution_started===false&&r.workflow_return.reopen_performed===false
    &&sameTable(t,r.workflow_return.source_table)&&r.workflow_return.node_context?.verified===true
    &&r.workflow_return.node_context.surface==='graph'
    &&['document_id','workflow_id','node_id'].every(k=>r.workflow_return.node_context[k]===node[k]),'restored graph owner');
  const restoration=r.format_restoration,original=r.format_proof?.original_formats?.[0];
  need(restoration?.restored===true&&sameTable(t,restoration.table)&&restoration.fields?.length===1
    &&restoration.fields[0].index===0&&restoration.fields[0].key==='Value'&&restoration.fields[0].type==='datetime'
    &&r.format_proof.original_formats.length===1&&original?.index===0&&original.key==='Value'&&original.type==='datetime','format restoration');
  const empty=original.settings?.format_string===''&&original.settings.custom===false&&original.settings.formatting===true;
  if(empty){
    const restored=restoration.default_datetime_restoration;
    need(restored?.length===1&&restored[0].index===0&&restored[0].key==='Value'&&restored[0].type==='datetime'
      &&restored[0].verified_after_apply===true&&JSON.stringify(restored[0].settings)===JSON.stringify(original.settings),'empty default restoration');
  }else{
    const applied=restoration.applied_format;
    need(applied?.verified===true&&applied.source==='applied_table_format_ui_cache'&&applied.result==='ok'
      &&sameTable(t,applied.table)&&applied.modal_tid===t.table_tid+';ModalWindow_BrowseFormat'
      &&applied.fields?.length===1&&applied.fields[0].index===0&&applied.fields[0].key==='Value'
      &&applied.fields[0].type==='datetime'&&applied.fields[0].mask===original.settings?.format_string,'applied restoration');
  }
  const decoded=decodeTableOutput(r.raw,{formatProof:r.format_proof,readSettings:r.read_settings,
    expectedColumns:[{name:'Value',label:'Value',type:'datetime'}],requireExactNumbers:true});
  need(decoded.row_count===3&&decoded.sample_rows===3&&decoded.sample_complete===true&&decoded.filter_enabled===false
    &&decoded.precision.limitations.length===0&&!decoded.limitations?.length,'full civil coverage');
  need(decoded.sample.every((row,i)=>row.length===1&&row[0].type==='datetime'&&row[0].is_null===(fixture.values[i]===null)
    &&row[0].value===fixture.values[i]&&row[0].precision===(i===0?'exact_null':'millisecond')
    &&(i===0||row[0].representation==='local_datetime'&&row[0].timezone==='unspecified')),'canonical civil components');
  return {verified:true,role,values:decoded.sample.map(row=>row[0].value),precision:'millisecond',timezone:'unspecified',epoch_verified:false,sha256:civilDigest(proof)};
}

export function nativeCivilExpectation(binding,role,sourceSha256){
  need(binding.completed_child&&binding.execution?.status==='completed'&&binding.execution.execution_id===binding.completed_child.execution_id
    &&['process_id','process_record_id','group_id'].every(k=>binding.execution[k]===undefined||binding.execution[k]===binding.completed_child[k]),'compact/full execution association');
  return {role,node:binding,execution:binding.completed_child,portGuid:binding.port_guid,sourceSha256};
}

export function freezeCivilEvidence(value){
  if(value&&typeof value==='object'){for(const entry of Object.values(value))freezeCivilEvidence(entry);Object.freeze(value);}
  return value;
}
