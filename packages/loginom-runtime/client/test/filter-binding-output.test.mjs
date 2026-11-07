import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveFilterOutputMapping} from '../lib/filter-output.mjs';
function fixture(){
 const node_context={document_id:'doc',workflow_id:'wf',node_id:'filter'};
 return {configuration:{node_context,input_fields:[{name:'Amount'},{name:'RowID'}]},context:{request:{target:{kind:'new'},bindings:[{}]},
  inputMapping:{verified:true,inventory_complete:true,node_context:{...node_context,input_port:{port:0}},target_fields:[{index:0,name:'RowID'},{index:1,name:'Amount'}]}}};
}
test('new bound Filter pins both output layouts to the owned input order rather than picker sorting',()=>{
 const f=fixture(),map=resolveFilterOutputMapping(f.configuration,undefined,f.context);
 assert.deepEqual(map,{autosync:false,fields:[{source:{kind:'configured_field',name:'RowID'}},{source:{kind:'configured_field',name:'Amount'}}]});
});
test('explicit layouts and preexisting Filter paths retain their requested semantics',()=>{
 const f=fixture(),explicit={autosync:true,fields:[]};
 assert.equal(resolveFilterOutputMapping(f.configuration,explicit,f.context),explicit);
 f.context.request.target.kind='existing';assert.deepEqual(resolveFilterOutputMapping(f.configuration,undefined,f.context),{});
 f.context.request.target.kind='new';f.context.request.bindings=[];assert.deepEqual(resolveFilterOutputMapping(f.configuration,undefined,f.context),{});
 delete f.context.request.bindings;assert.deepEqual(resolveFilterOutputMapping(f.configuration,undefined,f.context),{});
});
for(const fault of ['owner','order','duplicate','complete'])test('bound output defaults reject '+fault,()=>{
 const f=fixture(),m=f.context.inputMapping;
 if(fault==='owner')m.node_context.node_id='foreign';
 if(fault==='order')m.target_fields[0].index=1;
 if(fault==='duplicate')m.target_fields[1].name='RowID';
 if(fault==='complete')m.inventory_complete=false;
 assert.throws(()=>resolveFilterOutputMapping(f.configuration,undefined,f.context),/Owned ordered/);
});
