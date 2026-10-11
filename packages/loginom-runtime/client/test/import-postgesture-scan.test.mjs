import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openImportColumnEditor} from '../lib/text-import-procedure.mjs';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
const fixture=JSON.parse(readFileSync(new URL('./import-postgesture-scan.fixture.json',import.meta.url)));

test('recorded Amount postgesture receipt is journalled once and preserves parent uncertainty',async()=>{
 const before=fixture.before,records=[];let gestures=0;
 const pending=structuredClone(fixture.inspect.output);
 const operation={id:'import-null-empty-001',action:{action_key:'node.apply',revision:'1.0.0'},
  deadline:100000,pending,checkpoint:{workflow_ref:before.workflow_ref,document_id:before.dom_epoch.document}};
 const channel=createNodeProcedure({operation,now:()=>1,targetOrigin:before.origin,targetBuild:before.loginom_build,
  record:async e=>{records.push(e);return structuredClone(e);},
  wrapMutation:(code,options)=>({code,options}),
  execute:async code=>{
   if(typeof code==='string')return {status:'SUCCEEDED',output:before};
   gestures++;return {...structuredClone(fixture.failure.outcome),operation_id:code.options.id};
  }});
 const initial=await channel.observe({condition:'recorded Amount',ready:()=>true});
 await assert.rejects(openImportColumnEditor(channel,initial,1,'type'),error=>error.receipt?.status==='AMBIGUOUS');
 assert.equal(gestures,1);assert.equal(operation.nodeEffectPossible,true);
 assert.deepEqual(operation.pending,pending);
 const receipt=records.find(e=>e.phase==='node_step_completed').outcome;
 assert.equal(receipt.effect_possible,true);assert.equal(receipt.phase,'observing');
 assert.equal(receipt.output.ui,undefined);assert.equal(receipt.error.code,'UI_SCAN_LIMIT');
 assert.equal(pending.state,'pending');assert.equal(pending.cleanup_confirmed,false);
});

for(const fault of ['owner','root','Amount'])test('Amount binding rejects changed '+fault+' before a gesture',async()=>{
 const before=fixture.before,changed=structuredClone(before);let gestures=0;
 if(fault==='owner')changed.wizard.owner_context.node.tid+='Other';
 if(fault==='root')changed.wizard.root_tid='MF;TF-2;WizrdMCF';
 if(fault==='Amount')changed.wizard.import_columns.fields[0].name='Other';
 const channel={perform:async spec=>{
  assert.equal(spec.identity(before).field.name,'Amount');
  assert.equal(spec.identity(before).property,'type');
  assert.equal(spec.ready(changed),false);
  throw Error('identity refusal');
 }};
 await assert.rejects(openImportColumnEditor(channel,before,1,'type'),/identity refusal/);
 assert.equal(gestures,0);
});

test('node channel rejects a foreign document before admitting Amount',async()=>{
 const before=fixture.before,changed=structuredClone(before);changed.dom_epoch.document='foreign';
 let gestures=0;
 const channel=createNodeProcedure({operation:{id:'guard',action:{action_key:'node.apply',revision:'1'},deadline:10000,
  checkpoint:{workflow_ref:before.workflow_ref,document_id:before.dom_epoch.document}},now:()=>1,
  targetOrigin:before.origin,targetBuild:before.loginom_build,record:async e=>e,
  wrapMutation:()=>{gestures++;throw Error('unexpected mutation');},execute:async()=>({status:'SUCCEEDED',output:changed})});
 await assert.rejects(channel.observe({condition:'Amount owner',ready:()=>true}),/document|context/i);
 assert.equal(gestures,0);
});
