const need=(v,m)=>{if(!v)throw Error('Autocorrelation output: '+m);};
export function validateAutoCorrelationOutputSchema(schema){
 need(Array.isArray(schema)&&schema.length===4&&schema[0].name==='Lag'&&schema[0].type==='integer','Lag must be the first integer field');
 const match=/^(.+)_ACF$/.exec(schema[1].name);
 need(match&&schema[1].type==='real'&&schema[2].name===match[1]+'_StdErr'&&schema[2].type==='real'
  &&schema[3].name===match[1]+'_Significant'&&schema[3].type==='boolean','one ordered native ACF/error/significance block required');
 return schema;
}
export async function readAutoCorrelationOutputs(channel,read,ctx,mappings){
 const ports=[];
 for(const port of read.ports){
  const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
  validateAutoCorrelationOutputSchema(output.schema);
  const expected=mappings.ports.find(p=>p.port===port)?.schema;
  need(expected&&output.schema.length===expected.length&&output.schema.every((f,i)=>['name','label','type'].every(k=>f[k]===expected[i][k])),'observed schema differs from committed output');
  need(Number.isSafeInteger(output.row_count)&&output.row_count>=1&&output.row_count<=mappings.lag_count,'native lag count differs');
  need(output.sample.every((row,i)=>row.Lag===i),'native lag order differs');
  ports.push(output);
 }
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports};
}
