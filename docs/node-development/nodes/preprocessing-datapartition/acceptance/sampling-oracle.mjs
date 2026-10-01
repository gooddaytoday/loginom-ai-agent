import {isDeepStrictEqual} from 'node:util';

// This oracle uses source occurrences and declared settings, never an observed
// random sample as expected data. Native PRNG state is deliberately not copied.
export function compareSamplingPartition(expected,binding,result){
 const fail=error=>({status:'FAIL',error});
 if(expected.version!=='data-partition-sampling-v1'||result.node?.document_id!==binding.document_id
  ||result.node?.node_id!==binding.node_id||result.node?.workflow_id!==binding.workflow_id)return fail('OWNER_CHANGED');
 if(result.execution?.status!=='completed'||typeof result.execution.execution_id!=='string')return fail('EXECUTION_NOT_COMPLETED');
 if(result.configuration?.status==='applied'&&!isDeepStrictEqual({...result.configuration.readback?.parameters,mode:result.configuration.readback?.mode},expected.settings))return fail('EFFECTIVE_SETTINGS_CHANGED');
 const ports=result.output?.ports;
 if(!Array.isArray(ports)||ports.length!==3||new Set(ports.map(p=>p.port)).size!==3
  ||binding.ports.length!==3||new Set(binding.ports.map(p=>p.guid)).size!==3)return fail('PORT_SET');
 const schemas=expected.schemas;
 for(const [index,role] of ['combined','training','test'].entries()){
  const port=ports.find(p=>p.port===index),bound=binding.ports.find(p=>p.index===index);
  if(!port||port.role!==role||port.port_guid!==bound?.guid)return fail('PORT_IDENTITY');
  if(port.execution_id!==result.execution.execution_id||port.fresh!==true)return fail('STALE_EXECUTION');
  if(port.precision?.numbers_verified!==true||port.precision.limitations?.length)return fail('NUMERIC_PRECISION');
  if(port.sample_complete!==true||port.filter_enabled!==false||!Array.isArray(port.sample)||port.row_count!==port.sample.length)return fail('FILTER_OR_PARTIAL');
  if(!isDeepStrictEqual(port.schema.map(f=>({index:f.index,name:f.name,label:f.label,type:f.type,data_kind:f.data_kind})),schemas[index])
   ||port.schema.some(f=>f.data_kind_source!=='fresh_native'))return fail('SCHEMA_CHANGED_OR_CACHED');
  if(port.row_count!==expected.sizes[index])return fail('ROW_COUNT');
 }
 const cells=row=>row.map(cell=>({type:cell.type,is_null:cell.is_null,value:cell.value}));
 const training=ports.find(p=>p.port===1).sample.map(cells),test=ports.find(p=>p.port===2).sample.map(cells);
 const counts=new Map();
 for(const row of [...training,...test]){
  if(!expected.source_rows.some(source=>isDeepStrictEqual(source,row)))return fail('PROVENANCE_OR_PAYLOAD');
  const key=JSON.stringify(row);
  counts.set(key,(counts.get(key)??0)+1);
  if(!expected.replacement&&counts.get(key)>1)return fail('DUPLICATE_OCCURRENCE');
 }
 const membershipIndex=schemas[0].findIndex(f=>f.name===expected.membership_name);
 if(membershipIndex<0)return fail('MEMBERSHIP_SCHEMA');
 const combined=ports.find(p=>p.port===0).sample.map(cells);
 const wanted=[...training.map(row=>({row,isTest:false})),...test.map(row=>({row,isTest:true}))];
 for(const row of combined){
  const member=row[membershipIndex],payload=row.filter((_,index)=>index!==membershipIndex);
  if(member.type!=='boolean'||member.is_null||typeof member.value!=='boolean')return fail('MEMBERSHIP_VALUE');
  const index=wanted.findIndex(w=>w.isTest===member.value&&isDeepStrictEqual(w.row,payload));
  if(index<0)return fail('COMBINED_OCCURRENCE');
  wanted.splice(index,1);
 }
 if(wanted.length)return fail('COMBINED_MISSING_OCCURRENCE');
 if(expected.quotas)for(const quota of expected.quotas){
  const rows=quota.role==='training'?training:test;
  if(rows.filter(row=>quota.key.every((cell,index)=>isDeepStrictEqual(cell,row[quota.columns[index]]))).length!==quota.count)return fail('STRATUM_QUOTA');
 }
 if(expected.test_rows&&!isDeepStrictEqual(test,expected.test_rows))return fail('TEST_POSITION_OR_ORDER');
 return {status:'PASS',ports:3};
}

export function compareSamplingReplay(first,second){
 if(first.node?.node_id!==second.node?.node_id||first.execution?.execution_id===second.execution?.execution_id)return {status:'FAIL',error:'REPLAY_NOT_FRESH_SAME_NODE'};
 const rows=result=>result.output?.ports?.map(p=>({port:p.port,schema:p.schema,sample:p.sample}));
 return isDeepStrictEqual(rows(first),rows(second))?{status:'PASS'}:{status:'FAIL',error:'FIXED_SEED_REPLAY_CHANGED'};
}
