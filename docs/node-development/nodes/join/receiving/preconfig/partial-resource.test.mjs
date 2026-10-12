import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {assertPreconfigSample} from './consumer-contract.mjs';
const runtime=process.env.PRECONFIG_RUNTIME_ROOT?pathToFileURL(process.env.PRECONFIG_RUNTIME_ROOT.replace(/\/$/,'')+'/'):new URL('../../../../../../packages/loginom-runtime/',import.meta.url);
const resource=await import(new URL('src/acceptance/import-before-configure-v1.mjs',runtime));
test('real captureImport records partial diagnostic; consumer cannot treat it as preconfig readiness',async()=>{
 // Synthetic transport response only; no native Page/model/Ext claims are tested.
 const owner=id(),run=id(),account='synthetic-'+id(),session=id();
 const binding={revision:1,harness:'import-before-configure-v1',owner,run,lease:owner+':'+run,generation:1,chat:id(),account,session,admission:id(),packagePath:'/synthetic/test.lgp',expires:Date.now()+60000};
 const identity={session_id:session,document_id:id(),account,package_path:binding.packagePath,tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb',loginom_build:'7.4.2'};
 const partial={revision:1,harness:binding.harness,session_id:session,document_id:identity.document_id,account,status:'PARTIAL',complete:false,settings_applied:false,close_authority:false,effect_possible:false,source:{},format:{},columns:{status:'unknown',fields:[]},output0:{status:'unknown'},activity:{status:'unknown'},freshness:{status:'unknown',execution_verified:false},missing:['canonical_type_and_data_kind','activity','execution_freshness']};
 const events=[];let calls=0;
 const result=await resource.captureImport({binding,identity,browser:{callTool:async request=>{calls++;assert.equal(request.name,'browser_run_code_unsafe');assert.equal(typeof request.arguments.code,'string');return {content:[{type:'text',text:JSON.stringify(partial)}]};}},record:async e=>events.push(e)});
 assert.equal(calls,1);assert.equal(events.length,1);assert.equal(events[0].event,'fixed_import_preconfigure_observation');assert.deepEqual(result,partial);assert.deepEqual(events[0].result,partial);
 assert.throws(()=>assertPreconfigSample(result),/TRACE_CLASSIFICATION/);
 assert.equal(result.complete,false);assert.equal(result.close_authority,false);
});
test('resource exports do not provide closed prepare/current-owner/lineage/readonly authority adapter',()=>{
 assert.equal(typeof resource.captureImport,'function');assert.equal(typeof resource.readPreconfigSample,'undefined');
});
