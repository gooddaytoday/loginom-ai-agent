import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyNodeTargetEffect,prepareNodeTarget} from '../lib/node-target.mjs';
import {linkPage,run} from './support/executor-fixture.mjs';
const fixture=()=>{
 const ref=id=>({document_id:'doc',workflow_id:'wf',node_id:id});
 const before={complete:true,document_id:'doc',workflow_ref:{workflow_id:'wf'},dom_epoch:1,interaction_ready:true,foreign_links:[],links:[],nodes:[
  {ref:ref('s'),type:'bg-vendor-icon-calcvariables',label:'Source',dom_epoch:2,inputs:[],outputs:[],variable_outputs:[{kind:'variables',port:0,native_index:0,port_guid:'source-guid'}]},
  {ref:ref('t'),type:'variables.to_table',label:'Переменные в таблицу',dom_epoch:3,inputs:[],outputs:[0],variable_inputs:[{kind:'variables',port:0,native_index:0,port_guid:'target-guid'}]}
 ]};
 const edge={source:'s',output:0,target:'t',input:0,kind:'variables'};
 const after=structuredClone(before);after.nodes[1].label='В столбцы: Количество, Флаг (+6)';after.nodes[1].dom_epoch=4;
 after.variable_links=[{...edge,source_port_guid:'source-guid',target_port_guid:'target-guid'}];
 return {before,after,edge,effect:{kind:'connect',parameters:{edge},before}};
};
test('native VarToData label after its first exact variable link is an owned transition',()=>{
 const f=fixture();assert.deepEqual(verifyNodeTargetEffect(f.effect,f.after),{});
});
for(const [name,edit] of Object.entries({
 source:g=>g.nodes[0].label='changed',position:g=>g.nodes[1].position={x:1,y:2},
 type:g=>g.nodes[1].type='transform.sorting',label:g=>g.nodes[1].label='arbitrary',
 target_guid:g=>g.variable_links[0].target_port_guid='other',source_guid:g=>g.variable_links[0].source_port_guid='other',
 port:g=>g.nodes[1].outputs.push(1),extra_link:g=>g.links.push({source:'s',target:'t',output:0,input:0}),
 foreign:g=>g.foreign_links.push('foreign'),document:g=>g.document_id='other',container:g=>g.dom_epoch++,
 extra_variable:g=>g.variable_links.push({...g.variable_links[0],output:1})
}))test('VarToData label transition refuses '+name,()=>{
 const f=fixture();edit(f.after);assert.equal(verifyNodeTargetEffect(f.effect,f.after),null);
});
test('a user label and an existing connection do not acquire automatic-label permission',()=>{
 for(const mode of ['label','connected']){
  const f=fixture();if(mode==='label')f.before.nodes[1].label='My converter';else f.before.links.push({source:'t',target:'s',output:0,input:0});
  assert.equal(verifyNodeTargetEffect(f.effect,f.after),null);
 }
});
for(const type of ['variables.to_table','variables.column_union'])for(const mode of ['owned','foreign','wrong-guid','other-type'])test('serialized link primitive handles '+type+' caption: '+mode,async()=>{
 const f=fixture(),page=linkPage();page.nodes=[];
 if(type==='variables.column_union'){
  const target=f.before.nodes[1];Object.assign(target,{type,label:'Соединение (переменные)',outputs:[],variable_inputs:[0,1].map(port=>({kind:'variables',port,native_index:port,port_guid:port?'other':'target-guid'})),variable_outputs:[{kind:'variables',port:0,native_index:0,port_guid:'out'}]});
  f.after.nodes[1]={...structuredClone(target),label:'amount, empty',dom_epoch:4};
 }
 const defaultTid=type==='variables.column_union'?'Соединение_(переменные)':'Переменные_в_таблицу';
 page.addNode('Source',104,104,['Output_Var-0']);page.addNode(defaultTid,400,104,type==='variables.column_union'?['Input_Var-0','Input_Var-1','Output_Var-0']:['Input_Var-0','Output_Data-0']);
 f.before.workflow_ref={tab_tid:page.tabTid,prefix:page.prefix,workflow_id:'wf'};
 f.after.workflow_ref=structuredClone(f.before.workflow_ref);
 const renamed=type==='variables.column_union'?'amount_empty':'В_столбцы:_Количество_Флаг_(+6)';
 page.onDrop=()=>{page.nodes[1].label=renamed;page.edges.push('Source|Output_Var-0|'+renamed+'|Input_Var-0');};
 page.nativeGraph=probe=>{
  const g=structuredClone(page.drops?f.after:f.before);
  if(page.drops&&mode==='foreign')g.nodes[0].label='foreign';
  if(page.drops&&mode==='wrong-guid')g.variable_links[0].target_port_guid='other';
  if(mode==='other-type')g.nodes[1].type='transform.sorting';
  if(probe?.read_bindings)g.native_bindings=[{node_id:'s',label:'Source'},{node_id:'t',label:page.drops?renamed:defaultTid}];return g;
 };
 if(mode==='other-type')f.before.nodes[1].type='transform.sorting';
 const evaluate=page.evaluate.bind(page);
 page.evaluate=async(fn,arg)=>{
  if(fn.toString().includes('Node target link context changed'))return;
  if(fn.toString().includes('Link validation workflow changed')){const b=page.elements().find(e=>e.port==='Input_Var-0').box;return {state:'ready',target_ready:true,point:{x:b.x+b.width/2,y:b.y+b.height/2}};}
  return evaluate(fn,arg);
 };
 const result=await run(page,'link.create',{
  source_node:page.ref('Source'),target_node:page.ref(defaultTid),source_port:{kind:'var',index:0},target_port:{kind:'var',index:0}
 },{node_target_graph_reader:async (page,probe)=>page.nativeGraph(probe),node_target_context:{
  request:{document_id:'doc',workflow_ref:f.before.workflow_ref,target:{kind:'new',type}},
  graph_baseline:f.before,graph_probe:{},dom_epoch:1,nodes:[{id:'s',tid:'Source',dom_epoch:2},{id:'t',tid:defaultTid,dom_epoch:3}]
 }});
 assert.equal(result.status,mode==='owned'?'SUCCEEDED':'AMBIGUOUS',JSON.stringify(result));
 assert.equal(page.drops,1);assert.equal(page.upCalls,1);assert.equal(page.down,false);
 if(mode==='owned')assert.equal(result.output.variable_target_label_transition.node_id,'t');
});
for(const label of [undefined,'Переменные в таблицу'])test('new VarToData retains an explicit caption after connecting: '+label,async()=>{
 const f=fixture(),workflow={workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]};
 const graph={...structuredClone(f.before),workflow_ref:workflow,nodes:[structuredClone(f.before.nodes[0])]};graph.nodes[0].position={x:8,y:8};
 const calls=[],request={document_id:'doc',workflow_ref:workflow,target:{kind:'new',type:'variables.to_table',position:{x:160,y:160},...(label?{label}:{})},inputs:[],variable_inputs:[{source:graph.nodes[0].ref,output:0,input:0,kind:'variables'}]};
 const adapter={observe:async()=>structuredClone(graph),preflight:async()=>{},positionMatches:()=>true,mutate:async e=>{
  calls.push(e.kind);
  if(e.kind==='create')graph.nodes.push({...structuredClone(f.before.nodes[1]),position:e.parameters.position});
  if(e.kind==='connect'){graph.nodes[1].label=f.after.nodes[1].label;graph.variable_links=structuredClone(f.after.variable_links);}
  if(e.kind==='rename')graph.nodes[1].label=e.parameters.label;
  return {status:'SUCCEEDED',cleanup_complete:true,effect_possible:true};
 }};
 const result=await prepareNodeTarget({request,operation:{id:'var',deadline:Date.now()+10000},adapter,record:async e=>e});
 assert.equal(result.status,'SUCCEEDED',result.error);assert.equal(result.node.label,label??f.after.nodes[1].label);
 assert.deepEqual(calls,['create','connect',...(label?['rename']:[])]);
});
for(const foreign of [false,true])test('serialized union second variable link preserves the first edge through native caption replacement, foreign='+foreign,async()=>{
 const f=fixture(),page=linkPage(),old='amount_empty',next='amount_empty_amount_enabled';page.nodes=[];
 page.addNode('Source',104,104,['Output_Var-0']);page.addNode(old,400,104,['Input_Var-0','Input_Var-1','Output_Var-0']);page.addNode('Left',104,300,['Output_Var-0']);
 const target=f.before.nodes[1];target.type='variables.column_union';target.label='amount, empty';target.outputs=[];
 target.variable_inputs=[0,1].map(port=>({kind:'variables',port,native_index:port,port_guid:'input-'+port}));
 target.variable_outputs=[{kind:'variables',port:0,native_index:0,port_guid:'out'}];
 f.before.nodes.push({...structuredClone(f.before.nodes[0]),ref:{document_id:'doc',workflow_id:'wf',node_id:'left'},label:'Left'});
 const first={source:'left',output:0,target:'t',input:0,kind:'variables',source_port_guid:'source-guid',target_port_guid:'input-0'};
 f.before.variable_links=[first];f.before.workflow_ref={tab_tid:page.tabTid,prefix:page.prefix,workflow_id:'wf'};
 f.after=structuredClone(f.before);f.after.nodes[1].label='amount, empty, amount, enabled';
 f.after.variable_links.push({source:'s',output:0,target:'t',input:1,kind:'variables',source_port_guid:'source-guid',target_port_guid:'input-1'});
 if(foreign)f.after.nodes[2].label='changed';
 page.edges=['Left|Output_Var-0|'+old+'|Input_Var-0'];
 page.onDrop=()=>{page.nodes[1].label=next;page.edges=['Left|Output_Var-0|'+next+'|Input_Var-0','Source|Output_Var-0|'+next+'|Input_Var-1'];};
 page.nativeGraph=probe=>{const g=structuredClone(page.drops?f.after:f.before);if(probe?.read_bindings)g.native_bindings=[{node_id:'s',label:'Source'},{node_id:'t',label:page.drops?next:old},{node_id:'left',label:'Left'}];return g;};
 const evaluate=page.evaluate.bind(page);page.evaluate=async(fn,arg)=>{
  if(fn.toString().includes('Node target link context changed'))return;
  if(fn.toString().includes('Link validation workflow changed')){const b=page.elements().find(e=>e.port==='Input_Var-1').box;return {state:'ready',target_ready:true,point:{x:b.x+b.width/2,y:b.y+b.height/2}};}
  return evaluate(fn,arg);
 };
 const result=await run(page,'link.create',{source_node:page.ref('Source'),target_node:page.ref(old),source_port:{kind:'var',index:0},target_port:{kind:'var',index:1}},
  {node_target_graph_reader:async(page,probe)=>page.nativeGraph(probe),node_target_context:{request:{document_id:'doc',workflow_ref:f.before.workflow_ref,target:{kind:'new',type:'variables.column_union'}},graph_baseline:f.before,graph_probe:{},dom_epoch:1,nodes:[{id:'s',tid:'Source',dom_epoch:2},{id:'t',tid:old,dom_epoch:3}]}});
 assert.equal(result.status,foreign?'AMBIGUOUS':'SUCCEEDED',JSON.stringify(result));assert.equal(page.drops,1);assert.equal(page.edges.length,2);
});
