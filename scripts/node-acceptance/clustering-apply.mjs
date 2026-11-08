import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {matchesExpectedOutput} from './expected-outputs.mjs';
const need=(v,m)=>{if(!v)throw Error('CLUSTERING_APPLY_'+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function applyColdExpected(expected){
 return {...expected,outputs:expected.outputs.map((o,port)=>{
  const order=expected.clustering_apply.cold_column_order[port];
  need(order.length===o.columns.length&&new Set(order).size===order.length&&o.columns.every(f=>order.includes(f.name)),'COLD_ORDER_CONTRACT');
  return {...o,columns:order.map(name=>o.columns.find(f=>f.name===name))};
 })};
}

// Resolve only arbitrary native Cluster labels. Stage-0 means and holdout
// distances stay independent of the native partition and any later training.
export function checkApplyRound(expected,records,{cold=false}={}){
 if(cold)expected=applyColdExpected(expected);
 need(records.length===2&&new Set(records.map(r=>r.output_port)).size===2,'BOTH_PORTS');
 const tables=[0,1].map(port=>{
  const r=records.find(r=>r.output_port===port),d=r.data,w=expected.outputs[port];
  need(r.type==='datamining.clustering'&&d.sample_complete===true&&d.precision?.numbers_verified===true&&d.row_count===d.sample?.length,'COMPLETE_TYPED_TABLE');
  need(same(d.schema.map(({name,type})=>({name,type})),w.columns.map(({name,type})=>({name,type}))),'NATIVE_SCHEMA_ORDER');
  return d.sample.map(cells=>{
   need(cells.length===w.columns.length,'WIDTH');
   return Object.fromEntries(w.columns.map((f,i)=>{
    const c=cells[i];need(c?.is_null===false&&c.type===f.type,'CELL_TYPE_OR_NULL');
    const v=f.type==='string'?c.value:Number(c.value);
    need(f.type==='string'?typeof v==='string':Number.isFinite(v)&&(f.type!=='integer'||Number.isSafeInteger(v)),'SCALAR');
    return [f.name,v];
   }));
  });
 });
 const centers=tables[1],c=expected.clustering_apply;
 need(centers.length===3&&new Set(centers.map(r=>r.Cluster)).size===3,'THREE_CENTERS');
 const ids=c.centers.map(([X,Y])=>{
  const rows=centers.filter(r=>Math.abs(r.X-X)<=1e-8&&Math.abs(r.Y-Y)<=1e-8);
  need(rows.length===1,'SAVED_CENTERS_UNCHANGED');return rows[0].Cluster;
 });
 const outputs=expected.outputs.map(o=>({...o,rows:o.rows.map(r=>({...r,Cluster:ids[expected.outputs[1].rows.findIndex(center=>center.Cluster===r.Cluster)]}))}));
 need(records.every(r=>matchesExpectedOutput(r.data,outputs[r.output_port])),'HOLDOUT_VALUES_TYPES_ORDER');
 return {...expected,outputs};
}

function* receipts(v){
 if(!v||typeof v!=='object')return;
 if(v.status==='SUCCEEDED'&&v.node&&v.output?.ports&&v.execution)yield v;
 for(const child of Object.values(v))if(child&&typeof child==='object')yield* receipts(child);
}
export function checkApplyMain(expected,replies){
 const c=expected.clustering_apply;let trained,applied;
 for(const r of receipts(replies)){
  const config=r.configuration?.readback;
  if(config?.kind!=='clustering'||r.execution.status!=='completed')continue;
  need(r.cleanup_complete===true&&config.clusters===c.clusters&&config.seed===c.seed&&config.normalization==='none'&&same(config.features,c.features),'CONFIGURATION');
  if(config.mode==='k_means'&&config.training?.status==='trained')trained=r;
  if(config.mode!=='apply')continue;
  need(trained&&r.node.node_id===trained.node.node_id&&r.execution.execution_id!==trained.execution.execution_id,'TRAIN_THEN_APPLY_SAME_NODE');
  need(config.training?.status==='not_requested','NO_TRAINING');
  const records=r.output.ports.map(data=>{
   need(data.fresh===true&&data.freshness_basis==='completed_execution_port_source'&&data.execution_id===r.execution.execution_id,'PORT_PROOF');
   return {type:'datamining.clustering',output_port:data.port,data};
  });
  applied=checkApplyRound(expected,records);
 }
 need(applied,'APPLY_RECEIPT');return applied;
}

export async function observeApplySavedSettings({load,channel,expected}){
 const {configureClustering}=await load('client/lib/clustering-procedure.mjs');
 const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs');
 const {closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
 const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
 const selected=await channel.observe({condition:'cold apply selection',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
 await selectPreparedGraphNode(channel,selected,'cold select saved clustering',{refreshReplacedBody:true});
 await openPreparedWizard(channel);
 try{
  const r=await configureClustering(channel,{}, {request:{mode:'apply'}}),c=r.configuration,w=expected.clustering_apply;
  need(c.mode==='apply'&&c.clusters===w.clusters&&c.seed===w.seed&&same(c.fields.filter(f=>f.usage_type===3).map(f=>f.name),w.features)&&c.normalization.every(f=>f.norm_type===0),'SAVED_SETTINGS');
  return {mode:'apply',clusters:c.clusters,seed:c.seed,settings_applied:false};
 }finally{
  const closed=await closePreparedWizard(channel);need(closed.verified&&closed.cleanup_complete&&closed.settings_applied===false,'CANCEL');
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const e=JSON.parse(await readFile(process.argv[2],'utf8')),r=JSON.parse(await readFile(process.argv[3],'utf8'));
 await writeFile(process.argv[4],JSON.stringify(checkApplyMain(e,r),null,2));
 console.log('PASS: saved centers, full holdout values, types/order and no Teach on apply');
}
