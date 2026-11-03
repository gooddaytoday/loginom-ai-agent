import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {matchesExpectedOutput} from './expected-outputs.mjs';

const need=(v,m)=>{if(!v)throw Error('CLUSTERING_NORMALIZED_'+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const partition=groups=>groups.map(g=>[...g].sort((a,b)=>a-b)).sort((a,b)=>a[0]-b[0]);

// Owner-approved invariants, independent of the opaque native initialization.
// The stock matcher still owns exact typed source values and sample-SD distances.
export function checkClusteringRound(expected,records,{raw=false}={}){
 const c=expected.clustering_normalized;
 need(c?.version===1&&c.normalization==='standardize'&&c.clusters===3&&c.seed===42&&same(c.features,['X','Y']),'CONTRACT');
 need(records.length===2&&new Set(records.map(r=>r.output_port)).size===2,'BOTH_PORTS');
 const tables=records.map(record=>{
  const data=record.data,want=expected.outputs.find(o=>o.output_port===record.output_port);
  need(want&&record.type==='datamining.clustering'&&data?.sample_complete===true&&data.precision?.numbers_verified===true
   &&data.row_count===data.sample?.length,'COMPLETE_TYPED_TABLE');
  if(!raw)need(matchesExpectedOutput(data,want),'GEOMETRY_OR_DISTANCE');
  need(new Set(data.schema.map(f=>f.name)).size===data.schema.length,'DUPLICATE_FIELD');
  return {port:record.output_port,rows:data.sample.map(cells=>{
   need(cells.length===data.schema.length,'CELL_COUNT');
   return Object.fromEntries(data.schema.map((field,i)=>{
    const cell=cells[i];need(cell?.is_null===false&&cell.type===field.type&&['integer','real'].includes(field.type),'CELL_TYPE');
    const value=Number(cell.value);need(Number.isFinite(value),'FINITE_VALUE');
    return [field.name,value];
   }));
  })};
 });
 const assigned=tables.find(t=>t.port===0).rows,centers=tables.find(t=>t.port===1).rows;
 need(assigned.length===c.source.length&&centers.length===c.clusters,'ROW_COUNT');
 need(new Set(assigned.map(r=>r.RowID)).size===c.source.length,'ROW_MEMBERSHIP');
 for(const row of assigned){
  const source=c.source.find(r=>r.RowID===row.RowID);
  need(source&&c.features.every(k=>row[k]===source[k])&&Number.isSafeInteger(row.Cluster),'SOURCE_CHANGED');
 }
 need(new Set(centers.map(r=>r.Cluster)).size===c.clusters,'CLUSTER_COUNT');
 const groups=centers.map(center=>{
  const rows=assigned.filter(r=>r.Cluster===center.Cluster);need(rows.length>0,'EMPTY_CLUSTER');
  need(c.features.every(k=>Math.abs(center[k]-rows.reduce((n,r)=>n+r[k],0)/rows.length)<=1e-6),'ORIGINAL_UNIT_MEAN');
  return rows.map(r=>r.RowID);
 });
 need(same(partition(groups),partition(raw?c.raw_groups:c.groups)),'SCALE_PARTITION');
 return tables.map(t=>({...t,rows:t.rows.sort((a,b)=>(a.RowID??a.Cluster)-(b.RowID??b.Cluster))})).sort((a,b)=>a.port-b.port);
}

function* receipts(value){
 if(!value||typeof value!=='object')return;
 if(value.status==='SUCCEEDED'&&value.node&&value.output?.ports&&value.execution)yield value;
 for(const child of Object.values(value))if(child&&typeof child==='object')yield* receipts(child);
}
export function checkClusteringMain(expected,replies){
 const c=expected.clustering_normalized,rounds=new Map();
 for(const reply of receipts(replies)){
  const config=reply.configuration?.readback;
  if(config?.kind!=='clustering'||reply.execution.status!=='completed'||!reply.output.ports.length)continue;
  need(reply.cleanup_complete===true&&config.seed===c.seed&&config.clusters===c.clusters&&same(config.features,c.features),'CONFIGURATION');
  const id=reply.execution.execution_id;
  const records=reply.output.ports.map(data=>{
   need(data.fresh===true&&data.freshness_basis==='completed_execution_port_source'&&data.execution_id===id,'PORT_PROOF');
   return {node:reply.node,type:'datamining.clustering',execution:reply.execution,output_port:data.port,data};
  });
  if(rounds.has(id))continue;
  rounds.set(id,{node:reply.node.node_id,normalization:config.normalization,
   values:checkClusteringRound(expected,records,{raw:config.normalization==='none'})});
 }
 const values=[...rounds.values()],normalized=values.filter(r=>r.normalization==='standardize'),raw=values.filter(r=>r.normalization==='none');
 need(new Set(values.map(r=>r.node)).size===1&&normalized.length>=2&&raw.length>=1,'SAME_NODE_RAW_AND_TWO_NORMALIZED');
 need(normalized.every(r=>same(r.values,normalized[0].values)),'SEED_REPEAT');
 need(!same(partition(c.raw_groups),partition(c.groups)),'DISTINCT_PARTITIONS');
 return {node_id:normalized[0].node,ports:normalized[0].values,execution_ids:[...rounds.keys()]};
}

export async function observeClusteringSavedSettings({load,channel,expected}){
 const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs');
 const {closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
 const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
 const c=expected.clustering_normalized;
 const selected=await channel.observe({condition:'cold clustering selection',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
 await selectPreparedGraphNode(channel,selected,'cold select clustering',{refreshReplacedBody:true});
 await openPreparedWizard(channel);
 try{
  const next=async stage=>channel.perform({condition:'cold clustering '+stage,ready:s=>s.wizard?.stage===stage,identity:s=>s.prepared_node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));need(es.length===1,'NEXT');return {verb:'wizard_step',ref:es[0].ref,expected_stage:stage==='input_mapping'?'normalization':'clustering'};}});
  const roles=await channel.observe({condition:'cold clustering saved roles',readClustering:true,
   ready:s=>s.wizard?.stage==='input_mapping'&&s.node_clustering?.verified===true&&s.node_clustering.fields.length>0});
  need(same(roles.node_clustering.fields.filter(f=>f.usage_type===3).map(f=>f.name),c.features),'SAVED_ROLES');
  await next('input_mapping');
  const norm=await channel.observe({condition:'cold clustering saved normalization',readClustering:true,
   ready:s=>s.wizard?.stage==='normalization'&&s.node_clustering?.verified===true&&s.node_clustering.fields.length===c.features.length});
  need(same(norm.node_clustering.fields.map(f=>f.name),c.features)&&norm.node_clustering.fields.every(f=>f.norm_type===5),'SAVED_NORMALIZATION');
  await next('normalization');
  const params=await channel.observe({condition:'cold clustering saved seed and count',readClustering:true,
   ready:s=>s.wizard?.stage==='clustering'&&s.node_clustering?.verified===true});
  need(params.node_clustering.auto===false&&params.node_clustering.clusters===c.clusters&&params.node_clustering.seed===c.seed,'SAVED_PARAMETERS');
  return {normalization:'standardize',features:c.features,seed:c.seed,clusters:c.clusters,settings_applied:false};
 }finally{
  const closed=await closePreparedWizard(channel);
  need(closed.verified&&closed.cleanup_complete&&closed.settings_applied===false,'CANCEL');
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const expected=JSON.parse(await readFile(process.argv[2],'utf8')),replies=JSON.parse(await readFile(process.argv[3],'utf8'));
 await writeFile(process.argv[4],JSON.stringify(checkClusteringMain(expected,replies),null,2));
 console.log('PASS: original-unit means, source membership, scale partition, seed repeat and same-node reconfiguration');
}
