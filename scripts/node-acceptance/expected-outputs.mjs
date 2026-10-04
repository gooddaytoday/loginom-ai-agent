const need=(v,m)=>{if(!v)throw Error(m);};
export function parseExpectedOutputs(expected){
 need(expected&&typeof expected.package_path==='string'&&expected.package_path.endsWith('.lgp'),'EXPECTED_PACKAGE_PATH_REQUIRED');
 need(Array.isArray(expected.nodes),'EXPECTED_SHAPE_INVALID');
 const multiple=Object.hasOwn(expected,'outputs');
 need(!multiple||!['columns','rows','output_node_type'].some(k=>Object.hasOwn(expected,k)),'EXPECTED_MIXED_OUTPUT_FORMS');
 const outputs=multiple?expected.outputs:[{output_node_type:expected.output_node_type,columns:expected.columns,rows:expected.rows}];
 need(Array.isArray(outputs)&&outputs.length>0&&outputs.length<=16,'EXPECTED_OUTPUTS_INVALID');
 for(const output of outputs){
  need(output&&Object.keys(output).sort().join(',')==='columns,output_node_type,rows'
   &&typeof output.output_node_type==='string'&&output.output_node_type.length>0
   &&Array.isArray(output.columns)&&output.columns.length>0&&output.columns.length<=1000
   &&Array.isArray(output.rows)&&output.rows.length<=100,'EXPECTED_SHAPE_INVALID');
  const names=output.columns.map(c=>c.name);
  need(new Set(names).size===names.length&&output.columns.every(c=>typeof c.name==='string'&&c.name.length>0
   &&typeof (c.label??c.name)==='string'&&['string','integer','real','boolean','datetime','variant'].includes(c.type)),'EXPECTED_COLUMNS_INVALID');
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
 const indices=new Map(data.schema.map((f,i)=>[f.name,i]));
 if(indices.size!==expected.columns.length||expected.columns.some(c=>{
  const f=data.schema[indices.get(c.name)];return !f||f.label!==(c.label??c.name)||f.type!==c.type;
 }))return false;
 const unused=data.sample.slice();
 for(const want of expected.rows){
  const index=unused.findIndex(row=>expected.columns.every(c=>matchesCell(row[indices.get(c.name)],c,want[c.name])));
  if(index<0)return false;unused.splice(index,1);
 }
 return unused.length===0;
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
 let value=cell.value;
 if(type==='integer'){
  if(typeof value!=='string'||!/^[-]?[0-9]+$/.test(value))return false;
  const n=Number(value);value=Number.isSafeInteger(n)?n:value;
 }else if(type==='real'&&cell.precision==='exact_native'){
  if(typeof value!=='string'||!Number.isFinite(Number(value)))return false;
  value=Number(value);
 }
 // Independent sample-variance arithmetic and Loginom's binary64 algorithm
 // may round StdDev on adjacent representable values. Keep this allowance
 // confined to that derived scalar; sums, counts and Variant remain exact.
 if(column.type==='real'&&column.name.endsWith('_StdDev')&&typeof value==='number'&&typeof want==='number'
  &&Number.isFinite(value)&&Number.isFinite(want)&&Math.abs(value-want)<=2*Number.EPSILON*Math.abs(want))return true;
 return Object.is(value,want)||value===want;
}
export function matchExpectedOutputs(actual,outputs){
 need(actual.length===outputs.length,'COLD_EXTRA_OR_MISSING_OUTPUT_NODE');
 const used=new Set(),matches=[];
 for(const [index,want] of outputs.entries()){
  const candidates=actual.filter(a=>a.type===want.output_node_type&&matchesExpectedOutput(a.data,want));
  need(candidates.length===1&&!used.has(candidates[0].node.node_id),'COLD_OUTPUT_NOT_UNIQUELY_MATCHED');
  used.add(candidates[0].node.node_id);matches.push({expected_index:index,node:candidates[0].node,execution:candidates[0].execution});
 }
 return matches;
}
