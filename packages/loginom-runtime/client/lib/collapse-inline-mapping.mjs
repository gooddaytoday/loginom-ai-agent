import {collapseOutputSources} from './collapse-output-sources.mjs';
import {configureDerivedInlineMapping} from './grouping-inline-mapping.mjs';

const need=(value,message)=>{if(!value)throw Error(message);};
export function validateCollapseInlineSources(configuration,native){
 need(native?.verified===true&&native.inventory_complete===true&&native.source_identity_verified===true
  &&native.mapping_wizard==='DerivedDataSourceMappingEngineOutputPortWizard','Owned collapse conditional output required');
 const fields=collapseOutputSources(configuration),sources=native.source_fields;
 need(Array.isArray(fields)&&Array.isArray(sources)&&sources.length===fields.length
  &&new Set(sources.map(s=>s.name)).size===fields.length
  &&sources.every(s=>fields.some(f=>f.name===s.name&&f.label===s.label&&f.type===s.type)),
  'Collapse conditional output differs from the configured input');
 need(native.target_fields.every(f=>!f.inherited&&f.required===false&&(!f.excluded||f.source===null&&f.exclusion_source&&sources.some(s=>JSON.stringify(s)===JSON.stringify(f.exclusion_source)))),'Unsupported retained collapse output');
 const obsolete=native.target_fields.filter(f=>f.source===null&&!f.excluded&&!f.exclusion_source);
 need(obsolete.every(f=>!fields.some(s=>s.name===f.name)), 'Current collapse output cannot be pruned as obsolete');
 return obsolete;
}
export function configureCollapseInlineMapping(channel,configuration){
 return configureDerivedInlineMapping(channel,configuration,validateCollapseInlineSources,undefined,{sourceOf:f=>f.source??f.exclusion_source});
}
