export function assnRulesOutputColumns(configuration,port){
 if(![0,1,2].includes(port))throw Error('Association rules: unsupported output port');
 const item=configuration.fields.find(f=>f.usage_type===configuration.roles.item)?.name;
 if(!item)throw Error('Association rules: configured item field missing');
 const transaction=configuration.fields.find(f=>f.usage_type===configuration.roles.transaction)?.name;
 if(port===2&&!transaction)throw Error('Association rules: configured transaction field missing');
 const width=configuration.max_items??2,consequents=configuration.max_consequents??1;
 const names=port===0?['ItemsetID','Width','Support',...Array.from({length:width},(_,i)=>item+'_'+i)]:['RuleID','Support','Confidence','Lift',...(port===2?[transaction]:[]),...Array.from({length:width-1},(_,i)=>[item+'_'+i+'_A',...(i<consequents?[item+'_'+i+'_C']:[])]).flat()];
 return names.map((name,index)=>({name,type:index>=(port===0?3:4)?'string':['ItemsetID','Width','RuleID'].includes(name)?'integer':'real'}));
}
export function alignAssnRulesOutput(columns,expected){
 // Native field order depends on how the node was configured. Validate the
 // complete named inventory, then retain this node's schema and row positions.
 const actual=new Map(columns.map(c=>[c.name,c.type]));
 if(columns.length!==expected.length||actual.size!==expected.length||expected.some(c=>actual.get(c.name)!==c.type))throw Error('Association rules: output fields or types differ');
 return columns;
}
export async function readAssnRulesOutputs(channel,read,ctx,mapped){
 const ports=[];
 for(const port of read.ports){
  if(![0,1,2].includes(port))throw Error('Association rules: unsupported output port');
  const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
  const schema=mapped.ports.find(p=>p.port===port)?.schema;if(!schema)throw Error('Association rules: configured schema missing');
  alignAssnRulesOutput(output.schema,schema);ports.push(output);
 }
 if(new Set(ports.map(p=>p.port_guid)).size!==ports.length)throw Error('Association rules: output ports must be distinct');
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports};
}
