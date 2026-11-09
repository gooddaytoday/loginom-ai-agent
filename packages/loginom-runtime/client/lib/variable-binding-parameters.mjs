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
  const flag=b.parameter===booleanBindingParameter(type);
  need(file||flag||type==='transform.filter_data'&&/^\/groups\/(?:[0-9]|[1-5][0-9]|6[0-3])\/(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-7])\/value$/.test(b.parameter),'BINDING_PARAMETER_UNSUPPORTED',b.parameter);
  need(exact(b.variable,['kind','input','name'])&&b.variable.kind===(file?'variables':'control')&&b.variable.input===0,'BINDING_PORT_MISMATCH',b.parameter);
  need(typeof b.variable.name==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(b.variable.name),'BINDING_VARIABLE_MISSING',b.parameter);
 }
}
export const booleanBindingParameter=type=>({'transform.group_data':'/sort_result','transform.sorting':'/compare_with_locale'})[type];
export function booleanBindingSchema(type){
 const schema=structuredClone(variableBindingsSchema);
 schema.maxItems=1;schema.description='Boolean control input 0; exact mapped non-NULL variable. Omit bound literal; [] preserves saved binding.';
 schema.items.properties.parameter={const:booleanBindingParameter(type)};
 schema.items.properties.variable.properties.kind={const:'control'};
 schema.items.properties.variable.properties.input={const:0};return schema;
}
export function validateBooleanBinding(p,r){
 if(!r.bindings?.length)return;
 validateVariableBindings(r.bindings,r.target.type);
 need(!Object.hasOwn(p,booleanBindingParameter(r.target.type).slice(1)),'BINDING_CONFLICT');
 need(r.target.kind==='existing'||r.variable_inputs?.some(i=>i.kind==='control'&&i.input===0),'BINDING_PORT_MISMATCH');
 need(r.finish!=='close','BINDING_PARAMETER_UNSUPPORTED');
}
