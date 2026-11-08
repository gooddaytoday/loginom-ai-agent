import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {matchesExpectedOutput} from './expected-outputs.mjs';

const need=(v,m)=>{if(!v)throw Error('CLUSTERING_GMEANS_'+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// l1083-g1 cold actual-readback, checkpoint: native regeneration places used
// fields before retained IDs. Pin this observed order, never column_order:any.
export function gmeansColdExpected(expected){
 return {...expected,outputs:expected.outputs.map((output,port)=>{
  const order=expected.clustering_gmeans.cold_column_order[port];
  need(Array.isArray(order)&&order.length===output.columns.length&&new Set(order).size===order.length&&output.columns.every(f=>order.includes(f.name)),'COLD_ORDER_CONTRACT');
  return {...output,columns:order.map(name=>output.columns.find(f=>f.name===name))};
 })};
}

// The stage-0 oracle prescribes bounds and geometric invariants, never a true k.
// Only membership labels come from the native result; all values are recomputed.
export function checkGmeansRound(expected,records,{cold=false}={}){
 if(cold)expected=gmeansColdExpected(expected);
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
 need(values.length>=1&&new Set(values.map(r=>r.node)).size===1,'VERIFIED_EXECUTION');
 need(values.every(r=>same(r.values,values[0].values)),'SEED_REPEAT');
 return values.at(-1).expected;
}

// Seed repeat belongs to the harness: two native trainings of the saved node.
export function checkGmeansSeedRepeat(expected,first,second){
 for(const round of [first,second]){
  need(round.length===2&&round.every(r=>r.node?.node_id===round[0].node?.node_id
   &&r.execution?.status==='completed'&&r.execution?.verified===true&&r.execution?.owner_verified===true
   &&r.execution?.execution_id===round[0].execution?.execution_id),'REPEAT_EXECUTION_PROOF');
  checkGmeansRound(expected,round,{cold:true});
 }
 need(first[0].node.node_id===second[0].node.node_id&&first[0].execution.execution_id!==second[0].execution.execution_id,'TWO_EXECUTIONS_SAME_NODE');
 need([0,1].every(port=>same(first.find(r=>r.output_port===port).data.sample,second.find(r=>r.output_port===port).data.sample)),'SEED_REPEAT');
 return {verified:true,node_id:first[0].node.node_id,execution_ids:[first[0].execution.execution_id,second[0].execution.execution_id]};
}

export async function observeGmeansSavedSettings({load,channel,expected,execute,record}){
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
  if(execute){
   // Read the native Ext control bound to this exact data-tid, without setters.
   const tid=params.wizard.root_tid+';ClusterizationWizard;pedThreshold;ValueControl';
   const range=await execute('async page=>page.evaluate(tid=>{const es=[...document.querySelectorAll("[data-tid="+JSON.stringify(tid)+"]")];const e=es[0],c=es.length===1&&globalThis.Ext?.getCmp?.(e.id);if(c?.el?.dom!==e)throw Error("THRESHOLD_CONTROL");return {tid,min:c.minValue,max:c.maxValue,step:c.step};},'+JSON.stringify(tid)+')');
   need(range.min===0.1&&range.max===5,'NATIVE_THRESHOLD_RANGE');
   await record({phase:'gmeans_native_threshold_range',...range});
  }
  need(params.node_clustering.auto===true&&Object.values(params.node_clustering.switches).every(v=>v===false)&&['min_clusters','max_clusters','threshold','seed'].every(k=>params.node_clustering[k]===c[k]),'SAVED_PARAMETERS');
  return {mode:'g_means',min_clusters:c.min_clusters,max_clusters:c.max_clusters,threshold:c.threshold,seed:c.seed,settings_applied:false};
 }finally{
  const closed=await closePreparedWizard(channel);need(closed.verified&&closed.cleanup_complete&&closed.settings_applied===false,'CANCEL');
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const expected=JSON.parse(await readFile(process.argv[2],'utf8')),replies=JSON.parse(await readFile(process.argv[3],'utf8'));
 await writeFile(process.argv[4],JSON.stringify(checkGmeansMain(expected,replies),null,2));
 console.log('PASS: g-means bounds, source, means, distances, types/order and native outputs');
}
