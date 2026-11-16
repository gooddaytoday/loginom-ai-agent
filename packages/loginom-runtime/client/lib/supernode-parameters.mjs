import {validateActionParameters} from './action-catalog.mjs';
const name={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_]{0,127}$'},label={type:'string',minLength:1,maxLength:128};
const tableInput={type:'object',additionalProperties:false,required:['kind','name','label','requirement'],properties:{kind:{const:'table'},name,label,requirement:{const:'required'}}};
const variableInput={type:'object',additionalProperties:false,required:['kind','name','label','definitions'],properties:{kind:{const:'variables'},name,label,
 definitions:{type:'array',minItems:1,maxItems:128,description:'Ordered local non-NULL integer defaults; name is also the display label. Existing definitions must retain order, identities and values.',items:{type:'object',additionalProperties:false,required:['name','type','value'],properties:{name,type:{const:'integer'},value:{type:'integer',minimum:-9007199254740991,maximum:9007199254740991}}}}}};
export const supernodeParametersSchema={type:'object',description:'One-level Supernode: tabular_boundary requires one table input; variable_boundary has one variables input with integer defaults and no table input. Both have one table output. New: complete boundary, inputs:[], finish:done. Existing parameters:{} retains all ports and definitions. No nested, mixed, extra or output variable ports; no destructive edits.',additionalProperties:false,properties:{
 boundary:{type:'object',additionalProperties:false,required:['input','output'],properties:{input:{oneOf:[tableInput,variableInput]},output:{type:'object',additionalProperties:false,required:['kind','name','label'],properties:{kind:{const:'table'},name,label}}}}}};
const need=(v,m)=>{if(!v)throw Error('Supernode: '+m);};
export function validateSupernodeParameters(parameters,mode,request){
 need(['tabular_boundary','variable_boundary'].includes(mode),'unsupported boundary mode');
 validateActionParameters(supernodeParametersSchema,parameters);
 need(!request.variable_inputs?.length&&!request.bindings?.length,'external variables and bindings are unsupported; use local boundary definitions');
 const input=parameters.boundary?.input;
 if(input){
  need(input.kind===(mode==='variable_boundary'?'variables':'table'),'boundary kind differs from mode');
  if(input.kind==='variables')need(new Set(input.definitions.map(d=>d.name.toLowerCase())).size===input.definitions.length,'duplicate definition name');
 }
 if(mode==='variable_boundary')need(request.inputs.length===0,'variable boundary has no table input');
 need(request.mappings.length===0,'boundary field mappings are preserved; configure the inner Calculator output mapping');
 if(request.target.kind==='new'){
  need(parameters.boundary,'complete parameters.boundary required for creation');
  need(request.inputs.length===0&&request.finish==='done','create empty boundary first with inputs:[] and finish:done; then connect the SAME existing node');
 }
}
