import test from 'node:test';
import assert from 'node:assert/strict';
import {validateUngroupParameters,ungroupOutputFields} from '../lib/ungroup-parameters.mjs';
import {configureUngroup,supportedUngroupConfiguration} from '../lib/ungroup-procedure.mjs';
import {readUngroupOutputs} from '../lib/ungroup-mappings.mjs';
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

test('computed output reads retain exact types/order and refuse nonempty secondary data',async()=>{
 const schema=ungroupOutputFields({...configuration,ungroup:u}).map((f,index)=>({...f,index})),secondary=[fields[1][1],fields[1][0]].map((f,index)=>({...f,index}));
 const mapped={verified:true,ports:[{port:0,schema},{port:1,schema:secondary}]};
 const ctx={portExecution:{execution_id:'exec'},execution:{execution_id:'exec'},receipt_id:'read'};
 const read={ports:[0,1],sample_rows:100,require_exact_numbers:true};
 const outputs=[{port:0,port_guid:'a',schema,row_count:4,sample_complete:true},{port:1,port_guid:'b',schema:secondary,row_count:0,sample_complete:true}];
 const run=values=>readUngroupOutputs({readOutputPort:async options=>{assert.equal(options.execution,ctx.portExecution);return {output:values[options.port]};}},read,ctx,mapped);
 assert.equal((await run(structuredClone(outputs))).status,'complete');
 for(const change of [o=>o[0].schema[4].type='real',o=>o[1].schema.reverse(),o=>o[1].row_count=1,o=>o[1].port_guid='a']){
  const o=structuredClone(outputs);change(o);await assert.rejects(run(o));
 }
});
test('shares output retains the verified native mapping labels and data kinds',async()=>{
 const expected=[{index:0,name:'OutputValue',label:'Result',type:'real',data_kind:'Непрерывный'}];
 const ctx={portExecution:{},execution:{execution_id:'exec'},receipt_id:'read'};
 const mapped={ports:[{port:0,schema:expected}]};
 const output={port:0,port_guid:'data',schema:expected.map(({data_kind,...f})=>f),sample_complete:true};
 const run=()=>readUngroupOutputs({readOutputPort:async()=>({output})},{ports:[0]},ctx,mapped);
 assert.equal((await run()).ports[0].schema[0].data_kind,'Непрерывный');
 output.schema[0].label='Changed';await assert.rejects(run(),/identity|schema/);
});
