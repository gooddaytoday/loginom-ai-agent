import {closePreparedWizard} from './node-wizard-close.mjs';
import {readOutputDefinitionPages} from './import-definition-pages.mjs';
const need=(v,m)=>{if(!v)throw Error('CoarseClasses output: '+m);};
export function coarseClassesOutputColumns(c,port){
 const column=([name,type])=>({name,type});
 if(port===1)return [['Group','integer'],['ColumnName','string'],['ColumnDisplayName','string'],['ClassNumber','integer'],['UniqueValue','string'],['ClassMark','string'],['EventsCount','integer'],['NonEventsCount','integer'],['EventRate','real'],['NonEventRate','real'],['LowerBound','variant'],['UpperBound','variant'],['WoE','real'],['IV','real'],['Weight','real'],['IncludeUpperBound','boolean'],['PreQuantingApplied','boolean']].map(column);
 if(port===2)return [['ColumnName','string'],['ColumnDisplayName','string'],['EventsCount','integer'],['NonEventsCount','integer'],['EventRate','real'],['NonEventRate','real'],['TotalEventsCount','integer'],['IV','real'],['Significance','string']].map(column);
 need(port===0,'only ports 0, 1 and 2 supported');
 return c.fields.flatMap(f=>[{...f},...(f.name===c.input_field?['ClassNum','ClassMark','ClassSignificant'].map((suffix,i)=>({name:f.name+'_'+suffix,type:['integer','string','real'][i]})):[])]);
}
export async function configureCoarseClassesOutputs(channel,c,p,mappings){
 need(mappings.length===0,'mapping overrides unsupported');const ports=[];
 for(const port of [0,1,2]){
  await channel.openOutputPort(port);
  const s=await channel.observe({condition:'complete native coarse classes output '+port,readMappings:true,ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified&&s.node_mapping.inventory_complete});
  const m=s.node_mapping,expected=coarseClassesOutputColumns(c,port),fields=m.target_fields.filter(f=>!f.excluded);
  const n=m.node_context,b=n?.output_port,current=s.prepared_node_context;
  need(n?.verified===true&&current?.verified===true&&n.surface==='wizard'&&current.surface==='wizard'
   &&['document_id','workflow_id','node_id'].every(k=>n[k]===c.node_context?.[k]&&n[k]===current[k])
   &&b?.direction==='output'&&b.port===port&&b.native_index===port&&b.node_icon_class==='bg-vendor-icon-coarseclasses'
   &&typeof b.port_guid==='string'&&b.port_guid.length>0&&typeof b.opening_operation_id==='string'&&b.opening_operation_id.length>0
   &&['direction','port','native_index','port_guid','opening_operation_id','node_icon_class'].every(k=>b[k]===current.output_port?.[k]),'native output port owner differs');
  // Initial definitions are unconnected; materialized models expose a native
  // source collection. Both must retain the exact owned output schema/order.
  const sources=m.source_fields,sourceMapping=Array.isArray(sources)&&(sources.length===0?fields.every(f=>f.source===null)
   :m.source_identity_verified===true&&sources.length===expected.length&&fields.length===expected.length
    &&fields.every((f,i)=>sources[i].name===expected[i].name&&sources[i].type===expected[i].type&&JSON.stringify(f.source)===JSON.stringify(sources[i])));
  need(m.mapping_wizard==='DerivedDataSourceOutputSocketWizard'&&sourceMapping
   &&fields.length===expected.length&&fields.every((f,i)=>f.name===expected[i].name&&f.type===expected[i].type),'native output schema/order differs');
  const definition=await readOutputDefinitionPages(channel,{expectedCount:m.target_fields.length});
  need(definition.fields.length===fields.length&&definition.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===fields[i][k])),'rendered output definition differs');
  ports.push({port,schema:fields.map(({name,label,type,data_kind})=>({name,label,type,data_kind}))});
  // Output inspection must not commit a wizard and invalidate learned bins.
  await closePreparedWizard(channel);
 }
 return {verified:true,cleanup_complete:true,effect_possible:false,ports};
}
export async function readCoarseClassesOutputs(channel,read,ctx,mapped){
 need(JSON.stringify(read.ports)==='[0,1,2]','all three output ports required');const ports=[];
 for(const port of read.ports){
  const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
  const expected=mapped.ports.find(p=>p.port===port)?.schema;
  need(expected&&output.schema.length===expected.length&&output.schema.every((f,i)=>f.name===expected[i].name&&f.type===expected[i].type&&(expected[i].label===undefined||f.label===expected[i].label)),'schema/order differs from coarse classes output');
  ports.push(output);
 }
 need(new Set(ports.map(p=>p.port_guid)).size===ports.length,'distinct native ports required');
 coarseClassesMaterializedModel(ports);
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports};
}

// Materialization is proved by current native class/statistics outputs, never
// by entering the editor, which validates the current Target and may rebuild.
export function coarseClassesMaterializedModel(ports){
 const classesPort=ports.find(p=>p.port===1),stats=ports.find(p=>p.port===2);
 need([classesPort,stats].every(p=>p?.fresh===true&&p.sample_complete===true&&p.sample?.length===p.row_count)&&classesPort.row_count>0&&classesPort.row_count<=1000&&stats.row_count===1,'complete fresh model reports required');
 const value=(p,row,name,type)=>{const i=p.schema.findIndex(f=>f.name===name),c=row[i];need(i>=0&&c?.type===type&&c.is_null===false,'typed model cell required: '+name);
  if(type==='real')need(c.precision==='17_significant_digits'&&Number.isFinite(c.value),'exact model Real required');
  if(type==='integer')need(c.precision==='exact_integer'&&/^(0|[1-9][0-9]*)$/.test(c.value)&&Number.isSafeInteger(Number(c.value)),'exact model class number required');
  if(type==='string')need(typeof c.value==='string'&&c.value.length>0,'model text required');return type==='integer'?Number(c.value):c.value;};
 const input_field=value(stats,stats.sample[0],'ColumnName','string'),total_iv=value(stats,stats.sample[0],'IV','real');
 const classes=classesPort.sample.map(row=>{need(value(classesPort,row,'ColumnName','string')===input_field,'model field differs');return {number:value(classesPort,row,'ClassNumber','integer'),mark:value(classesPort,row,'ClassMark','string'),woe:value(classesPort,row,'WoE','real'),iv:value(classesPort,row,'IV','real')};});
 need(new Set(classes.map(c=>c.number)).size===classes.length,'duplicate model class identity');
 return {state:'materialized',input_field,total_iv,classes};
}
