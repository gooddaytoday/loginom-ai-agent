import {readOutputDefinitionPages,observeOutputDefinitionPage} from './import-definition-pages.mjs';
import {configureOutputAutosync,reorderOutputFields} from './port-mapping-procedure.mjs';
import {alignReadSchema} from './node-read-contract.mjs';
const need=(v,m)=>{if(!v)throw Error('Linear regression output: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function linRegressionOutputColumns(configuration,port){
 const target=configuration.fields.find(f=>f.usage_type===4);need(target,'one configured target required');
 // Full native statistics: only Name/coefficient labels are observed, so
 // port 1 is checked by native order, names and types (as logistic regression).
 if(port===1&&configuration.statistics==='full')return [...['Name','DisplayName','UniqueValues'].map(name=>({name,type:'string'})),
  ...['coefficients','stdError','TStat','PValue','lowerBound','upperBound'].map(suffix=>({name:target.name+'_'+suffix,type:'real'}))];
 return port===0?[{name:target.name+'_rergession',label:target.label+'|Регрессия',type:'real'},...configuration.fields.map(({name,label,type,data_kind})=>({name,label,type,data_kind}))]
  :[{name:'Name',label:'Имена входных полей',type:'string'},{name:target.name+'_coefficients',label:target.label+'|Коэффициенты',type:'real'}];
}
export async function configureLinRegressionOutputs(channel,configuration,p,mappings,finishWizard){
 need(mappings.length===0,'mapping overrides are outside stage 1');
 // Inactive intrinsic outputs may expose only exclusions. Preserve them;
 // verify the actual prediction/coefficient schemas after native Execute.
 if(configuration.mode==='apply')return {verified:true,cleanup_complete:true,effect_possible:false,deferred_schema:true,
  ports:[0,1].map(port=>({port,schema:linRegressionOutputColumns(configuration,port)})),saved_full_schema:linRegressionOutputColumns({...configuration,statistics:'full'},1)};
 // A fresh Enter node exposes all nine native coefficient columns; keep them.
 if(configuration.statistics==='full')return {verified:true,cleanup_complete:true,effect_possible:false,deferred_schema:true,
  ports:[0,1].map(port=>({port,schema:linRegressionOutputColumns(configuration,port)}))};
 // Native autosync regenerates pass-through fields in role order after cold
 // activation. Pin only LASSO's approved prediction layout before training.
 if(configuration.mode==='lasso'){
  await channel.openOutputPort(0);
  const observe=condition=>channel.observe({condition,readMappings:true,ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true&&s.node_mapping.inventory_complete===true});
  let state=await observe('complete LASSO prediction mapping');const expected=linRegressionOutputColumns(configuration,0);
  need(state.node_mapping.target_fields.length===expected.length&&expected.every(e=>state.node_mapping.target_fields.filter(f=>!f.excluded&&['name','label','type'].every(k=>f[k]===e[k])).length===1),'prediction mapping differs from configured fields');
  await configureOutputAutosync(channel,false);
  state=await observe('LASSO prediction mapping before ordering');
  if(state.node_mapping.target_fields.some((f,i)=>f.name!==expected[i].name))
   await reorderOutputFields(channel,expected.map(e=>state.node_mapping.target_fields.find(f=>f.name===e.name).record_id));
  state=await observe('stable LASSO prediction layout');
  need(state.node_mapping.autosync===false&&state.node_mapping.target_fields.every((f,i)=>['name','label','type'].every(k=>f[k]===expected[i][k])),'prediction order was not retained');
  const definition=await readOutputDefinitionPages(channel,{expectedCount:expected.length});
  need(definition.fields.every((f,i)=>['name','label','type'].every(k=>f[k]===expected[i][k])),'rendered prediction order differs');
  await finishWizard('done',true,definition);
 }
 await channel.openOutputPort(1);
 const ready=s=>s.node_mapping?.verified===true&&s.node_mapping.inventory_complete===true&&s.node_mapping.mapping_wizard==='DerivedDataSourceOutputSocketWizard';
 const observe=condition=>channel.observe({condition,readMappings:true,ready});
 let state=await observe('complete native regression coefficients');
 const initial=state.node_mapping,expected=linRegressionOutputColumns(configuration,1),keep=expected.map(f=>f.name);
 // After release, native sources can be materialized before the coefficient
 // selection was reduced. Admit that unfinished selection only with complete,
 // unique source bindings and the exact intended retained columns.
 const bindings=initial.target_fields.map(f=>f.excluded?f.exclusion_source:f.source);
 const configured=initial.source_fields.length===initial.target_fields.length
  &&same(initial.target_fields.filter(f=>!f.excluded&&keep.includes(f.name)).map(({name,label,type})=>({name,label,type})),expected)
  &&new Set(bindings.map(s=>s?.record_id)).size===bindings.length
  &&initial.target_fields.every((f,i)=>bindings[i]?.name===f.name&&bindings[i]?.type===f.type
   &&initial.source_fields.some(s=>same(s,bindings[i])));
 need((initial.source_fields.length===0||configured)&&initial.target_fields.every(f=>f.required===false&&f.inherited===false),'only optional native coefficient fields can be selected');
 need(keep.every(name=>initial.target_fields.some(f=>f.name===name&&!f.excluded)),'coefficient names differ from the configured target');
 const semantic=fs=>fs.map(({index,group_index,...f})=>f);
 for(const name of initial.target_fields.filter(f=>!keep.includes(f.name)&&!f.excluded).map(f=>f.name)){
  state=await observe('coefficient field before exclusion');const baseline=state.node_mapping,field=baseline.target_fields.find(f=>f.name===name&&!f.excluded);
  need(field&&baseline.target_fields.filter(f=>!f.excluded).length>2,'coefficient field changed');
  const definition=await readOutputDefinitionPages(channel,{expectedCount:baseline.target_fields.length});
  state=await observeOutputDefinitionPage(channel,{offset:Math.floor(field.index/8)*8,schemaId:definition.schema_id,total:definition.total_columns,field});
  const row=s=>s.wizard?.output_columns?.fields?.find(f=>f.name===name&&f.index===field.index),root=state.wizard.root_ref;
  await channel.perform({condition:'select optional intrinsic coefficient field',initialObservation:state,ready:s=>s.wizard?.root_ref===root&&!!row(s),identity:()=>field,
   resolve:s=>({verb:'click',ref:row(s).name_ref})});
  state=await channel.observe({condition:'selected intrinsic coefficient field',readMappings:true,outputColumnPage:{offset:Math.floor(field.index/8)*8,limit:8},ready:s=>ready(s)&&s.wizard.root_ref===root&&row(s)?.selected===true});
  need(same(semantic(state.node_mapping.target_fields),semantic(baseline.target_fields)),'coefficient mapping changed before exclusion');
  await channel.perform({condition:'exclude optional intrinsic coefficient field',initialObservation:state,ready:s=>ready(s)&&s.wizard.root_ref===root&&row(s)?.selected===true,identity:()=>field,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';DerivedDataSourceOutputSocketWizard;btnAddMappingToExcluded'&&e.allowed_actions.includes('click'));need(es.length===1,'native coefficient exclusion unavailable');return {verb:'click',ref:es[0].ref};}});
  state=await observe('native coefficient exclusion readback');const after=state.node_mapping;
  need(same(after.source_fields,baseline.source_fields)&&after.autosync===baseline.autosync&&after.target_fields.length===baseline.target_fields.length,'exclusion changed the coefficient inventory');
  const excluded=after.target_fields.filter(f=>f.name===name&&f.excluded===true);
  need(excluded.length===1&&excluded[0].source===null&&same(excluded[0].exclusion_source,field.source)
   &&excluded[0].type===field.type&&excluded[0].label===name
   &&same(semantic(after.target_fields.filter(f=>f.name!==name)),semantic(baseline.target_fields.filter(f=>f.name!==name))),'exclusion changed unrelated coefficients');
 }
 const mapping=(await observe('selected coefficient table readback')).node_mapping;
 need(same(mapping.target_fields.filter(f=>!f.excluded).map(f=>f.name),keep),'only names and coefficients must remain');
 const definition=await readOutputDefinitionPages(channel,{expectedCount:mapping.target_fields.length});
 await finishWizard('done',true,definition);
 return {verified:true,cleanup_complete:true,effect_possible:true,deferred_schema:true,coefficient_mapping:mapping,ports:[0,1].map(port=>({port,schema:linRegressionOutputColumns(configuration,port)}))};
}
export async function readLinRegressionOutputs(channel,read,ctx,mapped){
 const ports=[];
 for(const port of read.ports){
  const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
  // Apply preserves the saved coefficient selection: two columns or all nine.
  const expected=port===1&&mapped.saved_full_schema?.length===output.schema.length?mapped.saved_full_schema:mapped.ports.find(p=>p.port===port)?.schema;
  need(expected&&output.schema.length===expected.length&&new Set(output.schema.map(c=>c.name)).size===output.schema.length,'unexpected coefficient or prediction fields'+(port===1&&expected?.length===9?'; statistics:"full" needs all nine native columns, which an earlier coefficients-only setup of this node excluded':''));
  if(port===1&&expected.length===9)need(output.schema.every((field,index)=>field.index===index&&field.name===expected[index].name&&field.type===expected[index].type),'full coefficient field names, types or order differ');
  else{
   const aligned=alignReadSchema(output.schema,expected);
   output.schema=output.schema.map((field,index)=>({...field,data_kind:aligned[index].data_kind}));
  }
  ports.push(output);
 }
 need(new Set(ports.map(p=>p.port_guid)).size===ports.length,'regression outputs must have distinct native ports');
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports};
}
