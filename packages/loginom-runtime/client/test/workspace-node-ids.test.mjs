import test from 'node:test';
import assert from 'node:assert/strict';
import {Page} from './support/workspace-ui-fixture.mjs';
import {createObservationPages} from '../lib/observation-pages.mjs';

const first='00000000-0000-4000-8000-000000000001',second='00000000-0000-4000-8000-000000000002';
function fixture(){
 const page=new Page(),tid='MF;TF-1;Graph;Saved_JS';
 const body=page.add('g',tid,'',{x:50,y:100,width:80,height:60});
 page.add('text',tid+';Label;Label','Saved JS',{x:50,y:165,width:80,height:20});
 const graph=page.graphModels.get(body.parentElement),node=graph.byTid.get(tid);
 node.FGuid=first;node.FIconCls='bg-vendor-icon-javascript';
 return {page,tid,body,graph,node};
}
test('W1 observation and paging retain builtin identity and typed port ordinals',async()=>{
 const {page,node,tid}=fixture();node.FIconCls='bg-vendor-icon-modelvariables';
 for(const index of [0,1,2,3,4]){
  page.add('g',tid+';Output_Var-'+index,'',{x:140,y:100+index*12,width:10,height:10});
  node.FPorts[1].FCollection.at(-1).FSubType=3;
 }
 const raw=await page.execute({mode:'observe'}),n=raw.output.nodes[0];
 assert.equal(n.type,'variables.user');assert.deepEqual(n.target_modes,['existing']);
 assert.deepEqual(n.variable_outputs.map(p=>[p.kind,p.port,p.native_index]),[0,1,2,3,4].map(p=>['variables',p,p]));
 assert.equal(createObservationPages().retain(raw).output.nodes[0].variable_outputs.length,5);
 assert.deepEqual(page.events,[]);
});
test('W1 control and ordinary variable ordinal zero remain independent',async()=>{
 const {page,node,tid}=fixture();node.FIconCls='bg-vendor-icon-restclient';
 for(const [suffix,subtype] of [['Input_Var-1',3],['Input_ControlVar',4]]){
  page.add('g',tid+';'+suffix,'',{x:40,y:110+subtype*12,width:10,height:10});node.FPorts[0].FCollection.at(-1).FSubType=subtype;
 }
 const n=(await page.observe()).nodes[0];
 assert.deepEqual(n.variable_inputs.map(p=>[p.kind,p.port,p.native_index]),[['variables',0,1],['control',0,0]]);
});
test('W1 builtin remains observable without a visible Label cell',async()=>{
 const {page,node,tid}=fixture();node.FIconCls='bg-vendor-icon-modelvariables';
 page.document.querySelectorAll('[data-tid='+JSON.stringify(tid+';Label;Label')+']')[0].remove();
 const state=await page.observe();assert.equal(state.nodes.length,1);assert.equal(state.nodes[0].type,'variables.user');
 assert.equal(state.nodes[0].node_id,first);
});

test('saved graph exposes the native GUID without using its label as node identity',async()=>{
 const {page,node}=fixture(),snapshot=await page.observe();
 assert.equal(snapshot.nodes.length,1);
 assert.equal(snapshot.nodes[0].node_id,first);
 assert.equal(snapshot.nodes[0].node_ref.node_label,'Saved_JS');
 assert.deepEqual(page.events,[],'identity discovery must not dispatch a gesture');
 const raw=await page.execute({mode:'observe'}),delivered=createObservationPages().retain(raw);
 assert.equal(delivered.output.nodes[0].node_id,first,'public observation pages retain the issued GUID');
 node.FGuid=second;
 assert.equal((await page.observe()).nodes[0].node_id,second,'a fresh read uses the current native identity');
});

test('root discovery does not issue native GUIDs without the complete graph binding',async()=>{
 const {page}=fixture();
 const roots=await page.execute({mode:'observe',discover_roots:true});
 assert.ok(roots.output.nodes.every(n=>n.node_id===undefined));
 assert.deepEqual(page.events,[]);
});

for(const fault of ['invalid_guid','duplicate_guid','accessor_guid','foreign_container','foreign_shape','duplicate_tid'])
test('saved graph does not issue a persistent node ID for '+fault,async()=>{
 const f=fixture();
 if(fault==='invalid_guid')f.node.FGuid='Saved_JS';
 if(fault==='duplicate_guid')f.graph.model.FDiagram.FNodes.FCollection.push({...f.node,FCell:{}});
 if(fault==='accessor_guid')Object.defineProperty(f.node,'FGuid',{get(){throw Error('must not invoke native accessor')}});
 if(fault==='foreign_container')f.graph.model.FDiagram.FmxGraph.container=f.page.document.body;
 if(fault==='foreign_shape')f.graph.states.set(f.node.FCell,{shape:{node:f.page.add('g','foreign','')}});
 if(fault==='duplicate_tid')f.page.add('g',f.tid,'',{x:150,y:100,width:80,height:60});
 const result=await f.page.observe();
 assert.ok(result.nodes.every(n=>n.node_id===undefined));
 assert.deepEqual(f.page.events,[]);
});

test('unbound rendered graph text never becomes a guessed persistent GUID',async()=>{
 const {page,node}=fixture();delete node.FGuid;
 const result=await page.observe();
 assert.equal(result.nodes[0].node_ref.node_label,'Saved_JS');
 assert.equal(result.nodes[0].node_id,undefined);
});
