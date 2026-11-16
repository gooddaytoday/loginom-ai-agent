import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareNodeTarget,verifyNodeTargetEffect} from '../lib/node-target.mjs';
import {validateNodeTargetRequest} from '../lib/node-contracts.mjs';
import {mutateGraph} from '../lib/node-target-browser.mjs';
import {createActionRuntime} from '../lib/executor.mjs';
import {nodeApiTools,dispatchNodeApi} from '../lib/node-api.mjs';
import {userNodeTool} from '../lib/user-workflow.mjs';
import {nodeResultReply} from '../lib/node-result-reply.mjs';

const workflow={workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]};
const ref=node_id=>({document_id:'doc',workflow_id:'wf',node_id});
const chain=()=>({complete:true,interaction_ready:true,document_id:'doc',workflow_ref:workflow,dom_epoch:1,foreign_links:[],
 nodes:[['a','imports.text','Импорт'],['b','transform.filter_data','Фильтр'],['c','transform.sorting','Сортировка'],['d','exports.text','Экспорт']]
  .map(([id,type,label],i)=>({ref:ref(id),type,label,position:{x:96+160*i,y:96},inputs:id==='a'?[]:[0],outputs:id==='d'?[]:[0],locked:false,dom_epoch:10+i})),
 links:[{source:'a',output:0,target:'b',input:0},{source:'b',output:0,target:'c',input:0},{source:'c',output:0,target:'d',input:0}]});
const remove=(graph,id)=>({...graph,nodes:graph.nodes.filter(n=>n.ref.node_id!==id),links:graph.links.filter(e=>e.source!==id&&e.target!==id)});
const request=(id='b',extra={})=>({document_id:'doc',workflow_ref:workflow,target:{kind:'delete',ref:ref(id),...extra},inputs:[]});

function fixture(change=()=>{}) {
 let graph=chain();change(graph);
 const calls=[];
 const adapter={observe:async()=>structuredClone(graph),preflight:async()=>assert.fail('deletion has no create preflight'),
  positionMatches:()=>assert.fail('deletion never matches positions'),reconcile:async()=>({verified:false}),
  mutate:async effect=>{calls.push(effect.kind);graph=remove(graph,effect.parameters.ref.node_id);return {status:'SUCCEEDED',effect_possible:true,cleanup_complete:true};}};
 const operation={id:'delete',deadline:Date.now()+10000};
 return {adapter,operation,calls,get graph(){return graph;},set graph(value){graph=value;},
  run:(r=request())=>prepareNodeTarget({request:r,operation,adapter,record:async e=>e})};
}

test('delete_node verifies exactly the node and its own links disappearing',()=>{
 const before=chain(),effect={kind:'delete_node',parameters:{ref:ref('b')},before};
 const proof=verifyNodeTargetEffect(effect,remove(before,'b'));
 assert.deepEqual(proof.removed_links,before.links.slice(0,2));assert.deepEqual(proof.removed_variable_links,[]);
 for(const [name,mutation] of Object.entries({
  kept:g=>{g.nodes.push(structuredClone(before.nodes[1]));},
  other_node:g=>{g.nodes.pop();},
  other_link:g=>{g.links=[];},
  residual_edge:g=>{g.links.push({source:'a',output:0,target:'b',input:0});},
  moved:g=>{g.nodes[0].position.x+=8;},
  foreign:g=>{g.foreign_links.push('MF;TF-1;Graph;x|Output_Connection-0|y|Input_Connection-0');},
  epoch:g=>{g.dom_epoch++;},
 })){const after=structuredClone(remove(before,'b'));mutation(after);assert.equal(verifyNodeTargetEffect(effect,after),null,name);}
 // A deleted node's redrawn neighbours are the same domain graph.
 const redrawn=remove(before,'b');for(const n of redrawn.nodes)n.dom_epoch++;
 assert.ok(verifyNodeTargetEffect(effect,redrawn));
});

