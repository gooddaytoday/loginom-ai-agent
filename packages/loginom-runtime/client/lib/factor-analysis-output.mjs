import {configureOutputAutosync,reorderOutputFields} from './port-mapping-procedure.mjs';
import {readOutputDefinitionPages} from './import-definition-pages.mjs';
const need=(v,m)=>{if(!v)throw Error('Factor analysis output: '+m);};
export function factorAnalysisOutputColumns(c,port){
 const factors=c.fields.filter(f=>f.usage_type===3).map((_,i)=>({name:'Factor'+(i+1),label:'Фактор'+(i+1),type:'real',data_kind:'Непрерывный'}));
 return port===0?[...factors,...c.fields.map(({name,label,type,data_kind})=>({name,label,type,data_kind}))]
  :[{name:'ColumnName',label:'Имя',type:'string',data_kind:'Дискретный'},{name:'ColumnDisplayName',label:'Метка',type:'string',data_kind:'Дискретный'},...factors];
}
export function alignFactorAnalysisOutput(columns,expected){
 need(columns.length===expected.length&&columns.every((c,i)=>['name','label','type'].every(k=>c[k]===expected[i][k])),'schema or field order differs');
 return columns.map((c,i)=>({...c,data_kind:expected[i].data_kind}));
}
export async function configureFactorAnalysisOutputs(channel,c,p,mappings,finishWizard){
 need(mappings.length===0,'output overrides unsupported');
 const ports=[];
 for(const port of [0,1]){
  await channel.openOutputPort(port);
  const observe=condition=>channel.observe({condition,readMappings:true,ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true});
  let s=await observe('complete PCA port '+port+' mapping');const expected=factorAnalysisOutputColumns(c,port);
  const baseline=s.node_mapping;
  need(baseline.target_fields.length===expected.length&&expected.every(e=>baseline.target_fields.some(f=>f.name===e.name&&f.label===e.label&&f.type===e.type&&!f.excluded)),'native output fields differ');
  await configureOutputAutosync(channel,false);
  s=await observe('PCA mapping before ordering');
  await reorderOutputFields(channel,expected.map(e=>s.node_mapping.target_fields.find(f=>f.name===e.name).record_id));
  s=await observe('stable PCA output mapping');const mapping=s.node_mapping;
  need(mapping.autosync===false,'autosync must be disabled');
  alignFactorAnalysisOutput(mapping.target_fields,expected);
  const definition=await readOutputDefinitionPages(channel,{expectedCount:expected.length});
  need(definition.fields.every((f,i)=>['name','label','type'].every(k=>f[k]===expected[i][k])),'rendered output differs');
  await finishWizard('done',true,definition);
  ports.push({port,schema:expected,mapping});
 }
 return {verified:true,cleanup_complete:true,effect_possible:true,ports};
}
export async function readFactorAnalysisOutputs(channel,read,ctx,mapped){
 const ports=[];
 for(const port of read.ports){
  const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
  const expected=mapped.ports.find(p=>p.port===port)?.schema;need(expected,'missing configured schema');
  output.schema=alignFactorAnalysisOutput(output.schema,expected);ports.push(output);
 }
 need(new Set(ports.map(p=>p.port_guid)).size===ports.length,'distinct native output ports required');
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports};
}
