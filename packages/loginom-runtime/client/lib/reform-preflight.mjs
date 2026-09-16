import {preflightTabularSource} from './sorting-preflight.mjs';
import {resolveReformChanges,REFORM_TYPES} from './reform-parameters.mjs';
import {preflightMappedReform} from './reform-mapped-preflight.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
export function validateReformInputParameters(parameters,resolved,native){
 const fields=resolved.fields??native.target_fields;
 for(const change of parameters.changes){
  const matches=fields.filter(f=>f.name===change.field.name);need(matches.length===1,'Unknown reform input field: '+change.field.name);
  need(change.type===undefined||Object.hasOwn(REFORM_TYPES,matches[0].type),'Unsupported reform input scalar type');
 }
}
export function preflightReformParameters(parameters,fields){
 const baseline={verified:true,inventory_complete:true,fields:fields.map((f,index)=>({...f,index,record_id:'preview:'+index,excluded:false}))};
 // New reform fields initially have their effective input names. This early
 // preview validates the request only; it never claims native ID correspondence.
 return resolveReformChanges({changes:parameters.changes.map(c=>({...c,field:{kind:'configured_field',name:c.field.name}}))},baseline);
}
export async function preflightReformSource(options,ctx,config){
 const mapped=await preflightMappedReform(options,ctx,config);
 if(mapped)return mapped;
 return preflightTabularSource(options,ctx,config,{required:true,resolve:preflightReformParameters,label:'reform'});
}
