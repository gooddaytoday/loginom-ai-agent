import {openNewOutputTable,configureTablePrecision,restoreTablePrecision,prepareTableRead,returnFromOutputTable} from './node-output-procedure.mjs';
import {readTableOutputPages} from './table-output-pages.mjs';
import {decodeTableOutput} from './table-output-values.mjs';
export function clusteringOutputColumns(configuration,port){
 const fields=port===0?configuration.fields:configuration.fields.filter(f=>f.usage_type===3);
 return [{name:'Cluster',label:'Номер кластера',type:'integer'},...(port===0?[{name:'Distance',label:'Расстояние до центра кластера',type:'real'}]:[]),...fields.map(({name,label,type,data_kind})=>({name,label,type,data_kind}))];
}
export function alignClusteringOutput(columns,expected){
 if(columns.length!==expected.length||new Set(columns.map(c=>c.name)).size!==columns.length||columns.some(c=>!expected.some(e=>['name','label','type'].every(k=>c[k]===e[k]))))throw Error('Clustering output differs from its configured input and service fields');
 return columns.map(c=>expected.find(e=>e.name===c.name));
}
export async function readClusteringOutputs(channel,read,ctx,mapped){
 const ports=[],evidence=[];
 for(const port of read.ports){
  const table=await openNewOutputTable(channel,port),format=read.require_exact_numbers?await configureTablePrecision(channel,table.table):null;
  let data,settings,restored;
  try{
   settings=await prepareTableRead(channel,table.table);
   const raw=await readTableOutputPages(channel,table.table,{sampleRows:read.sample_rows});
   const schema=mapped.ports.find(p=>p.port===port)?.schema;if(!schema)throw Error('Configured clustering schema is missing');
   data=decodeTableOutput(raw,{formatProof:format,readSettings:settings,expectedColumns:alignClusteringOutput(raw.columns,schema),requireExactNumbers:read.require_exact_numbers});
  }finally{if(format)restored=await restoreTablePrecision(channel,format);}
  const returned=await returnFromOutputTable(channel,table.table);
  if(!data.schema.some(f=>f.name==='Cluster'&&f.type==='integer')||port===0&&!data.schema.some(f=>f.name==='Distance'&&f.type==='real'))throw Error('Clustering output schema differs from the native model result');
  ports.push({port,port_guid:table.port_guid,fresh:true,execution_id:ctx.execution.execution_id,...data});
  evidence.push({port,table_creation:table,format_proof:format,format_restoration:restored,read_settings:settings,workflow_return:returned});
 }
 if(new Set(ports.map(p=>p.port_guid)).size!==ports.length)throw Error('Clustering outputs must have distinct native ports');
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports,port_evidence:evidence};
}
