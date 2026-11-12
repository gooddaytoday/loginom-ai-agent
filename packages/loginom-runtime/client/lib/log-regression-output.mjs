import {readOutputDefinitionPages} from './import-definition-pages.mjs';
import {configureOutputAutosync,reorderOutputFields} from './port-mapping-procedure.mjs';
import {alignReadSchema} from './node-read-contract.mjs';
const need=(v,m)=>{if(!v)throw Error('Logistic regression output: '+m);};
export function logRegressionOutputColumns(configuration,port=0){
 const target=configuration.fields.filter(f=>f.usage_type===4);need(target.length===1,'one configured target required');
 need(port===0||port===1,'only prediction 0 and coefficients 1 are supported');
 if(port===1)return [
  ...['Name','DisplayName','UniqueValues'].map(name=>({name,type:'string'})),
  ...['coefficients','stdError','wald','waldPValue','oddsRatio','lowerBound','upperBound'].map(suffix=>({name:target[0].name+'_'+suffix,type:'real'}))];
 return [{name:'PredictionEvent',label:'Событие|Прогноз',type:'boolean'},
  {name:'PredictionProbability',label:'Вероятность события|Прогноз',type:'real'},
  {name:'ActualEvent',label:'Событие|Факт',type:'boolean'},
  {name:target[0].name+'_predicted',label:target[0].label+'|Прогноз',type:'string'},
  ...(configuration.fields.some(f=>f.usage_type===7)?[...configuration.fields.filter(f=>f.usage_type===3),...target,...configuration.fields.filter(f=>![3,4].includes(f.usage_type))]:configuration.fields).map(({name,label,type,data_kind})=>({name,label,type,data_kind}))];
}
export async function configureLogRegressionOutputs(channel,configuration,p,mappings,finishWizard){
 need(mappings.length===0,'mapping overrides are outside stage 1');
 // l1466-r1 CSV retained RowID before factors, while cold regenerates role
 // order. Use the existing native mapping controls to pin the weighted layout.
 const weighted=configuration.mode!=='apply'&&configuration.fields.some(f=>f.usage_type===7);
 if(weighted){
  await channel.openOutputPort(0);
  const observe=condition=>channel.observe({condition,readMappings:true,ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true&&s.node_mapping.inventory_complete===true});
  let state=await observe('complete weighted prediction mapping');const expected=logRegressionOutputColumns(configuration);
  need(state.node_mapping.target_fields.length===expected.length&&expected.every(e=>state.node_mapping.target_fields.filter(f=>!f.excluded&&['name','label','type'].every(k=>f[k]===e[k])).length===1),'weighted prediction fields differ');
  await configureOutputAutosync(channel,false);
  state=await observe('weighted prediction mapping before ordering');
  if(state.node_mapping.target_fields.some((f,i)=>f.name!==expected[i].name))
   await reorderOutputFields(channel,expected.map(e=>state.node_mapping.target_fields.find(f=>f.name===e.name).record_id));
  state=await observe('stable weighted prediction layout');
  need(state.node_mapping.autosync===false&&state.node_mapping.target_fields.every((f,i)=>['name','label','type'].every(k=>f[k]===expected[i][k])),'weighted prediction order was not retained');
  const definition=await readOutputDefinitionPages(channel,{expectedCount:expected.length});
  need(definition.fields.every((f,i)=>['name','label','type'].every(k=>f[k]===expected[i][k])),'rendered weighted prediction order differs');
  await finishWizard('done',true,definition);
 }
 // Preserve both intrinsic tables; verify their materialized schemas after
 // native training/Execute. Coefficient labels come from the native output.
 return {verified:true,cleanup_complete:true,effect_possible:weighted,deferred_schema:true,
  ports:[0,1].map(port=>({port,schema:logRegressionOutputColumns(configuration,port)}))};
}
export async function readLogRegressionOutputs(channel,read,ctx,mapped){
 need(read.ports.every(p=>p===0||p===1),'only prediction 0 and coefficients 1 are supported');const ports=[];
 for(const port of read.ports){
  const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
  const expected=mapped.ports.find(p=>p.port===port)?.schema;
  need(expected&&output.schema.length===expected.length&&new Set(output.schema.map(c=>c.name)).size===output.schema.length,'unexpected prediction or coefficient fields');
  if(port===0){
   const aligned=alignReadSchema(output.schema,expected);
   output.schema=output.schema.map((field,index)=>({...field,data_kind:aligned[index].data_kind}));
  }else need(output.schema.every((field,index)=>field.index===index&&field.name===expected[index].name&&field.type===expected[index].type),'coefficient field names, types or order differ');
  ports.push(output);
 }
 need(new Set(ports.map(p=>p.port_guid)).size===ports.length,'logistic outputs must have distinct native ports');
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports};
}
