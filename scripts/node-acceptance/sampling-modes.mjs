import {matchesExpectedOutput} from './expected-outputs.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const need=(v,m)=>{if(!v)throw Error('SAMPLING_'+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function makeSamplingExpected(proposal,mode,package_path){
 need(['random','stratified'].includes(mode),'MODE_UNSUPPORTED');
 need(['preprocessing.sampling','preprocessing.data_partition'].includes(proposal?.node_type),'TYPE_UNSUPPORTED');
 const partition=proposal.node_type==='preprocessing.data_partition',source=proposal.source?.rows;
 need(Array.isArray(source)&&source.length>0&&source.length<=100&&proposal.source.row_count===source.length,'SOURCE_INCOMPLETE');
 need(new Set(source.map(r=>r.RowID)).size===source.length&&source.every(r=>Number.isSafeInteger(r.RowID)&&typeof r.Class==='string'&&Number.isSafeInteger(r.Value)&&Object.keys(r).length===3),'SOURCE_INVALID');
 const columns=[{name:'RowID',type:'integer',label_any:true},{name:'Class',type:'string',label_any:true},{name:'Value',type:'integer',label_any:true}];
 need(same(proposal.columns,columns),'SOURCE_SCHEMA');
 need(Number.isInteger(proposal.seed)&&proposal.seed>=0,'SEED_INVALID');
 const sizes=proposal.requested_sizes,keys=partition?['train','test']:['sample'];
 need(sizes&&same(Object.keys(sizes),keys)&&keys.every(k=>Number.isInteger(sizes[k])&&sizes[k]>=0)&&keys.reduce((n,k)=>n+sizes[k],0)<=source.length,'SIZES_INVALID');
 if(mode==='stratified')need(same(proposal.stratified?.fields,['Class']),'STRATA_UNSUPPORTED');
 const ports=partition?[0,1,2]:[0];
 return {package_path,nodes:[{type:'imports.text'},{type:proposal.node_type},{type:'exports.text'}],
  sampling_modes:{version:1,mode,node_type:proposal.node_type,seed:proposal.seed,source,requested_sizes:sizes},
  // Empty rows are a read plan, never an exact-row oracle. This envelope is
  // consumed only by the explicit sampling adapter, not the stock matcher.
  outputs:ports.map(port=>({output_node_type:proposal.node_type,output_port:port,ordered:true,column_order:'exact',
   columns:partition&&port===0?[{name:'IsTestSet',type:'boolean',label_any:true},...columns]:columns,rows:[]}))};
}
export function parseSamplingExpected(expected){
 const c=expected?.sampling_modes;
 need(c?.version===1&&typeof expected.package_path==='string'&&expected.package_path.endsWith('.lgp'),'CONTRACT_INVALID');
 const proposal={node_type:c.node_type,seed:c.seed,source:{rows:c.source,row_count:c.source?.length},requested_sizes:c.requested_sizes,
  columns:[{name:'RowID',type:'integer',label_any:true},{name:'Class',type:'string',label_any:true},{name:'Value',type:'integer',label_any:true}],stratified:{fields:['Class']}};
 const canonical=makeSamplingExpected(proposal,c.mode,expected.package_path);
 need(same(c,canonical.sampling_modes)&&same(expected.outputs,canonical.outputs)&&same(expected.nodes,canonical.nodes),'CONTRACT_CHANGED');
 return {multiple:true,outputs:canonical.outputs,sample_rows:c.source.length};
}
export function checkSamplingGraph(expected,graph,baseline){
 parseSamplingExpected(expected);
 need(graph?.complete===true&&Array.isArray(graph.nodes)&&Array.isArray(graph.links),'GRAPH_INCOMPLETE');
 const own=graph.nodes.filter(n=>n.type===expected.sampling_modes.node_type),imports=graph.nodes.filter(n=>n.type==='imports.text');
 // Saved workflows expose one native variable-service icon that is absent in
 // the data flow. It may not supply/consume tabular data or bypass the source.
 const services=graph.nodes.filter(n=>n.type==='bg-vendor-icon-modelvariables');
 need(services.length<=1&&services.every(n=>Array.isArray(n.inputs)&&n.inputs.length===0&&Array.isArray(n.outputs)&&n.outputs.length===0
  &&!graph.links.some(l=>l.source===n.ref.node_id||l.target===n.ref.node_id)),'GRAPH_SERVICE');
 need(own.length===1&&imports.length===1&&own[0].ref.node_id===baseline.node_id
  &&graph.nodes.every(n=>services.includes(n)||['imports.text','exports.text',expected.sampling_modes.node_type].includes(n.type)),
  'GRAPH_NODES:'+JSON.stringify({main_node_id:baseline.node_id,nodes:graph.nodes.map(n=>({type:n.type,node_id:n.ref?.node_id}))}));
 const incoming=graph.links.filter(l=>l.target===own[0].ref.node_id);
 need(incoming.length===1&&incoming[0].source===imports[0].ref.node_id&&incoming[0].output===0&&incoming[0].input===0,'GRAPH_SOURCE');
 need(graph.nodes.some(n=>n.type==='exports.text')&&graph.links.every(l=>
  l===incoming[0]||l.source===own[0].ref.node_id&&expected.outputs.some(o=>o.output_port===l.output)&&l.input===0
   &&graph.nodes.some(n=>n.type==='exports.text'&&n.ref.node_id===l.target)),'GRAPH_LINKS');
 return true;
}

