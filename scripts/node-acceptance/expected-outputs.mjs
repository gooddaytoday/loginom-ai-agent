const need=(v,m)=>{if(!v)throw Error(m);};
// Read the first CSV record, including quoted separators/newlines and UTF-8 BOM.
// The complete downloaded file is checked by the scenario's file oracle.
export function parseExportCsvHeader(text,delimiter=','){
 need(typeof text==='string'&&text.length<=16777216&&[',',';','\t'].includes(delimiter),'COLD_EXPORT_CSV_INVALID');
 const fields=[];let value='',quoted=false,closed=false;
 if(text.startsWith('\uFEFF'))text=text.slice(1);
 for(let i=0;i<text.length;i++){
  need(i<65536,'COLD_EXPORT_CSV_HEADER_BOUND');
  const c=text[i];
  if(quoted){
   if(c!=='"'){value+=c;continue;}
   if(text[i+1]==='"'){value+='"';i++;continue;}
   quoted=false;closed=true;continue;
  }
  if(c===delimiter){fields.push(value);value='';closed=false;continue;}
  if(c==='\r'||c==='\n'){fields.push(value);return fields;}
  need(!closed,'COLD_EXPORT_CSV_INVALID');
  if(c==='"'){need(value==='','COLD_EXPORT_CSV_INVALID');quoted=true;continue;}
  value+=c;
 }
 need(!quoted&&text.length>0,'COLD_EXPORT_CSV_INVALID');
 fields.push(value);return fields;
}
export function parseExpectedOutputs(expected){
 need(expected&&typeof expected.package_path==='string'&&expected.package_path.endsWith('.lgp'),'EXPECTED_PACKAGE_PATH_REQUIRED');
 need(Array.isArray(expected.nodes),'EXPECTED_SHAPE_INVALID');
 const multiple=Object.hasOwn(expected,'outputs');
 need(!multiple||!['columns','rows','output_node_type'].some(k=>Object.hasOwn(expected,k)),'EXPECTED_MIXED_OUTPUT_FORMS');
 const fields=['output_node_type','output_node_label','columns','rows','ordered','output_port','column_order','export_destination'];
 const outputs=multiple?expected.outputs:[Object.fromEntries(fields.filter(k=>Object.hasOwn(expected,k)).map(k=>[k,expected[k]]))];
 need(Array.isArray(outputs)&&outputs.length>0&&outputs.length<=32,'EXPECTED_OUTPUTS_INVALID');
 for(const output of outputs){
  need(output&&Object.keys(output).every(k=>fields.includes(k))
   &&(!Object.hasOwn(output,'ordered')||typeof output.ordered==='boolean')
   &&(!Object.hasOwn(output,'column_order')||['exact','any'].includes(output.column_order))
   &&(!Object.hasOwn(output,'output_port')||Number.isSafeInteger(output.output_port)&&output.output_port>=0)
   &&(output.output_node_label===undefined||typeof output.output_node_label==='string'&&output.output_node_label.length>0)
   &&typeof output.output_node_type==='string'&&output.output_node_type.length>0
   &&Array.isArray(output.columns)&&output.columns.length>0&&output.columns.length<=1000
   &&Array.isArray(output.rows)&&output.rows.length<=100,'EXPECTED_SHAPE_INVALID');
  need(output.output_node_type!=='export_input'||!['output_port','output_node_label'].some(k=>Object.hasOwn(output,k)),
   'EXPECTED_EXPORT_INPUT_OPTIONS_INVALID');
  need(output.output_node_type!=='table_content'||!['output_port','output_node_label'].some(k=>Object.hasOwn(output,k)),
   'EXPECTED_CONTENT_OPTIONS_INVALID');
  if(Object.hasOwn(output,'export_destination'))need(output.output_node_type==='export_input'
   &&typeof output.export_destination==='string'&&/^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+$/.test(output.export_destination)
   &&!output.export_destination.split('/').some(p=>p==='.'||p==='..'),'EXPECTED_EXPORT_DESTINATION_INVALID');
  const names=output.columns.map(c=>c.name);
  need(new Set(names).size===names.length&&output.columns.every(c=>typeof c.name==='string'&&c.name.length>0
   &&typeof (c.label??c.name)==='string'&&['string','integer','real','boolean','datetime','variant'].includes(c.type)
   &&(!Object.hasOwn(c,'label_any')||typeof c.label_any==='boolean')),'EXPECTED_COLUMNS_INVALID');
  for(const c of output.columns)if(Object.hasOwn(c,'tolerance')){
   const t=c.tolerance;
   need(c.type==='real'&&t&&typeof t==='object'&&!Array.isArray(t)&&Object.keys(t).length>0
    &&Object.keys(t).every(k=>['abs','rel'].includes(k)&&typeof t[k]==='number'&&Number.isFinite(t[k])&&t[k]>=0),
    'EXPECTED_TOLERANCE_INVALID');
  }
  need(output.rows.every(r=>r&&Object.keys(r).length===names.length&&names.every(n=>Object.hasOwn(r,n))), 'EXPECTED_ROWS_INVALID');
  for(const row of output.rows)for(const c of output.columns)if(c.type==='variant'&&row[c.name]!==null){
   const v=row[c.name];need(v&&typeof v==='object'&&['string','boolean','real','integer','datetime'].includes(v.cell_type)
    &&(Object.hasOwn(v,'value')||/^[a-f0-9]{16}$/.test(v.bytes_le??'')),'EXPECTED_VARIANT_SUBTYPE_REQUIRED');
  }
 }
 need(!outputs.some(o=>Object.hasOwn(o,'export_destination'))||outputs.filter(o=>o.output_node_type==='export_input').length===1,'EXPECTED_EXPORT_INPUT_OPTIONS_INVALID');
 // Compatibility with the coefficient oracles: once nodes no longer requires
 // Regression, its old port-1 selector must not reintroduce that requirement.
 // Explicit node requirements and unrelated typed outputs retain their meaning.
 return {multiple,outputs:outputs.map(output=>{
  if(output.output_node_type!=='datamining.lin_regression'||output.output_port!==1
   ||output.output_node_label!==undefined||expected.nodes.some(n=>n.type===output.output_node_type)
   ||output.columns.length!==2||!output.columns.some(c=>c.name==='Name'&&c.type==='string')
   ||!output.columns.some(c=>c.name.endsWith('_coefficients')&&c.type==='real'))return output;
  const {output_port,...content}=output;
  return {...content,output_node_type:'table_content'};
 })};
}
export function selectColdOutputReads(graph,outputs,{exportInput,savedNode}={}){
 // Without a prescribed node/port, only reading all exposed tabular outputs
 // can establish both presence and uniqueness. Read failures remain failures.
 const content=outputs.some(o=>o.output_node_type==='table_content');
 const types=new Set(outputs.filter(o=>o.output_node_type!=='table_content').map(o=>o.output_node_type));
 const nodes=graph.nodes.filter(n=>types.has(n.type)&&(!savedNode||n.ref.node_id===savedNode)
  ||exportInput&&n.ref.node_id===exportInput.node.ref.node_id||content&&n.outputs.length>0);
 need(nodes.length>0&&(content||nodes.length<=outputs.length),'COLD_EXTRA_OR_MISSING_OUTPUT_NODE');
 return nodes.map(node=>{
  const requested=outputs.filter(o=>o.output_node_type===node.type
   &&(o.output_node_label===undefined||o.output_node_label===node.label)).map(o=>o.output_port??0)
   .concat(exportInput&&node.ref.node_id===exportInput.node.ref.node_id?[exportInput.output_port]:[]);
  const ports=[...new Set(requested.concat(content?node.outputs:[]))];
  need(ports.length>0,'COLD_EXTRA_OR_MISSING_OUTPUT_NODE');
  return {node,ports:ports.map(port=>({port,content_candidate:!requested.includes(port)}))};
 });
}
export function resolveExportInput(graph,{destination,destinations}={}){
 const error='COLD_EXTRA_OR_MISSING_OUTPUT_NODE';
 need(graph?.complete===true&&Array.isArray(graph.nodes)&&Array.isArray(graph.links),error);
 let exports=graph.nodes.filter(n=>n.type==='exports.text');
 if(destination!==undefined){
  need(Array.isArray(destinations)&&destinations.length===exports.length
   &&new Set(destinations.map(d=>d.node_id)).size===exports.length
   &&exports.every(n=>destinations.some(d=>d.node_id===n.ref.node_id&&typeof d.destination==='string')),error);
  exports=exports.filter(n=>destinations.some(d=>d.node_id===n.ref.node_id&&d.destination===destination));
 }
 need(exports.length===1,error);
 const incoming=graph.links.filter(l=>l.target===exports[0].ref.node_id);
 need(incoming.length===1&&incoming[0].input===0&&Number.isSafeInteger(incoming[0].output)&&incoming[0].output>=0,error);
 const sources=graph.nodes.filter(n=>n.ref.node_id===incoming[0].source);
 need(sources.length===1&&Array.isArray(sources[0].outputs)&&sources[0].outputs.includes(incoming[0].output),error);
 const input_fields=destinations?.find(d=>d.node_id===exports[0].ref.node_id)?.input_fields;
 return {node:sources[0],output_port:incoming[0].output,export_node_id:exports[0].ref.node_id,...(input_fields?{input_fields}:{})};
}
// export_input is the saved export's input layout, not the temporary Table's
// display order. Reorder only from the independently observed unchanged mapping.
function exportInputData(data,fields){
 if(!fields)return data;
 if(!Array.isArray(fields)||fields.length!==data.schema?.length||!fields.length
  ||new Set(fields.map(f=>f.source_name)).size!==fields.length)return {...data,schema:[]};
 const indices=fields.map(f=>data.schema.findIndex(c=>c.name===f.source_name&&f.name===f.source_name&&c.type===f.type));
 if(indices.some(i=>i<0)||new Set(indices).size!==indices.length)return {...data,schema:[]};
 return {...data,schema:indices.map((i,index)=>({...data.schema[i],index})),sample:data.sample?.map(row=>indices.map(i=>row[i]))};
}
export function matchesExpectedOutput(data,expected){
 if(data.row_count!==expected.rows.length||!data.sample_complete||!data.precision?.numbers_verified
  ||data.sample?.length!==expected.rows.length||data.schema?.length!==expected.columns.length)return false;
 if(expected.column_order==='exact'&&expected.columns.some((c,i)=>data.schema[i].name!==c.name||!c.label_any&&data.schema[i].label!==(c.label??c.name)||data.schema[i].type!==c.type))return false;
 const indices=new Map(data.schema.map((f,i)=>[f.name,i]));
 if(indices.size!==expected.columns.length||expected.columns.some(c=>{
  const f=data.schema[indices.get(c.name)];return !f||!c.label_any&&f.label!==(c.label??c.name)||f.type!==c.type;
 }))return false;
 const matchesRow=(row,want)=>expected.columns.every(c=>matchesCell(row[indices.get(c.name)],c,want[c.name]));
 if(expected.ordered)return expected.rows.every((want,i)=>matchesRow(data.sample[i],want));
 // Tolerance ranges can overlap: a greedy first match can consume the only
 // row suitable for a later expectation. Reassign along an augmenting path.
 const owners=new Map();
 const assign=(wantIndex,seen)=>{
  for(const [i,row] of data.sample.entries()){
   if(seen.has(i)||!matchesRow(row,expected.rows[wantIndex]))continue;
   seen.add(i);
   if(!owners.has(i)||assign(owners.get(i),seen)){owners.set(i,wantIndex);return true;}
  }
  return false;
 };
 return expected.rows.every((_,i)=>assign(i,new Set()));
}
function matchesCell(cell,column,want){
 if(!cell||cell.type!==column.type)return false;
 const nativeRequired=column.type==='variant'||want&&typeof want==='object';
 if(nativeRequired){
  const tags={null:1,real:5,datetime:7,string:8,boolean:11,integer:20};
  if(cell.precision!=='exact_native'||cell.native?.tag!==tags[cell.cell_type])return false;
 }
 if(want===null)return cell.is_null===true&&cell.value===null&&(!nativeRequired||cell.cell_type==='null');
 if(cell.is_null)return false;
 const type=column.type==='variant'?want.cell_type:column.type;
 if(nativeRequired){
  if(cell.cell_type!==type)return false;
  if(want.bytes_le!==undefined&&cell.native.bytes_le!==want.bytes_le)return false;
  if(type==='datetime'&&(cell.native.temporal_profile!=='loginom-7.4.2-native-oadate'||cell.native.semantic_scope!=='native_serial_only'))return false;
  if(!Object.hasOwn(want,'value'))return typeof want.bytes_le==='string';
  want=want.value;
 }
 if(type==='datetime'&&!nativeRequired){
  if(typeof want!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/.test(want)
   ||cell.precision!=='millisecond'||cell.representation!=='local_datetime'||cell.timezone!=='unspecified')return false;
 }
 let value=cell.value;
 if(type==='integer'){
  if(typeof value!=='string'||!/^[-]?[0-9]+$/.test(value))return false;
  const n=Number(value);value=Number.isSafeInteger(n)?n:value;
 }else if(type==='real'&&cell.precision==='exact_native'){
  if(typeof value!=='string'||!Number.isFinite(Number(value)))return false;
  value=Number(value);
 }
 if(column.type==='real'&&column.tolerance){
  if(typeof value!=='number'||!Number.isFinite(value)||typeof want!=='number'||!Number.isFinite(want))return false;
  const difference=Math.abs(value-want),abs=column.tolerance.abs??0,rel=column.tolerance.rel??0;
  // Opposite finite extremes can overflow their difference and the limit.
  return Number.isFinite(difference)?difference<=Math.max(abs,rel*Math.abs(want))
   :Math.abs(value/2-want/2)<=Math.max(abs/2,rel*(Math.abs(want)/2));
 }
 return Object.is(value,want)||value===want;
}
export function matchExpectedOutputs(actual,outputs,{allowExtraPortReads=false,exportInput,exportCsv}={}){
 need(allowExtraPortReads?actual.length>=outputs.length:actual.length===outputs.length,'COLD_EXTRA_OR_MISSING_OUTPUT_NODE');
 need(new Set(actual.map(a=>JSON.stringify([a.node.node_id,a.output_port??0]))).size===actual.length,'COLD_DUPLICATE_OUTPUT_PORT');
 const used=new Set(),matches=[];
 const contentOutputs=outputs.filter(o=>o.output_node_type==='table_content');
 for(const [index,want] of outputs.entries()){
  const port=want.output_node_type==='export_input'?exportInput?.output_port:want.output_port??0;
  const csvOrder=want.output_node_type==='export_input'&&want.column_order==='exact'&&exportCsv!==undefined;
  const content=want.output_node_type==='table_content';
  const candidates=content?actual.filter(a=>matchesContentSchema(a.data,want)):actual.filter(a=>(want.output_node_type==='export_input'
   ?exportInput&&a.node.node_id===exportInput.node.ref.node_id&&(a.output_port??0)===exportInput.output_port
   :a.type===want.output_node_type&&(a.output_port??0)===port
    &&(want.output_node_label===undefined||a.label===want.output_node_label))
     &&(!csvOrder||matchesExportCsvOrder(a.data,want,exportCsv))
     &&matchesExpectedOutput(want.output_node_type==='export_input'?exportInputData(a.data,exportInput?.input_fields):a.data,
      csvOrder?{...want,column_order:'any'}:want));
  const matchedPort=content?candidates[0]?.output_port??0:port;
  const key=candidates.length===1?JSON.stringify([candidates[0].node.node_id,matchedPort]):undefined;
  need(candidates.length===1&&!used.has(key)&&(!content||matchesExpectedOutput(candidates[0].data,want)),
   'COLD_OUTPUT_NOT_UNIQUELY_MATCHED');
  used.add(key);matches.push({expected_index:index,node:candidates[0].node,output_port:matchedPort,execution:candidates[0].execution});
 }
 // The cold reader may inspect requested ports on indistinguishable nodes
 // before values identify each report. Only explicitly marked discovery reads
 // with unrelated schemas may be unused; extra coefficient tables still refuse.
 need(actual.every(a=>matches.some(m=>m.node.node_id===a.node.node_id)
  ||allowExtraPortReads&&contentOutputs.length>0&&a.content_candidate===true
   &&!contentOutputs.some(want=>matchesContentSchema(a.data,want))),'COLD_EXTRA_OR_MISSING_OUTPUT_NODE');
 return matches;
}
function matchesContentSchema(data,want){
 return data.schema?.length===want.columns.length&&new Set(data.schema.map(c=>c.name)).size===want.columns.length
  &&want.columns.every(c=>data.schema.some(f=>f.name===c.name&&f.type===c.type));
}
function matchesExportCsvOrder(data,want,csv){
 if(!['names','labels'].includes(csv?.header)||!Array.isArray(csv.columns))return false;
 const columns=want.columns.map(c=>csv.header==='names'?c.name:data.schema.find(f=>f.name===c.name)?.label);
 // Duplicate labels cannot prove which source column occupies a CSV position.
 return columns.every(c=>typeof c==='string')&&new Set(columns).size===columns.length
  &&csv.columns.length===columns.length&&columns.every((c,i)=>csv.columns[i]===c);
}
