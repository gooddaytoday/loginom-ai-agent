import test from 'node:test';
import assert from 'node:assert/strict';
import {validateUngroupParameters,ungroupOutputFields} from '../lib/ungroup-parameters.mjs';
import {configureUngroup,supportedUngroupConfiguration} from '../lib/ungroup-procedure.mjs';
import {createUngroupNodeSupport} from '../lib/ungroup-node.mjs';
const u={keys:[{total:'Group',support:'Group'}],value_field:'Total',item_field:'Item',share_field:'Weight',rounding:{format:'none'},balance:'none'};
const fields=[['Group','Total'],['Group','Item','Weight']].map(ns=>ns.map((name,index)=>({name,label:name,index,usage:name==='Group'?6:name==='Total'?7:name==='Item'?4:9,type:['Total','Weight'].includes(name)?'integer':'string'})));
const configuration={verified:true,inventory_complete:true,method:'computed',input_fields:fields,ungroup:{...u,value_fields:['Total'],item_fields:['Item'],share_fields:['Weight']}};
test('computed mode accepts both outputs and preserves native integer fields',()=>{
 const r={target:{kind:'new'},inputs:[{input:0},{input:1}],finish:'execute',read:{ports:[0,1]},mappings:[]};
 assert.doesNotThrow(()=>validateUngroupParameters({ungroup:u},'computed',r));
 assert.deepEqual(ungroupOutputFields({...configuration,ungroup:u}).map(f=>[f.name,f.type]),[['Group','string'],['Total','integer'],['Total_Rounded','integer'],['Item','string'],['OutputValue','integer']]);
 for(const change of [{rounding:{format:'precision',value:2}},{balance:'proportional'}])assert.throws(()=>validateUngroupParameters({ungroup:{...u,...change}},'computed',r));
 assert.throws(()=>validateUngroupParameters({ungroup:u},'shares',r));
 assert.deepEqual(createUngroupNodeSupport({}).nodeApplyHandlers.get('transform.ungroup_data').modes,['shares','computed']);
});
test('existing computed execution preserves settings only with matching requested mode',async()=>{
 assert.equal(supportedUngroupConfiguration(configuration).share_field,'Weight');
 const s={wizard:{stage:'ungroup'},node_ungroup:configuration};
 const channel={observe:async o=>{assert.ok(o.ready(s));return s;},perform:async()=>assert.fail('must preserve')};
 const result=await configureUngroup(channel,{}, {request:{mode:'computed',finish:'execute'}});
 assert.equal(result.preserved,true);
 await assert.rejects(configureUngroup(channel,{}, {request:{mode:'shares',finish:'execute'}}),/mode|method/);
});
test('computed writer chooses the observed native method entry',async()=>{
 const c=structuredClone(configuration);c.method='shares';
 const root='MF;TF;WizrdMCF',picker=root+';UngroupDataWizard;pedUngroupMethod;ValueControl;trg_picker';
 const entry=root+';UngroupDataWizard;pedUngroupMethod;ValueControl;boundlist;С_расчетом_долей_по_всей_выборке';
 const s={wizard:{stage:'ungroup',root_tid:root},node_ungroup:c,ui:{elements:[picker,entry].map(tid=>({tid,ref:tid,allowed_actions:['click']}))}};
 const actions=[];
 const channel={observe:async o=>{assert.ok(o.ready(s),o.condition);return s;},perform:async o=>{assert.ok(o.ready(s));const a=o.resolve(s);actions.push(a);if(a.ref===entry)c.method='computed';}};
 const result=await configureUngroup(channel,{ungroup:u},{request:{mode:'computed',finish:'execute'}});
 assert.equal(result.configuration.method,'computed');assert.deepEqual(actions.map(a=>a.ref),[picker,entry]);
});
