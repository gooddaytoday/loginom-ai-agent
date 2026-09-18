// Final tables remain complete. An operator may omit a large intermediate
// table only while retaining its execution/settings audit and naming complete
// downstream final outputs. This is not a full read of the intermediate data.
export function validateAuditReadScope(plan) {
 const need=(v,m)=>{if(!v)throw Error(m);};
 const outputs=new Map(plan.outputs.map(o=>[o.name,o]));
 need(outputs.size===plan.outputs.length,'Audit output names must be unique');
 const reaches=(from,to)=>{
  const visited=new Set([from]),queue=[from];
  while(queue.length){const current=queue.shift();for(const e of plan.expected_graph.links){
   if(e.source!==current||visited.has(e.target))continue;
   if(e.target===to)return true;visited.add(e.target);queue.push(e.target);
  }}return false;
 };
 for(const output of plan.outputs){
  if(!output.configuration_only||output.type==='exports.text')continue;
  need(plan.operator_reviewed===true&&plan.inspect_configuration===true&&output.audit_role==='intermediate'
   &&output.type!=='imports.text'&&typeof output.read_omission_reason==='string'
   &&output.read_omission_reason.trim().length>0&&output.read_omission_reason.length<=500,
   'Intermediate read omission requires explicit operator scope and settings audit');
  need(Array.isArray(output.covered_by)&&output.covered_by.length>0&&new Set(output.covered_by).size===output.covered_by.length,
   'Intermediate read omission requires named complete final tables');
  for(const name of output.covered_by){const final=outputs.get(name);
   need(final&&final.audit_role==='final'&&final.configuration_only!==true&&final.type!=='exports.text'
    &&final.node_id!==output.node_id&&reaches(output.node_id,final.node_id),
    'Read omission must lead to a complete downstream final table');
  }
 }
 return true;
}
