const need=(v,m)=>{if(!v)throw Error(m);};
export function parseExpectedOutputs(expected){
 need(expected&&typeof expected.package_path==='string'&&expected.package_path.endsWith('.lgp'),'EXPECTED_PACKAGE_PATH_REQUIRED');
 need(Array.isArray(expected.nodes),'EXPECTED_SHAPE_INVALID');
 const multiple=Object.hasOwn(expected,'outputs');
 need(!multiple||!['columns','rows','output_node_type'].some(k=>Object.hasOwn(expected,k)),'EXPECTED_MIXED_OUTPUT_FORMS');
 const fields=['output_node_type','output_node_label','columns','rows','ordered','output_port'];
 const outputs=multiple?expected.outputs:[Object.fromEntries(fields.filter(k=>Object.hasOwn(expected,k)).map(k=>[k,expected[k]]))];
 need(Array.isArray(outputs)&&outputs.length>0&&outputs.length<=32,'EXPECTED_OUTPUTS_INVALID');
 for(const output of outputs){
  need(output&&Object.keys(output).every(k=>fields.includes(k))
   &&(!Object.hasOwn(output,'ordered')||typeof output.ordered==='boolean')
   &&(!Object.hasOwn(output,'output_port')||Number.isSafeInteger(output.output_port)&&output.output_port>=0)
   &&(output.output_node_label===undefined||typeof output.output_node_label==='string'&&output.output_node_label.length>0)
   &&typeof output.output_node_type==='string'&&output.output_node_type.length>0
   &&Array.isArray(output.columns)&&output.columns.length>0&&output.columns.length<=1000
   &&Array.isArray(output.rows)&&output.rows.length<=100,'EXPECTED_SHAPE_INVALID');
  const names=output.columns.map(c=>c.name);
  need(new Set(names).size===names.length&&output.columns.every(c=>typeof c.name==='string'&&c.name.length>0
   &&typeof (c.label??c.name)==='string'&&['string','integer','real','boolean','datetime','variant'].includes(c.type)),'EXPECTED_COLUMNS_INVALID');
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
 return {multiple,outputs};
}
export function matchesExpectedOutput(data,expected){
 if(data.row_count!==expected.rows.length||!data.sample_complete||!data.precision?.numbers_verified
  ||data.sample?.length!==expected.rows.length||data.schema?.length!==expected.columns.length)return false;
 if(expected.columns.some((c,i)=>data.schema[i].name!==c.name||data.schema[i].label!==(c.label??c.name)||data.schema[i].type!==c.type))return false;
 const indices=new Map(data.schema.map((f,i)=>[f.name,i]));
 if(indices.size!==expected.columns.length||expected.columns.some(c=>{
  const f=data.schema[indices.get(c.name)];return !f||f.label!==(c.label??c.name)||f.type!==c.type;
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
export function matchExpectedOutputs(actual,outputs,{allowExtraPortReads=false}={}){
 need(allowExtraPortReads?actual.length>=outputs.length:actual.length===outputs.length,'COLD_EXTRA_OR_MISSING_OUTPUT_NODE');
 need(new Set(actual.map(a=>JSON.stringify([a.node.node_id,a.output_port??0]))).size===actual.length,'COLD_DUPLICATE_OUTPUT_PORT');
 const used=new Set(),matches=[];
 for(const [index,want] of outputs.entries()){
  const port=want.output_port??0;
  const candidates=actual.filter(a=>a.type===want.output_node_type&&(a.output_port??0)===port
   &&(want.output_node_label===undefined||a.label===want.output_node_label)&&matchesExpectedOutput(a.data,want));
  const key=candidates.length===1?JSON.stringify([candidates[0].node.node_id,port]):undefined;
  need(candidates.length===1&&!used.has(key),'COLD_OUTPUT_NOT_UNIQUELY_MATCHED');
  used.add(key);matches.push({expected_index:index,node:candidates[0].node,output_port:port,execution:candidates[0].execution});
 }
 // The cold reader may inspect requested ports on indistinguishable nodes
 // before values identify each report. Every observed node must be used.
 need(actual.every(a=>matches.some(m=>m.node.node_id===a.node.node_id)),'COLD_EXTRA_OR_MISSING_OUTPUT_NODE');
 return matches;
}
