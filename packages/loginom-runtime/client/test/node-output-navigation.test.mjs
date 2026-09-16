import test from 'node:test';
import assert from 'node:assert/strict';
import {returnFromOutputTable} from '../lib/node-output-procedure.mjs';
function fixture() {
 const table={view_guid:'view',port_guid:'port',table_tid:'Table'};
 const node={verified:true,document_id:'doc',workflow_id:'flow',node_id:'node'};
 const path=[{tid:'scenario',label:'Сценарий'}];
 const before={prepared_node_context:{...node,surface:'views'},node_outputs:{verified:true,surface:'views',tables:[{...table,active:true}]},
  workflow_navigation:{status:'observed',control_ref:'parent',control_tid:'scenario',path},ui:{elements:[{ref:'parent',tid:'scenario',allowed_actions:['click']}]}};
 const after={prepared_node_context:{...node,surface:'graph'},node_outputs:{verified:true,surface:'graph',ports:[{port_guid:'port',active:true}]},navigation_context:{status:'observed',path}};
 let calls=0;const mutations=[];
 const channel={observe:async o=>{const s=calls++===0?before:after;assert.ok(o.readOutputs&&o.readNavigation);assert.ok(o.ready(s),'readiness');return s;},
  perform:async o=>{assert.ok(o.ready(before),'mutation readiness');mutations.push(o.resolve(before));}};
 return {table,before,after,mutations,channel};
}
test('Table returns to its scenario in one click without execution or wizard reopen',async()=>{
 const f=fixture(),r=await returnFromOutputTable(f.channel,f.table);
 assert.equal(r.verified,true);assert.equal(r.execution_started,false);assert.equal(r.reopen_performed,false);
 assert.deepEqual(f.mutations,[{verb:'click',ref:'parent'}]);
});
for(const [name,change] of Object.entries({
 wrong_table:f=>f.before.node_outputs.tables[0].view_guid='other',
 wrong_port:f=>f.before.node_outputs.tables[0].port_guid='other',
 inactive:f=>f.before.node_outputs.tables[0].active=false,
 ambiguous_control:f=>f.before.ui.elements.push({...f.before.ui.elements[0]}),
 unobserved_navigation:f=>f.before.workflow_navigation.status='unobserved',
}))test('return refuses '+name+' before navigation',async()=>{const f=fixture();change(f);await assert.rejects(returnFromOutputTable(f.channel,f.table));assert.equal(f.mutations.length,0);});
for(const [name,change] of Object.entries({
 foreign_node:f=>f.after.prepared_node_context.node_id='other',
 wrong_workflow:f=>f.after.navigation_context.path=[{tid:'other',label:'Сценарий'}],
 inactive_port:f=>f.after.node_outputs.ports[0].active=false,
 foreign_port:f=>f.after.node_outputs.ports[0].port_guid='other',
}))test('return requires final '+name+' guard',async()=>{const f=fixture();change(f);await assert.rejects(returnFromOutputTable(f.channel,f.table));assert.equal(f.mutations.length,1);});
