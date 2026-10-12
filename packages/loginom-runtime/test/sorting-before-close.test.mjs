import test from 'node:test';import assert from 'node:assert/strict';
import {checkSortingAdmission,checkSortingTable,bindSortingNative} from '../src/acceptance/sorting-before-close-v1.mjs';
import {readNativeVariant,nativeVariantStatus} from '../client/lib/variant-native-read.mjs';
import {decodeVariantFrame} from '../client/lib/variant-native-decode.mjs';
import {adaptRead} from '../client/lib/variant-native-values.mjs';
import {fake} from './sorting-native-page-fixture.mjs';
const binding={revision:1,harness:'sorting-before-close-v1',owner:'o',run:'r',lease:'o:r',chat:'c',admission:'a',generation:1,expires:Date.now()+600000,account:'account',session:'s',packagePath:'/account/test.lgp'};
const identity={session_id:'s',account:'account',package_path:'/account/test.lgp',document_id:'d',tab_tid:'tab',loginom_build:'7.4.2'};
const node={document_id:'d',workflow_id:'w',node_id:'n'},execution={status:'completed',execution_id:'d:1:2'};
const ordinary={status:'SUCCEEDED',cleanup_complete:true,node,execution,configuration:{readback:{kind:'sorting',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node,keys:[{name:'Scalar',type:'variant',order:0,direction:'ASC'}],receipt_ids:['a','b','c','d','e']}},output:{ports:[{port:0,port_guid:'p',row_count:1,schema:[{name:'Scalar',label:'Scalar',type:'variant'}],fresh:true,execution_id:execution.execution_id}]}};
const args={...node,package_id:'d:w',port_guid:'p',execution,tab_tid:'tab',prefix:'TF',origin:'http://test',build:'7.4.2',account:'account',schema:[{name:'Scalar',label:'Scalar',type:6}]};
function page(mode){const f=fake(mode);f.node.FIconCls='bg-vendor-icon-sorting';f.dc.PrepareColumnInfoAndRowCount=()=>{};f.dc.InitOutput=()=>{};f.store.proxy.read=()=>{};return f}
test('admission requires actual ordinary verified settings; sample is not full proof',()=>{
 const c=checkSortingAdmission(binding,identity,ordinary);assert.deepEqual(c.node,node);
 assert.throws(()=>checkSortingTable({coverage:{table_complete:false}},c),/FULL_READ/)
});
for(const [name,change]of Object.entries({legacy:b=>b.revision=0,copied:b=>b.harness='calculator-grouped-before-done-v1',lease:b=>b.lease='foreign',generation:b=>b.generation=0,deadline:b=>b.expires=0,owner:b=>b.owner='',chat:b=>b.chat='',account:b=>b.account='foreign',session:b=>b.session='foreign',path:b=>b.packagePath='/foreign/x.lgp'}))test('refuse '+name,()=>{const b=structuredClone(binding);change(b);assert.throws(()=>checkSortingAdmission(b,identity,ordinary))});
for(const [name,change]of Object.entries({running:n=>n.execution.status='running',unknown:n=>n.cleanup_complete=false,stale:n=>n.output.ports[0].fresh=false,port:n=>n.output.ports[0].port=1,keys:n=>n.configuration.readback.keys[0].order=1,identity:n=>n.configuration.readback.node={...n.node,node_id:'foreign'}}))test('ordinary refusal '+name,()=>{const n=structuredClone(ordinary);change(n);assert.throws(()=>checkSortingAdmission(binding,identity,n))});
test('fresh Sorting native object -> actual321 full typed read; Page/Ext/RPC are doubles',async()=>{
 const f=page(),before=await bindSortingNative(f.page,args);const b={...before,runtime_binding_id:'test-binding_id'};delete b.count_loader_sources;
 const raw=await readNativeVariant(f.page,b,decodeVariantFrame);const lifecycle=await nativeVariantStatus(f.page);
 const table=adaptRead(raw,{expected:{...b,read_id:raw.read_id},lifecycle,consistency:{kind:'observed_local',changed:false,exclusive_operation:true,stability_basis:'owned_static_completed_fixture'}});
 const full=checkSortingTable(table,checkSortingAdmission(binding,identity,ordinary));assert.equal(full.rows.length,1);assert.equal(full.rows[0][0].value,'1');assert.deepEqual(f.counters,{sent:1,released:2});

});
for(const [name,mutate]of Object.entries({foreignNode:f=>f.node.FGuid='foreign',wrongDomain:f=>f.node.FIconCls='bg-vendor-icon-columnflipping',running:f=>f.node.FRunning=true,unknownCount:f=>f.dt.FTotalRowCount=undefined,wide:f=>f.dt.FTotalRowCount=51,missingRoot:f=>f.env.document.querySelectorAll=()=>[],foreignAccount:f=>f.env.bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection.UserName='foreign',staleExecution:f=>f.root.internalId='other',schema:f=>f.dc.FColumnInfosStore.data.items[0].data.DataType=3}))test('native refusal before RPC '+name,async()=>{const f=page();mutate(f);await assert.rejects(()=>bindSortingNative(f.page,args));assert.equal(f.counters.sent,0)});

for(const mutation of [t=>t.coverage.table_complete=false,t=>t.cells.push({...t.cells[0]}),t=>t.cells[0].column=1,t=>t.cells[0].precision='rounded',t=>t.binding.execution.execution_id='d:1:9'])test('full read completeness/order/precision/freshness refusal',()=>{
 const t={coverage:{table_complete:true},binding:{node_id:'n',port_guid:'p',execution:structuredClone(execution)},row_count:1,schema:[{name:'Scalar',label:'Scalar',type:'variant'}],cells:[{row:0,column:0,precision:'exact_native',value:0}]};mutation(t);assert.throws(()=>checkSortingTable(t,checkSortingAdmission(binding,identity,ordinary)))
});
test('duplicates retain positions and multiplicity, typed empty retains schema',()=>{
 const t={coverage:{table_complete:true},binding:{node_id:'n',port_guid:'p',execution},row_count:2,schema:[{name:'Scalar',type:'integer'}],cells:[{row:0,column:0,precision:'exact_native',value:'0'},{row:1,column:0,precision:'exact_native',value:'0'}]};
 const c=checkSortingAdmission(binding,identity,ordinary);c.port.schema=t.schema;c.port.row_count=2;const r=checkSortingTable(t,c);assert.deepEqual(Object.values(r.multiplicity),[2]);t.row_count=0;t.cells=[];c.port.row_count=0;assert.deepEqual(checkSortingTable(t,c).rows,[]);assert.equal(t.schema[0].type,'integer');
});
