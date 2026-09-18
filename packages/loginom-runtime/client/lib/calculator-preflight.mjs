import {preflightTabularSource} from './sorting-preflight.mjs';
import {expandOutputChanges} from './output-mapping-changes.mjs';

const need=(value,message)=>{if(!value)throw Error(message);};
// Validate only facts derivable from the observed input schema. Formula syntax
// and native output identities still belong to the Loginom wizard.
export function predictNewCalculatorOutput(parameters,inputFields,mappings=[]) {
 const expressions=parameters.expressions;
 need(Array.isArray(expressions)&&expressions.length>0&&expressions.every(e=>e.target?.kind==='new'),
  'New calculator requires new expressions');
 const names=new Set(),replaced=new Set();
 for(const expression of expressions){
  const key=expression.name.toLowerCase();
  need(!names.has(key),'Duplicate calculator expression name: '+expression.name);names.add(key);
  const matches=inputFields.filter(f=>f.name.toLowerCase()===key);
  need(matches.length<=1,'Ambiguous calculator input field: '+expression.name);
  if(expression.replace){need(matches.length===1,'Replacement input field is missing: '+expression.name);replaced.add(key);}
  else need(matches.length===0,'Added expression collides with an input field: '+expression.name);
 }
 let ordered=[...expressions];
 if(parameters.order){
  need(parameters.order.length===expressions.length&&new Set(parameters.order).size===expressions.length
   &&parameters.order.every(n=>expressions.some(e=>e.name===n)),'Explicit order must include every resulting expression exactly once');
  ordered.sort((a,b)=>parameters.order.indexOf(a.name)-parameters.order.indexOf(b.name));
 }
 const fields=[...ordered,...inputFields.filter(f=>!replaced.has(f.name.toLowerCase()))].map(({name,label,type})=>({name,label,type,used:true}));
 for(let mapping of mappings.filter(m=>m.direction==='output'&&(m.fields!==undefined||m.changes!==undefined))){
  mapping=expandOutputChanges(mapping,fields.map(f=>({source:{kind:'configured_field',name:f.name},name:f.name,label:f.label,excluded:false})));
  need(mapping.fields.length===fields.length,'Invalid mappings.fields: full output list must include every configured source field');
  const seen=new Set(),outputs=new Set();
  for(const field of mapping.fields){
   const source=fields.find(f=>f.name===field.source?.name);
   need(source&&!seen.has(source.name),'Invalid mappings.fields: unknown or repeated source '+field.source?.name);seen.add(source.name);
   const name=(field.name??source.name).toLowerCase();
   need(!outputs.has(name),'Invalid mappings.fields: conflicting output name '+name);outputs.add(name);
   // Live Calculator output marks expression sources as required. Passthrough
   // inputs are optional; their final native exclusion flags are checked later.
   need(field.excluded!==true||!ordered.some(e=>e.name===source.name),'Invalid mappings.fields: calculated output cannot be excluded');
  }
  need(mapping.fields.some(f=>f.excluded!==true),'At least one output field must remain');
 }
 return fields;
}

export function preflightCalculatorSource(options,ctx,config){
 const request=options.operation.parameters;
 return preflightTabularSource(options,ctx,config,{required:true,label:'calculator',
  resolve:(parameters,fields)=>predictNewCalculatorOutput(parameters,fields,request.mappings)});
}
