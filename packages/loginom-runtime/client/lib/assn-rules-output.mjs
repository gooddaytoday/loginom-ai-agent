export function assnRulesOutputColumns(configuration,port){
 const item=configuration.fields.find(f=>f.usage_type===configuration.roles.item)?.name;
 if(!item)throw Error('Association rules: configured item field missing');
 const names=port===0?['ItemsetID','Width','Support',item+'_0',item+'_1']:['RuleID','Support','Confidence','Lift',item+'_0_A',item+'_0_C'];
 return names.map((name,index)=>({name,type:index>=(port===0?3:4)?'string':['ItemsetID','Width','RuleID'].includes(name)?'integer':'real'}));
}
export function alignAssnRulesOutput(columns,expected){
 if(columns.length!==expected.length||columns.some((c,i)=>c.name!==expected[i].name||c.type!==expected[i].type))throw Error('Association rules: output field order or types differ');
 return columns;
}
export async function readAssnRulesOutputs(channel,read,ctx,mapped){
 const ports=[];
 for(const port of read.ports){
  if(port!==0&&port!==1)throw Error('Association rules: recommendation port 2 is not supported yet');
  const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
  const schema=mapped.ports.find(p=>p.port===port)?.schema;if(!schema)throw Error('Association rules: configured schema missing');
  alignAssnRulesOutput(output.schema,schema);ports.push(output);
 }
 if(new Set(ports.map(p=>p.port_guid)).size!==ports.length)throw Error('Association rules: output ports must be distinct');
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports};
}
