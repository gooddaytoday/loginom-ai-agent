import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {preflightUngroup} from '../lib/ungroup-node.mjs';
import {resolveUngroupFields,ungroupOutputFields} from '../lib/ungroup-parameters.mjs';
// LAB-785 shares-1 journal:479,500: the production Preview reader supplies
// names/types only. Native input mappings separately prove data_kind.
const observed=[['Group','Total'],['Group','Item','Share']].map(ns=>ns.map((name,index)=>({index,name,label:name,type:['Total','Share'].includes(name)?'real':'string'})));
const parameters={ungroup:{keys:[{total:'Group',support:'Group'}],value_field:'Total',item_field:'Item',share_field:'Share',rounding:{format:'none'},balance:'none'}};
function run(schemas=observed){
 const calls=[];
 // Substitute the browser read dependency, not the production preflight branch.
 const preflight=vm.runInNewContext('('+preflightUngroup.toString()+')',{
  resolveUngroupFields,ungroupOutputFields,need:(v,m)=>{if(!v)throw Error(m);},
  preflightTabularSource:async(o,cfg,config,options)=>{calls.push(options.inputPort);options.resolve(parameters,schemas[options.inputPort]);return {verified:true,cleanup_complete:true};},
 });
 return {calls,promise:preflight({operation:{parameters:{target:{kind:'new'},parameters,finish:'execute'}}},{},{})};
}
test('ungroup new-source preflight accepts actual Preview schema without inventing data kind',async()=>{
 const f=run(),r=await f.promise;assert.equal(r.verified,true);assert.deepEqual(f.calls,[0,1]);assert.equal(r.proofs.length,2);
 assert.ok(observed.every(fs=>fs.every(f=>f.data_kind===undefined)));
});
test('ungroup preflight still rejects incompatible types and missing fields before target effects',async()=>{
 for(const change of [fs=>fs[0][1].type='string',fs=>fs[1][2].type='string',fs=>fs[1][0].type='integer',fs=>fs[1].pop()]){
  const fs=structuredClone(observed);change(fs);await assert.rejects(run(fs).promise);
 }
});
test('complete native mappings still require continuous numeric total/share roles',()=>{
 const mapped=observed.map(fs=>fs.map(f=>({...f,data_kind:['Total','Share'].includes(f.name)?'Непрерывный':'Дискретный'})));
 assert.doesNotThrow(()=>resolveUngroupFields(parameters.ungroup,mapped));
 for(const [port,index] of [[0,1],[1,2]]){const f=structuredClone(mapped);f[port][index].data_kind='Дискретный';assert.throws(()=>resolveUngroupFields(parameters.ungroup,f),/continuous/);}
});
