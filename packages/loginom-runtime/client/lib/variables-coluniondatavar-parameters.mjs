const need=(ok,message)=>{if(!ok)throw Error('Variables column union: '+message);};
// A native default caption changes after each variable link. Give only a new
// union without a caller caption an explicit name before either connection.
// Reuse the original baseline on resume so the requested identity stays fixed.
export function variablesColumnUnionTargetRequest(request,graph){
 if(request.target?.type!=='variables.column_union'||request.target.kind!=='new'||request.target.label!==undefined)return request;
 need(graph?.complete===true&&graph.document_id===request.document_id&&graph.workflow_ref?.workflow_id===request.workflow_ref.workflow_id
  &&Array.isArray(graph.nodes)&&graph.nodes.length<=200,'complete owned graph required for the union caption');
 const labels=new Set(graph.nodes.map(n=>n.label)),base='Соединение переменных';
 const label=Array.from({length:201},(_,i)=>base+(i?' '+(i+1):'')).find(name=>!labels.has(name));
 need(label,'no unique union caption available');return {...request,target:{...request.target,label}};
}
export const variablesColumnUnionParametersSchema={type:'object',additionalProperties:false,properties:{column_union:{type:'object',additionalProperties:false,properties:{mapping:{type:'string',enum:['automatic','manual'],description:'automatic retains every input variable. manual uses fields as the complete ordered output selection without changing source types.'},fields:{type:'array',minItems:1,maxItems:128,items:{type:'object',additionalProperties:false,properties:{input:{type:'integer',enum:[0,1]},source:{type:'string',minLength:1,maxLength:128},name:{type:'string',minLength:1,maxLength:128},label:{type:'string',maxLength:240},type:{type:'string',enum:['integer','real','string','boolean']}},required:['input','source','name','label','type']}}},required:['mapping']}},description:'Two fixed variable inputs. Omitted settings preserve the saved automatic or manual mapping. Manual retains source types; convert using a Variables Calculator after the union.'};
export function validateVariablesColumnUnionParameters(p,mode,r){
 need(mode==='append_variables','use append_variables mode');
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>k==='column_union'),'only column_union settings supported');
 if(p.column_union!==undefined){
  const c=p.column_union;
  need(c&&['automatic','manual'].includes(c.mapping)&&Object.keys(c).every(k=>['mapping','fields'].includes(k)),'automatic or manual mapping required');
  if(c.mapping==='automatic')need(Object.keys(c).join(',')==='mapping','automatic mapping takes no fields');
  if(c.mapping==='manual'){
   need(Array.isArray(c.fields)&&c.fields.length>0&&c.fields.length<=128,'manual requires the complete ordered fields');
   const names=new Set(),sources=new Set();
   for(const f of c.fields){
    need(f&&Object.keys(f).length===5&&Object.keys(f).every(k=>['input','source','name','label','type'].includes(k))
     &&[0,1].includes(f.input)&&typeof f.source==='string'&&f.source.length>0&&f.source.length<=128
     &&typeof f.name==='string'&&/^[A-Za-z_][A-Za-z_0-9]*$/.test(f.name)&&f.name.length<=128
     &&typeof f.label==='string'&&f.label.length<=240&&['integer','real','string','boolean'].includes(f.type),'invalid manual field');
    const source=JSON.stringify([f.input,f.source]);
    need(!names.has(f.name.toLowerCase())&&!sources.has(source),'duplicate output name or source');names.add(f.name.toLowerCase());sources.add(source);
   }
  }
 }
 if(!r)return;
 need(!(r.target.kind==='new'&&p.column_union?.mapping==='manual'&&r.finish==='close'),'new manual union does not support finish close; use done or execute');
 need(r.inputs.length===0&&r.mappings.length===0,'table inputs and custom mappings are unsupported');
 need(r.read.ports.length===0&&(r.read.variable_ports??[]).every(p=>p===0),'read variable output zero, no table ports');
 const inputs=r.variable_inputs??[];
 need(inputs.length===0&&r.target.kind==='existing'||inputs.length===2&&inputs.every((i,n)=>i.kind==='variables'&&i.input===n)
  &&inputs[0].source.node_id!==inputs[1].source.node_id,'exactly two distinct variable sources in input order 0,1 required');
}
export function validateVariablesColumnUnionFields(parameters,outputs){
 for(const field of parameters.column_union?.fields??[]){
  const found=outputs[field.input]?.variables.filter(v=>v.name===field.source);
  need(found?.length===1,'unique source required for '+field.source);
  need(found[0].type===field.type,(found[0].type==='integer'&&field.type==='string'?'Loginom 7.4.2: ручное соответствие не преобразует ':'ручное соответствие этого узла не меняет тип: ')+found[0].type+' → '+field.type
   +'. Источники, узел и связи не изменены. Используйте Калькулятор переменных после Соединения.');
 }
}
export function resolveVariablesColumnUnionInputs(request,graph){
 const existing=request.target.kind==='existing'?graph.nodes.find(n=>n.ref.node_id===request.target.ref.node_id):null;
 if(request.target.kind==='existing')need(existing?.type==='variables.column_union'&&existing.locked===false,'owned writable union required');
 if(existing)need(existing.variable_inputs?.length===2&&existing.variable_inputs.every((p,i)=>p.kind==='variables'&&p.port===i),'dynamic/control inputs are unsupported');
 const inputs=[0,1].map(input=>{
  const requested=request.variable_inputs?.find(i=>i.input===input);
  const edges=(graph.variable_links??[]).filter(e=>e.target===existing?.ref.node_id&&e.input===input&&e.kind==='variables');
  need(requested||edges.length===1,'both fixed inputs must be connected');
  const source=requested?.source??graph.nodes.find(n=>n.ref.node_id===edges[0].source)?.ref,output=requested?.output??edges[0].output;
  const upstream=graph.nodes.filter(n=>n.ref.node_id===source?.node_id),ports=upstream[0]?.variable_outputs?.filter(p=>p.kind==='variables'&&p.port===output);
  need(upstream.length===1&&ports?.length===1,'observed source variable output required');
  if(!requested)need(edges[0].source_port_guid===ports[0].port_guid&&edges[0].target_port_guid===existing.variable_inputs[input].port_guid,'reciprocal port GUIDs changed');
  return {kind:'variables',input,output,source:structuredClone(source)};
 });
 need(inputs[0].source.node_id!==inputs[1].source.node_id,'distinct sources required');return inputs;
}
export function validateVariablesColumnUnionInventory(outputs){
 need(outputs.length===2&&outputs.every(o=>o.complete===true&&o.count===o.variables?.length)&&outputs.reduce((n,o)=>n+o.count,0)<=128,'complete inputs with at most 128 variables required');
 for(const o of outputs)for(const v of o.variables){
  const c=v.cell;
  need(['integer','real','string','boolean'].includes(v.type)&&c?.type===v.type&&typeof c.is_null==='boolean','unsupported source variable type');
  if(c.is_null){need(c.value===null,'typed NULL required');continue;}
  need(v.type==='integer'?c.precision==='exact_integer'&&/^-?\d+$/.test(c.value)&&Number.isSafeInteger(Number(c.value)):
   v.type==='real'?typeof c.value==='number'&&Number.isFinite(c.value):typeof c.value===v.type,'unsafe or unsupported source value');
 }
}