function checkRound(expected,records){
 const c=expected.sampling_modes;parseSamplingExpected(expected);
 need(records.length===expected.outputs.length&&new Set(records.map(r=>r.output_port)).size===records.length,'PORTS_INCOMPLETE');
 const result=[];
 for(const want of expected.outputs){
  const record=records.find(r=>r.output_port===want.output_port),data=record?.data;
  need(record?.type===c.node_type&&data?.sample_complete===true&&data.precision?.numbers_verified===true
   &&Array.isArray(data.sample)&&data.row_count===data.sample.length&&data.sample.length<=c.source.length,'TABLE_INCOMPLETE');
  const idIndex=want.columns.findIndex(f=>f.name==='RowID'),rows=[];
  for(const cells of data.sample){
   const cell=cells?.[idIndex];need(cell?.type==='integer'&&typeof cell.value==='string'&&/^-?\d+$/.test(cell.value),'ROW_ID_INVALID');
   const source=c.source.find(r=>String(r.RowID)===cell.value);need(source,'SOURCE_MEMBERSHIP');
   const flag=want.columns[0].name==='IsTestSet'?cells[0]?.value:undefined;
   const row=flag===undefined?{...source}:{IsTestSet:flag,...source};
   need(matchesExpectedOutput({...data,row_count:1,sample:[cells]}, {...want,rows:[row]}),'VALUES_OR_TYPES');
   rows.push(row);
  }
  // The zero-row case still has to establish exact names, types and order.
  need(matchesExpectedOutput(data,{...want,rows}),'SCHEMA_OR_VALUES');
  need(new Set(rows.map(r=>r.RowID)).size===rows.length,'DUPLICATE_ROW_ID');
  result.push({port:want.output_port,rows});
 }
 const rows=p=>result.find(r=>r.port===p).rows;
 const partition=c.node_type==='preprocessing.data_partition';
 const subsets=partition?[['train',rows(1)],['test',rows(2)]]:[['sample',rows(0)]];
 for(const [key,subset] of subsets){
  need(subset.length===c.requested_sizes[key],'ROW_COUNT');
  if(c.mode==='stratified')for(const cls of new Set(c.source.map(r=>r.Class))){
   const quota=c.requested_sizes[key]*c.source.filter(r=>r.Class===cls).length/c.source.length;
   need(Number.isInteger(quota)&&subset.filter(r=>r.Class===cls).length===quota,'CLASS_QUOTA');
  }
  need(subset.every((r,i)=>i===0||c.source.findIndex(s=>s.RowID===subset[i-1].RowID)<c.source.findIndex(s=>s.RowID===r.RowID)),'ROW_ORDER');
 }
 if(partition){
  need(!rows(1).some(r=>rows(2).some(s=>s.RowID===r.RowID)),'TRAIN_TEST_OVERLAP');
  need(same(rows(0),[...rows(1).map(r=>({IsTestSet:false,...r})),...rows(2).map(r=>({IsTestSet:true,...r}))]),'COMBINED_RELATION');
 }
 return result;
}
function checkExecutions(expected,actual){
 const nodes=new Set(actual.map(r=>r.node?.node_id));need(nodes.size===1&&!nodes.has(undefined),'NODE_CHANGED');
 const rounds=new Map();
 for(const record of actual){
  const id=record.execution?.execution_id;need(record.execution?.status==='completed'&&typeof id==='string'&&id.length>0,'EXECUTION_UNCONFIRMED');
  if(!rounds.has(id))rounds.set(id,[]);
  const list=rounds.get(id),old=list.find(r=>r.output_port===record.output_port);
  if(old)need(same(old.data,record.data),'CONFLICTING_EXECUTION');else list.push(record);
 }
 need(rounds.size>=2,'TWO_EXECUTIONS_REQUIRED');
 const values=[...rounds.values()].map(r=>checkRound(expected,r));
 need(values.every(r=>same(r,values[0])),'SEED_REPEAT_MISMATCH');
 return {version:1,contract:expected.sampling_modes,node_id:[...nodes][0],ports:values[0],execution_ids:[...rounds.keys()]};
}
function* receipts(value){
 if(!value||typeof value!=='object')return;
 if(value.status==='SUCCEEDED'&&value.node&&value.output?.ports&&value.execution)yield value;
 for(const item of Object.values(value))if(item&&typeof item==='object')yield* receipts(item);
}
export function checkSamplingMain(expected,replies,csvs){
 parseSamplingExpected(expected);const c=expected.sampling_modes,actual=[],configs=[];
 for(const reply of receipts(replies)){
  const readback=reply.configuration?.readback;
  if(readback?.kind===(c.node_type==='preprocessing.sampling'?'sampling':'data_partition'))configs.push({node:reply.node,readback});
 }
 need(configs.length>0&&new Set(configs.map(r=>r.node.node_id)).size===1,'CONFIGURATION_MISSING');
 const node=configs[0].node.node_id;
 for(const {readback:r} of configs){
  need(r.mode===c.mode&&r.seed===c.seed&&same(r.counts,Object.values(c.requested_sizes))&&r.test_priority===false,'CONFIGURATION_CHANGED');
  need(same(r.strata_fields,c.mode==='stratified'?['Class']:[]),'STRATA_CHANGED');
 }
 for(const reply of receipts(replies))if(reply.node.node_id===node){
  need(reply.cleanup_complete===true,'MAIN_CLEANUP');
  for(const data of reply.output.ports){
   need(data.fresh===true&&data.freshness_basis==='completed_execution_port_source'&&data.execution_id===reply.execution.execution_id,'MAIN_PORT_PROOF');
   actual.push({node:reply.node,type:c.node_type,execution:reply.execution,output_port:data.port,data});
  }
 }
 const baseline=checkExecutions(expected,actual),ports=baseline.ports;
 need(csvs.length===ports.length*2,'CSV_REPEATS_REQUIRED');
 for(const [index,csv] of csvs.entries()){
  const want=expected.outputs[index%ports.length],rows=ports[index%ports.length].rows;
  need(same(csv[0],want.columns.map(f=>f.name))&&csv.length===rows.length+1,'CSV_SCHEMA_OR_COUNT');
  need(csv.slice(1).every((r,i)=>r.length===want.columns.length&&r.every((v,j)=>{
   const value=rows[i][want.columns[j].name];return typeof value==='boolean'?v.toLowerCase()===String(value):v===String(value);
  })),'CSV_VALUES_OR_ORDER');
 }
 return baseline;
}
export function checkSamplingCold(expected,actual,baseline){
 const result=checkExecutions(expected,actual);
 need(baseline?.version===1&&same(baseline.contract,expected.sampling_modes)&&baseline.node_id===result.node_id,'COLD_BASELINE_IDENTITY');
 need(same(baseline.ports,result.ports),'COLD_MAIN_MISMATCH');
 const first=actual.filter(a=>a.execution.execution_id===result.execution_ids[0]);
 return {evidence:{mode:expected.sampling_modes.mode,seed:expected.sampling_modes.seed,repeat_execution_ids:result.execution_ids,membership:true,values_and_types:true,relations:true},
  correspondence:expected.outputs.map((want,index)=>{const a=first.find(a=>a.output_port===want.output_port);return {expected_index:index,node:a.node,output_port:a.output_port,execution:a.execution};})};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [action,path,...rest]=process.argv.slice(2),value=JSON.parse(await readFile(path,'utf8'));
 if(action==='expected')console.log(JSON.stringify(makeSamplingExpected(value,rest[0],rest[1])));
 else if(action==='main'){
  const replies=JSON.parse(await readFile(rest[0],'utf8')),csvs=JSON.parse(await readFile(rest[1],'utf8'));
  const result=checkSamplingMain(value,replies,csvs);await writeFile(rest[2],JSON.stringify(result)+'\n');
  console.log(JSON.stringify({status:'PASS',executions:result.execution_ids.length}));
 }else throw Error('SAMPLING_ACTION_UNSUPPORTED');
}