test('delete_node may remove only its own native REST service edge',()=>{
 const tid='MF;TF-1;Graph;Подключение|Output_Connection-0|REST|Input_Connection-0';
 const before={...chain(),foreign_links:[tid],rest_connection_links:[{tid,source:'conn',target:'b',output:'connection:0',input:'connection:0'}]};
 before.nodes.push({ref:ref('conn'),type:'bg-vendor-icon-restclientconnection',label:'Подключение',position:{x:96,y:300},inputs:[],outputs:[],locked:false});
 const effect={kind:'delete_node',parameters:{ref:ref('b')},before},after={...remove(before,'b'),foreign_links:[],rest_connection_links:[]};
 assert.equal(verifyNodeTargetEffect(effect,after).removed_service_links.length,1);
 assert.equal(verifyNodeTargetEffect({...effect,parameters:{ref:ref('c')}},{...remove(before,'c'),foreign_links:[],rest_connection_links:[]}),null);
});

test('deleting the middle node of four keeps the other nodes and links',async()=>{
 const f=fixture(),result=await f.run();
 assert.equal(result.status,'SUCCEEDED',result.error);assert.equal(result.phase,'target_deleted');
 assert.deepEqual(result.deleted_node,{ref:ref('b'),type:'transform.filter_data',label:'Фильтр'});
 assert.deepEqual(result.removed_links.map(e=>e.source+'>'+e.target),['a>b','b>c']);
 assert.deepEqual(f.graph.nodes.map(n=>n.ref.node_id),['a','c','d']);assert.deepEqual(f.graph.links,[{source:'c',output:0,target:'d',input:0}]);
 assert.equal(result.package_saved,false);assert.deepEqual(f.calls,['delete_node']);
 const replay=await f.run();assert.equal(replay.replayed,true);assert.deepEqual(f.calls,['delete_node']);
});

for(const [name,change,r,pattern] of [
 ['absent',()=>{},request('missing'),/absent or its identity is ambiguous/],
 ['ambiguous',g=>{g.nodes.push(structuredClone(g.nodes[1]));},request(),/bounds or contains ambiguous/],
 ['locked',g=>{g.nodes[1].locked=true;},request(),/locked or executing/],
 ['submodel input boundary',g=>{g.nodes[1].boundary_role='input';},request(),/boundary node/],
 ['submodel output boundary',g=>{g.nodes[1].type='control.supernode_output';},request(),/boundary node/],
 ['caption',()=>{},request('b',{label:'Другой'}),/different caption/],
 ['busy graph',g=>{g.interaction_ready=false;},request(),/not ready/],
])test('deletion refuses '+name+' before any gesture',async()=>{
 const f=fixture(change),before=structuredClone(f.graph),result=await f.run(r);
 assert.equal(result.status,'NOT_APPLIED');assert.equal(result.partial_effect,false);assert.equal(result.cleanup_complete,true);
 assert.match(result.error,pattern);assert.deepEqual(f.calls,[]);assert.deepEqual(f.graph,before);
});

test('deletion contract rejects foreign workflow, inputs and unknown fields before observation',()=>{
 for(const r of [{...request(),target:{kind:'delete',ref:{...ref('b'),workflow_id:'other'}}},{...request(),inputs:[{source:ref('a'),output:0,input:0}]},
  {...request(),variable_inputs:[]},{...request(),target:{kind:'delete',ref:ref('b'),type:'transform.filter_data'}}])
  assert.throws(()=>validateNodeTargetRequest(r));
 assert.equal(validateNodeTargetRequest(request('b',{label:'Фильтр'})).target.label,'Фильтр');
});

test('an unverified deletion stays ambiguous and is never repeated',async()=>{
 const f=fixture();f.adapter.mutate=async effect=>{f.calls.push(effect.kind);f.graph=remove(remove(f.graph,'b'),'d');return {status:'SUCCEEDED',effect_possible:true,cleanup_complete:true};};
 const result=await f.run();assert.equal(result.status,'AMBIGUOUS');assert.match(result.error,/reconciliation/);
 assert.equal(result.pending,'delete:graph:0');assert.deepEqual(f.calls,['delete_node']);
});

