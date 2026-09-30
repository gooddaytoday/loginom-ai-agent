import test from 'node:test';
import assert from 'node:assert/strict';
import {admitJavascriptExistingSchema,verifiedJavascriptExistingSchemaRefusal} from '../lib/javascript-existing-schema-refusal.mjs';
import {createJavascriptSourceAdmission} from '../lib/javascript-source-admission.mjs';
import {javascriptManagedSourceSettings} from '../lib/javascript-managed-source-adapter.mjs';
import {createRedactor} from '../lib/redact.mjs';
import {sourceFixture} from './support/javascript-source-fixture.mjs';
const owner={document_id:'document',workflow_id:'workflow',node_id:'node',operation_id:'edit',ui_epoch:1};
async function fixture(mode,{close=true}={}) {
 const browser=sourceFixture('import {InputTable} from "builtIn/Data";\n'),events=[],calls=[];
 const schema={verified:true,inventory_complete:true,form:'JavaScriptColumnsWizard',page_tid:'page',node_context:{verified:true,surface:'wizard',...Object.fromEntries(['document_id','workflow_id','node_id'].map(key=>[key,owner[key]]))},generation:{checked:mode==='code'},grids:[{tid:'page;grdSourceColumns;tbl',count:0,total:0,fields:[]},{tid:'page;grdTargetColumns;tbl',count:mode==='code'?0:1,total:mode==='code'?0:1,fields:mode==='code'?[]:[{record_id:'actual',Index:0,Name:'Value',DisplayName:'Value',DataType:4,DataKind:1,UsageType:0,DefaultUsageType:4,Required:false,Broken:false}]}]};
 const settings=javascriptManagedSourceSettings(schema),record=async event=>{events.push(structuredClone(event));return event;},deadline=Date.now()+60000;
 const admission=createJavascriptSourceAdmission({kind:'existing',owner,deadline,redactor:createRedactor(),record,sourceAdapter:async()=>({
  open:async()=>{calls.push('open');return browser.observe({context:browser.context,owner,epoch:1,capture:true});},
  read:async held=>({...browser.observe({context:browser.context,owner,epoch:1,held}),settings}),
  discard:async()=>{calls.push('discard');return {closed:close,owner};}})});
 const receipt=await admission.admit({});
 return {receipt,snapshot:{owner,schema,settings},parameters:{schema_mode:mode==='code'?'declared':'code'},owner,record,deadline,events,calls};
}
for(const mode of ['code','declared'])test('actual owned admission/discard produces one acknowledged mode refusal '+mode,async()=>{
 const f=await fixture(mode);let error;
 try{await admitJavascriptExistingSchema(f);}catch(value){error=value;}
 assert.equal(error.nodePhaseRefusal.cleanup_complete,true);assert.equal(error.nodePhaseRefusal.effect_possible,true);
 const proof=error.nodePhaseRefusal.proof,node=proof.node;
 assert.equal(verifiedJavascriptExistingSchemaRefusal(error.nodePhaseRefusal,{operation_id:owner.operation_id,target:{kind:'existing',type:'programming.javascript',ref:node},mode:'script',finish:'execute',inputs:[],mappings:[],parameters:f.parameters}),true);
 assert.deepEqual(f.calls,['open','discard']);assert.equal(proof.settings_sha256,f.receipt.settings_sha256);
 assert.equal(proof.editor_mutation_started,false);assert.equal(proof.explicit_execute_requested,false);
 assert.equal(f.events.at(-1).phase,'javascript_existing_schema_mode_refused');
 const count=f.events.length;assert.equal((await admitJavascriptExistingSchema({...f,parameters:{schema_mode:mode}})).schema_mode,mode);assert.equal(f.events.length,count);
});
for(const failure of ['ack-missing','ack-mutated','owner','settings','native-schema','deadline'])test('unconfirmed schema refusal cannot clear the uncertainty gate '+failure,async()=>{
 const f=await fixture('declared');
 if(failure==='owner')f.snapshot={...f.snapshot,owner:{...owner,node_id:'foreign'}};
 if(failure==='settings')f.snapshot.settings.generation=true;
 if(failure==='native-schema')f.snapshot.schema.verified=false;
 if(failure==='deadline')f.deadline=Date.now()-1;
 if(failure==='ack-missing')f.record=async()=>({});
 if(failure==='ack-mutated')f.record=async event=>{event.proof.settings_unchanged=false;return event;};
 await assert.rejects(()=>admitJavascriptExistingSchema(f),error=>{assert.equal(error.nodePhaseRefusal,undefined);return true;});
});
test('actual unconfirmed discard prevents source admission and schema-refusal proof',async()=>{
 await assert.rejects(()=>fixture('declared',{close:false}),error=>{assert.equal(error.nodePhaseRefusal,undefined);return true;});
});

test('lost or late refusal ACK keeps the original deadline and cannot produce typed cleanup proof',async()=>{
 const f=await fixture('code');f.deadline=Date.now()+20;
 f.record=async event=>{await new Promise(resolve=>setTimeout(resolve,60));return event;};
 await assert.rejects(()=>admitJavascriptExistingSchema(f),error=>{assert.match(error.message,/ACK deadline/);assert.equal(error.nodePhaseRefusal,undefined);return true;});
});
