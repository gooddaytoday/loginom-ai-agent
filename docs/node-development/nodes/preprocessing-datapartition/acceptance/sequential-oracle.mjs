import {isDeepStrictEqual} from 'node:util';
import {compareMultiOutput,MULTI_OUTPUT_VERSION} from '../../../../../scripts/node-acceptance/multi-output-oracle.mjs';
const need=(value,message)=>{if(!value)throw Error(message);};

// Binding is frozen separately from mathematical expected rows. Changing an
// output under test must never change its expected owner/port GUIDs.
export function compareSequentialPartition(expected,binding,result){
 if(expected.version!=='data-partition-independent-v1'||result.node?.document_id!==binding.document_id)return {status:'FAIL',error:'EXPECTED_OR_DOCUMENT_CHANGED'};
 if(result.configuration?.status==='applied'){
  const c=result.configuration.readback;
  if(c?.kind!=='data_partition'||!isDeepStrictEqual({...c.parameters,mode:c.mode},expected.settings))return {status:'FAIL',error:'EFFECTIVE_SETTINGS_CHANGED'};
 }
 const oracle={version:MULTI_OUTPUT_VERSION,owner:binding.owner,ports:expected.ports.map(port=>({...port,
  guid:binding.ports.find(p=>p.index===port.index)?.guid,rules:port.schema.map(()=>({kind:'exact'}))})),invariants:[]};
 need(binding.ports.length===3&&new Set(binding.ports.map(p=>p.guid)).size===3,'Independent owned port binding required');
 const observation={version:MULTI_OUTPUT_VERSION,owner:binding.owner,
  execution:{id:result.execution?.execution_id,status:result.execution?.status,fresh:result.output?.ports?.every(p=>p.fresh===true),owner_verified:result.node?.node_id===binding.owner.node_id&&result.node?.workflow_id===binding.owner.workflow_id},
  ports:(result.output?.ports??[]).map(port=>({index:port.port,role:port.role,
   guid:port.port_guid,execution_id:port.execution_id,schema:port.schema.map(f=>({index:f.index,name:f.name,label:f.label,type:f.type,data_kind:f.data_kind,null_semantics:'typed_null'})),
   schema_source:port.schema.every(f=>f.data_kind_source==='fresh_native')?'fresh_native':'cached',filter_enabled:port.filter_enabled,
   complete:port.sample_complete,row_count:port.row_count,rows:port.sample.map(row=>row.map(cell=>({type:cell.type,is_null:cell.is_null,value:cell.value})))}))};
 return compareMultiOutput(oracle,observation);
}
