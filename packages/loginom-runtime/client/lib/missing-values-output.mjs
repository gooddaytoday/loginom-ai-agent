import {configureSortingOutput} from './sorting-output.mjs';
import {configureSortingInlineMapping} from './sorting-inline-mapping.mjs';

// Loginom remembers the links/table presentation independently of node data.
// Select the table before the shared mapping reader validates rendered cells.
export async function showMissingValuesMappingTable(channel){
 const ready=s=>s.wizard?.stage==='output_mapping';
 const state=await channel.observe({condition:'missing values output presentation',ready});
 const controls=state.ui.elements.filter(e=>e.tid?.startsWith(state.wizard.root_tid+';')&&e.tid.endsWith(';rbTable;DisplayEl')&&e.allowed_actions.includes('set_checked'));
 if(controls.length!==1)throw Error('Missing values mapping Table control unavailable');
 const control=controls[0];
 if(control.check_state?.checked===true)return;
 await channel.perform({condition:'show missing values output table',initialObservation:state,ready,identity:s=>s.prepared_node_context,
  resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===control.tid&&e.allowed_actions.includes('set_checked'));if(es.length!==1)throw Error('Mapping Table control changed');return {verb:'set_checked',ref:es[0].ref,checked:true};}});
}
export async function configureMissingValuesInlineMapping(channel,configuration){
 await showMissingValuesMappingTable(channel);
 return configureSortingInlineMapping(channel,configuration);
}
export async function configureMissingValuesOutput(channel,configuration,parameters,mapping){
 await showMissingValuesMappingTable(channel);
 return configureSortingOutput(channel,configuration,parameters,mapping);
}
