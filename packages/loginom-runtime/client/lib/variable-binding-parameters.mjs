const need=(ok,code,parameter='')=>{if(!ok)throw Error(code+': '+parameter);};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export const variableBindingsSchema={
 type:'array',maxItems:32,description:'Optional parameter bindings; omit the bound literal. Read binding_schema from the node card. Omit/[] preserves saved bindings; no unbind.',
 items:{type:'object',additionalProperties:false,required:['parameter','variable'],properties:{
  parameter:{type:'string',minLength:1,maxLength:256},
  variable:{type:'object',additionalProperties:false,required:['kind','input','name'],properties:{
   kind:{type:'string',enum:['control','variables']},input:{type:'integer',minimum:0,maximum:15},name:{type:'string',minLength:1,maxLength:128}
  }}
 }}
};
export function validateVariableBindings(bindings,type){
 if(bindings===undefined)return;
 need(Array.isArray(bindings)&&bindings.length<=32,'BINDING_VALUE_INVALID');
 const seen=new Set();
 for(const b of bindings){
  need(exact(b,['parameter','variable'])&&typeof b.parameter==='string','BINDING_PARAMETER_UNSUPPORTED');
  need(!seen.has(b.parameter),'BINDING_CONFLICT',b.parameter);seen.add(b.parameter);
  const file=type==='imports.text'&&b.parameter==='/settings/source/source_path';
  need(file||type==='transform.filter_data'&&/^\/groups\/(?:[0-9]|[1-5][0-9]|6[0-3])\/(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-7])\/value$/.test(b.parameter),'BINDING_PARAMETER_UNSUPPORTED',b.parameter);
  need(exact(b.variable,['kind','input','name'])&&b.variable.kind===(file?'variables':'control')&&b.variable.input===0,'BINDING_PORT_MISMATCH',b.parameter);
  need(typeof b.variable.name==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(b.variable.name),'BINDING_VARIABLE_MISSING',b.parameter);
 }
}
