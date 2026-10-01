import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {DATAPARTITION_MODES,validateDataPartitionParameters,validateDataPartitionInputParameters} from './datapartition-parameters.mjs';
import {configureDataPartition} from './datapartition-procedure.mjs';
import {configureDataPartitionOutputs,readDataPartitionOutputs} from './datapartition-output.mjs';
import {dataPartitionConfigurationReadback} from './datapartition-readback.mjs';
import {dataPartitionParametersSchema} from './datapartition-schema.mjs';
import {preflightTabularSource} from './sorting-preflight.mjs';
const need=(value,message)=>{if(!value)throw Error(message);};

export function createDataPartitionNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'preprocessing.data_partition',modes:DATAPARTITION_MODES,revision:'data-partition-v1-internal-1',
 inputMappingRecovery:true,parameterSchema:dataPartitionParametersSchema,readback:dataPartitionConfigurationReadback,
 validate:validateDataPartitionParameters,validateInput:validateDataPartitionInputParameters,
 preflight:(options,ctx,config)=>preflightTabularSource(options,ctx,config,{required:options.operation.parameters.parameters.stratified!==undefined||options.operation.parameters.parameters.biased!==undefined,
  resolve:(parameters,fields)=>validateDataPartitionInputParameters(parameters,{fields},{}),label:'DataPartition'}),
 configurationObservation:{condition:'DataPartition configuration page',readDataPartition:true,
  ready:s=>s.wizard?.stage==='data_partition'&&s.node_data_partition?.verified===true},
 async configure(channel,parameters,{request,inputMapping}){
  if(request.finish==='close'){
   const observed=await channel.observe({condition:'DataPartition draft ready for disposal',readDataPartition:true,
    ready:s=>s.wizard?.stage==='data_partition'&&s.node_data_partition?.verified===true});
   return {verified:true,cleanup_complete:true,effect_possible:false,configuration:observed.node_data_partition,draft_edits_skipped:true};
  }
  need(inputMapping?.verified&&inputMapping.inventory_complete,'Verified DataPartition input mapping required');
  const changed=await configureDataPartition(channel,parameters,{mode:request.mode,newNode:request.target.kind==='new'});
  const inputFields=inputMapping.target_fields;
  if(changed.configuration.input_fields.length)need(inputFields.length===changed.configuration.input_fields.length&&inputFields.every((f,index)=>
   ['name','label','type','data_kind'].every(key=>f[key]===changed.configuration.input_fields[index][key])),'DataPartition wizard input schema differs');
  changed.configuration={...changed.configuration,input_fields:structuredClone(inputFields)};
  const settings=await channel.observe({condition:'DataPartition settings ready for validation',readDataPartition:true,
   ready:s=>s.wizard?.stage==='data_partition'&&s.node_data_partition?.verified===true});
  await channel.perform({condition:'validate DataPartition settings',initialObservation:settings,
   ready:s=>s.wizard?.stage==='data_partition',identity:s=>s.prepared_node_context,resolve:s=>{
    const controls=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));
    need(controls.length===1,'DataPartition Next unavailable');return {verb:'wizard_step',ref:controls[0].ref,expected_stage:'done'};
   }});
  const done=await channel.observe({condition:'DataPartition accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureAllOutputs:configureDataPartitionOutputs,readOutputs:readDataPartitionOutputs,
});}
