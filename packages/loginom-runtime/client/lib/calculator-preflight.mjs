import {preflightInactiveTabularSource} from './grouping-preflight.mjs';
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
 // An intermediate expression feeds later formulas but is not an output source.
 const fields=[...ordered.filter(e=>!e.intermediate),...inputFields.filter(f=>!replaced.has(f.name.toLowerCase()))].map(({name,label,type})=>({name,label,type,used:true}));
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
  inactiveSource:source=>preflightInactiveCalculatorSource(options,source),
  resolve:(parameters,fields)=>predictNewCalculatorOutput(parameters,fields,request.mappings)});
}

export async function preflightInactiveCalculatorSource(options,source){
 const sourceIcons=['bg-vendor-icon-importtextfile'];
 const {binding,state}=source;
 const boundary=state.ui.elements.some(e=>e.tid===state.prepared_node_context?.tid
  &&e.signature?.native_graph?.status==='non_script'&&e.signature.native_graph.icon==='bg-vendor-icon-nullvendor'
  &&e.signature.native_graph.node_id===binding.node.node_id);
 if(boundary){
  // Nullvendor alone is ambiguous. The observed native input boundary has
  // no output schema editor. Validate its fields in the Calculator's owned
  // input/configuration wizard, as for an existing target's effective schema.
  const graph=await options.operation.nodeTargetAdapter.observe(options.operation.parameters,options.operation.deadline);
  const nodes=graph.nodes.filter(n=>n.ref.node_id===binding.node.node_id);
  if(graph.complete===true&&graph.document_id===binding.document_id
    &&JSON.stringify(graph.workflow_ref)===JSON.stringify(binding.workflow_ref)&&nodes.length===1
    &&nodes[0].ref.document_id===binding.node.document_id&&nodes[0].ref.workflow_id===binding.node.workflow_id
    &&nodes[0].boundary_role==='input'&&nodes[0].type==='bg-vendor-icon-nullvendor'
    &&nodes[0].inputs.length===0&&JSON.stringify(nodes[0].outputs)==='[0]'
    &&source.port.index===0&&source.port.active===false){
   const proof={verified:true,cleanup_complete:true,settings_changed:false,source:binding.node,port:0,
    validation_deferred:'input_mapping',source_activity:{before:false,after:false,changed:false}};
   const phase='calculator_preflight_completed',saved=await options.onRecord({phase,operation_id:options.operation.id,proof});
   need(saved?.phase===phase&&JSON.stringify(saved.proof)===JSON.stringify(proof),'calculator preflight was not durably acknowledged');
   return proof;
  }
 }
 return preflightInactiveTabularSource(options,source,{label:'calculator',sourceIcons,
  resolve:(parameters,fields)=>predictNewCalculatorOutput(parameters,fields,options.operation.parameters.mappings)});
}
