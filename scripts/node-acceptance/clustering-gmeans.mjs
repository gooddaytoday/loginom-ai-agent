import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {matchesExpectedOutput} from './expected-outputs.mjs';

const need=(v,m)=>{if(!v)throw Error('CLUSTERING_GMEANS_'+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// The stage-0 oracle prescribes bounds and geometric invariants, never a true k.
// Only membership labels come from the native result; all values are recomputed.
export function checkGmeansRound(expected,records){
 const c=expected.clustering_gmeans;
 need(records.length===2&&new Set(records.map(r=>r.output_port)).size===2,'BOTH_PORTS');
 const tables=[0,1].map(port=>{
  const r=records.find(r=>r.output_port===port),data=r.data,want=expected.outputs[port];
  need(r.type==='datamining.clustering'&&data?.sample_complete===true&&data.precision?.numbers_verified===true&&data.row_count===data.sample?.length,'COMPLETE_TYPED_TABLE');
  need(same(data.schema.map(f=>({name:f.name,type:f.type})),want.columns.map(f=>({name:f.name,type:f.type}))),'NATIVE_SCHEMA_ORDER');
  return data.sample.map(cells=>{
   need(cells.length===want.columns.length,'WIDTH');
   return Object.fromEntries(want.columns.map((f,i)=>{
    const cell=cells[i];need(cell?.is_null===false&&cell.type===f.type,'CELL_TYPE_OR_NULL');
    const value=f.type==='string'?cell.value:Number(cell.value);
    need(f.type==='string'?typeof value==='string':Number.isFinite(value)&&(f.type!=='integer'||Number.isSafeInteger(value)),'SCALAR');
    return [f.name,value];
   }));
  });
 });
 const [assigned,centers]=tables;
 need(assigned.length===c.source.length&&new Set(assigned.map(r=>r.RowID)).size===c.source.length,'MEMBERSHIP');
 need(centers.length>=c.min_clusters&&centers.length<=c.max_clusters&&new Set(centers.map(r=>r.Cluster)).size===centers.length,'CLUSTER_COUNT');
 need(assigned.every((r,i)=>c.source[i].RowID===r.RowID&&Object.keys(c.source[i]).every(k=>r[k]===c.source[i][k])&&centers.some(v=>v.Cluster===r.Cluster)),'EXACT_SOURCE_ORDER');
 const means=centers.map(center=>{
  const rows=assigned.filter(r=>r.Cluster===center.Cluster);need(rows.length>0,'EMPTY_CLUSTER');
  return {Cluster:center.Cluster,...Object.fromEntries(c.features.map(k=>[k,rows.reduce((sum,r)=>sum+r[k],0)/rows.length]))};
 }).sort((a,b)=>a.Cluster-b.Cluster);
 const outputs=expected.outputs.map((o,port)=>({...o,rows:port===1?means:c.source.map(source=>{
  const Cluster=assigned.find(r=>r.RowID===source.RowID).Cluster,center=means.find(r=>r.Cluster===Cluster);
  return {Cluster,Distance:Math.hypot(...c.features.map(k=>source[k]-center[k])),...source};
 })}));
 need(records.every(r=>matchesExpectedOutput(r.data,outputs[r.output_port])),'MEANS_DISTANCES_OR_ORDER');
 return {...expected,outputs};
}

function* receipts(value){
 if(!value||typeof value!=='object')return;
 if(value.status==='SUCCEEDED'&&value.node&&value.output?.ports&&value.execution)yield value;
 for(const child of Object.values(value))if(child&&typeof child==='object')yield* receipts(child);
}
export function checkGmeansMain(expected,replies){
 const c=expected.clustering_gmeans,rounds=new Map();
 for(const reply of receipts(replies)){
  const config=reply.configuration?.readback;
  if(config?.kind!=='clustering'||reply.execution.status!=='completed'||!reply.output.ports.length)continue;
  need(reply.cleanup_complete===true&&config.mode==='g_means'&&same(config.features,c.features)&&config.normalization==='none'
   &&['seed','min_clusters','max_clusters','threshold'].every(k=>config[k]===c[k]),'CONFIGURATION');
  const id=reply.execution.execution_id;
  if(rounds.has(id))continue;
  const records=reply.output.ports.map(data=>{
   need(data.fresh===true&&data.freshness_basis==='completed_execution_port_source'&&data.execution_id===id,'PORT_PROOF');
   return {type:'datamining.clustering',output_port:data.port,data};
  });
  const resolved=checkGmeansRound(expected,records);
  rounds.set(id,{node:reply.node.node_id,expected:resolved,values:resolved.outputs.map(o=>o.rows)});
 }
 const values=[...rounds.values()];
 need(values.length>=2&&new Set(values.map(r=>r.node)).size===1,'TWO_EXECUTIONS_SAME_NODE');
 need(values.every(r=>same(r.values,values[0].values)),'SEED_REPEAT');
 return values.at(-1).expected;
}

export async function observeGmeansSavedSettings({load,channel,expected}){
 const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs');
 const {closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
 const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
 const c=expected.clustering_gmeans;
 const selected=await channel.observe({condition:'cold g-means selection',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
 await selectPreparedGraphNode(channel,selected,'cold select g-means',{refreshReplacedBody:true});
 await openPreparedWizard(channel);
 try{
  const next=stage=>channel.perform({condition:'cold g-means '+stage,ready:s=>s.wizard?.stage===stage,identity:s=>s.prepared_node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));need(es.length===1,'NEXT');return {verb:'wizard_step',ref:es[0].ref,expected_stage:stage==='input_mapping'?'normalization':'clustering'};}});
  const roles=await channel.observe({condition:'cold g-means roles',readClustering:true,ready:s=>s.wizard?.stage==='input_mapping'&&s.node_clustering?.verified===true});
  need(same(roles.node_clustering.fields.filter(f=>f.usage_type===3).map(f=>f.name),c.features),'SAVED_ROLES');
  await next('input_mapping');
  const norm=await channel.observe({condition:'cold g-means normalization',readClustering:true,ready:s=>s.wizard?.stage==='normalization'&&s.node_clustering?.verified===true});
  need(same(norm.node_clustering.fields.map(f=>f.name),c.features)&&norm.node_clustering.fields.every(f=>f.norm_type===0),'SAVED_NORMALIZATION');
  await next('normalization');
  const params=await channel.observe({condition:'cold g-means bounds and seed',readClustering:true,ready:s=>s.wizard?.stage==='clustering'&&s.node_clustering?.verified===true});
  need(params.node_clustering.auto===true&&Object.values(params.node_clustering.switches).every(v=>v===false)&&['min_clusters','max_clusters','threshold','seed'].every(k=>params.node_clustering[k]===c[k]),'SAVED_PARAMETERS');
  return {mode:'g_means',min_clusters:c.min_clusters,max_clusters:c.max_clusters,threshold:c.threshold,seed:c.seed,settings_applied:false};
 }finally{
  const closed=await closePreparedWizard(channel);need(closed.verified&&closed.cleanup_complete&&closed.settings_applied===false,'CANCEL');
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const expected=JSON.parse(await readFile(process.argv[2],'utf8')),replies=JSON.parse(await readFile(process.argv[3],'utf8'));
 await writeFile(process.argv[4],JSON.stringify(checkGmeansMain(expected,replies),null,2));
 console.log('PASS: g-means bounds, source, means, distances, types/order and seed repeat');
}
