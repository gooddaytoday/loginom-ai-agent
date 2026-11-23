export const QUALITY_SUMMARY=[['N','integer'],['DisplayName','string'],['DataType','string'],['DataKind','string'],['Null','integer'],['Out','integer'],['Extr','integer'],['Avg','real'],['Moda','variant'],['Median','real']]
 .map(([label,type],index)=>({name:'Col'+index,label,type}));
export async function readQualityOutputs(channel,read,ctx,mapped){
 const ports=[];
 for(const port of read.ports){
  const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
  const expected=mapped.ports.find(p=>p.port===port)?.schema;
  if(!expected||output.schema.length!==expected.length||output.schema.some((f,i)=>['name','label','type'].some(k=>f[k]!==expected[i][k])))throw Error('Quality output '+port+' schema differs from the native profile');
  ports.push(output);
 }
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports};
}
