import {readOutputDefinitionPages} from './import-definition-pages.mjs';
import {reconcileCollapseOutput} from './collapse-output-reconcile.mjs';
import {alignReadSchema} from './node-read-contract.mjs';
const need=(v,m)=>{if(!v)throw Error('Factor analysis output: '+m);};
export function factorAnalysisOutputColumns(c,port){
 const features=c.fields.filter(f=>f.usage_type===3);
 const factors=features.slice(0,c.output_cap?c.output_factors:features.length).map((_,i)=>({name:'Factor'+(i+1),label:'Фактор'+(i+1),type:'real',data_kind:'Непрерывный'}));
 return port===0?[...factors,...c.fields.map(({name,label,type,data_kind})=>({name,label,type,data_kind}))]
  :[{name:'ColumnName',label:'Имя',type:'string',data_kind:'Дискретный'},{name:'ColumnDisplayName',label:'Метка',type:'string',data_kind:'Дискретный'},...factors];
}
export function alignFactorAnalysisOutput(columns,expected){
 need(columns.length===expected.length&&columns.every((c,i)=>['name','label','type'].every(k=>c[k]===expected[i][k])),'schema or field order differs');
 return columns.map((c,i)=>({...c,data_kind:expected[i].data_kind}));
}
export function factorAnalysisInlineSources(c,native,port=0){
 need(port===0||port===1,'conditional PCA port differs');
 need(native?.verified===true&&native.inventory_complete===true&&native.source_identity_verified===true
  &&native.mapping_wizard==='DerivedDataSourceMappingEngineOutputPortWizard'+(port?'-1':''),'owned complete conditional PCA output required');
 const expected=factorAnalysisOutputColumns(c,port),count=c.fields.filter(f=>f.usage_type===3).length;
 need(native.source_fields.length===expected.length&&expected.every(e=>native.source_fields.some(f=>['name','label','type'].every(k=>f[k]===e[k]))),'conditional PCA source schema differs');
 const obsolete=[];
 for(const field of native.target_fields){
  need(field.required===false&&field.inherited===false&&field.excluded===false,'unsupported retained PCA field');
  if(field.source===null){
   const factor=/^Factor([1-9][0-9]*)$/.exec(field.name);
   need(c.output_cap&&factor&&Number(factor[1])>c.output_factors&&Number(factor[1])<=count
    &&field.label==='Фактор'+factor[1]&&field.type==='real','only obsolete unbound capped factors may be removed');
   obsolete.push(field);continue;
  }
  const source=native.source_fields.find(f=>f.record_id===field.source?.record_id);
  need(source&&expected.some(e=>['name','label','type'].every(k=>field[k]===e[k]&&source[k]===e[k])),'retained PCA source link differs');
 }
 const retained=port?expected.filter(f=>!/^Factor[1-9][0-9]*$/.test(f.name)):c.fields;
 need(retained.every(f=>native.target_fields.some(t=>t.name===f.name&&t.source)),'original PCA input or loadings metadata fields must remain linked');
 return obsolete;
}
export async function configureFactorAnalysisOutputs(channel,c,_parameters,mappings,finishWizard){
 need(mappings.length===0,'output overrides unsupported');
 const ports=[];
 for(const port of [0,1]){
  await channel.openOutputPort(port);
  const observe=condition=>channel.observe({condition,readMappings:true,ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true});
  const s=await observe('complete PCA port '+port+' mapping'),expected=factorAnalysisOutputColumns(c,port);
  let mapping=s.node_mapping;
  if(mapping.target_fields.length!==expected.length&&(c.output_cap||c.output_schema_changed)){
   const full=factorAnalysisOutputColumns({...c,output_cap:false},port);
   need(mapping.target_fields.every(f=>!f.excluded&&!f.inherited&&f.required===false&&full.some(e=>['name','label','type'].every(k=>f[k]===e[k])))
    &&expected.filter(f=>!/^Factor[1-9][0-9]*$/.test(f.name)).every(e=>mapping.target_fields.some(f=>f.name===e.name)),'only intrinsic PCA factor width may change');
   mapping=(await reconcileCollapseOutput(channel,s,expected)).node_mapping;
  }
  need(mapping.target_fields.length===expected.length&&expected.every(e=>mapping.target_fields.filter(f=>f.name===e.name&&f.label===e.label&&f.type===e.type&&!f.excluded).length===1),'native output fields differ');
  const schema=mapping.target_fields.map(f=>expected.find(e=>e.name===f.name));
  alignFactorAnalysisOutput(mapping.target_fields,schema);
  const definition=await readOutputDefinitionPages(channel,{expectedCount:expected.length});
  need(definition.fields.every((f,i)=>['name','label','type'].every(k=>f[k]===schema[i][k])),'rendered output differs');
  await finishWizard('done',true,definition);
  ports.push({port,schema,mapping});
 }
 return {verified:true,cleanup_complete:true,effect_possible:true,ports};
}
export async function readFactorAnalysisOutputs(channel,read,ctx,mapped){
 const ports=[];
 for(const port of read.ports){
  const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
  const mappedPort=mapped.ports.find(p=>p.port===port);
  need(mappedPort?.schema,'missing configured schema');
  if(mappedPort.mapping?.autosync===false)output.schema=alignFactorAnalysisOutput(output.schema,mappedPort.schema);
  else {
   const aligned=alignReadSchema(output.schema,mappedPort.schema);
   output.schema=output.schema.map((field,index)=>({...field,data_kind:aligned[index].data_kind}));
  }
  ports.push(output);
 }
 need(new Set(ports.map(p=>p.port_guid)).size===ports.length,'distinct native output ports required');
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports};
}
