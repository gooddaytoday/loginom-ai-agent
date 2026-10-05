// Reader choice uses the independently observed owned Preview definition,
// never an expected result or inferred category combinations.
export function coldNativeEligible(configuration, output) {
 if (!configuration || output?.verified !== true || output.inventory_complete !== true
  || output.node_context?.verified !== true
  || !['document_id','workflow_id','node_id'].every(k=>typeof configuration.node_context?.[k]==='string' && configuration.node_context[k]===output.node_context?.[k])
  || output.port !== 0 || output.node_id !== configuration.node_context.node_id || !Array.isArray(output.fields)) return false;
 // Native DateTime supplies bytes, not inferred civil dates.
 return output.fields.length>0 && output.fields.length<=8
  && output.fields.every(f=>['string','integer','real','boolean','variant'].includes(f.type));
}
