import {decodePortCell,makeNodeVariableOutputCode} from '../lib/node-port-output.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readVariableRecords,readOutputContext,makeNodeOutputContextCode} from '../lib/node-output-context.mjs';
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
 const copies=[];
 const document={querySelectorAll:q=>{const tid=JSON.parse(q.slice(10,-1)),e=elements.get(tid),matches=[...(e?[e]:[]),...copies.filter(c=>c.getAttribute('data-tid')===tid)];return {length:matches.length,...matches,[Symbol.iterator]:function*(){yield*matches;}};}};
 const context=vm.createContext({document,bg:{app}});
 const page={evaluate:(fn,arg)=>structuredClone(vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',context))};
 return {binding,base,node,d,model,desc,panelEl,table,port,copies,page,readNode:async()=>({...base})};
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
test('native descriptor without its UI card retains only pending panel proof',async()=>{
 const f=fixture('views');delete f.desc.ViewerCard;
 const r=await readOutputContext(f.page,f.binding,f.readNode);
 assert.equal(r.verified,false);assert.equal(r.reason,'table_card_pending');assert.equal(r.tables.length,0);
 assert.deepEqual(r.pending_tables,[{port_guid:portGuid,view_guid:viewGuid}]);
 assert.equal(r.port_panels[0].port_guid,portGuid);assert.equal(r.node_context.verified,true);
 assert.equal(r.execution_freshness_verified,false);
});
test('missing UI card does not hide a foreign panel or another invalid descriptor',async()=>{
 const f=fixture('views');delete f.desc.ViewerCard;f.desc.PortPanel={el:{dom:f.panelEl}};
 const r=await readOutputContext(f.page,f.binding,f.readNode);assert.equal(r.reason,'table_card_binding');
 assert.equal(r.pending_tables,undefined);
 const g=fixture('views');g.model.FViewDescList['33333333-3333-3333-3333-333333333333']={...g.desc};
 delete g.desc.ViewerCard;g.panelEl.children=[];
 const other=await readOutputContext(g.page,g.binding,g.readNode);
 assert.equal(other.reason,'table_card_binding');assert.equal(other.card_state,'foreign_or_invalid_card');
 assert.equal(other.pending_tables,undefined);
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

for(const inside of [false,true])test('graph output inventory '+(inside?'rejects a duplicate inside the native canvas':'ignores an outline copy outside the native canvas'),async()=>{
 const f=fixture(),copy={getAttribute:k=>f.port.getAttribute(k)};f.copies.push(copy);
 f.d.FmxGraph.container.contains=e=>e===f.port||(inside&&e===copy);
 const r=await readOutputContext(f.page,f.binding,f.readNode);
 assert.equal(r.verified,!inside);if(inside)assert.equal(r.reason,'port_identity');else assert.equal(r.ports.length,1);
});

function variableStore(){
 const values=[[1,false],[4,0],[5,''],[5,null]];
 const items=values.map(([DataType,ValueVariant],Index)=>({isModel:true,data:{ID:Index,Index,Name:'v'+Index,DisplayName:'V'+Index,DataType,ValueVariant,DisplayValue:ValueVariant,ValueIsNull:ValueVariant===null,OriginType:1}}));
 return {items,complete:true,loadCount:1,getTotalCount:()=>items.length,isLoading:()=>false,getCount:()=>items.length,getData:()=>({items})};
}
for(const mode of ['preview','values'])test('W1 complete native variable inventory distinguishes NULL, false, zero and empty string: '+mode,()=>{
 const s=variableStore(),r=readVariableRecords(s,mode,decodePortCell);
 assert.deepEqual(r.variables.map(v=>v.cell.value),[false,'0','',null]);assert.deepEqual(r.variables.map(v=>v.cell.is_null),[false,false,false,true]);
 assert.deepEqual(r.completeness,{count:4,store_count:4,unique_ids:4,loaded:true});
});
for(const fault of ['loading','truncated','duplicate-id','duplicate-name','unsupported','unloaded','unsafe-integer','foreign-origin'])test('W1 refuses unproved variable inventory: '+fault,()=>{
 const s=variableStore();
 if(fault==='loading')s.isLoading=()=>true;if(fault==='truncated')s.getCount=()=>5;
 if(fault==='duplicate-id')s.items[1].data.ID=0;if(fault==='duplicate-name')s.items[1].data.Name='v0';
 if(fault==='unsupported')s.items[0].data.DataType=6;if(fault==='unloaded')s.items[1].data.ValueVariant=undefined;
 if(fault==='unsafe-integer')s.items[1].data.ValueVariant=Number.MAX_SAFE_INTEGER+1;if(fault==='foreign-origin')s.items[0].data.OriginType=0;
 assert.throws(()=>readVariableRecords(s,fault==='foreign-origin'?'values':'preview',decodePortCell));
});
test('W1 executable variable reader refuses a fabricated execution before any browser call',()=>{
 assert.throws(()=>makeNodeVariableOutputCode({document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'tab',navigation_path:[]},node:{document_id:'doc',workflow_id:'wf',node_id:'n'}},{port:0,execution:{execution_id:'fake'}}));
});

test('W1 observed DataToVar real output uses the existing finite binary64 decoder, without admitting real writes',()=>{
 const s=variableStore();s.items[1].data.DataType=3;s.items[1].data.ValueVariant=3.5;
 assert.equal(readVariableRecords(s,'preview',decodePortCell).variables[1].cell.value,3.5);
 assert.throws(()=>readVariableRecords(s,'values',decodePortCell));
 s.items[1].data.ValueVariant=Infinity;assert.throws(()=>readVariableRecords(s,'preview',decodePortCell));
 for(const patch of [{complete:false},{loadCount:0},{getTotalCount:()=>8}])assert.throws(()=>readVariableRecords({...variableStore(),...patch},'preview',decodePortCell));
});
