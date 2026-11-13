// Declared columns are fixed before Execute; code-defined columns exist only
// after it. Values and types are Loginom's output, never recomputed here.
export async function readPythonOutputs(channel,read,ctx,configured){
 const declared=configured?.ports?.[0]?.schema??null,ports=[];
 for(const port of read.ports){
  const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
  if(declared&&(output.schema.length!==declared.length||output.schema.some((f,i)=>f.name!==declared[i].name||f.type!==declared[i].type)))
   throw Error('Python output schema differs from the declared columns: '+JSON.stringify(output.schema.map(f=>f.name+':'+f.type)));
  ports.push(output);
 }
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports};
}
