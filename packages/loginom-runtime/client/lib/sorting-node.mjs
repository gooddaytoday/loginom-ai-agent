import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {booleanBindingSchema} from './variable-binding-parameters.mjs';
import {preflightBooleanBindings,prepareBooleanBindingInput,preflightBuiltinBindings} from './variable-binding-source.mjs';
import {configureBooleanBinding} from './variable-binding-procedure.mjs';
import {readBooleanBindings} from './variable-binding-readback.mjs';
import {validateSortingParameters,validateSortingInputParameters} from './sorting-parameters.mjs';
import {preflightSortingSource} from './sorting-preflight.mjs';
import {configureSorting,advanceSortingInputColumns} from './sorting-procedure.mjs';
import {configureSortingOutput} from './sorting-output.mjs';
import {sortingConfigurationReadback} from './sorting-readback.mjs';
import {sortingParametersSchema} from './node-api.mjs';
import {configureSortingInlineMapping} from './sorting-inline-mapping.mjs';
export function createSortingNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'transform.sorting',mode:'keys',revision:'sorting-v3-internal-1',readback:sortingConfigurationReadback,parameterSchema:sortingParametersSchema,
 bindingSchema:booleanBindingSchema('transform.sorting'),validate:validateSortingParameters,validateInput:validateSortingInputParameters,
 async preflight(options,ctx,c){await preflightBooleanBindings(options,ctx,c);return preflightSortingSource(options,ctx,c);},
 beforeInput:prepareBooleanBindingInput,
 async afterDone(channel,request,configured,{readGraph,options,ctx}){
  if(!request.bindings?.length)return;
  const proof=options.operation.variableBindingSource;
  const sourceProof=proof?await preflightBuiltinBindings(options,ctx,config,proof.source):undefined;
  const bindings=await readBooleanBindings(channel,{type:'transform.sorting',node:ctx.node,readGraph,sourceProof});
  if(bindings.length!==request.bindings.length||bindings.some((b,i)=>b.parameter!==request.bindings[i].parameter||b.variable.name!==request.bindings[i].variable.name))throw Error('BINDING_SOURCE_UNVERIFIED');
  return bindings;
 },
 afterOpen:advanceSortingInputColumns,
 configurationObservation:{condition:'sorting configuration page',readSorting:true,ready:s=>s.wizard?.stage==='sorting'&&s.node_sorting?.verified===true},
 async configure(channel,p,{request,bindingSource,bindingMapping}){
  if(request.finish!=='close')await configureBooleanBinding(channel,{type:'transform.sorting',bindings:request.bindings,bindingSource,bindingMapping});
  const changed=await configureSorting(channel,p,{newNode:request.target.kind==='new',bound:!!request.bindings?.length});if(request.finish==='close')return changed;
  await channel.perform({condition:'validate sorting and advance',ready:s=>s.wizard?.stage==='sorting',identity:()=>changed.configuration.node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));if(es.length!==1)throw Error('Sorting Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:['output_mapping','done']};}});
  const destination=await channel.observe({condition:'sorting validated destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
  const inline_mapping=destination.wizard.stage==='output_mapping'?await configureSortingInlineMapping(channel,changed.configuration):null;
  const done=await channel.observe({condition:'sorting accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,...(inline_mapping?{inline_mapping}:{}),validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureOutput:configureSortingOutput,
});}
