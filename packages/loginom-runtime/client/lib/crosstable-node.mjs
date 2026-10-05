import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {preflightCrossTableSource} from './crosstable-preflight.mjs';
import {validateCrossTableParameters} from './crosstable-parameters.mjs';
import {configureCrossTable} from './crosstable-procedure.mjs';
import {materializeCrossTableOutput} from './crosstable-output.mjs';
import {crossTableConfigurationReadback} from './crosstable-readback.mjs';
import {crossTableParametersSchema} from './node-api.mjs';
import {completedStaticImports} from './collapse-native-source.mjs';
import {completedCrossTableCollapses,validateCrossTableNativeSources} from './crosstable-native-source.mjs';
import {prepareCrossTableAncestorExecution} from './crosstable-ancestor-execution.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {prepareCrossTableAutosync} from './crosstable-autosync.mjs';
const need=(v,m)=>{if(!v)throw Error('CrossTable: '+m);};
export function createCrossTableNodeSupport(config){return createTabularTransformNodeSupport(config,{
 nativeFullOutput:true,type:'transform.cross_table',mode:'pivot',revision:'crosstable-v3-internal-1',readback:crossTableConfigurationReadback,
 parameterSchema:crossTableParametersSchema,validate:validateCrossTableParameters,preflight:preflightCrossTableSource,
 beforeInput:prepareCrossTableAutosync,
 async beforeGraphExecute(options,ctx,configuration){
  if(options.operation.parameters.read?.coverage!=='full')return;
  const imports=completedStaticImports(options.nodeHistory?.(),options.verifiedUploads?.(),ctx,options.uploadHistory?.());
  const sources=validateCrossTableNativeSources(imports,completedCrossTableCollapses(options.nodeHistory?.(),ctx),configuration.input_fields);
  const graph=await options.operation.nodeTargetAdapter.observe({document_id:ctx.document_id,workflow_ref:ctx.workflow_ref},ctx.deadline);
  return prepareCrossTableAncestorExecution({graph,node:ctx.node,sources,operation:options.operation,execute:options.execute,record:options.onRecord,
   targetOrigin:config.targetOrigin,targetBuild:config.targetBuild,signal:ctx.signal,now:options.now,
   wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...options.receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
 },
 async beforeOpen(channel,request){
  if(request.parameters.local_variables||request.parameters.bindings||request.target.kind==='existing')
   return channel.configureCrossTableVariables(request.parameters.local_variables??[]);
 },
 configurationObservation:{condition:'owned CrossTable configuration',readCrossTable:true,ready:s=>s.wizard?.stage==='crosstable'&&s.node_crosstable?.verified===true},
 async configure(channel,p,context){
  const changed=await configureCrossTable(channel,p,context);if(context.request.finish==='close')return changed;
  return advanceCrossTableConfiguration(channel,changed);
 },
 materializedSchema:materializeCrossTableOutput,
});}

// CrossTable output fields are materialized only by Execute. A new inline
// mapping has no rows: its absence is not a verified inventory. Preserve native
// wizard/node ownership, advance with Next, and attest schema after execution.
export async function advanceCrossTableConfiguration(channel,changed){
  const root=changed.configuration.node_context.tid;
  const next=async(initial,expected)=>channel.perform({condition:'validate CrossTable and advance',initialObservation:initial,
   ready:s=>s.wizard?.status==='observed',identity:()=>changed.configuration.node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===root+';btnNext'&&e.allowed_actions.includes('wizard_step'));
    need(es.length===1,'Next is unavailable; inspect native wizard error');return {verb:'wizard_step',ref:es[0].ref,expected_stage:expected};}});
  const before=await channel.observe({condition:'CrossTable complete before Next',readCrossTable:true,
   ready:s=>s.wizard?.stage==='crosstable'&&s.node_crosstable?.verified===true&&s.node_crosstable.dialogs.length===0});
  await next(before,['output_mapping','done']);
  let destination=await channel.observe({condition:'CrossTable validated destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
  if(destination.wizard.stage==='output_mapping'){
   need(destination.prepared_node_context?.verified===true
    &&['document_id','workflow_id','node_id'].every(k=>destination.prepared_node_context[k]===changed.configuration.node_context[k])
   &&destination.wizard.root_tid===root&&destination.wizard.title==='Настройка соответствия между столбцами','inline output owner differs');
   // Native CrossTable generates/synchronizes these fields on execution. No
   // guessed source inventory, mapping override or premature schema comparison.
   await next(destination,'done');
  }
  const done=await channel.observe({condition:'CrossTable accepted by native Next',ready:s=>s.wizard?.stage==='done'});
  return {...changed,validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}
