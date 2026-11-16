import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {makeSupernodeConfigureCode} from '../../packages/loginom-runtime/client/lib/supernode-procedure.mjs';
import {matchExpectedOutputs} from './expected-outputs.mjs';

const need=(v,m)=>{if(!v)throw Error('SUPERNODE_'+m);};
function* objects(value){
 if(!value||typeof value!=='object')return;
 if(!Array.isArray(value))yield value;
 for(const item of Object.values(value))yield* objects(item);
}
export function checkSupernodeGraph(graph,calculatorId,converterId){
 need(Array.isArray(graph.nodes)&&Array.isArray(graph.links),'GRAPH_INCOMPLETE');
 const input=graph.nodes.filter(n=>n.boundary_role==='input'),output=graph.nodes.filter(n=>n.boundary_role==='output');
 const id=n=>n.ref?.node_id??n.node_id,label=n=>n.node_ref?.node_label??n.label;
 const calculator=graph.nodes.filter(n=>calculatorId?id(n)===calculatorId:n.type==='transform.calculator');
 need(input.length===1&&output.length===1&&calculator.length===1,'BOUNDARIES_AND_CALCULATOR');
 const edge=(source,target)=>graph.links.some(e=>typeof e==='string'
  ?e.endsWith(';Graph;'+label(source)+'|Output_Data-0|'+label(target)+'|Input_Data-0')
  :e.source===id(source)&&e.output===0&&e.target===id(target)&&e.input===0);
 const converters=graph.nodes.filter(n=>converterId?id(n)===converterId:n.type==='variables.to_table');
 if(converters.length){
  need(converters.length===1&&edge(converters[0],calculator[0])&&edge(calculator[0],output[0]),'LOCAL_LINKS');
  for(const target of [converters[0],calculator[0]])need((graph.variable_links??graph.links).some(e=>typeof e==='string'
   ?e.endsWith(';Graph;'+label(input[0])+'|Output_Var-0|'+label(target)+'|Input_Var-'+(target===calculator[0]?1:0))
   :e.source===id(input[0])&&e.target===id(target)&&e.kind==='variables'&&e.input===0&&e.output===0),'LOCAL_VARIABLE_LINKS');
 }else need(!converterId&&edge(input[0],calculator[0])&&edge(calculator[0],output[0]),'LOCAL_LINKS');
 return {input:id(input[0]),calculator:id(calculator[0]),output:id(output[0])};
}

export async function observeSupernodeSaved({execute,adapter,prepared,origin,session,platform,makeWorkspacePrepareCode,record,expected}){
 const outer=await adapter.observe({document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},Date.now()+30000);
 const nodes=outer.nodes.filter(n=>n.type==='control.supernode');need(nodes.length===1,'ONE_SAVED_CONTAINER');
 const navigate=async(direction,node)=>{
  const result=await execute(makeWorkspacePrepareCode({loginomUrl:origin+'/app/',compatibility:{profile_id:'supernode-cold',loginom_build:'7.4.2',platform,browser:'chromium'},
   sessionId:session,operationId:'cold-supernode-'+direction,intent:'existing_workflow',workflowRef:{document_id:prepared.document_id,...prepared.workflow_ref},
   graphNavigation:{direction,...(node?{node_ref:node}:{})},timeoutMs:120000}));
  need(result.status==='READY'&&result.created_draft===false,'COLD_NAVIGATION_'+direction);
  prepared.workflow_ref=result.workflow_ref;
  return adapter.observe({document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},Date.now()+30000);
 };
 let variables;
 if(expected?.supernode_variables){
  const result=await execute(makeSupernodeConfigureCode({document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:nodes[0].ref},{origin,build:'7.4.2',operation_id:'cold-supernode-vars',deadline:Date.now()+60000,parameters:{definitions:expected.supernode_variables,read_only:true}}));
  need(result.status==='SUCCEEDED'&&result.cleanup_complete===true,'COLD_SAVED_VARIABLE_DEFINITIONS');
  variables=result.variable_boundary;await record({phase:'supernode_saved_definitions',node:nodes[0].ref,variables,settings_applied:false});
 }
 const graph=await navigate('enter',nodes[0].ref),topology=checkSupernodeGraph(graph);
 await record({phase:'supernode_saved_nested_graph',graph,topology,settings_applied:false});
 const returned=await navigate('leave');
 need(returned.nodes.some(n=>n.type==='control.supernode'&&n.ref.node_id===nodes[0].ref.node_id),'COLD_CONTAINER_CHANGED');
 return {...returned,...(variables?{supernode_variable_boundary:variables}:{})};
}

