// Advisory projection of verified native settings. Never rewrite a formula or
// infer that an entire calculation is exact from the absence of this warning.
// Only a leading Round call is recognized; this is not an expression parser.
export function calculatorPrecisionWarnings(node) {
  const r=node?.configuration?.readback;
  if(r?.kind!=='calculator'||r.values_are!=='observed_ui_values'
    ||r.scope!=='observed_before_verified_finish'
    ||!['document_id','workflow_id','node_id'].every(k=>node.node?.[k]&&r.node?.[k]===node.node[k])
    ||!Array.isArray(r.expressions)||!Array.isArray(r.output_mapping?.fields))return [];
  const names=[];
  for(const e of r.expressions){
    if(!['integer','real'].includes(e.type)||typeof e.formula!=='string'||!/^\s*Round\s*\(/i.test(e.formula))continue;
    const fields=r.output_mapping.fields.filter(f=>f.source_name===e.name&&f.excluded===false);
    if(fields.length===1&&typeof fields[0].name==='string'&&fields[0].name.length<=128)names.push(fields[0].name);
  }
  if(!names.length)return [];
  return ['Formula rounding: '+JSON.stringify(names.slice(0,8))+(names.length>8?' (and more fields)':'')
    +' use Round in their observed formula. Exact-number reading preserves these already rounded values; it cannot restore digits removed by the formula. For downstream means, ratios and differences use unrounded inputs unless the task explicitly requires intermediate rounding. Round only the final presentation value.'];
}
