const need=(ok,message)=>{if(!ok)throw Error(message);};
const object=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k));
const name=value=>typeof value==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value);
const scalarTypes=['integer','real','string','datetime','boolean'];
const comparable=(value,type)=>type==='datetime'&&value.length===19?value+'.000':value;
// Loginom Help filtering-criteria.md, verified against the node wizard (7.4.2).
// Boolean predicates are explicit: the wizard does not offer numeric comparisons.
export const FILTER_OPERATORS=Object.freeze({
 '<':{code:0},'<=':{code:1},'>':{code:2},'>=':{code:3},'=':{code:4},'<>':{code:5},
 is_null:{code:6,label:'пустой',arity:0},not_null:{code:7,label:'не пустой',arity:0},
 between:{code:8,label:'в интервале',arity:2},not_between:{code:9,label:'вне интервала',arity:2},
 in:{code:10,label:'в списке',arity:'list'},not_in:{code:11,label:'вне списка',arity:'list'},
 contains:{code:12,label:'содержит',string:true},not_contains:{code:13,label:'не содержит',string:true},
 starts_with:{code:14,label:'начинается с',string:true},not_starts_with:{code:15,label:'не начинается с',string:true},
 ends_with:{code:16,label:'заканчивается на',string:true},not_ends_with:{code:17,label:'не заканчивается на',string:true},
 is_true:{code:22,label:'истина',arity:0,boolean:true},is_false:{code:23,label:'ложь',arity:0,boolean:true},
});
export function validateFilterValue(value,type){
 need(scalarTypes.includes(type),'Unsupported filter scalar type');
 if(type==='integer')need(Number.isSafeInteger(value),'Filter integer must be exactly representable');
 if(type==='real')need(typeof value==='number'&&Number.isFinite(value),'Finite filter number required');
 if(type==='boolean')need(typeof value==='boolean','Boolean filter value required');
 if(type==='string')need(typeof value==='string'&&value.length<=256&&!/[\x00-\x1f]/.test(value),'Bounded single-line filter string required');
 if(type==='datetime'){
  need(typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?$/.test(value),'Filter datetime requires local ISO date/time including seconds, without a timezone');
  const d=new Date(value+'Z');need(Number.isFinite(+d)&&d.toISOString().replace(/Z$/,'')===(value.length===19?value+'.000':value),'Invalid filter calendar date');
 }
 return value;
}
export function validateFilterConditions(p){
 need(object(p,['groups'])&&Array.isArray(p.groups)&&p.groups.length>0&&p.groups.length<=64,'Nonempty OR groups required; empty filters are not an implicit pass-through');
 let count=p.groups.length-1;
 for(const group of p.groups){
  need(Array.isArray(group)&&group.length>0,'Each OR group must contain at least one AND condition');count+=group.length;
  for(const c of group){
   need(object(c,['field','operator','type','value','lower','upper','values','case_sensitive']),'Unknown filter condition property');
   need(object(c.field,['kind','name'])&&((c.field.kind==='input_field'&&name(c.field.name))||(c.field.kind==='row_number'&&c.field.name===undefined)),'Exact input field or row_number required');
   const op=FILTER_OPERATORS[c.operator];need(op,'Unsupported filter operator');
   need(scalarTypes.includes(c.type),'Filter condition requires an explicit scalar type');
   need(c.field.kind!=='row_number'||c.type==='integer','Row number is integer');
   need(!op.string||c.type==='string','String operator requires a string field');
   need(!op.boolean||c.type==='boolean','Boolean operator requires a boolean field');
   need(c.type!=='boolean'||op.boolean||['is_null','not_null'].includes(c.operator),'Boolean comparison is unsupported; use is_true/is_false');
   need(c.type==='string'&&(op.arity??1)!==0?typeof c.case_sensitive==='boolean':c.case_sensitive===undefined,'Explicit case_sensitive is required only for string value predicates');
   const arity=op.arity??1,keys=arity===0?[]:arity===2?['lower','upper']:arity==='list'?['values']:['value'];
   need(['value','lower','upper','values'].every(k=>keys.includes(k)?Object.hasOwn(c,k):!Object.hasOwn(c,k)),'Filter operator operands differ');
   if(arity==='list'){
    need(Array.isArray(c.values)&&c.values.length>0&&c.values.length<=128,'A bounded nonempty filter list is required');
    c.values.forEach(v=>validateFilterValue(v,c.type));
    need(new Set(c.values.map(v=>JSON.stringify(comparable(v,c.type)))).size===c.values.length,'Duplicate filter list values');
   }else for(const k of keys)validateFilterValue(c[k],c.type);
   if(arity===2&&c.type!=='string')need(comparable(c.lower,c.type)<=comparable(c.upper,c.type),'Filter interval lower bound exceeds upper bound');
  }
 }
 need(count<=128,'Filter supports at most 128 condition/OR rows');return p;
}
export function resolveFilterConditions(p,fields){
 validateFilterConditions(p);
 need(Array.isArray(fields)&&fields.length<=1000&&fields.every(f=>name(f.name))&&new Set(fields.map(f=>f.name)).size===fields.length,'Complete unique filter input schema required');
 return p.groups.map(group=>group.map(c=>{
  if(c.field.kind==='row_number')return {...c};
  const found=fields.filter(f=>f.name===c.field.name);need(found.length===1,'Unknown filter input field: '+c.field.name);
  need(found[0].type===c.type,'Filter scalar type differs from input: '+c.field.name);
  return {...c,field:{...c.field}};
 }));
}

// Reconstruct only the supported persisted native conditions. Omitting groups
// on an existing node means execute its saved definition, without rewriting it.
export function filterGroupsFromNative(native){
 need(native?.verified===true&&native.inventory_complete===true&&Array.isArray(native.rows)&&native.rows.length>0,'Complete nonempty saved filter required');
 const groups=[[]];
 for(const row of native.rows){
  if(row.kind==='or'){need(groups.at(-1).length>0,'Invalid saved OR separator');groups.push([]);continue;}
  need(row.kind==='condition','Unsupported saved filter row');
  const entries=Object.entries(FILTER_OPERATORS).filter(([,op])=>op.code===row.operator_code);
  need(entries.length===1,'Unsupported saved filter operator');const [operator,op]=entries[0];
  const condition={field:structuredClone(row.field),operator,type:row.type};
  const arity=op.arity??1;
  if(row.type==='string'&&arity!==0)condition.case_sensitive=row.case_sensitive;
  for(const key of arity===0?[]:arity===2?['lower','upper']:arity==='list'?['values']:['value'])condition[key]=structuredClone(row[key]);
  groups.at(-1).push(condition);
 }
 return resolveFilterConditions({groups},native.input_fields);
}
