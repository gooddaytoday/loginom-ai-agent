import {ensureGroupingOutputSources} from './grouping-output-sources.mjs';
import {configureSortingOutput} from './sorting-output.mjs';
import {readOutputDefinitionPages} from './import-definition-pages.mjs';
import {openNewOutputTable,configureTablePrecision,restoreTablePrecision,prepareTableRead,returnFromOutputTable} from './node-output-procedure.mjs';
import {readTableOutputPages} from './table-output-pages.mjs';
import {decodeTableOutput} from './table-output-values.mjs';
const need=(value,message)=>{if(!value)throw Error(message);};
export const DATAPARTITION_OUTPUT_ROLES=Object.freeze(['combined','training','test']);
const schema=fields=>fields.map(f=>[f.name,f.label,f.type]);

export function verifyDataPartitionOutputSources(fields,inputFields,port){
 need([0,1,2].includes(port)&&Array.isArray(fields)&&Array.isArray(inputFields)
  &&new Set(fields.map(f=>f.name)).size===fields.length,'Unique owned DataPartition output sources required');
 const inherited=fields.filter(f=>inputFields.some(input=>input.name===f.name));
 need(JSON.stringify(schema(inherited))===JSON.stringify(schema(inputFields)),'DataPartition passthrough schema differs from its input');
 const service=fields.filter(f=>!inputFields.some(input=>input.name===f.name));
 need(port===0?service.length===1&&service[0].type==='boolean'&&service[0].required===true:service.length===0,'DataPartition service schema differs');
 return service[0]??null;
}

export function verifyDataPartitionOutputKinds(fields,inputFields,membership){
 need(fields.every(field=>{
  const source=field.source??field.exclusion_source;
  const input=inputFields.find(f=>f.name===source?.name);
  return input?field.type===input.type&&field.data_kind===input.data_kind
   :membership&&source?.record_id===membership.record_id&&field.type==='boolean'&&field.data_kind==='Дискретный';
 }),'DataPartition output type or data kind differs from its source');
}

export async function configureDataPartitionOutputs(channel,configuration,parameters,mappings,finishWizard){
 const ports=[];
 for(const port of [0,1,2]){
  await channel.openOutputPort(port);
  const initial=await channel.observe({condition:'owned DataPartition output sources '+port,readMappings:true,
   ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true});
  const complete=await ensureGroupingOutputSources(channel,initial);
  const membership=verifyDataPartitionOutputSources(complete.node_mapping.source_fields,configuration.input_fields,port);
  const mapped=await configureSortingOutput(channel,{input_fields:complete.node_mapping.source_fields},parameters,
   {direction:'output',port,...mappings.find(m=>m.port===port)});
  need(mapped.native_mapping.node_context?.output_port?.port===port,'DataPartition output mapping owner differs');
  verifyDataPartitionOutputKinds(mapped.native_mapping.target_fields,configuration.input_fields,membership);
  if(membership)need(mapped.native_mapping.target_fields.filter(f=>f.source?.record_id===membership.record_id&&f.type==='boolean'&&f.excluded!==true).length===1,
   'DataPartition combined membership must remain present');
  const definition=await readOutputDefinitionPages(channel,{expectedCount:mapped.native_mapping.target_fields.length});
  need(definition.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===mapped.native_mapping.target_fields[i][k])),'DataPartition output definition differs');
  const finish=await finishWizard('done',true,definition);
  ports.push({port,role:DATAPARTITION_OUTPUT_ROLES[port],...mapped,definition,finish,membership});
 }
 need(new Set(ports.map(p=>p.native_mapping.node_context.output_port.port_guid)).size===3,'DataPartition outputs share an identity');
 return {verified:true,cleanup_complete:true,effect_possible:true,ports};
}

export async function readDataPartitionOutputs(channel,read,ctx,mapped){
 need(read.ports.length===3&&[0,1,2].every(port=>read.ports.includes(port)),'DataPartition read requires all three outputs');
 const ports=[],evidence=[];
 for(const port of read.ports){
  const mapping=mapped.ports.find(p=>p.port===port);need(mapping,'Missing DataPartition output schema');
  const table=await openNewOutputTable(channel,port);
  need(table.port_guid===mapping.native_mapping.node_context.output_port.port_guid,'DataPartition output port GUID changed');
  const formatProof=read.require_exact_numbers?await configureTablePrecision(channel,table.table):null;
  let readSettings,data,formatRestoration;
  try{
   readSettings=await prepareTableRead(channel,table.table);
   const raw=await readTableOutputPages(channel,table.table,{sampleRows:read.sample_rows});
   data=decodeTableOutput(raw,{formatProof,readSettings,expectedColumns:mapping.native_mapping.target_fields.filter(f=>!f.excluded),requireExactNumbers:read.require_exact_numbers});
  }finally{if(formatProof)formatRestoration=await restoreTablePrecision(channel,formatProof);}
  const returned=await returnFromOutputTable(channel,table.table);
  ports.push({port,role:DATAPARTITION_OUTPUT_ROLES[port],port_guid:table.port_guid,fresh:true,execution_id:ctx.execution.execution_id,...data});
  evidence.push({port,table_creation:table,format_proof:formatProof,format_restoration:formatRestoration,read_settings:readSettings,workflow_return:returned});
 }
 need(new Set(ports.map(p=>p.port_guid)).size===3,'DataPartition outputs share an unexpected identity');
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',
  execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports,port_evidence:evidence};
}
