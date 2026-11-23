export const CORR_ANALYSIS_OUTPUT=[{name:'ColSet1',label:'Поле1.Имя',type:'string'},{name:'ColSet1_Label',label:'Поле1.Метка',type:'string'},
 {name:'ColSet2',label:'Поле2.Имя',type:'string'},{name:'ColSet2_Label',label:'Поле2.Метка',type:'string'},{name:'Pirson',label:'Пирсона',type:'real'}];
export function corrAnalysisOutputSchema(mode){
 if(mode==='pearson')return CORR_ANALYSIS_OUTPUT;
 const name={spearman:'Spearman',kendall:'TauBKendall'}[mode];
 if(!name)throw Error('Correlation output: unsupported coefficient');
 return [...CORR_ANALYSIS_OUTPUT.slice(0,4),{name,type:'real'}];
}
export async function readCorrAnalysisOutputs(channel,read,ctx,configured){
 const schema=configured?.ports?.[0]?.schema??CORR_ANALYSIS_OUTPUT;
 const ports=[];
 for(const port of read.ports){
  const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
  if(output.schema.length!==schema.length||output.schema.some((f,i)=>Object.keys(schema[i]).some(k=>f[k]!==schema[i][k])))throw Error('Correlation output schema differs from selected native coefficient fields');
  ports.push(output);
 }
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports};
}
