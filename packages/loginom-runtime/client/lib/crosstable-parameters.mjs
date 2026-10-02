const need=(condition,message)=>{if(!condition)throw Error(message);};
const name=value=>typeof value==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value);
const field=value=>value&&Object.keys(value).sort().join(',')==='kind,name'&&value.kind==='input_field'&&name(value.name);
export const CROSSTABLE_FUNCTIONS=Object.freeze({sum:{bit:1,suffix:'Sum',label:'Сумма'},min:{bit:4,suffix:'Min',label:'Минимум'},max:{bit:8,suffix:'Max',label:'Максимум'},avg:{bit:16,suffix:'Avg',label:'Среднее'}});

export function validateCrossTableParameters(parameters,mode,request){
 need(mode==='pivot','CrossTable supports pivot mode');
 need(parameters&&typeof parameters==='object'&&!Array.isArray(parameters)
  &&Object.keys(parameters).every(key=>['rows','column','facts','columns'].includes(key)),'Invalid CrossTable parameters');
 {
  need(Object.keys(parameters).length===4&&Array.isArray(parameters.rows)&&parameters.rows.length>0&&parameters.rows.length<=128
   &&parameters.rows.every(field)&&field(parameters.column),'CrossTable row keys and column dimension required');
  need(Array.isArray(parameters.facts)&&parameters.facts.length>0&&parameters.facts.length<=64
   &&parameters.facts.every(f=>f&&Object.keys(f).sort().join(',')==='field,functions'&&field(f.field)
    &&Array.isArray(f.functions)&&f.functions.length>0&&f.functions.length<=4
    &&f.functions.every(fn=>Object.hasOwn(CROSSTABLE_FUNCTIONS,fn))&&new Set(f.functions).size===f.functions.length),
  'CrossTable requires numeric facts with distinct supported functions');
  const names=[...parameters.rows.map(row=>row.name),parameters.column.name,...parameters.facts.map(f=>f.field.name)];
  need(new Set(names.map(n=>n.toLowerCase())).size===names.length,'CrossTable roles must reference distinct input fields');
  const columns=parameters.columns;
  need(columns&&typeof columns==='object'&&!Array.isArray(columns),'CrossTable column mode required');
  if(columns.mode==='sliding')need(Object.keys(columns).sort().join(',')==='min_values,mode'
   &&Number.isInteger(columns.min_values)&&columns.min_values===0,'Sliding CrossTable requires unbounded observed categories');
  else if(columns.mode==='fixed')need(Object.keys(columns).sort().join(',')==='include_null,include_other,mode'
   &&typeof columns.include_null==='boolean'&&typeof columns.include_other==='boolean',
  'Fixed CrossTable uses all source categories; columns.categories is unsupported');
  else need(false,'Unknown CrossTable column mode');
 }
 need(request.target.kind==='existing'||request.inputs.length===1,'New CrossTable requires one explicit input');
 need(request.inputs.length<=1&&request.inputs.every(input=>input.input===0),'CrossTable has one table input');
 need(request.read.ports.every(port=>port===0),'CrossTable has one table output');
 need(request.mappings.every(mapping=>mapping.port===0&&mapping.direction==='input'&&mapping.fields===undefined&&mapping.changes===undefined),
  'CrossTable derived output mapping is verified from the fresh execution schema');
 need(request.finish!=='close'||request.mappings.length===0,'Close cannot commit port mappings');
 return parameters;
}

export function resolveCrossTableParameters(parameters,fields){
 need(Array.isArray(fields)&&fields.length<=1000&&new Set(fields.map(f=>f.name.toLowerCase())).size===fields.length,
  'Complete unique CrossTable input schema required');
 const get=ref=>{const matches=fields.filter(f=>f.name===ref.name);need(matches.length===1,'CrossTable input field is missing: '+ref.name);return matches[0];};
 const rows=parameters.rows.map(get),column=get(parameters.column),facts=parameters.facts.map(f=>({
  field:get(f.field),functions:f.functions,mask:f.functions.reduce((mask,fn)=>mask|CROSSTABLE_FUNCTIONS[fn].bit,0),
 }));
 // Preview exposes type but not data kind; the mapped input wizard supplies it.
 if(column.data_kind!==undefined)need(column.data_kind==='Дискретный','CrossTable column field must be discrete');
 need(facts.every(f=>['integer','real'].includes(f.field.type)),'CrossTable facts must be numeric');
 return {rows,column,facts,columns:parameters.columns};
}
