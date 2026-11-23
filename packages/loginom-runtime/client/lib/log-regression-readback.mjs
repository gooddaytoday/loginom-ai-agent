import {existingOutputExecution} from './node-execution-evidence.mjs';
const need=(v,m)=>{if(!v)throw Error('Logistic regression readback: '+m);};
export function logRegressionConfigurationReadback({node,phases,operation_id}){
 const phase=name=>{const rows=phases.filter(p=>p.phase===name);need(rows.length===1&&rows[0].status==='verified'&&rows[0].receipt_id===operation_id+':'+name&&rows[0].value?.verified===true&&rows[0].value.cleanup_complete===true,'verified '+name);return rows[0];};
 const input=phase('input_mapping'),configured=phase('configure'),saved=phase('node_finish'),mapped=phase('output_mapping'),finished=phase('finish');
 const c=configured.value.configuration,training=finished.value.training??{status:'not_requested'},applying=c?.mode==='apply';
 need(c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c.node_context?.[k]===node[k]),'configuration owner changed');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&(applying?saved.value.settings_applied===false&&saved.value.draft_discarded===true&&finished.value.settings_applied===false:saved.value.settings_applied===true&&finished.value.settings_applied===true),'settings were not committed or preserved');
 need(applying?training.status==='not_requested':finished.value.mode!=='execute'||training.status==='trained'&&training.execution_id!==finished.value.execution_id&&training.source?.length===1,'training on connected source must complete before Execute');
 need(c.partition?.validation!==1||applying||finished.value.mode!=='execute'||training.validation?.status==='completed'&&training.validation.execution_id===training.execution_id&&training.validation.folds===c.partition.folds,'K-fold execution must have independent native evidence');
 return {kind:'log_regression',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),mode:c.mode??'enter',...(c.selection?{selection:structuredClone(c.selection)}:{}),
  ...(c.regularization?{regularization:structuredClone(c.regularization)}:{}),...(c.fields.some(f=>f.usage_type===7)?{weight_field:c.fields.find(f=>f.usage_type===7).name}:{}),input_fields:c.fields.filter(f=>f.usage_type===3).map(f=>f.name),target_field:c.target_field,classes:structuredClone(c.classes),event:c.event,threshold:c.threshold,intercept:c.intercept,epsilon:c.epsilon,
  normalization:c.normalization?.filter(f=>c.fields.some(role=>role.name===f.name&&role.usage_type===3)).every(f=>f.norm_type===5)&&c.normalization?.length?'standardize':'none',...(c.partition?.sampling===2?{partition:{method:'column',field:c.partition.field}}:{train_percent:c.partition?.train??100}),...(c.partition?.sampling===1&&c.partition.test>0?{partition:{method:'sequential',train_percent:c.partition.train,test_percent:c.partition.test,...(c.partition.train_count!==undefined?{train_count:c.partition.train_count,test_count:c.partition.test_count,total_count:c.partition.total_count}:{})}}:{}),validation:c.partition?.validation===1?{method:'kfold',folds:c.partition.folds,sampling:'sequential'}:'none',calibration:'train',training:structuredClone(training),package_persistence_verified:false};
}

// Native LAB-1788 probe: these two Integer variables exist only after validation.
// Read the existing complete VariablesForm through the owner-bound channel;
// do not substitute correct predictions for proof that folds were executed.
export async function readLogRegressionValidation(channel,node,training,folds){
 const execution=existingOutputExecution(await channel.readExistingProcesses(),node);
 need(execution.status==='completed'&&execution.execution_id===training.execution_id,'validation execution differs from training');
 const result=await channel.readVariablePort({port:0,execution}),o=result.output;
 need(result.verified===true&&result.cleanup_complete===true&&o?.complete===true&&o.fresh===true
  &&o.execution_id===training.execution_id&&o.native_source==='VariablesForm','complete native validation summary required');
 const count=name=>{
  const vs=o.variables.filter(v=>v.name===name),v=vs[0];
  need(vs.length===1&&v.type==='integer'&&v.cell?.type==='integer'&&v.cell.is_null===false&&v.cell.precision==='exact_integer'
   &&/^[1-9][0-9]*$/.test(v.cell.value)&&Number.isSafeInteger(Number(v.cell.value)),'native validation count missing: '+name);
  return Number(v.cell.value);
 };
 const partitions=count('ValidationPartitions'),samples=count('ValidationSamples');
 need(partitions===folds,'executed validation folds differ from configured folds');
 return {status:'completed',source:'native_validation_summary',execution_id:execution.execution_id,read_id:o.read_id,folds:partitions,samples_per_fold:samples};
}
