export function alignElimOutlierOutput(columns,expected){
 if(columns.length!==expected.length||columns.some((c,i)=>['name','label','type'].some(k=>c[k]!==expected[i][k])))throw Error('Outlier detect: output schema/order differs from current input');
 return columns.map((c,i)=>({...c,data_kind:expected[i].data_kind}));
}
export async function readElimOutlierOutputs(channel,read,ctx,mapped){
 const ports=[];
 for(const port of read.ports){
  const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
  const schema=mapped.ports.find(p=>p.port===port)?.schema;if(!schema)throw Error('Outlier detect: configured port schema missing');
  output.schema=alignElimOutlierOutput(output.schema,schema);ports.push(output);
 }
 if(new Set(ports.map(p=>p.port_guid)).size!==ports.length)throw Error('Outlier detect: distinct native ports required');
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports};
}
