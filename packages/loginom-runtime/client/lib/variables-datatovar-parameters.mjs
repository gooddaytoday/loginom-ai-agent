const need=(ok,message)=>{if(!ok)throw Error('Table to variables: '+message);};
// GroupFunctions bits follow the native FactorEditDialog order; the first ten
// match GROUPING_FUNCTIONS, first..concat continue it (LAB-1051 discovery).
export const DATA_TO_VAR_FUNCTIONS=Object.freeze({sum:1,count:2,min:4,max:8,avg:16,median:32,mode:64,standard_deviation:128,
 unique_count:256,null_count:512,first:1024,last:2048,only:4096,concat:8192});
const SCALAR=['count','min','max','mode','unique_count','null_count','first','last','only'];
// Native per-type availability observed in the factor editor. Variant is not
// admitted: its variable output has no approved exact reader yet.
export const DATA_TO_VAR_TYPE_FUNCTIONS=Object.freeze({integer:Object.keys(DATA_TO_VAR_FUNCTIONS),real:Object.keys(DATA_TO_VAR_FUNCTIONS),
 string:[...SCALAR,'concat'],boolean:SCALAR,datetime:SCALAR});
export const dataToVarMask=(type,functions)=>Number.isSafeInteger(functions)&&functions>0&&Object.hasOwn(DATA_TO_VAR_TYPE_FUNCTIONS,type)
 &&(functions&~DATA_TO_VAR_TYPE_FUNCTIONS[type].reduce((m,a)=>m|DATA_TO_VAR_FUNCTIONS[a],0))===0;
const name=v=>typeof v==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);

export const dataToVarParametersSchema={type:'object',additionalProperties:false,
 description:'Aggregate the current table into variables output 0. Empty parameters preserve an existing configuration.',
 properties:{fields:{type:'array',minItems:1,maxItems:16,
  description:'Complete selected fields in native field order. Supply the full set when changing configuration.',
  items:{type:'object',additionalProperties:false,properties:{
   field:{type:'object',additionalProperties:false,properties:{kind:{const:'input_field'},name:{type:'string',minLength:1,maxLength:128}},required:['kind','name']},
   aggregations:{type:'array',minItems:1,maxItems:14,uniqueItems:true,items:{type:'string',enum:Object.keys(DATA_TO_VAR_FUNCTIONS)},
    description:'Native order as listed. integer/real: all; string: no sum,avg,median,standard_deviation; boolean/datetime: also no concat. count includes NULL; unique_count/null_count skip/count NULL. sum,avg,median,standard_deviation (sample) are real; counts integer; min,max,mode,first,last,only keep the input type; only is NULL unless one distinct value. concat: string, comma, no wrapper, unique, appearance order.'},
  },required:['field','aggregations']}}}};

function validateSpecification(p){
 need(object(p)&&Object.keys(p).every(k=>k==='fields'),'only fields are supported');
 if(p.fields===undefined){need(!Object.hasOwn(p,'fields'),'fields cannot be undefined');return;}
 need(Array.isArray(p.fields)&&p.fields.length>0&&p.fields.length<=16,'a complete nonempty field selection is required');
 const names=new Set();
 for(const f of p.fields){
  need(object(f)&&Object.keys(f).sort().join(',')==='aggregations,field'&&object(f.field)
   &&Object.keys(f.field).sort().join(',')==='kind,name'&&f.field.kind==='input_field'&&name(f.field.name),'exact input_field references are required');
  need(!names.has(f.field.name.toLowerCase()),'duplicate selected field');names.add(f.field.name.toLowerCase());
  need(Array.isArray(f.aggregations)&&f.aggregations.length>0&&f.aggregations.length<=14
   &&f.aggregations.every(a=>typeof a==='string'&&Object.hasOwn(DATA_TO_VAR_FUNCTIONS,a))
   &&new Set(f.aggregations).size===f.aggregations.length,'choose unique functions from '+Object.keys(DATA_TO_VAR_FUNCTIONS).join(','));
 }
 need(p.fields.reduce((n,f)=>n+f.aggregations.length,0)<=128,'variable inventory exceeds 128');
}

export function validateDataToVarParameters(p,mode,r){
 need(mode==='aggregate','only aggregate mode is supported');validateSpecification(p);
 need(p.fields!==undefined||r.target.kind==='existing','a new node requires fields');
 need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0)
  &&(r.target.kind==='existing'||r.inputs.length===1),'a new node requires one explicit table input 0');
 need((r.variable_inputs??[]).length===0,'variable inputs are unsupported');
 need(r.read.ports.length===0&&(r.read.variable_ports??[]).every(p=>p===0),'read variables output 0 via read.variable_ports; there is no table output');
 need(r.mappings.length<=1&&r.mappings.every(m=>m.direction==='input'&&m.port===0&&m.kind===undefined),'only table input mapping 0 is supported');
 need(r.finish!=='close'||r.mappings.length===0,'Close cannot commit separate input mappings');
 return p;
}

// Resolve against the complete observed table before the first writer gesture.
// Output variable names/labels/values must be read from the native variables
// port. In particular, a single function is not assigned a guessed suffix.
export function resolveDataToVarParameters(p,fields){
 validateSpecification(p);need(p.fields!==undefined,'explicit fields are required for a replacement');
 need(Array.isArray(fields)&&fields.length<=1000&&fields.every(f=>name(f.name))
  &&new Set(fields.map(f=>f.name.toLowerCase())).size===fields.length,'complete unique input schema is required');
 // Preview/output schemas identify fields by name. The wizard inventory also
 // carries local record IDs; never synthesize those during source preflight.
 if(fields.some(f=>f.record_id!==undefined))need(fields.every(f=>typeof f.record_id==='string'&&f.record_id.length>0)
  &&new Set(fields.map(f=>f.record_id)).size===fields.length,'complete unique input record IDs are required');
 return {fields:p.fields.map(f=>{
  const input=fields.find(x=>x.name===f.field.name);need(input,'input field is missing: '+f.field.name);
  const allowed=DATA_TO_VAR_TYPE_FUNCTIONS[input.type];
  need(allowed,'an integer, real, string, boolean or datetime input field is required: '+f.field.name);
  const refused=f.aggregations.filter(a=>!allowed.includes(a));
  need(!refused.length,f.field.name+' ('+input.type+') does not support '+refused.join(',')+'; allowed: '+allowed.join(','));
  const aggregations=Object.keys(DATA_TO_VAR_FUNCTIONS).filter(a=>f.aggregations.includes(a));
  return {input:structuredClone(input),aggregations,mask:aggregations.reduce((mask,a)=>mask|DATA_TO_VAR_FUNCTIONS[a],0)};
 })};
}
