export const CROSSTABLE_FUNCTIONS=Object.freeze({sum:{bit:1,index:0,label:'Сумма'},count:{bit:2,index:1,label:'Количество'},min:{bit:4,index:2,label:'Минимум'},max:{bit:8,index:3,label:'Максимум'},avg:{bit:16,index:4,label:'Среднее'},stddev:{bit:32,index:5,label:'Стандартное откл.'},sum_squares:{bit:64,index:6,label:'Сумма квадратов'},unique_count:{bit:128,index:7,label:'Кол-во уникальных'},null_count:{bit:256,index:8,label:'Кол-во пропусков'},first:{bit:512,index:9,label:'Первый'},last:{bit:1024,index:10,label:'Последний'}});
export const CROSSTABLE_TYPE_MASKS=Object.freeze({integer:2047,real:2047,string:1934,boolean:1934,datetime:1982});
export const crossTableDimensions=p=>p.columns??(p.column?[p.column]:[]);
export function crossTableResultType(type,fn){
 if(['count','unique_count','null_count'].includes(fn))return 'integer';
 if(['sum','stddev','sum_squares'].includes(fn))return 'real';
 if(fn==='avg')return type==='datetime'?'datetime':'real';
 return type;
}
const need=(v,m)=>{if(!v)throw Error('CrossTable: '+m);};
const field=v=>v&&Object.keys(v).sort().join(',')==='kind,name'&&v.kind==='input_field'&&typeof v.name==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(v.name);
export function validateCrossTableParameters(p,mode,r){
 need(mode==='pivot','use pivot mode');
 need(p&&Object.keys(p).every(k=>['row_keys','column','columns','facts','category_mode','include_null','include_other','min_values','limit','separator','unique_names'].includes(k)),'unsupported parameters; variables, explicit categories and output overrides are unavailable');
 const preserved=Object.keys(p).length===0;
 need(!preserved||r.target.kind==='existing','new node requires complete roles, facts and category_mode');
 if(!preserved){
  need(Array.isArray(p.row_keys)&&p.row_keys.length<=128&&p.row_keys.every(field),'ordered row_keys input_field references required');
  need(p.column===undefined||p.columns===undefined,'choose column or columns, never both');
  need(field(p.column)||Array.isArray(p.columns)&&p.columns.length<=128&&p.columns.every(field),'ordered columns or legacy column input_field required');
  need(Array.isArray(p.facts)&&p.facts.length>0&&p.facts.length<=128,'typed facts required');
  for(const f of p.facts)need(f&&Object.keys(f).sort().join(',')==='field,functions'&&field(f.field)
   &&Array.isArray(f.functions)&&f.functions.length>0&&f.functions.length<=11
   &&new Set(f.functions).size===f.functions.length&&f.functions.every(fn=>CROSSTABLE_FUNCTIONS[fn]),'facts require a unique supported aggregate set');
  const names=[...p.row_keys.map(f=>f.name),...crossTableDimensions(p).map(f=>f.name),...p.facts.map(f=>f.field.name)];
  need(new Set(names.map(n=>n.toLowerCase())).size===names.length,'roles must use distinct input fields');
  need(['fixed','sliding'].includes(p.category_mode),'choose fixed or sliding category_mode');
  if(p.category_mode==='fixed')need(typeof p.include_null==='boolean'&&typeof p.include_other==='boolean','fixed requires explicit include_null/include_other');
  else need(p.include_null===undefined&&p.include_other===undefined,'sliding must omit fixed special-group flags');
  if(crossTableDimensions(p).length===0)need(!p.include_null&&!p.include_other,'special groups require a column dimension');
  need((p.min_values??0)===0&&(p.limit??0)===0&&(p.separator??'|')==='|'&&(p.unique_names??false)===false,'supported schema policy requires min_values=0, limit=0, separator=|, unique_names=false');
  need(r.inputs.length===1&&r.inputs[0].input===0,'complete configuration requires one explicit table input zero');
 }
 need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0),'one input zero supported');
 need(r.mappings.length===0,'CrossTable mapping overrides are unavailable');
 need(r.read.ports.every(p=>p===0),'one output zero supported');return p;
}
export function resolveCrossTableParameters(p,fields){
 const get=ref=>{const xs=fields.filter(f=>f.name===ref.name);need(xs.length===1,'input field missing: '+ref.name);return xs[0];};
 const columns=crossTableDimensions(p).map(get),keys=p.row_keys.map(get),facts=p.facts.map(f=>({...get(f.field),functions:f.functions}));
 need(columns.every(f=>f.data_kind==='Дискретный'&&['string','integer','real','boolean','datetime'].includes(f.type)),'column dimensions require supported discrete fields');
 need(keys.every(f=>f.data_kind==='Дискретный'&&['string','integer','boolean','datetime'].includes(f.type)),'row keys require supported discrete fields');
 need(facts.every(f=>CROSSTABLE_TYPE_MASKS[f.type]&&f.functions.every(fn=>(CROSSTABLE_TYPE_MASKS[f.type]&CROSSTABLE_FUNCTIONS[fn].bit)!==0
  &&(f.available_functions===undefined||(f.available_functions&CROSSTABLE_FUNCTIONS[fn].bit)!==0))),'unsupported fact type/function pair');
 need([...keys,...columns,...facts].every(f=>f.label&&f.label.length<=120&&!f.label.includes('|')),'roles need unique unambiguous labels without |');
 need(new Set([...keys,...columns,...facts].map(f=>f.label)).size===keys.length+facts.length+columns.length,'duplicate role labels are unsupported');
 return {keys,column:columns[0]??null,columns,facts};
}
