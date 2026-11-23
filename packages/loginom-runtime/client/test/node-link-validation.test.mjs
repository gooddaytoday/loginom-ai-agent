import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readNodeTargetLinkValidation} from '../lib/executor.mjs';
import {makeRestLinkCode} from '../lib/rest-request.mjs';
import {linkPage,linkParameters,run} from './support/executor-fixture.mjs';
function fixture(value,kind='data'){
 const context={request:{document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'wf'}},dom_epoch:1,nodes:[{id:'s',tid:'Source'},{id:'t',tid:'Target'}]};
 const make=(id,label,direction)=>{const tid='wf;Graph;'+label+';'+direction+'_'+(kind==='connection'?'Connection':kind==='tree'?'DataTree':'Data')+'-0',element={getAttribute:()=>tid,getBoundingClientRect:()=>({x:100,y:200,width:12,height:24})},node={FGuid:id,FCell:{},FPorts:[]},port={parent:node,FCell:{id,parent:node.FCell}};node.FPorts=[{FCollection:[port]}];return {node,port,element,tid};};
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
 return {context,diagram,handler,graph,target,source,root,document,page,browser,preparation,read:()=>readNodeTargetLinkValidation(page,context,{source_port:{kind,index:0},target_port:{kind,index:0}})};
}

function restServiceLink(mode='ready'){
 const f=fixture(true,'connection'),moves=[];let clock=1000,down=false,upCalls=0,drops=0,point,shift=0,entered=false,edge;
 const rootTid='wf;ModelForm;cmpDiagram',edgeTid='wf;Graph;Source|Output_Connection-0|Target|Input_Connection-0';
 f.source.port.FCell.id='115';f.target.port.FCell.id='237';f.source.port.FCell.edges=[];
 const cache=f.diagram.FValidatedConnectionsCache.FCache={'115':{'237':['pending','expired'].includes(mode)?undefined:mode!=='rejected'}};
 f.root.getAttribute=()=>rootTid;f.root.isConnected=true;
 f.source.element.getBoundingClientRect=()=>({x:20,y:20,width:12,height:24});
 f.target.element.getBoundingClientRect=()=>({x:100+shift,y:200,width:12,height:24});
 f.document.elementFromPoint=(x,y)=>[f.source.element,f.target.element].find(e=>{const b=e.getBoundingClientRect();return x>=b.x&&x<b.x+b.width&&y>=b.y&&y<b.y+b.height;});
 const edgeElement={getAttribute:()=>edgeTid},getState=f.graph.view.getState;
 f.graph.view.getState=cell=>cell===f.source.node.FCell?{shape:{node:{getAttribute:()=> 'wf;Graph;Source'}}}
  :cell===f.target.node.FCell?{shape:{node:{getAttribute:()=> 'wf;Graph;Target'}}}:cell===edge?{shape:{node:edgeElement}}:getState(cell);
 const locator=selector=>{
  const elements=()=>selector.includes('|Input_Connection-0')?edge?[edgeElement]:[]
   :[f.source,f.target].filter(p=>selector.includes(JSON.stringify(p.tid))).map(p=>p.element);
  return {locator,count:async()=>elements().length,evaluate:async(fn,arg)=>vm.runInContext('('+fn.toString()+')',f.browser)(elements()[0],arg),
   evaluateAll:async(fn,arg)=>vm.runInContext('('+fn.toString()+')',f.browser)(elements(),arg)};
 };
 f.page.locator=locator;f.browser.Date=class extends Date{static now(){return clock;}};
 f.page.waitForTimeout=async ms=>{clock+=ms;if(mode==='pending'&&clock>=1100)cache['115']['237']=true;};
 f.page.mouse={move:async(x,y)=>{
  moves.push({x,y});
  if(down){
   const same=point?.x===x&&point?.y===y;
   f.handler.marker.validState=mode==='marker'||(same&&mode!=='unready')?null:{cell:f.target.port.FCell};
   if(!entered){entered=true;if(mode==='shifted')shift=3;if(mode==='unready')f.handler.marker.validState=null;if(mode==='foreign')f.preparation.id='foreign';}
  }
  point={x,y};
 },down:async()=>{down=true;f.graph.isMouseDown=true;f.handler.first={};f.handler.previous={cell:f.source.port.FCell};f.diagram.FHandlers.FConnectionHandler.FDelegationHandler.FMouseDown=true;},
 up:async()=>{upCalls++;if(down&&f.handler.marker.validState?.cell===f.target.port.FCell&&cache['115']['237']===true){drops++;edge={source:f.source.port.FCell,target:f.target.port.FCell};f.source.port.FCell.edges=[edge];}down=false;f.graph.isMouseDown=false;}};
 if(mode==='existing'){edge={source:f.source.port.FCell,target:f.target.port.FCell};f.source.port.FCell.edges=[edge];}
 const task={document_id:'doc',workflow_ref:f.context.request.workflow_ref,node:{node_id:'t'},connection:{reference_node_id:'s'},dom_epoch:1,deadline:mode==='expired'?1150:30000};
 return {run:()=>vm.runInContext('('+makeRestLinkCode(task)+')',f.browser)(f.page),moves,get down(){return down;},get upCalls(){return upCalls;},get drops(){return drops;}};
}

