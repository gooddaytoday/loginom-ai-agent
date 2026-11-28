import {alignReadSchema} from './node-read-contract.mjs';

const need=(v,m)=>{if(!v)throw Error('Sequential output: '+m);};
export function validateSamplingOutputMapping(c,m,port){
 need(m?.verified===true&&m.inventory_complete===true&&m.node_context?.output_port?.port===port,'output owner differs');
 if(m.source_identity_verified===true)return;
 // With autosync off, Loginom's unexecuted output exposes its complete literal
 // definition without a source store. Bind it to the already verified input
 // inventory and this exact port; do not claim a native source-link proof.
 need(['stratified','biased','uniform'].includes(c.mode)&&m.autosync===false&&Array.isArray(m.source_fields)&&m.source_fields.length===0
  &&Array.isArray(m.target_fields)&&m.target_fields.every(f=>!f.source&&!f.excluded&&f.inherited===false),'frozen output definition required');
 const expected=samplingOutputColumns(c,port);
 need(m.target_fields.length===expected.length&&new Set(m.target_fields.map(f=>f.name)).size===expected.length
  &&expected.every(f=>m.target_fields.some(t=>['name','label','type','data_kind'].every(k=>t[k]===f[k]))),'frozen fields differ from verified input');
}
export function samplingOutputColumns(c,port){
 const partition=c.kind==='data_partition';
 need(Number.isInteger(port)&&port>=0&&port<(partition?3:1),'unknown port');
 return [...(partition&&port===0?[{name:'IsTestSet',label:'Тестовое множество',type:'boolean',data_kind:'Дискретный'}]:[]),...c.input_fields];
}
export function alignSamplingOutput(actual,expected,autosync){
 if(autosync!==true)
  need(actual.length===expected.length&&actual.every((f,i)=>['name','label','type'].every(k=>f[k]===expected[i][k])),'field types or order differ');
 const aligned=autosync===true?alignReadSchema(actual,expected):expected;
 return actual.map((f,i)=>({...f,data_kind:aligned[i].data_kind}));
}
export async function readSamplingOutputs(channel,read,ctx,mapped){
 const ports=[];
 for(const port of read.ports){
  const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
  const mappedPort=mapped.ports.find(p=>p.port===port);need(mappedPort?.schema,'configured schema missing');
  output.schema=alignSamplingOutput(output.schema,mappedPort.schema,mappedPort.native_mapping?.autosync);ports.push(output);
 }
 need(new Set(ports.map(p=>p.port_guid)).size===ports.length,'duplicate native ports');
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports};
}
