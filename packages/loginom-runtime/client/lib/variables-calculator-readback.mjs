// Only verified native configuration and lifecycle receipts enter this view.
// Scalar output values, port identities and cold persistence belong to W1.
export function variablesCalculatorConfigurationReadback({node,phases,operation_id}) {
 const need=(ok,message)=>{if(!ok)throw Error('Variables calculator readback: '+message);};
 const owner=c=>c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>typeof node[k]==='string'&&c[k]===node[k]);
 const receipt=phase=>{
  const found=phases.filter(p=>p.phase===phase),p=found[0];
  need(found.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+phase
   &&p.value?.verified===true&&p.value.cleanup_complete===true,'unique verified '+phase+' receipt required');return p;
 };
 const configured=receipt('configure'),finished=receipt('finish'),c=configured.value.configuration;
 need(c?.verified===true&&c.inventory_complete===true&&c.mode==='expression'&&owner(c.node_context),'complete same-owner configuration required');
 need(configured.value.syntax_validation?.status==='accepted_by_loginom_next'
  &&owner(configured.value.syntax_validation.node_context),'native syntax validation required');
 need(finished.value.settings_applied===true&&['done','execute'].includes(finished.value.mode)
  &&owner(finished.value.node_context),'verified finish required');
 need(Array.isArray(c.expressions)&&c.expressions.length>0&&c.expressions.length<=32
  &&c.expressions.every((e,i)=>e.index===i&&typeof e.name==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(e.name)
   &&typeof e.label==='string'&&['integer','real','string','boolean'].includes(e.type)
   &&typeof e.formula==='string'&&e.formula.trim().length>0&&e.formula.length<=2048&&!/[\r\0]/.test(e.formula)
   &&typeof e.description==='string'&&typeof e.intermediate==='boolean')
  &&new Set(c.expressions.map(e=>e.name.toLowerCase())).size===c.expressions.length,'incomplete expressions');
 return {kind:'variables_calculator',scope:'observed_before_verified_finish',values_are:'observed_ui_values',
  node:structuredClone(node),receipt_ids:[configured.receipt_id,finished.receipt_id],mode:'expression',
  expressions:c.expressions.map(e=>Object.fromEntries(['index','name','label','type','formula','description','intermediate'].map(k=>[k,e[k]]))),
  syntax_validation:'accepted_by_loginom_next',package_persistence_verified:false};
}