// Native gesture: select exactly the node cell, toolbar Delete, confirm.
function page({selected=true,text='Удалить выделенный узел?',locked=false}={}) {
 let graph=chain(),selection=[],clicks=[];
 const value={graph:()=>graph,clicks,
  evaluate:async(fn,arg)=>{
   const source=fn.toString();
   if(arg?.epoch)return;
   if(source.includes('Native node body hit unavailable')){if(locked)throw Error('Exact unlocked node to delete required');return {x:200,y:120};}
   if(source.includes('getSelectionCells'))return selection.length===1&&selection[0]===arg&&graph.nodes.some(n=>n.ref.node_id===arg);
   throw Error('Unexpected evaluate '+source.slice(0,80));
  },
  locator:selector=>({locator:child=>value.locator(child),count:async()=>1,isVisible:async()=>true,isEnabled:async()=>true,
   evaluate:async()=>({x:10,y:10}),waitFor:async()=>{},textContent:async()=>text,
   click:async()=>{clicks.push(selector);if(selector.includes('msgbox;tlb;yes'))graph=remove(graph,'b');}}),
  mouse:{click:async()=>{clicks.push('body');if(selected)selection=['b'];},move:async()=>{}},
  keyboard:{press:async()=>{}},waitForTimeout:async()=>{},
 };
 return value;
}
const gesture=async options=>{
 const p=page(options),before=chain();
 const task={effect:{id:'delete:graph:0',kind:'delete_node',parameters:{ref:ref('b')},before},deadline:Date.now()+20000,
  request:{document_id:'doc',workflow_ref:workflow}};
 const strip=g=>JSON.stringify({...g,nodes:g.nodes.map(({dom_epoch,...n})=>n)});
 const receipt=await mutateGraph(p,task,async()=>structuredClone(p.graph()),null,null,null,async()=>({fully_visible:true}),(a,b)=>strip(a)===strip(b));
 return {receipt,clicks:p.clicks,graph:p.graph(),before};
};
test('native deletion selects the owned node body and confirms once',async()=>{
 const {receipt,clicks,graph,before}=await gesture();
 assert.equal(receipt.status,'SUCCEEDED',receipt.error);assert.equal(receipt.cleanup_complete,true);
 assert.deepEqual(clicks,['body','[data-tid="MF;TF-1;ModelForm;btnRemoveSelected"]','[data-tid="msgbox;tlb;yes"]']);
 assert.equal(receipt.deletion.confirmation_text,'Удалить выделенный узел?');
 assert.ok(verifyNodeTargetEffect({kind:'delete_node',parameters:{ref:ref('b')},before},graph));
});
test('native deletion never presses Delete without the exact single-node selection',async()=>{
 const {receipt,clicks}=await gesture({selected:false});
 assert.equal(receipt.status,'AMBIGUOUS');assert.match(receipt.error,/owned_node_selection/);
 assert.deepEqual(clicks,['body']);
});
test('an unrelated confirmation is cancelled without deleting',async()=>{
 const {receipt,clicks,graph}=await gesture({text:'Сохранить изменения?'});
 assert.equal(receipt.status,'AMBIGUOUS');assert.equal(receipt.cleanup_complete,true);
 assert.match(receipt.error,/confirmation unavailable/);assert.ok(clicks.includes('[data-tid="msgbox;tlb;no"]'));
 assert.equal(graph.nodes.length,4);
});
test('a locked node is refused before the selection click',async()=>{
 const {receipt,clicks}=await gesture({locked:true});
 assert.equal(receipt.status,'NOT_APPLIED');assert.equal(receipt.effect_possible,false);assert.deepEqual(clicks,[]);
});

