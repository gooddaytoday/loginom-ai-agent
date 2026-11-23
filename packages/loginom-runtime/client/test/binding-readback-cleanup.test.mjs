import test from 'node:test';
import assert from 'node:assert/strict';
import {readFilterBindings} from '../lib/variable-binding-readback.mjs';
function fixture(fault){
 const node={document_id:'doc',workflow_id:'wf',node_id:'filter',verified:true,tid:'N',locked:false};
 const owner={status:'observed',node:{tid:'flow>Filter',label:'Filter'},path:[{tid:'flow',label:'Scenario'},{tid:'n',label:'Filter'},{tid:'settings',label:'Settings'}]};
 const native={verified:true,inventory_complete:true,dialogs:[],rows:[{kind:'condition',field:{name:'Amount'},variable_mode:0,value:5}]};
 let opened=false;const actions=[];
 const state=()=>({prepared_node_context:{...node,surface:opened?'wizard':'graph'},wizard:opened?{status:'observed',stage:'row_filter',root_ref:'root',root_tid:'W',owner_context:owner}:{status:'absent'},node_filter:native,
 ui:{dialogs:[],masks:[],elements:opened?[{ref:'cancel',tid:'W;btnClose',allowed_actions:['click']}]:[{ref:'settings',tid:'N;Setting',allowed_actions:['begin_wizard'],wizard_open:{node:{node_label:'Filter'},workflow_path:[{tid:'flow',label:'Scenario'}]}}]}});
 const channel={observe:async o=>{if(fault==='observe'&&o.condition==='independent saved binding readback')throw Error('READ_FAILED');const s=state();assert.ok(o.ready(s),o.condition);return s;},perform:async o=>{const s=state();assert.ok(o.ready(s),o.condition);const a=o.resolve(s);actions.push(a);if(a.verb==='begin_wizard')opened=true;else if(a.ref==='cancel')opened=false;else throw Error('unexpected gesture');}};
 const expected=structuredClone(native);
 if(fault==='count')expected.rows=[];
 if(fault==='predicate')expected.rows[0].value=6;
 return {channel,expected,actions,opened:()=>opened};
}
for(const fault of ['count','predicate','observe'])test('readback Cancels its actual owned wizard after '+fault+' failure',async()=>{
 const f=fixture(fault);
 await assert.rejects(readFilterBindings(f.channel,{readGraph:async()=>({}),expected:f.expected}),fault==='count'?/condition identity/:fault==='predicate'?/saved predicates/:/READ_FAILED/);
 assert.equal(f.opened(),false);assert.deepEqual(f.actions,[{verb:'begin_wizard',ref:'settings'},{verb:'click',ref:'cancel'}]);
});
test('successful empty inventory also Cancels before returning',async()=>{
 const f=fixture();assert.deepEqual(await readFilterBindings(f.channel,{readGraph:async()=>({}),expected:f.expected}),[]);assert.equal(f.opened(),false);
});
