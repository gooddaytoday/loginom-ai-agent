import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const runtime=process.env.CALCULATOR_RUNTIME??new URL('..',import.meta.url).pathname;
const {closePreparedWizard,wizardCloseBinding}=await import(pathToFileURL(runtime+'/client/lib/node-wizard-close.mjs'));
function fixture(){
 const node={verified:true,surface:'wizard',document_id:'doc',workflow_id:'flow',node_id:'node'};
 const wizard={status:'observed',stage:'output_mapping',root_tid:'root',root_ref:'ref',owner_context:{status:'observed',node_id:'node'}};
 const before={prepared_node_context:node,wizard,ui:{elements:[{tid:'root;btnClose',allowed_actions:['click'],ref:'close'}],dialogs:[],masks:[]}};
 const after={prepared_node_context:{...node,surface:'graph',locked:false},wizard:{status:'absent'},ui:{elements:[],dialogs:[],masks:[]}};
 let phase=0;const events=[];
 const channel={observe:async({ready})=>{const s=phase?after:before;assert.equal(ready(s),true);return s;},perform:async({ready,initialObservation,resolve})=>{assert.equal(ready(initialObservation),true);events.push(resolve(initialObservation));phase++;}};
 return {before,channel,events};
}
test('real close procedure accepts original owner without mapping and returns same graph',async()=>{
 const {before,channel,events}=fixture();const r=await closePreparedWizard(channel,wizardCloseBinding(before));
 assert.equal(r.draft_discarded,true);assert.equal(r.settings_applied,false);assert.deepEqual(events,[{verb:'click',ref:'close'}]);
});
for(const drift of ['root','owner','node'])test('real close procedure refuses '+drift+' between read and cancellation before gesture',async()=>{
 const {before,channel,events}=fixture();const expected=wizardCloseBinding(before);
 if(drift==='root')before.wizard.root_ref='foreign';
 if(drift==='owner')before.wizard.owner_context.node_id='foreign';
 if(drift==='node')before.prepared_node_context.node_id='foreign';
 await assert.rejects(closePreparedWizard(channel,expected),{message:'Prepared wizard changed before cancellation'});assert.deepEqual(events,[]);
});
