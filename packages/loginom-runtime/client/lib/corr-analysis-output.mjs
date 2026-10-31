export const CORR_ANALYSIS_OUTPUT=[{name:'ColSet1',label:'Поле1.Имя',type:'string'},{name:'ColSet1_Label',label:'Поле1.Метка',type:'string'},
 {name:'ColSet2',label:'Поле2.Имя',type:'string'},{name:'ColSet2_Label',label:'Поле2.Метка',type:'string'},{name:'Pirson',label:'Пирсона',type:'real'}];
export async function readCorrAnalysisOutputs(channel,read,ctx){
 const ports=[];
 for(const port of read.ports){
  const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
  if(output.schema.length!==CORR_ANALYSIS_OUTPUT.length||output.schema.some((f,i)=>['name','label','type'].some(k=>f[k]!==CORR_ANALYSIS_OUTPUT[i][k])))throw Error('Correlation output schema differs from native Pearson fields');
  ports.push(output);
 }
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports};
}