// Public tool: running node operations refuse without touching the graph.
function runtime(){
 let graph=chain();const calls=[];
 const adapter={observe:async()=>structuredClone(graph),preflight:async()=>{},positionMatches:()=>false,reconcile:async()=>({verified:false}),
  mutate:async effect=>{calls.push(effect.kind);graph=remove(graph,effect.parameters.ref.node_id);return {status:'SUCCEEDED',effect_possible:true,cleanup_complete:true};}};
 const value=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},allowCandidate:true,execute:async()=>{throw Error('Unexpected public transport');},
  onRecord:async e=>e,nodeTargetAdapterFactory:()=>adapter,
  nodeApplyHandlers:new Map([['imports.text',{revision:'1',modes:['delimited'],validate:()=>{},configure:async()=>{}}]]),
  nodeApplyDriverFactory:()=>({})});
 return {runtime:value,calls,get graph(){return graph;}};
}
const args={operation_id:'del-1',document_id:'doc',workflow_ref:workflow,node:ref('b'),label:'Фильтр'};
test('dock_node_delete deletes through the public tool and reports a user-v1 receipt',async()=>{
 const f=runtime();assert.ok(f.runtime.tools.some(t=>t.name==='dock_node_delete'));
 const result=await dispatchNodeApi(f.runtime,'dock_node_delete',args);
 assert.equal(result.state,'settled');assert.equal(result.outcome.status,'SUCCEEDED',JSON.stringify(result));
 assert.equal(result.outcome.action_key,'node.delete');assert.equal(result.outcome.output.deleted_node.label,'Фильтр');
 assert.deepEqual(f.calls,['delete_node']);
 const reply=JSON.parse(nodeResultReply(result,{userProfile:true,tool:'dock_node_delete'}).content[0].text);
 assert.equal(reply.status,'SUCCEEDED');assert.equal(reply.output.status,'deleted');assert.equal(reply.package_saved,false);
 assert.match(reply.limitations[0],/Deleted node "Фильтр".*2 own link.*package.save_checkpoint/);
 const again=await dispatchNodeApi(f.runtime,'dock_node_delete',args);
 assert.equal(again.outcome.status,'SUCCEEDED');assert.deepEqual(f.calls,['delete_node']);
 await assert.rejects(dispatchNodeApi(f.runtime,'dock_node_delete',{...args,node:{...args.node,workflow_id:'other'}}),/another workflow/);
 await assert.rejects(dispatchNodeApi(f.runtime,'dock_node_delete',{...args,type:'x'}),/unknown|Invalid|additional/i);
});
test('dock_node_delete refuses honestly while a node operation runs',async()=>{
 const f=runtime();let release;
 const running=f.runtime.startNodeApply({operation_id:'slow',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
  target:{kind:'new',type:'imports.text'},inputs:[],mode:'delimited',parameters:{},mappings:[],finish:'execute',
  read:{ports:[0],sample_rows:1,require_exact_numbers:false},budgets:{configure_ms:1000,execute_ms:1000,total_ms:1000}});
 assert.equal(running.state,'running');
 const result=await dispatchNodeApi(f.runtime,'dock_node_delete',{...args,operation_id:'del-busy'});
 assert.equal(result.outcome.status,'NOT_APPLIED');assert.equal(result.outcome.effect_possible,false);
 assert.equal(result.outcome.error.code,'NODE_OPERATION_RUNNING');assert.match(result.outcome.error.message,/slow.*not attempted/);
 assert.deepEqual(f.calls,[]);assert.equal(f.graph.nodes.length,4);
 const reply=JSON.parse(nodeResultReply(result,{userProfile:true,tool:'dock_node_delete'}).content[0].text);
 assert.equal(reply.next_step.tool,'dock_node_wait');assert.match(reply.limitations[0],/Nothing was deleted/);
 release=f.runtime.closeNodeOperations?.();await release;
});
test('dock_node_delete is a compact additive model tool',()=>{
 const tool=userNodeTool(nodeApiTools.find(t=>t.name==='dock_node_delete'));
 assert.deepEqual(tool.inputSchema.required,['operation_id','document_id','workflow_ref','node']);
 assert.match(tool.description,/explicitly asks/);assert.match(tool.description,/JavaScript/);
 assert.ok(Buffer.byteLength(JSON.stringify({name:tool.name,description:tool.description,inputSchema:tool.inputSchema}))<=2400);
});
