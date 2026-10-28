import {ensureGroupingOutputSources as ensureDerivedOutputSources} from './grouping-output-sources.mjs';
import {resolveConfiguredOutputMapping,configureOutputFields,reorderOutputFields,configureOutputAutosync} from './port-mapping-procedure.mjs';
import {verifyCalculatorInlineSync} from './calculator-inline-mapping.mjs';
export async function configureSortingOutput(channel,configuration,parameters,mapping={},request){
 const ready=s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true;
 // Native autosync saves only referenced input columns; after reopen it can
 // append pass-through fields in a different order. Fix a new node's output
 // layout, preserving an explicit choice and any existing node's settings.
 const sources=configuration.input_fields.map(f=>({...f,used:true})),requested={direction:'output',port:0,
  ...(request?.target.kind==='new'?{autosync:false}:{}),...mapping},changes=[];
 let s=await channel.observe({condition:'sorting output inventory',readMappings:true,ready});
 s=await ensureDerivedOutputSources(channel,s);
 // A saved port can retain only the narrowed input's outputs. A full layout
 // explicitly requests every configured source, including newly restored ones.
 if(requested.fields){
  const before=s.node_mapping;
  resolveConfiguredOutputMapping({...requested,fields:undefined},sources,before);
  const names=requested.fields.map(f=>f.source?.kind==='configured_field'?f.source.name:null);
  if(names.length!==sources.length||new Set(names).size!==names.length||names.some(name=>!sources.some(s=>s.name===name)))
   throw Error('Mapping must account for every unique configured source field');
  const linked=before.target_fields.map(f=>f.source??f.exclusion_source);
  const missing=before.source_fields.filter(f=>!linked.some(s=>s?.record_id===f.record_id));
  if(missing.length){
   if(before.mapping_wizard!=='DerivedDataSourceOutputSocketWizard'||before.node_context?.verified!==true
    ||new Set(linked.map(f=>f?.record_id)).size!==linked.length
    ||before.target_fields.some((f,i)=>f.inherited!==false||f.required!==false
     ||!before.source_fields.some(s=>JSON.stringify(s)===JSON.stringify(linked[i]))))
    throw Error('Owned Sorting output with unique native source links required for synchronization');
   const root=s.wizard.root_ref;
   const bound=state=>ready(state)&&state.wizard.root_ref===root
    &&JSON.stringify(state.node_mapping.node_context)===JSON.stringify(before.node_context);
   await channel.perform({condition:'synchronize restored Sorting output fields',initialObservation:s,ready:bound,identity:()=>before.node_context,
    resolve:state=>{
     const controls=state.ui.elements.filter(e=>e.tid===state.wizard.root_tid+';DerivedDataSourceOutputSocketWizard;btnSyncThroughColumns'&&e.allowed_actions.includes('click'));
     if(controls.length!==1)throw Error('Sorting output synchronization unavailable');
     return {verb:'click',ref:controls[0].ref};
    }});
   s=await channel.observe({condition:'restored Sorting output fields synchronized',readMappings:true,ready:bound});
   verifyCalculatorInlineSync(before,s.node_mapping,missing);
   changes.push({verified:true,cleanup_complete:true,effect_possible:true,added_sources:missing.map(f=>f.name)});
  }
 }
 resolveConfiguredOutputMapping(requested,sources,s.node_mapping);
 if(requested.fields||requested.changes){changes.push(await configureOutputFields(channel,requested,sources));
  s=await channel.observe({condition:'sorting output after edits',readMappings:true,ready});
  const resolved=resolveConfiguredOutputMapping(requested,sources,s.node_mapping);
  changes.push(await reorderOutputFields(channel,resolved.fields.map(f=>f.current.record_id)));
 }
 if(requested.autosync!==undefined)changes.push(await configureOutputAutosync(channel,requested.autosync));
 s=await channel.observe({condition:'sorting output mapping readback',readMappings:true,ready});
 return {verified:true,cleanup_complete:true,effect_possible:changes.length>0,source_identity_verified:true,native_mapping:s.node_mapping,changes};
}
