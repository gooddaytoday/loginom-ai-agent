// Reader choice uses the independently observed owned output definition,
// never an expected result or an inferred number of category combinations.
export function coldNativeEligible(configuration, output) {
 if (!configuration || output?.verified !== true || output.inventory_complete !== true
  || !['document_id','workflow_id','node_id'].every(k=>output.node_context?.[k]===configuration.node_context?.[k])
  || output.node_context?.output_port?.port !== 0 || !Array.isArray(output.target_fields)
  || output.target_fields.length === 0 || output.target_fields.length > 128) return false;
 const fields=output.target_fields.filter(f=>f.excluded!==true);
 // Native DateTime deliberately supplies bytes, not inferred civil dates.
 // Civil DateTime expectations retain the existing formatted reader.
 return fields.length>0 && fields.length<=8 && fields.every(f=>['string','integer','real','boolean','variant'].includes(f.type));
}
