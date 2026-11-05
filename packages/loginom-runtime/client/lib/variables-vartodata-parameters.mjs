const need=(value,message)=>{if(!value)throw Error('Переменные в таблицу: '+message);};
export const variablesToTableParametersSchema={type:'object',properties:{},required:[],additionalProperties:false,
 description:'Use parameters:{} and mode columns or rows. Columns produces one typed row preserving variable names, labels, types and order. Rows produces Name string, DisplayName string, Value variant, one row per variable in source order; each Value retains its native subtype and civil datetime milliseconds. NULL, empty string, false and zero are distinct. Values belong to the upstream variable source. Done commits, Execute computes, Close discards; save separately.'};

export function validateVariablesToTableParameters(parameters,mode,request){
 need(['columns','rows'].includes(mode),'Этот режим пока не поддерживается');
 need(parameters&&typeof parameters==='object'&&!Array.isArray(parameters)&&Object.keys(parameters).length===0,'требуется parameters:{}; значения и формулы задаются в источнике переменных');
 need(Array.isArray(request.inputs)&&request.inputs.length===0,'используй variable_inputs; табличный вход не поддерживается');
 need(Array.isArray(request.variable_inputs)&&request.variable_inputs.length===1,'нужен один явный источник variable_inputs');
 const input=request.variable_inputs[0];
 need(input.kind==='variables'&&input.input===0&&Number.isInteger(input.output)&&input.output>=0&&input.output<=99,'нужен выход переменных и вход variables 0; control-порт не поддерживается');
 need(input.source?.document_id===request.document_id&&input.source?.workflow_id===request.workflow_ref.workflow_id,'источник переменных должен принадлежать текущему сценарию');
 need(request.mappings.every(m=>m.direction==='output'&&m.port===0),'поддерживается только соответствие табличного выхода 0; вход переменных не является таблицей');
}

export function validateVariablesToTableFields(fields){
 need(Array.isArray(fields)&&fields.length>0&&fields.length<=128,'нужен непустой проверенный набор переменных (до 128)');
 need(new Set(fields.map(f=>f?.name?.toLowerCase())).size===fields.length&&fields.every(f=>f&&typeof f.name==='string'&&f.name.length>0&&f.name.length<=128
  &&typeof f.label==='string'&&['integer','real','boolean','string','datetime'].includes(f.type)),
 'имена, метки и scalar-типы переменных должны быть полными и уникальными; Variant пока не поддерживается');
}

export function validateVariablesToTableOutputFields(fields,mode='columns'){
 if(mode==='columns')return validateVariablesToTableFields(fields);
 need(mode==='rows'&&Array.isArray(fields)&&fields.length===3
  &&fields.every((f,i)=>f.name===['Name','DisplayName','Value'][i]&&f.type===['string','string','variant'][i]&&typeof f.label==='string'),
  'режим rows требует исходные поля Name string, DisplayName string, Value variant в этом порядке');
}
