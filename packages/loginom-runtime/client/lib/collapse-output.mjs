import {collapseOutputSources} from './collapse-output-sources.mjs';
import {reconcileCollapseOutput} from './collapse-output-reconcile.mjs';
import {resolveConfiguredOutputMapping,configureOutputFields,reorderOutputFields,configureOutputAutosync} from './port-mapping-procedure.mjs';
export async function configureCollapseOutput(channel,configuration,parameters,mapping={}){
 const ready=s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true;
 const sources=collapseOutputSources(configuration),requested={direction:'output',port:0,...mapping},changes=[];
 let s=await channel.observe({condition:'collapse output inventory',readMappings:true,ready});
 s=await reconcileCollapseOutput(channel,s,sources);
 resolveConfiguredOutputMapping(requested,sources,s.node_mapping);
 if(requested.fields){changes.push(await configureOutputFields(channel,requested,sources));
  s=await channel.observe({condition:'collapse output after edits',readMappings:true,ready});
  const resolved=resolveConfiguredOutputMapping(requested,sources,s.node_mapping);
  changes.push(await reorderOutputFields(channel,resolved.fields.map(f=>f.current.record_id)));
 }
 if(requested.autosync!==undefined)changes.push(await configureOutputAutosync(channel,requested.autosync));
 s=await channel.observe({condition:'collapse output mapping readback',readMappings:true,ready});
 return {verified:true,cleanup_complete:true,effect_possible:changes.length>0,source_identity_verified:true,native_mapping:s.node_mapping,changes};
}