for(const mode of ['ready','shifted','unready','pending'])test('serialized REST service drag preserves the native marker: '+mode,async()=>{
 const f=restServiceLink(mode),result=await f.run();
 assert.equal(result.verified,true,result.error);assert.equal(result.cleanup_complete,true);
 assert.equal(f.drops,1);assert.equal(f.upCalls,1);assert.equal(f.down,false);
 assert.equal(f.moves.length,['ready','pending'].includes(mode)?2:3);
});
for(const [mode,error] of [['marker','native target marker is not ready'],['rejected','native compatibility rejected'],['expired','validation deadline elapsed'],['foreign','Link validation workflow changed']])test('serialized REST service drag retains refusal: '+mode,async()=>{
 const f=restServiceLink(mode),result=await f.run();
 assert.equal(result.verified,false);assert.equal(result.effect_possible,true);assert.equal(result.cleanup_complete,false);assert.match(result.error,new RegExp(error));
 if(mode!=='foreign')assert.equal(f.drops,0);assert.equal(f.upCalls,1);assert.equal(f.down,false);
 if(mode==='marker'){
  const diagnostic=JSON.parse(result.error.split('; ')[1]);
  assert.equal(diagnostic.before.state,'ready');assert.equal(diagnostic.after.target_ready,false);
  assert.equal(diagnostic.after.target_cell_id,'237');assert.equal(diagnostic.root.actual,'wf;ModelForm;cmpDiagram');assert.equal(diagnostic.root.count,1);
  assert.ok(result.error.length<=1000);
 }
});
test('existing REST service edge remains a gesture-free verified continuation',async()=>{
 const f=restServiceLink('existing'),result=await f.run();assert.equal(result.verified,true);assert.equal(result.effect_possible,false);assert.equal(f.moves.length,0);assert.equal(f.upCalls,0);
});
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
 if(mode==='marker'){
  const diagnostic=page[Symbol.for('loginom-dock.node-target-link-diagnostic')];
  assert.equal(diagnostic.after.state,'ready');assert.equal(diagnostic.after.target_ready,false);
  assert.deepEqual(diagnostic.before.point,diagnostic.after.point);
  assert.doesNotMatch(JSON.stringify(result),/marker_cell|target_cell_id|node-target-link-diagnostic/);
 }
});

test('REST service links retain native cached compatibility and marker ownership',async()=>{const f=fixture(true,'connection');assert.equal((await f.read()).state,'ready');f.handler.marker.validState=null;assert.equal((await f.read()).target_ready,false);f.diagram.FHandlers.FConnectionHandler.FDelegationHandler.FMouseDown=false;await assert.rejects(f.read(),/owner/);});
test('tree_io link validation binds the native tree sockets and retains drag ownership',async()=>{
 const f=fixture(true,'tree');assert.equal((await f.read()).state,'ready');
 f.target.port.parent={};await assert.rejects(f.read(),/port changed/);
});

// LAB-1690 diagnostic: marker cell 210 was ready at (683,714); moving to
// that identical center cleared validState while compatibility stayed ready.
for(const shift of [0,3])test('ready marker preserves the held drag and recenters only for changed geometry: '+shift,async()=>{
 const page=linkPage(),evaluate=page.evaluate.bind(page),move=page.mouse.move;
 let invalidated=false,reads=0;
 page.mouse.move=async(x,y,options)=>{
  if(page.down&&page.point.x===x&&page.point.y===y)invalidated=true;
  return move(x,y,options);
 };
 page.evaluate=async(fn,arg)=>{
  if(fn.toString().includes('Link validation workflow changed')){
   reads++;assert.equal(page.down,true);
   const box=page.elements().find(e=>e.node==='Приёмник'&&e.port==='Input_Data-0').box;
   return {state:'ready',target_ready:!invalidated,point:{x:box.x+box.width/2+shift,y:box.y+box.height/2}};
  }
  if(fn.toString().includes('Node target link context changed'))return;
  return evaluate(fn,arg);
 };
 const result=await run(page,'link.create',linkParameters(page,'data'),{node_target_context:{},deadline_at:page.clock+30000});
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
 assert.equal(invalidated,false);assert.equal(reads,2);
 const box=page.elements().find(e=>e.node==='Приёмник'&&e.port==='Input_Data-0').box;
 assert.equal(page.point.x,box.x+box.width/2+shift);
 assert.equal(page.drops,1);assert.equal(page.upCalls,1);assert.equal(page.down,false);
});
