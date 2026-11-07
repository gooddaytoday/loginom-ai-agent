import {configureSortingOutput} from './sorting-output.mjs';
import {readOutputDefinitionPages} from './import-definition-pages.mjs';
import {alignReadSchema} from './node-read-contract.mjs';
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
 const ports=[];
 for(const port of read.ports){
  const mapping=mapped.ports.find(p=>p.port===port);need(mapping,'Missing filter output schema');
  const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
  const expected=mapping.native_mapping.target_fields.filter(f=>!f.excluded);
  need(output.schema.every((field,index)=>field.name===expected[index]?.name),'Filter output field order differs from the configured output');
  const aligned=alignReadSchema(output.schema,expected);
  output.schema=output.schema.map((field,index)=>({...field,data_kind:aligned[index].data_kind}));
  ports.push(output);
 }
 need(new Set(ports.map(p=>p.port_guid)).size===ports.length,'Filter outputs share an unexpected identity');
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports};
}
