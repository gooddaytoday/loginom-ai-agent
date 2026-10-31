import {closePreparedWizard} from './node-wizard-close.mjs';
import {readOutputDefinitionPages} from './import-definition-pages.mjs';
const need=(v,m)=>{if(!v)throw Error('Binning output: '+m);};
export function binningOutputColumns(c,port){
 const column=(name,type)=>({name,type});
 if(port===1)return [['BinsID','string'],['BoundsDataType','integer'],['Number','integer'],['LowBound',c.type],['UppBound',c.type],['Label','string'],['LowBoundQuota','real'],['UppBoundQuota','real'],['BinQuota','real'],['LowDev',c.type],['UppDev',c.type],['LowLimitOpen','boolean'],['UppLimitOpen','boolean']].map(([n,t])=>column(n,t));
 need(port===0,'only ports 0 and 1 supported');
 return c.fields.flatMap(f=>[{name:f.name,label:f.label,type:f.type,data_kind:f.data_kind},...(f.name===c.field?[
  ['BinsID','string'],['Number','integer'],['Label','string'],['LowBound',c.type],['UppBound',c.type],['LowBoundIncl','boolean'],['UppBoundIncl','boolean'],['LowLimOpen','boolean'],['UppLimOpen','boolean'],['OutOfBins','integer']].map(([n,t])=>column(f.name+'_'+n,t)):[])]);
}
export async function configureBinningOutputs(channel,c,p,mappings){
 need(mappings.length===0,'mapping overrides unsupported');const ports=[];
 for(const port of [0,1]){
  await channel.openOutputPort(port);
  const s=await channel.observe({condition:'complete native binning output '+port,readMappings:true,ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified&&s.node_mapping.inventory_complete});
  const m=s.node_mapping,expected=binningOutputColumns(c,port),fields=m.target_fields.filter(f=>!f.excluded);
  const n=m.node_context,b=n?.output_port,current=s.prepared_node_context;
  need(n?.verified===true&&current?.verified===true&&n.surface==='wizard'&&current.surface==='wizard'
   &&['document_id','workflow_id','node_id'].every(k=>n[k]===c.node_context?.[k]&&n[k]===current[k])
   &&b?.direction==='output'&&b.port===port&&b.native_index===port&&b.node_icon_class==='bg-vendor-icon-binning'
   &&typeof b.port_guid==='string'&&b.port_guid.length>0&&typeof b.opening_operation_id==='string'&&b.opening_operation_id.length>0
   &&['direction','port','native_index','port_guid','opening_operation_id','node_icon_class'].every(k=>b[k]===current.output_port?.[k]),'native output port owner differs');
  // Derived Binning definitions have no ConnectedRecord/source collection.
  // Their identity comes from the owned native output port, not input links.
  need(m.mapping_wizard==='DerivedDataSourceOutputSocketWizard'&&m.source_fields?.length===0
   &&fields.length===expected.length&&fields.every((f,i)=>f.name===expected[i].name&&f.type===expected[i].type&&f.source===null),'native output schema/order differs');
  const definition=await readOutputDefinitionPages(channel,{expectedCount:m.target_fields.length});
  need(definition.fields.length===fields.length&&definition.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===fields[i][k])),'rendered output definition differs');
  ports.push({port,schema:fields.map(({name,label,type,data_kind})=>({name,label,type,data_kind}))});
  // Output inspection must not commit a wizard and invalidate learned bins.
  await closePreparedWizard(channel);
 }
 return {verified:true,cleanup_complete:true,effect_possible:false,ports};
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
