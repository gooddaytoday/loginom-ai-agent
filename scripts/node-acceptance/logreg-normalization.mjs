import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {matchesExpectedOutput} from './expected-outputs.mjs';
const need=(v,m)=>{if(!v)throw Error('LOGREG_NORMALIZATION_'+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

function* receipts(value){
 if(!value||typeof value!=='object')return;
 if(value.status==='SUCCEEDED'&&value.configuration?.readback?.kind==='log_regression')yield value;
 for(const child of Object.values(value))if(child&&typeof child==='object')yield* receipts(child);
}

// Stock typed matching against the approved independent oracle, for BOTH
// trainings. A final correct CSV alone cannot prove the same-node transition.
export function checkLogregNormalization(expected,replies){
 const rounds=new Map();
 for(const reply of receipts(replies)){
  const c=reply.configuration.readback,id=reply.execution?.execution_id;
  if(c.mode!=='enter'||reply.execution?.status!=='completed')continue;
  const output=reply.output?.ports?.find(p=>p.port===0);
  if(!output)continue;
  need(reply.cleanup_complete===true&&c.training?.status==='trained'&&c.training.execution_id!==id
   &&same(c.input_fields,['X'])&&c.target_field==='Target'&&c.event==='yes'&&c.threshold===0.8,'CONFIGURATION');
  need(output.fresh===true&&output.freshness_basis==='completed_execution_port_source'&&output.execution_id===id
   &&output.sample_complete===true&&output.precision?.numbers_verified===true
   &&matchesExpectedOutput(output,expected.outputs[0]),'COMPLETE_TYPED_PREDICTIONS');
  rounds.set(id,{node:reply.node,normalization:c.normalization});
 }
 const values=[...rounds.values()];
 const raw=values.findIndex(r=>r.normalization==='none');
 const normalized=values.findIndex((r,i)=>i>raw&&r.normalization==='standardize');
 need(raw>=0&&normalized>raw&&values.every(r=>same(r.node,values[raw].node)),'SAME_NODE_NONE_THEN_STANDARDIZE');
 return {node:values[raw].node,execution_ids:[...rounds.keys()],normalization:'standardize'};
}

export async function observeLogregNormalizationSaved({load,channel}){
 const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs');
 const {closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
 const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
 const selected=await channel.observe({condition:'cold logistic selection',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
 await selectPreparedGraphNode(channel,selected,'cold select logistic',{refreshReplacedBody:true});
 await openPreparedWizard(channel);
 try{
  const observe=(stage,kind)=>channel.observe({condition:'cold logistic '+kind,readLogRegression:true,
   ready:s=>s.wizard?.stage===stage&&s.node_logregression?.verified===true&&(!kind||s.node_logregression.kind===kind)});
  const next=(stage,destination)=>channel.perform({condition:'cold inspect logistic '+stage,ready:s=>s.wizard?.stage===stage,
   identity:s=>s.prepared_node_context,resolve:s=>{
    const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));
    need(es.length===1,'NEXT');return {verb:'wizard_step',ref:es[0].ref,expected_stage:destination};}});
  const roles=(await observe('input_mapping')).node_logregression.fields;
  need(same(roles.filter(f=>f.usage_type!==0).map(f=>[f.name,f.type,f.usage_type]),[['X','real',3],['Target','string',4]]),'SAVED_ROLES');
  await next('input_mapping','normalization');
  const normalization=(await observe('normalization','normalization')).node_logregression.fields;
  need(normalization.length===2&&normalization.every(f=>f.norm_type===(f.name==='X'?5:f.name==='Target'?9:-1)
   &&f.importance===1&&f.irremovable===false),'SAVED_NORMALIZERS');
  await next('normalization','learn_partition');
  const partition=(await observe('learn_partition','partition')).node_logregression.values;
  need(partition.train===100&&partition.test===0&&partition.validation===0,'SAVED_PARTITION');
  await next('learn_partition','lin_regression');
  const {values,classes}=(await observe('lin_regression','parameters')).node_logregression;
  need(values.pedDenormalize===true&&values.pedRegressionMethod===0&&values.pedAutoMethod===false
   &&values.pedEventType===4&&classes.some(c=>c.index===values.pedEventId&&c.label==='yes'),'SAVED_DENORMALIZE_EVENT');
  await next('lin_regression','lin_regression_details');
  const details=(await observe('lin_regression_details','details')).node_logregression.values;
  need(details.pedThreshold===0.8&&details.pedIntercept===true&&details.pedEpsilon===1e-10,'SAVED_DETAILS');
  return {roles,normalization,denormalize:values.pedDenormalize,settings_applied:false};
 }finally{
  const closed=await closePreparedWizard(channel);
  need(closed.verified&&closed.cleanup_complete&&closed.settings_applied===false,'CANCEL');
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const expected=JSON.parse(await readFile(process.argv[2],'utf8')),replies=JSON.parse(await readFile(process.argv[3],'utf8'));
 await writeFile(process.argv[4],JSON.stringify(checkLogregNormalization(expected,replies),null,2));
 console.log('PASS: same-node none -> standardize, independent complete typed predictions in both trainings');
}
