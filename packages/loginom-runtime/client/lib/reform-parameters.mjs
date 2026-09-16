const need=(ok,message)=>{if(!ok)throw Error(message);};
const object=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const name=v=>typeof v==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v);
export const REFORM_TYPES=Object.freeze({string:'Строковый',integer:'Целый',real:'Вещественный',boolean:'Логический',datetime:'Дата/Время'});
export const REFORM_USAGE=Object.freeze({'Не задано':0,'Активное':3,'Выходное':4,'Группа':6,'Показатель':7,'Транзакция':8,'Элемент':9});
export const REFORM_KINDS=Object.freeze(['Неопределенное','Непрерывный','Дискретный']);

// A reference names a current configured field, never its non-unique label.
// Resolve the whole patch against one baseline before any editor is opened.
export function validateReformChanges(p) {
 need(object(p,['changes'])&&Array.isArray(p.changes)&&p.changes.length<=128,'Bounded reform changes required');
 const selected=new Set();
 for(const c of p.changes) {
  need(object(c,['field','name','label','type','data_kind','usage','excluded'])&&Object.keys(c).length>1,'Reform change requires a property');
  need(object(c.field,['kind','name'])&&['configured_field','input_field'].includes(c.field.kind)&&name(c.field.name),'Exact reform field identity required');
  need(!selected.has(c.field.name.toLowerCase()),'Duplicate reform field');selected.add(c.field.name.toLowerCase());
  need(c.name===undefined||name(c.name),'Invalid reform field name');
  need(c.label===undefined||typeof c.label==='string'&&c.label.length>0&&c.label.length<=128&&!/[\x00-\x1f]/.test(c.label),'Invalid reform label');
  need(c.type===undefined||Object.hasOwn(REFORM_TYPES,c.type),'Unsupported reform scalar type');
  need(c.data_kind===undefined||REFORM_KINDS.includes(c.data_kind),'Unsupported reform data kind');
  need(c.usage===undefined||Object.hasOwn(REFORM_USAGE,c.usage),'Unsupported reform usage');
  need(c.excluded===undefined||typeof c.excluded==='boolean','Boolean reform exclusion required');
 }
 return p;
}

export function resolveReformChanges(p,baseline) {
 validateReformChanges(p);
 need(baseline?.verified===true&&baseline.inventory_complete===true&&Array.isArray(baseline.fields),'Complete reform inventory required');
 const fields=baseline.fields;
 need(new Set(fields.map(f=>f.name.toLowerCase())).size===fields.length&&new Set(fields.map(f=>f.record_id)).size===fields.length,'Unique reform identities required');
 const changes=p.changes.map(c=>{
  if(c.field.kind==='input_field')need(baseline.source_identity_verified===true,'Verified reform input binding required');
  const found=fields.filter(f=>(c.field.kind==='input_field'?f.input_field?.name:f.name)===c.field.name);need(found.length===1,'Unknown reform field: '+c.field.name);
  const original=found[0];
  if(c.type!==undefined||c.data_kind!==undefined)need(!['string','boolean'].includes(c.type??original.type)
    ||(c.data_kind??original.data_kind)==='Дискретный'
    ||c.data_kind===undefined&&original.data_kind===undefined,
    'String and boolean reform fields require discrete kind; request data_kind explicitly when converting a continuous field');
  need(c.type===undefined||c.type===original.type||Object.hasOwn(REFORM_TYPES,original.input_field?.type??original.type),'Conversion from non-scalar source is unsupported');
  return {original,wanted:{...original,...Object.fromEntries(Object.entries(c).filter(([k])=>!['field','usage'].includes(k))),
   ...(c.usage===undefined?{}:{usage_type:REFORM_USAGE[c.usage]})}};
 });
 const projected=fields.map(f=>changes.find(c=>c.original.record_id===f.record_id)?.wanted??f);
 need(new Set(projected.map(f=>f.name.toLowerCase())).size===projected.length,'Reform output name collision');
 need(projected.some(f=>!f.excluded),'At least one reform field must remain');
 // Move renames to vacated names in dependency order. Cyclic swaps require a
 // separate explicit operation; do not silently introduce temporary names.
 const remaining=[...changes],ordered=[],occupied=new Map(fields.map(f=>[f.name.toLowerCase(),f.record_id]));
 while(remaining.length) {
  const index=remaining.findIndex(c=>!occupied.has(c.wanted.name.toLowerCase())||occupied.get(c.wanted.name.toLowerCase())===c.original.record_id);
  need(index>=0,'Cyclic reform renames are unsupported');
  const [change]=remaining.splice(index,1);occupied.delete(change.original.name.toLowerCase());occupied.set(change.wanted.name.toLowerCase(),change.original.record_id);ordered.push(change);
 }
 return {changes:ordered,fields:projected};
}
