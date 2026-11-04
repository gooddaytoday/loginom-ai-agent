import test from 'node:test';
import assert from 'node:assert/strict';
import {configureUngroup} from '../lib/ungroup-procedure.mjs';
import {Page} from './support/workspace-ui-fixture.mjs';

// rounding-1 journal:1069-1071: the native numeric editor has an anchored
// input, but this wizard has no generic wizard.settings.fields structure.
test('ungroup rounding edits the native numeric input and verifies its blur readback',async()=>{
 const page=new Page(),root='MF;TF-1;WizrdMCF',wizard=page.add('div',root);
 page.add('div',root+';UngroupDataWizard;grdUngroupColumns;tbl','',undefined,wizard);
 const owner=page.add('div',root+';UngroupDataWizard;pedRoundParam;ValueControl','',undefined,wizard);
 const input=page.add('input',null,'',undefined,owner);input.attrs.role='spinbutton';input.value='1';
 const u={keys:[{total:'Group',support:'Group'}],value_field:'Total',item_field:'Item',share_field:'Share',rounding:{format:'precision',value:0},balance:'none'};
 const c={verified:true,inventory_complete:true,method:'shares',
  input_fields:[[{record_id:'g0',name:'Group',type:'string',index:0,usage:6},{record_id:'v',name:'Total',type:'real',index:1,usage:7}],
   [{record_id:'g1',name:'Group',type:'string',index:0,usage:6},{record_id:'i',name:'Item',type:'string',index:1,usage:4},{record_id:'s',name:'Share',type:'real',index:2,usage:9}]],
  ungroup:{keys:u.keys,value_fields:['Total'],item_fields:['Item'],share_fields:['Share'],rounding:{format:'precision',value:1},balance:'none'}};
 page.onPress=(key,element)=>{if(key==='Tab'&&element===input)c.ungroup.rounding.value=Number(input.value);};
 const snapshot=async()=>({...await page.observe(),node_ungroup:structuredClone(c)});
 const channel={observe:async options=>{const s=await snapshot();assert.ok(options.ready(s));return s;},
  perform:async options=>{const s=await snapshot();assert.ok(options.ready(s));
   const action=options.resolve(s),result=await page.act(action,s);
   assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));return result;}};
 assert.equal((await page.observe()).wizard.settings,undefined);
 const result=await configureUngroup(channel,{ungroup:u},{request:{finish:'execute'}});
 assert.equal(input.value,'0');assert.deepEqual(result.configuration.ungroup.rounding,u.rounding);
 assert.ok(result.changes.includes('rounding.value'));
});
