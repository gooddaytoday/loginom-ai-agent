import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {matchesExpectedOutput} from './expected-outputs.mjs';
const need=(v,m)=>{if(!v)throw Error('ASSNRULES_HOLDOUT_'+m);};
function* receipts(value){
 if(!value||typeof value!=='object')return;
 if(value.status==='SUCCEEDED'&&value.node&&value.execution&&value.output?.ports)yield value;
 for(const child of Object.values(value))if(child&&typeof child==='object')yield* receipts(child);
}
export function checkAssnRulesHoldout(expected,replies){
 let trained,applied;const seen=new Set();
 for(const r of receipts(replies)){
  const c=r.configuration?.readback;
  if(c?.kind!=='assn_rules'||r.execution.status!=='completed'||seen.has(r.execution.execution_id))continue;
  seen.add(r.execution.execution_id);
  if(c.mode==='fp_growth'&&c.training?.status==='trained'){
   need(!applied,'NO_RETRAIN_AFTER_APPLY');trained=r;continue;
  }
  if(c.mode!=='apply')continue;
  need(trained&&JSON.stringify(r.node)===JSON.stringify(trained.node)&&r.execution.execution_id!==trained.execution.execution_id,'TRAIN_THEN_APPLY_SAME_NODE');
  need(r.cleanup_complete===true&&c.training?.status==='not_requested','NO_TRAINING');
  for(const key of ['transaction_field','item_field','min_support_pct','min_confidence_pct','max_items','min_lift','consequence_limit'])
   need(c[key]===trained.configuration.readback[key],'SAVED_SETTINGS_'+key);
  need(expected.outputs.every(w=>{
   const p=r.output.ports.find(p=>p.port===w.output_port);
   return p?.fresh===true&&p.freshness_basis==='completed_execution_port_source'&&p.execution_id===r.execution.execution_id&&matchesExpectedOutput(p,w);
  }),'COMPLETE_RULES_AND_RECOMMENDATIONS');
  applied=r;
 }
 need(applied,'APPLY_RECEIPT');
 return {node:applied.node,training_execution_id:trained.execution.execution_id,apply_execution_id:applied.execution.execution_id};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [expected,replies]=await Promise.all(process.argv.slice(2,4).map(async p=>JSON.parse(await readFile(p,'utf8'))));
 console.log(JSON.stringify(checkAssnRulesHoldout(expected,replies)));
}
