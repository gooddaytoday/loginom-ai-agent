import {configureSortingOutput} from './sorting-output.mjs';
import {readOutputDefinitionPages} from './import-definition-pages.mjs';
import {openNewOutputTable,configureTablePrecision,restoreTablePrecision,prepareTableRead,returnFromOutputTable} from './node-output-procedure.mjs';
import {readTableOutputPages} from './table-output-pages.mjs';
import {decodeTableOutput} from './table-output-values.mjs';
const need=(ok,message)=>{if(!ok)throw Error(message);};
export async function configureFilterOutputs(channel,configuration,parameters,mappings,finishWizard){
 const ports=[];
 for(const port of [0,1]){
  await channel.openOutputPort(port);
  const mapped=await configureSortingOutput(channel,configuration,parameters,{direction:'output',port,...mappings.find(m=>m.port===port)});
  need(mapped.native_mapping.node_context?.output_port?.port===port,'Filter output mapping owner differs');
  const definition=await readOutputDefinitionPages(channel,{expectedCount:mapped.native_mapping.target_fields.length});
  need(definition.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===mapped.native_mapping.target_fields[i][k])),'Filter output definition differs');
  const finish=await finishWizard('done',true);
  ports.push({port,...mapped,definition,finish});
 }
 return {verified:true,cleanup_complete:true,effect_possible:true,ports};
}
export async function readFilterOutputs(channel,read,ctx,mapped){
 const ports=[],evidence=[];
 for(const port of read.ports){
  const mapping=mapped.ports.find(p=>p.port===port);need(mapping,'Missing filter output schema');
  const table=await openNewOutputTable(channel,port),formatProof=read.require_exact_numbers?await configureTablePrecision(channel,table.table):null;
  let readSettings,data,formatRestoration;
  try{
   readSettings=await prepareTableRead(channel,table.table);
   const raw=await readTableOutputPages(channel,table.table,{sampleRows:read.sample_rows});
   data=decodeTableOutput(raw,{formatProof,readSettings,expectedColumns:mapping.native_mapping.target_fields.filter(f=>!f.excluded),requireExactNumbers:read.require_exact_numbers});
  }finally{if(formatProof)formatRestoration=await restoreTablePrecision(channel,formatProof);}
  const returned=await returnFromOutputTable(channel,table.table);
  ports.push({port,port_guid:table.port_guid,fresh:true,execution_id:ctx.execution.execution_id,...data});
  evidence.push({port,table_creation:table,format_proof:formatProof,format_restoration:formatRestoration,read_settings:readSettings,workflow_return:returned});
 }
 need(new Set(ports.map(p=>p.port_guid)).size===ports.length,'Filter outputs share an unexpected identity');
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports,port_evidence:evidence};
}
