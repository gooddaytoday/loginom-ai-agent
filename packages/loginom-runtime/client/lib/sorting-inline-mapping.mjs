import {configureDerivedInlineMapping} from './grouping-inline-mapping.mjs';

const need=(value,message)=>{if(!value)throw Error(message);};
export function validateSortingInlineSources(configuration,native){
 need(native?.verified===true&&native.inventory_complete===true&&native.source_identity_verified===true
  &&native.mapping_wizard==='DerivedDataSourceMappingEngineOutputPortWizard','Owned sorting conditional output required');
 const fields=configuration.input_fields,sources=native.source_fields;
 need(Array.isArray(fields)&&Array.isArray(sources)&&sources.length===fields.length
  &&new Set(sources.map(s=>s.name)).size===fields.length
  &&sources.every(s=>fields.some(f=>f.name===s.name&&f.label===s.label&&f.type===s.type)),
  'Sorting conditional output differs from the configured input');
 need(native.target_fields.every(f=>!f.excluded&&!f.inherited&&f.required===false),'Unsupported retained sorting output');
 const obsolete=native.target_fields.filter(f=>f.source===null);
 need(obsolete.every(f=>!fields.some(s=>s.name===f.name)), 'Current sorting output cannot be pruned as obsolete');
 return obsolete;
}
export function configureSortingInlineMapping(channel,configuration){
 return configureDerivedInlineMapping(channel,configuration,validateSortingInlineSources);
}
