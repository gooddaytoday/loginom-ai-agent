import {resolveAutoCorrelationField} from './auto-correlation-parameters.mjs';
import {bindReformInput} from './reform-input.mjs';
import {readOutputDefinitionPages,observeOutputDefinitionPage} from './import-definition-pages.mjs';
import {validateAutoCorrelationOutputSchema} from './auto-correlation-output.mjs';
const need=(v,m)=>{if(!v)throw Error('Autocorrelation: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function configureAutoCorrelationRoles(channel,p,inputMapping){
 const ready=s=>s.wizard?.stage==='input_mapping'&&s.node_auto_correlation?.verified===true&&s.node_auto_correlation.kind==='roles';
 const observe=condition=>channel.observe({condition,readAutoCorrelation:true,ready});
 const bind=s=>bindReformInput(s.node_auto_correlation,inputMapping);
 const baseline=bind(await observe('complete autocorrelation roles'));
 need(baseline.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===inputMapping.target_fields[i][k])),'role schema differs from connected input');
 const field=resolveAutoCorrelationField(p,baseline.fields),expected=baseline.fields.map(f=>({...f,usage_type:f.name===field?1:0}));
 let current=baseline.fields,edits=0;
 for(const wanted of expected){
  const original=current.find(f=>f.record_id===wanted.record_id);if(original.usage_type===wanted.usage_type)continue;
  need(same(bind(await observe('roles before edit')).fields,current),'unrequested role change');
  const definition=await readOutputDefinitionPages(channel,{expectedCount:current.length});
  let s=await observeOutputDefinitionPage(channel,{offset:Math.floor(original.index/8)*8,schemaId:definition.schema_id,total:definition.total_columns,field:original,fieldAction:'double_click'});
  const root=s.wizard.root_ref,row=s=>s.wizard.output_columns.fields.find(f=>f.name===original.name);
  await channel.perform({condition:'edit exact autocorrelation role',initialObservation:s,ready:s=>s.wizard.root_ref===root&&!!row(s),identity:()=>original,
   resolve:s=>({verb:'double_click',ref:row(s).name_ref})});
  const editor=s=>s.wizard?.root_ref===root&&s.wizard.column_parameters?.status==='observed'&&s.wizard.column_parameters.portal_bound===true&&s.wizard.column_parameters.selected_column?.name===original.name;
  const choice=(e,kind)=>e.wizard_combo?.kind===kind&&e.wizard_combo.field.scope==='output_column'&&e.wizard_combo.field.name==='usage';
  const one=(s,p)=>{const es=s.ui.elements.filter(p);need(es.length===1,'unique role editor control required');return es[0];};
  s=await channel.observe({condition:'bound autocorrelation role editor',ready:s=>editor(s)&&s.ui.elements.filter(e=>choice(e,'picker')&&e.allowed_actions.includes('click')).length===1});
  await channel.perform({condition:'open autocorrelation roles',initialObservation:s,ready:editor,identity:()=>original,
   resolve:s=>({verb:'click',ref:one(s,e=>choice(e,'picker')&&e.allowed_actions.includes('click')).ref})});
  const label=wanted.usage_type===1?'Используемое':'Не задано';
  s=await channel.observe({condition:'exact autocorrelation role option',ready:s=>editor(s)&&s.ui.elements.some(e=>choice(e,'option')&&e.wizard_combo.label===label)});
  await channel.perform({condition:'select autocorrelation role',initialObservation:s,ready:editor,identity:()=>original,
   resolve:s=>({verb:'select_wizard_option',ref:one(s,e=>choice(e,'option')&&e.wizard_combo.label===label).ref})});
  s=await channel.observe({condition:'autocorrelation role applied in editor',ready:s=>editor(s)&&s.wizard.column_parameters.fields.usage.value===label
   &&s.ui.elements.filter(e=>e.column_close?.scope==='output'&&e.allowed_actions.includes('apply_output_column')).length===1});
  await channel.perform({condition:'commit autocorrelation role once',initialObservation:s,ready:editor,identity:()=>original,
   resolve:s=>({verb:'apply_output_column',ref:one(s,e=>e.column_close?.scope==='output'&&e.allowed_actions.includes('apply_output_column')).ref})});
  current=current.map(f=>f.record_id===wanted.record_id?{...f,usage_type:wanted.usage_type}:f);
  need(same(bind(await observe('complete autocorrelation role readback')).fields,current),'role edit changed unrelated fields');edits++;
 }
 const configuration=bind(await observe('final autocorrelation roles'));
 need(same(configuration.fields,expected),'final roles differ');
 return {configuration,field,edits};
}
export async function configureAutoCorrelation(channel,p,{request,inputMapping}){
 const roles=await configureAutoCorrelationRoles(channel,p,inputMapping);
 const one=(s,tid,verb)=>{const es=s.ui.elements.filter(e=>e.tid===tid&&e.allowed_actions.includes(verb));need(es.length===1,'unique control required: '+tid);return es[0];};
 const next=(stage,destination)=>channel.perform({condition:'accept autocorrelation '+stage,ready:s=>s.wizard?.stage===stage,identity:s=>s.prepared_node_context,
  resolve:s=>({verb:'wizard_step',ref:one(s,s.wizard.root_tid+';btnNext','wizard_step').ref,expected_stage:destination})});
 await next('input_mapping','auto_correlation');
 const ready=s=>s.wizard?.stage==='auto_correlation'&&s.node_auto_correlation?.verified===true&&s.node_auto_correlation.kind==='parameters';
 const observe=condition=>channel.observe({condition,readAutoCorrelation:true,ready});
 let s=await observe('loaded autocorrelation parameters');const before=s.node_auto_correlation;
 need(Object.values(before.switches).every(v=>v===false),'variable-bound settings are unsupported');
 const a=p.autocorrelation??{};
 if(request.target.kind==='existing'&&Object.keys(a).length===0)need(before.domain==='time'&&before.pacf===false&&before.lag_count>=1,'empty patch requires saved time-domain settings with PACF off');
 const lag_count=a.lag_count??before.lag_count;need(lag_count>=1,'positive lag count required');
 const control=(s,key,verb)=>one(s,s.wizard.root_tid+';AutoCorrelationWizard;'+key,verb);
 if(before.lag_count!==lag_count){
  await channel.perform({condition:'set autocorrelation lag count',initialObservation:s,ready,identity:s=>s.prepared_node_context,
   resolve:s=>({verb:'fill',ref:control(s,'pedLagCount;ValueControl','fill').ref,text:String(lag_count)})});
  s=await observe('lag editor before blur');
  await channel.perform({condition:'commit lag count editor',initialObservation:s,ready,identity:s=>s.prepared_node_context,
   resolve:s=>({verb:'press',ref:control(s,'pedLagCount;ValueControl','press').ref,key:'Tab'})});
  s=await observe('loaded lag count readback');need(s.node_auto_correlation.lag_count===lag_count,'lag count was overwritten');
 }
 if(s.node_auto_correlation.domain!=='time'){
  await channel.perform({condition:'open autocorrelation calculation domain',initialObservation:s,ready,identity:s=>s.prepared_node_context,
   resolve:s=>({verb:'click',ref:control(s,'pedDomainCalc;ValueControl;trg_picker','click').ref})});
  const tid=s.wizard.root_tid+';AutoCorrelationWizard;pedDomainCalc;ValueControl;boundlist;Временная';
  s=await channel.observe({condition:'native time-domain option',readAutoCorrelation:true,ready:s=>ready(s)&&s.ui.elements.some(e=>e.tid===tid&&e.allowed_actions.includes('click'))});
  await channel.perform({condition:'select native time domain',initialObservation:s,ready,identity:s=>s.prepared_node_context,resolve:s=>({verb:'click',ref:one(s,tid,'click').ref})});
  s=await observe('time-domain readback');
 }
 if(s.node_auto_correlation.pacf){
  await channel.perform({condition:'disable partial autocorrelation',initialObservation:s,ready,identity:s=>s.prepared_node_context,
   resolve:s=>({verb:'set_checked',ref:control(s,'pedCalcPacf;ValueControl;DisplayEl','set_checked').ref,checked:false})});
  s=await observe('PACF off readback');
 }
 const settings=s.node_auto_correlation;
 need(settings.domain==='time'&&settings.pacf===false&&settings.lag_count===lag_count&&Object.values(settings.switches).every(v=>v===false),'final autocorrelation settings differ');
 await next('auto_correlation','output_mapping');
 const output=await channel.observe({condition:'native autocorrelation output schema',readMappings:true,ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true&&s.node_mapping.inventory_complete===true});
 const m=output.node_mapping;
 need(m.source_identity_verified===true&&m.target_fields.every(f=>!f.excluded&&f.source&&m.source_fields.some(source=>same(source,f.source))),'complete bound native output required');
 const output_schema=m.target_fields.map(({name,label,type})=>({name,label,type}));
 validateAutoCorrelationOutputSchema(output_schema);
 need(m.source_fields.length===4&&new Set(m.target_fields.map(f=>f.source.record_id)).size===4,'all four native fields required');
 await next('output_mapping','done');
 const done=await channel.observe({condition:'autocorrelation settings accepted',ready:s=>s.wizard?.stage==='done'});
 return {verified:true,cleanup_complete:true,effect_possible:true,configuration:{...roles.configuration,field:roles.field,lag_count,domain:'time',pacf:false,output_schema},
  inline_mapping:{verified:true,native_mapping:m},validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}
