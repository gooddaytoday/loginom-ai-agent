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
   &&typeof (c.label??c.name)==='string'&&['string','integer','real','boolean','datetime'].includes(c.type)),'EXPECTED_COLUMNS_INVALID');
  need(output.rows.every(r=>r&&Object.keys(r).length===names.length&&names.every(n=>Object.hasOwn(r,n))), 'EXPECTED_ROWS_INVALID');
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
 const rows=data.sample.map(row=>expected.columns.map(c=>{
  const cell=row[indices.get(c.name)];if(!cell||cell.type!==c.type)return Symbol('invalid');
  if(cell.is_null)return cell.value===null?null:Symbol('invalid');
  if(c.type==='integer'){
   if(typeof cell.value!=='string'||!/^[-]?[0-9]+$/.test(cell.value))return Symbol('invalid');
   const number=Number(cell.value);return Number.isSafeInteger(number)?number:cell.value;
  }
  return cell.value;
 }));
 const unused=rows.slice();
 for(const want of expected.rows){
  const index=unused.findIndex(row=>expected.columns.every((c,i)=>Object.is(row[i],want[c.name])||row[i]===want[c.name]));
  if(index<0)return false;unused.splice(index,1);
 }
 return unused.length===0;
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
