import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareNodeTarget} from '../lib/node-target.mjs';
const workflow={workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]};
const ref=node_id=>({document_id:'doc',workflow_id:'wf',node_id});
function fixture(label){
 const request={document_id:'doc',workflow_ref:workflow,target:{kind:'new',type:'variables.column_union',position:{x:560,y:80},...(label?{label}:{})},inputs:[],variable_inputs:[0,1].map(input=>({source:ref('s'+input),output:0,input,kind:'variables'}))};
 const graph={complete:true,dom_epoch:1,document_id:'doc',workflow_ref:workflow,nodes:[0,1].map(i=>({ref:ref('s'+i),type:'variables.calculator',label:'Source '+i,inputs:[],outputs:[],variable_outputs:[{kind:'variables',port:0,port_guid:'out'}],position:{x:80,y:80+200*i}})),links:[],variable_links:[],foreign_links:[]};
 const calls=[],operation={id:'union',deadline:Date.now()+30000},record=async e=>e;
 const adapter={observe:async()=>structuredClone(graph),preflight:async()=>{},positionMatches:(n,p)=>JSON.stringify(n.position)===JSON.stringify(p),
  async mutate(effect){calls.push(structuredClone(effect));const p=effect.parameters;
   if(effect.kind==='create')graph.nodes.push({ref:ref('u'),type:p.type,label:p.label??'Соединение (переменные)',position:p.position,inputs:[],outputs:[],variable_inputs:[0,1].map(port=>({kind:'variables',port,port_guid:'in'+port})),variable_outputs:[{kind:'variables',port:0,port_guid:'out'}]});
   else if(effect.kind==='connect'){
    const target=graph.nodes.at(-1);if(!calls[0].parameters.label)target.label='Параметр, Заголовок (+4)';
    graph.variable_links.push({...p.edge,source_port_guid:'out',target_port_guid:'in'+p.edge.input});
   }else throw Error('unexpected '+effect.kind);
   return {status:'SUCCEEDED',cleanup_complete:true};
  }};
 return {request,graph,calls,operation,run:()=>prepareNodeTarget({request,operation,adapter,record})};
}
test('omitted union caption gets a stable unique label before either variable connection, with no connect relaxation',async()=>{
 const f=fixture();const before=structuredClone(f.request),result=await f.run();
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));assert.deepEqual(f.request,before);
 assert.equal(f.calls[0].parameters.label,'Соединение переменных');
 assert.deepEqual(f.calls.filter(c=>c.kind==='connect').map(c=>c.parameters.edge.input),[0,1]);
 assert.equal(f.graph.nodes.at(-1).label,'Соединение переменных');
 assert.equal((await f.run()).status,'SUCCEEDED');assert.equal(f.calls.length,3);
 const g=fixture();g.graph.nodes.push({...g.graph.nodes[0],ref:ref('existing'),label:'Соединение переменных'});
 assert.equal((await g.run()).status,'SUCCEEDED');assert.equal(g.calls[0].parameters.label,'Соединение переменных 2');
});
test('explicit union captions remain caller-owned',async()=>{
 const f=fixture('User union');assert.equal((await f.run()).status,'SUCCEEDED');assert.equal(f.calls[0].parameters.label,'User union');
});
