const need=(v,m)=>{if(!v)throw Error('Binning output: '+m);};
export function binningOutputColumns(c,port){
 const column=(name,type)=>({name,type});
 if(port===1)return [['BinsID','string'],['BoundsDataType','integer'],['Number','integer'],['LowBound',c.type],['UppBound',c.type],['Label','string'],['LowBoundQuota','real'],['UppBoundQuota','real'],['BinQuota','real'],['LowDev',c.type],['UppDev',c.type],['LowLimitOpen','boolean'],['UppLimitOpen','boolean']].map(([n,t])=>column(n,t));
 need(port===0,'only ports 0 and 1 supported');
 return c.fields.flatMap(f=>[{name:f.name,label:f.label,type:f.type,data_kind:f.data_kind},...(f.name===c.field?[
  ['BinsID','string'],['Number','integer'],['Label','string'],['LowBound',c.type],['UppBound',c.type],['LowBoundIncl','boolean'],['UppBoundIncl','boolean'],['LowLimOpen','boolean'],['UppLimOpen','boolean'],['OutOfBins','integer']].map(([n,t])=>column(f.name+'_'+n,t)):[])]);
}
export async function readBinningOutputs(channel,read,ctx,mapped){
 need(JSON.stringify(read.ports)==='[0,1]','both output ports required');const ports=[];
 for(const port of read.ports){
  const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
  const expected=mapped.ports.find(p=>p.port===port)?.schema;
  need(expected&&output.schema.length===expected.length&&output.schema.every((f,i)=>f.name===expected[i].name&&f.type===expected[i].type&&(expected[i].label===undefined||f.label===expected[i].label)),'schema/order differs from binning output');
  ports.push(output);
 }
 need(new Set(ports.map(p=>p.port_guid)).size===ports.length,'distinct native ports required');
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports};
}
