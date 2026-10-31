const need=(v,m)=>{if(!v)throw Error('Sequential output: '+m);};
export function samplingOutputColumns(c,port){
 const partition=c.kind==='data_partition';
 need(Number.isInteger(port)&&port>=0&&port<(partition?3:1),'unknown port');
 return [...(partition&&port===0?[{name:'IsTestSet',label:'Тестовое множество',type:'boolean',data_kind:'Дискретный'}]:[]),...c.input_fields];
}
export function alignSamplingOutput(actual,expected){
 need(actual.length===expected.length&&actual.every((f,i)=>['name','label','type'].every(k=>f[k]===expected[i][k])),'field types or order differ');
 return actual.map((f,i)=>({...f,data_kind:expected[i].data_kind}));
}
export async function readSamplingOutputs(channel,read,ctx,mapped){
 const ports=[];
 for(const port of read.ports){
  const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
  const expected=mapped.ports.find(p=>p.port===port)?.schema;need(expected,'configured schema missing');
  output.schema=alignSamplingOutput(output.schema,expected);ports.push(output);
 }
 need(new Set(ports.map(p=>p.port_guid)).size===ports.length,'duplicate native ports');
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports};
}
