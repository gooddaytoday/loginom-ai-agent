import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readNodeTargetLinkValidation} from '../lib/executor.mjs';
import {linkPage,linkParameters,run} from './support/executor-fixture.mjs';
function fixture(value){
 const context={request:{document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'wf'}},dom_epoch:1,nodes:[{id:'s',tid:'Source'},{id:'t',tid:'Target'}]};
 const make=(id,label,direction)=>{const tid='wf;Graph;'+label+';'+direction+'_Data-0',element={getAttribute:()=>tid,getBoundingClientRect:()=>({x:100,y:200,width:12,height:24})},node={FGuid:id,FCell:{},FPorts:[]},port={parent:node,FCell:{id,parent:node.FCell}};node.FPorts=[{FCollection:[port]}];return {node,port,element,tid};};
 const source=make('s','Source','Output'),target=make('t','Target','Input');
 const root={querySelectorAll:q=>[source,target].filter(p=>q.includes(JSON.stringify(p.tid))).map(p=>p.element)},document={querySelectorAll:()=>[root]};
 const handler={first:{},previous:{cell:source.port.FCell},marker:{validState:{cell:target.port.FCell}},error:null};
 const graph={container:root,isMouseDown:true,connectionHandler:handler,view:{getState:cell=>({shape:{node:cell===source.port.FCell?source.element:target.element}})}};
 const diagram={FmxGraph:graph,FNodes:{FCollection:[source.node,target.node]},FHandlers:{FConnectionHandler:{FDelegationHandler:{FMouseDown:true}}},FValidatedConnectionsCache:{FCache:{s:{t:value}}}};
 const preparation={document,id:'doc',receipts:new Map([['wf',{workflowId:'wf',phase:'verified'}]]),nodeTargetDomEpochs:{objects:new Map([[root,1]])}};
 const workspace={getActiveTab:()=>({Controller:{FController:{FDiagram:diagram}}})};
 const bg={app:{Application:{FInstance:{FMainForm:{Items:{Workspace:workspace}}}}}};
 const browser=vm.createContext({document,__loginomDockPreparationV1:preparation,bg});
 const page={evaluate:async(fn,arg)=>vm.runInContext('('+fn.toString()+')',browser)(arg)};
 return {context,diagram,handler,graph,target,preparation,read:()=>readNodeTargetLinkValidation(page,context,{source_port:{kind:'data',index:0},target_port:{kind:'data',index:0}})};
}
for(const [value,state] of [[undefined,'pending'],[null,'pending'],[true,'ready'],[false,'rejected']])test('cached validation '+value,async()=>{const r=await fixture(value).read();assert.equal(r.state,state);assert.equal(r.target_ready,true);assert.deepEqual(JSON.parse(JSON.stringify(r.point)),{x:106,y:212});});
for(const [name,change] of Object.entries({document:f=>f.preparation.id='other',root:f=>f.context.dom_epoch=2,node:f=>f.context.nodes[1].id='other',port:f=>f.target.port.parent={},released:f=>f.graph.isMouseDown=false,source:f=>f.handler.previous.cell={},owner:f=>f.diagram.FHandlers.FConnectionHandler.FDelegationHandler.FMouseDown=false,cache:f=>f.diagram.FValidatedConnectionsCache.FCache.s.t='yes'}))test('validation refuses changed '+name,async()=>{const f=fixture(true);change(f);await assert.rejects(f.read());});
test('cache is not a drop marker proof',async()=>{const f=fixture(true);f.handler.marker.validState=null;assert.equal((await f.read()).target_ready,false);});
for(const mode of ['delayed','rejected','expired','foreign','marker','cancelled'])test('serialized held drag '+mode,async()=>{
 const page=linkPage(),evaluate=page.evaluate.bind(page),start=page.clock;let reads=0;
 page.evaluate=async(fn,arg)=>{
  if(fn.toString().includes('Link validation workflow changed')){
   reads++;assert.equal(page.down,true);
   if(mode==='cancelled')page[Symbol.for('loginom-dock.node-target-cancel')]=new Set(['cancelled']);
   if(mode==='foreign')throw Error('Link validation workflow changed');
   const box=page.elements().find(e=>e.node==='Приёмник'&&e.port==='Input_Data-0').box;
   return {state:mode==='rejected'?'rejected':['expired','cancelled'].includes(mode)||page.clock-start<20000?'pending':'ready',point:{x:box.x+box.width/2,y:box.y+box.height/2},target_ready:mode!=='marker'};
  }
  if(fn.toString().includes('Node target link context changed'))return;
  return evaluate(fn,arg);
 };
 if(mode!=='delayed')page.onDrop=()=>{};
 const result=await run(page,'link.create',linkParameters(page,'data'),{node_target_context:{},node_target_cancellation_id:'cancelled',deadline_at:start+(mode==='expired'?1000:30000)});
 assert.equal(result.status,mode==='delayed'?'SUCCEEDED':'AMBIGUOUS',JSON.stringify(result));assert.equal(page.drops,1);assert.equal(page.upCalls,1);assert.equal(page.down,false);assert.ok(reads>0);
 assert.equal(result.trace.filter(e=>e.event==='port_drag_attempt').length,1);assert.equal(result.trace.some(e=>e.event==='link_validation_settled'),mode==='delayed');
 if(mode==='delayed')assert.ok(page.clock-start>=20000);
 if(mode==='expired')assert.match(result.error.message,/deadline/);
 if(mode==='cancelled')assert.match(result.error.message,/cancelled/);
});
