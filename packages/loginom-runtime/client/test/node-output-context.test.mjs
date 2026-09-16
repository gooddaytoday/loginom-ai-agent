import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readOutputContext,makeNodeOutputContextCode} from '../lib/node-output-context.mjs';
const portGuid='11111111-1111-1111-1111-111111111111',viewGuid='22222222-2222-2222-2222-222222222222';
function fixture(surface='graph') {
 const binding={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;TF-1',navigation_path:[]},node:{node_id:'node'}};
 const base={verified:true,surface,tid:'MF;TF-1;Graph;Import',document_id:'doc',workflow_id:'flow',node_id:'node'};
 const elements=new Map(),el=tid=>{const e={getAttribute:k=>k==='data-tid'?tid:null,contains:x=>e.children?.includes(x)};elements.set(tid,e);return e;};
 const port=el(base.tid+';Output_Data-7');port.querySelectorAll=()=>[{getAttribute:k=>k==='href'?'/output_table_active.svg':null}];
 const cell={},node={FGuid:'node',FCell:cell,FPorts:[{FCollection:[{FGuid:portGuid,FCell:{},FDisplayName:'Data'}]}]};
 const d={FNodes:{FCollection:[node]},FmxGraph:{container:{contains:e=>e===port},getSelectionCells:()=>[cell],view:{getState:()=>({shape:{node:port}})}}};
 const panelEl=el('MF;TF-1;ViewsForm;cntPorts;'+portGuid),panel={el:{dom:panelEl}},nativeCard=el('MF;TF-1;ViewsForm;ViewerCard');panelEl.children=[nativeCard];
 const table=el('MF;TF-1;ViewsForm;BrowseView');class BrowseView{};class BrowseViewVendor{};
 const desc={Vendor:new BrowseViewVendor(),PortPanel:panel,ViewerCard:{FView:{el:{dom:nativeCard}}},BaseView:Object.assign(new BrowseView(),{FView:{el:{dom:table}}})};
 const model={FDiagram:d,FPortList:{[portGuid]:{Type:0,Panel:panel}},FViewDescList:{[viewGuid]:desc},FActiveViewGuid:viewGuid};
 const Workspace={getActiveTab:()=>({Controller:{FController:model}})};
 const app={Application:{FInstance:{FMainForm:{Items:{Workspace}}}}};
 const document={querySelectorAll:q=>{const e=elements.get(JSON.parse(q.slice(10,-1)));return e?[e]:[];}};
 const context=vm.createContext({document,bg:{app}});
 const page={evaluate:(fn,arg)=>structuredClone(vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',context))};
 return {binding,base,node,d,model,desc,panelEl,table,port,page,readNode:async()=>({...base})};
}
test('native output IDs retain public order and distinguish selection from activation',async()=>{
 const f=fixture(),r=await readOutputContext(f.page,f.binding,f.readNode);assert.equal(r.verified,true);
 assert.equal(r.ports[0].native_index,7);assert.equal(r.ports[0].index,0);assert.equal(r.ports[0].port_guid,portGuid);
 assert.equal(r.node_selected,true);assert.equal(r.ports[0].active,true);assert.equal(r.execution_freshness_verified,false);
});
test('view descriptors bind the active table to a native port panel, not its title',async()=>{
 const f=fixture('views'),r=await readOutputContext(f.page,f.binding,f.readNode);assert.equal(r.verified,true);
 assert.deepEqual(r.tables.map(t=>[t.port_guid,t.view_guid,t.active]),[[portGuid,viewGuid,true]]);
 assert.equal(r.execution_freshness_verified,false);
});
for(const [name,change] of Object.entries({
 foreign_panel:f=>f.desc.PortPanel={el:{dom:f.panelEl}},foreign_card:f=>f.panelEl.children=[],
 foreign_table:f=>f.desc.BaseView.FView.el.dom={getAttribute:()=> 'MF;TF-2;ViewsForm;BrowseView'},
 duplicate_port_id:f=>f.model.FPortList.other=f.model.FPortList[portGuid],
}))test('output context rejects '+name,async()=>{const f=fixture('views');change(f);assert.equal((await readOutputContext(f.page,f.binding,f.readNode)).verified,false);});
test('a node change between the two read guards invalidates the result',async()=>{
 const f=fixture();let calls=0;const r=await readOutputContext(f.page,f.binding,async()=>({...f.base,node_id:++calls===1?'node':'other'}));assert.equal(r.reason,'node_context_changed');
});
test('unverified prepared context stops before reading UI data',async()=>{
 let calls=0;const r=await readOutputContext({evaluate:()=>{calls++}}, {},async()=>({verified:false}));assert.equal(r.verified,false);assert.equal(calls,0);
 assert.throws(()=>makeNodeOutputContextCode({}));
});

test('a second native Table card retains descriptor identity with its numbered tid',async()=>{
 const f=fixture('views');f.desc.ViewerCard.FView.el.dom.getAttribute=()=> 'MF;TF-1;ViewsForm;ViewerCard-1';
 const r=await readOutputContext(f.page,f.binding,f.readNode);assert.equal(r.verified,true);assert.equal(r.tables[0].view_guid,viewGuid);
});
for(const suffix of ['-other',';foreign','-1;child'])test('card suffix refuses '+suffix,async()=>{
 const f=fixture('views');f.desc.ViewerCard.FView.el.dom.getAttribute=()=> 'MF;TF-1;ViewsForm;ViewerCard'+suffix;
 assert.equal((await readOutputContext(f.page,f.binding,f.readNode)).verified,false);
});

for(const suffix of ['', '_no_automapping'])for(const state of ['active','inactive','warning','error','hover','unknown'])
test('output activity with icon '+state+suffix,async()=>{
 const f=fixture();f.port.querySelectorAll=()=>[{getAttribute:k=>k==='href'?'/output_table_'+state+suffix+'.svg':null}];
 const r=await readOutputContext(f.page,f.binding,f.readNode);assert.equal(r.verified,true);assert.equal(r.ports[0].active,state==='active');
});
