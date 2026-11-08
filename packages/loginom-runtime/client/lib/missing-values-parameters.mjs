const need=(v,m)=>{if(!v)throw Error(m);};
const object=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const numeric=['integer','real'];
// Observed Loginom 7.4.2 menus: previous/linear exist only for ordered input, delete/random only for unordered input.
export const MISSING_VALUES_METHODS=['mean','zero','constant','median','most_probable','previous','delete','random','linear'];
const ORDERED_METHODS=['previous','linear'];
const compatible=(method,s)=>method==='zero'?numeric.includes(s.type)&&['Непрерывный','Дискретный'].includes(s.data_kind)
 :['mean','median','previous','delete','random','linear'].includes(method)?numeric.includes(s.type)&&s.data_kind==='Непрерывный'
 :s.type==='string'&&s.data_kind==='Дискретный';
const name=v=>typeof v==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v);

// A replacement is the complete processing set, never an implicit patch.
// An empty object is reserved for reexecuting an existing saved configuration.
export function validateMissingValuesParameters(p,mode,r){
 need(mode==='impute','Missing values supports impute mode');
 need(object(p,['fields','max_nulls_percent','ordered']),'Invalid missing values parameters');
 const preserve=Object.keys(p).length===0;
 need(!preserve||r.target.kind==='existing','New missing values requires complete settings');
 if(!preserve){
  need(typeof p.ordered==='boolean','Explicit ordered true/false required');
  need(Number.isInteger(p.max_nulls_percent)&&p.max_nulls_percent>=0&&p.max_nulls_percent<=100,'Explicit integer threshold 0–100 required');
  need(Array.isArray(p.fields)&&p.fields.length>0&&p.fields.length<=128,'Complete nonempty processing fields required');
  const seen=new Set();
  for(const f of p.fields){
   need(object(f,['field','method','value'])&&object(f.field,['kind','name'])&&f.field.kind==='input_field'&&name(f.field.name),'Exact input field name required');
   need(!seen.has(f.field.name.toLowerCase()),'Duplicate missing values field');seen.add(f.field.name.toLowerCase());
   need(MISSING_VALUES_METHODS.includes(f.method),'Unsupported missing values method');
   need(ORDERED_METHODS.includes(f.method)===(p.ordered===true),'previous and linear require ordered:true, and ordered:true allows only previous and linear');
   need(f.method!=='constant'?!Object.hasOwn(f,'value'):typeof f.value==='string'&&f.value.length<=2048&&!/[\r\n\u0000]/.test(f.value),'Only string constant accepts an explicit replacement value');
  }
 }
 need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0),'Missing values accepts one input');
 need(r.target.kind==='existing'||r.inputs.length===1,'New missing values requires explicit input');
 need(r.read.ports.every(i=>i===0),'Missing values has one output');
 need(r.mappings.length<=2&&r.mappings.every(m=>m.port===0),'Missing values has one input/output mapping');
 for(const m of r.mappings)if(m.fields||m.changes){
  const seen=new Set();for(const f of m.fields??m.changes){
   need(f.source?.kind==='configured_field'&&name(f.source.name)&&!seen.has(f.source.name.toLowerCase()),'Unique configured mapping fields required');seen.add(f.source.name.toLowerCase());
   need(m.direction==='output'||f.excluded!==true,'Input exclusions are unsupported');
  }
 }
 need(r.finish!=='close'||r.mappings.every(m=>m.direction!=='input'),'Close cannot commit separate input mappings');
 return p;
}

export function resolveMissingValuesParameters(p,fields,ordered=p.ordered){
 need(Array.isArray(fields)&&fields.length<=1000&&fields.every(f=>name(f.name))&&new Set(fields.map(f=>f.name.toLowerCase())).size===fields.length,'Complete unique input schema required');
 need(Array.isArray(p.fields),'Complete processing fields required');
 return p.fields.map(f=>{
  need(MISSING_VALUES_METHODS.includes(f.method)&&(f.method!=='constant'||typeof f.value==='string'&&f.value.length<=2048&&!/[\r\n\u0000]/.test(f.value)),'Unsupported saved missing values method/value');
  const matches=fields.filter(s=>s.name===f.field.name);need(matches.length===1,'Missing values input field is missing: '+f.field.name);
  const source=matches[0];
  need(ORDERED_METHODS.includes(f.method)===(ordered===true),'Missing values method is incompatible with ordered input: '+f.field.name);
  need(compatible(f.method,source),'Missing values method is incompatible with type/data kind: '+source.name);
  return {...source,method:f.method,...(f.method==='constant'?{value:f.value}:{})};
 });
}
export function validateMissingValuesInputParameters(p,resolved,native){
 if(p.fields!==undefined)resolveMissingValuesParameters(p,resolved.fields??native.target_fields);
}