export async function checkSupernodeRun(eventsFile,expectedDirectory,journalFiles=[]){
 const replies=[];
 for(const [index,line] of (await readFile(eventsFile,'utf8')).split('\n').entries()){
  let event;try{event=JSON.parse(line);}catch{continue;}
  if(event.type!=='tool_use'||event.part?.state?.status!=='completed')continue;
  try{replies.push({line:index+1,reply:JSON.parse(event.part.state.output)});}catch{}
 }
 const all=replies.flatMap(r=>[...objects(r.reply)].map(value=>({...r,value})));
 const containers=all.filter(r=>r.value.kind==='supernode'),calculators=all.filter(r=>r.value.kind==='calculator');
 const ids=values=>new Set(values.map(r=>r.value.node?.node_id));
 need(containers.length&&ids(containers).size===1,'CONTAINER_IDENTITY');
 need(calculators.length&&ids(calculators).size===1,'CALCULATOR_IDENTITY');
 const container=[...ids(containers)][0],calculator=[...ids(calculators)][0];
 const expected=JSON.parse(await readFile(new URL('expected.json',expectedDirectory),'utf8'));
 const variable=expected.supernode_variables,converters=all.filter(r=>r.value.kind==='variables_to_table');
 if(variable)need(ids(converters).size===1,'VARIABLE_CONVERTER_IDENTITY');
 const converter=variable?[...ids(converters)][0]:undefined;
 let definitions;
 if(variable){
  const observed=containers.filter(r=>r.value.mode==='variable_boundary').map(r=>r.value.boundary?.input);
  need(observed.length>0&&observed.every(p=>p?.kind==='variables'&&typeof p.port_guid==='string'&&JSON.stringify(p.definitions.map(d=>({name:d.name,type:d.type,value:d.value})))===JSON.stringify(variable)),'SAVED_DEFINITIONS');
  need(new Set(observed.map(p=>JSON.stringify(p))).size===1,'DEFINITION_IDENTITIES');
  definitions={port_guid:observed[0].port_guid,native_index:0,kind:'variables',definitions:observed[0].definitions};
 }
 const graphs=[];
 for(const file of journalFiles)for(const [index,line] of (await readFile(file,'utf8')).split('\n').entries()){
  let event;try{event=JSON.parse(line);}catch{continue;}
  if(!['observation_completed','node_observation_completed'].includes(event.phase)||event.outcome?.status!=='SUCCEEDED')continue;
  const value=event.outcome.output;
  if(Array.isArray(value?.nodes)&&value.nodes.some(n=>n.boundary_role==='input'))graphs.push({file,line:index+1,value});
 }
 const topology=[];
 for(const r of graphs){
  try{topology.push({file:r.file,line:r.line,...checkSupernodeGraph(r.value,calculator,converter)});}
  catch(error){
   // Enter and construction observe incomplete graphs. Once the local chain
   // is complete, every subsequent observation must retain that topology.
   if(topology.length)throw Error('SUPERNODE_MAIN_NESTED_OBSERVATION: '+r.file+':'+r.line+': '+error.message);
  }
 }
 need(topology.length>0,'MAIN_NESTED_OBSERVATION');
 need(topology.every(t=>t.calculator===calculator),'CALCULATOR_IDENTITY');
 need(new Set(topology.map(t=>JSON.stringify([t.input,t.calculator,t.output]))).size===1,'BOUNDARY_IDENTITY');
 const imports=all.filter(r=>r.value.kind==='text_import');
 const sourceName=r=>r.value.source?.source_path?.split('/').at(-1).replace(/^[a-f0-9]{64}-[0-9]+-/,'');
 if(!variable)need(ids(imports).size===1&&imports.some(r=>sourceName(r)==='input.csv')
  &&imports.some(r=>sourceName(r)==='replacement.csv'),'IMPORT_REPLACEMENT_IDENTITY');
 const initial=!variable&&JSON.parse(await readFile(new URL('expected-initial.json',expectedDirectory),'utf8')).outputs[0];
 const final=expected.outputs[0];
 let previous=0;
 const tables=[];
 for(const expected of (variable?[final]:[initial,final])){
  const matches=all.filter(r=>r.line>previous&&r.value.status==='SUCCEEDED'&&r.value.node?.node_id===container&&r.value.output?.ports?.length===1);
  let found;
  for(const r of matches){
   const actual={node:r.value.node,type:'control.supernode',output_port:0,data:r.value.output.ports[0]};
   try{matchExpectedOutputs([actual],[expected]);found={line:r.line,actual};break;}catch{}
  }
  need(found,'COMPLETE_TYPED_TABLE_'+expected.rows.length);previous=found.line;tables.push(found.line);
 }
 return {status:'PASS',container,calculator,topology,tables,...(definitions?{variable_boundary:definitions}:{})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await checkSupernodeRun(process.argv[2],pathToFileURL(process.argv[3].replace(/\/$/,'')+'/'),process.argv.slice(5));
 await writeFile(process.argv[4],JSON.stringify(result,null,2)+'\n');
}
