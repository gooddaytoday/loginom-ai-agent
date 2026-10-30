import {alignReadSchema} from './node-read-contract.mjs';
const need=(v,m)=>{if(!v)throw Error('Logistic regression output: '+m);};
export function logRegressionOutputColumns(configuration){
 const target=configuration.fields.filter(f=>f.usage_type===4);need(target.length===1,'one configured target required');
 return [{name:'PredictionEvent',label:'Событие|Прогноз',type:'boolean'},
  {name:'PredictionProbability',label:'Вероятность события|Прогноз',type:'real'},
  {name:'ActualEvent',label:'Событие|Факт',type:'boolean'},
  {name:target[0].name+'_predicted',label:target[0].label+'|Прогноз',type:'string'},
  ...configuration.fields.map(({name,label,type,data_kind})=>({name,label,type,data_kind}))];
}
export async function configureLogRegressionOutputs(channel,configuration,p,mappings){
 need(mappings.length===0,'mapping overrides are outside stage 1');
 // Preserve the intrinsic prediction layout. Coefficients and variables are
 // outside this handler; verify port zero after explicit native training.
 return {verified:true,cleanup_complete:true,effect_possible:false,deferred_schema:true,ports:[{port:0,schema:logRegressionOutputColumns(configuration)}]};
}
export async function readLogRegressionOutputs(channel,read,ctx,mapped){
 need(read.ports.every(p=>p===0),'only prediction output zero is supported');const ports=[];
 for(const port of read.ports){
  const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
  const expected=mapped.ports.find(p=>p.port===port)?.schema;
  need(expected&&output.schema.length===expected.length&&new Set(output.schema.map(c=>c.name)).size===output.schema.length,'unexpected prediction fields');
  const aligned=alignReadSchema(output.schema,expected);
  output.schema=output.schema.map((field,index)=>({...field,data_kind:aligned[index].data_kind}));ports.push(output);
 }
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports};
}
