export const CROSSTABLE_FUNCTIONS=Object.freeze({sum:{bit:1,index:0,label:'Сумма'},min:{bit:4,index:2,label:'Минимум'},max:{bit:8,index:3,label:'Максимум'},avg:{bit:16,index:4,label:'Среднее'}});
const need=(v,m)=>{if(!v)throw Error('CrossTable: '+m);};
const field=v=>v&&Object.keys(v).sort().join(',')==='kind,name'&&v.kind==='input_field'&&typeof v.name==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v.name);
export function validateCrossTableParameters(p,mode,r){
 need(mode==='pivot','use pivot mode');
 need(p&&Object.keys(p).every(k=>['row_keys','column','facts','category_mode','include_null','include_other','min_values','limit','separator','unique_names'].includes(k)),'unsupported parameters; variables, explicit categories and output overrides are unavailable');
 const preserved=Object.keys(p).length===0;
 need(!preserved||r.target.kind==='existing','new node requires complete roles, facts and category_mode');
 if(!preserved){
  need(Array.isArray(p.row_keys)&&p.row_keys.length>0&&p.row_keys.length<=128&&p.row_keys.every(field),'ordered row_keys input_field references required');
  need(field(p.column),'one column input_field required');
  need(Array.isArray(p.facts)&&p.facts.length>0&&p.facts.length<=128,'numeric facts required');
  for(const f of p.facts)need(f&&Object.keys(f).sort().join(',')==='field,functions'&&field(f.field)
   &&Array.isArray(f.functions)&&f.functions.length>0&&f.functions.length<=4
   &&new Set(f.functions).size===f.functions.length&&f.functions.every(fn=>CROSSTABLE_FUNCTIONS[fn]),'facts require unique sum/min/max/avg; count uses sum of Quantity=1');
  const names=[...p.row_keys.map(f=>f.name),p.column.name,...p.facts.map(f=>f.field.name)];
  need(new Set(names.map(n=>n.toLowerCase())).size===names.length,'roles must use distinct input fields');
  need(['fixed','sliding'].includes(p.category_mode),'choose fixed or sliding category_mode');
  if(p.category_mode==='fixed')need(typeof p.include_null==='boolean'&&typeof p.include_other==='boolean','fixed requires explicit include_null/include_other');
  else need(p.include_null===undefined&&p.include_other===undefined,'sliding must omit fixed special-group flags');
  need((p.min_values??0)===0&&(p.limit??0)===0&&(p.separator??'|')==='|'&&(p.unique_names??false)===false,'stage one requires min_values=0, limit=0, separator=|, unique_names=false');
  need(r.inputs.length===1&&r.inputs[0].input===0,'complete configuration requires one explicit table input zero');
 }
 need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0),'one input zero supported');
 need(r.mappings.length===0,'CrossTable mapping overrides are unavailable');
 need(r.read.ports.every(p=>p===0),'one output zero supported');return p;
}
export function resolveCrossTableParameters(p,fields){
 const get=ref=>{const xs=fields.filter(f=>f.name===ref.name);need(xs.length===1,'input field missing: '+ref.name);return xs[0];};
 const column=get(p.column),keys=p.row_keys.map(get),facts=p.facts.map(f=>({...get(f.field),functions:f.functions}));
 need(column.data_kind==='Дискретный'&&column.type==='string','column dimension requires a discrete string field');
 need(keys.every(f=>f.data_kind==='Дискретный'&&['string','integer','boolean','datetime'].includes(f.type)),'row keys require supported discrete fields');
 need(facts.every(f=>['integer','real'].includes(f.type)),'facts must be numeric integer or real');
 need([...keys,column,...facts].every(f=>f.label&&f.label.length<=120&&!f.label.includes('|')),'roles need unique unambiguous labels without |');
 need(new Set([...keys,column,...facts].map(f=>f.label)).size===keys.length+facts.length+1,'duplicate role labels are unsupported');
 return {keys,column,facts};
}
