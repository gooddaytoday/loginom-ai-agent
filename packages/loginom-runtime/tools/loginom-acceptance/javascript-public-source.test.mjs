import test from 'node:test';
import assert from 'node:assert/strict';
import {javascriptPublicSourceCase,javascriptPublicSourceOutputOracle} from './javascript-public-source-cases.mjs';
import {javascriptDiscoveryProbe} from './javascript-discovery-probes.mjs';
import {readJavascriptPublicExistingSource} from './javascript-public-existing-live.mjs';
import {runJavascriptOperator} from './javascript-live.mjs';
import {createJavascriptSourceReadRegistry} from '../../client/lib/javascript-source-read-registry.mjs';
import {createJavascriptSourceReadSession} from '../../client/lib/javascript-source-read-session.mjs';
import {createJavascriptCodeNodeSupport,validateJavascriptCodeRequest} from '../../client/lib/javascript-code-node.mjs';
import {nodeApiTools} from '../../client/lib/node-api.mjs';
import {createRedactor} from '../../client/lib/redact.mjs';
import {sourceFixture} from '../../client/test/support/javascript-source-fixture.mjs';
const node={document_id:'document',workflow_id:'workflow',node_id:'node'};
const prepared={document_id:'document',workflow_ref:{workflow_id:'workflow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'MF;TF-1;path',label:'Scenario'}]}};
function fixture(source,{drift=false}={}) {
 const browser=sourceFixture(source),requests=[],events=[],calls=[],record=async event=>{events.push(structuredClone(event));return event;};
 const registry=createJavascriptSourceReadRegistry({openSession:async request=>createJavascriptSourceReadSession({request,uiEpoch:1,deadline:Date.now()+request.budget_ms-100,redactor:createRedactor(),record,
  adapter:{open:async({owner})=>{calls.push('open');return browser.observe({context:browser.context,owner,epoch:1,capture:true});},
   read:async(held,{owner})=>({...browser.observe({context:browser.context,owner,epoch:1,held}),settings:{generation:true}}),
   discard:async(held,{owner})=>{calls.push('discard');return {closed:true,owner};}}})});
 const runtime={tools:nodeApiTools,hasUnsettledWork:()=>registry.unsettled||registry.busy,startNodeRead:async request=>{requests.push(structuredClone(request));if(drift&&requests.length===2)browser.setSource(source.slice(0,-1)+'x');return registry.read(request);}};
 return {runtime,events,requests,calls,record};
}
test('public operator gathers actual serialized reader chunks including empty source under one original session',async()=>{
 for(const id of ['fidelity-bound-code','empty-source-declared']) {
  const spec=javascriptPublicSourceCase(id),f=fixture(spec.source),result=await readJavascriptPublicExistingSource({...f,prepared,node,deadline:Date.now()+700000});
  assert.equal(result.source_text,spec.source);assert.equal(result.source_sha256,spec.source_sha256);
  assert.equal(result.source_utf8_bytes,id==='fidelity-bound-code'?32768:0);assert.equal(result.source_lf_lines,id==='fidelity-bound-code'?1024:1);
  assert.equal(f.requests.length,result.chunks.length);assert.ok(result.chunks.length>=(id==='fidelity-bound-code'?8:1));
  assert.equal(new Set(f.requests.map(request=>request.operation_id)).size,1);
  for(const request of f.requests.slice(1))assert.deepEqual(Object.keys(request).sort(),['cursor','expected_source_sha256','kind','operation_id']);
  assert.equal(f.calls.filter(call=>call==='open').length,f.calls.filter(call=>call==='discard').length);assert.equal(f.runtime.hasUnsettledWork(),false);
  assert.equal(f.events.at(-1).phase,'javascript_existing_public_source_chunks_verified');assert.ok(!JSON.stringify(f.events).includes('Кириллица'));
 }
});
test('public whole-source collection refuses actual drift without a complete proof',async()=>{
 const f=fixture(javascriptPublicSourceCase('fidelity-bound-code').source,{drift:true});
 await assert.rejects(()=>readJavascriptPublicExistingSource({...f,prepared,node,deadline:Date.now()+700000}),/digest/);
 assert.equal(f.requests.length,2);assert.equal(f.events.some(event=>event.phase==='javascript_existing_public_source_chunks_verified'),false);
 assert.equal(f.calls.filter(call=>call==='open').length,f.calls.filter(call=>call==='discard').length);
});
test('public handler refuses cap+1, line+1, modules, columns and redaction before browser effects',async()=>{
 const support=createJavascriptCodeNodeSupport({targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2',redactor:createRedactor(['SYNTHETIC_SOURCE_SECRET'])});
 const valid={operation_id:'preflight-source',document_id:node.document_id,workflow_ref:prepared.workflow_ref,target:{kind:'existing',type:'programming.javascript',ref:node},mode:'script',inputs:[],mappings:[],finish:'execute',read:{ports:[0],sample_rows:100,require_exact_numbers:true,coverage:'full'},parameters:{source_text:'',expected_source_sha256:'a'.repeat(64),schema_mode:'declared'}};
 assert.equal(validateJavascriptCodeRequest(valid.parameters,valid.mode,valid),valid.parameters);
 for(const patch of [{source_text:'x'.repeat(32769)},{source_text:'\n'.repeat(1024)},{source_text:'import fs from "fs";'},{columns:[{name:'Value',label:'Value',type:'integer',data_kind:'Непрерывный',usage:'Не задано'}]}]) {
  const request={...valid,parameters:{...valid.parameters,...patch}};assert.throws(()=>support.nodeApplyHandlers.get('programming.javascript').validate(request.parameters,request.mode,request));
 }
 let browserCalls=0;
 for(const source_text of ['const value="SYNTHETIC_SOURCE_SECRET";','// Bearer abcdefghijklmnop']) {
  const request={...valid,parameters:{...valid.parameters,source_text}},driver=support.nodeApplyDriverFactory({operation:{id:request.operation_id,parameters:request},execute:async()=>{browserCalls++;throw Error('Unexpected browser call');},onRecord:async event=>event,now:Date.now,receiptOptions:()=>({})});
  await assert.rejects(()=>driver.verifySource(request.parameters),error=>
   error.nodePhaseRefusal?.phase==='source'&&error.nodePhaseRefusal.status==='NOT_APPLIED'
   &&error.nodePhaseRefusal.effect_possible===false&&error.nodePhaseRefusal.cleanup_complete===true);
 }
 assert.equal(browserCalls,0);
});
test('empty-source oracle verifies full retained schema and rejects phantom rows or missing schema',()=>{
 const schema=javascriptDiscoveryProbe('p1-business-declared-base').schema.map((column,index)=>({index,...column,data_kind:'Непрерывный'}));
 const table={row_count:0,sample_rows:0,sample_complete:true,filter_enabled:false,schema,sample:[],precision:{numbers_verified:true,limitations:[]}};
 assert.equal(javascriptPublicSourceOutputOracle('empty-source-declared',table).gate_passed,true);
 assert.throws(()=>javascriptPublicSourceOutputOracle('empty-source-declared',{...table,schema:[]}));
 assert.throws(()=>javascriptPublicSourceOutputOracle('empty-source-declared',{...table,row_count:1,sample_rows:1,sample:[]}));
});
test('source entrypoint rejects wrong case/mode, input variant, custom source and focus flags before config read',async()=>{
 const paths=['--config','/not-read/private.json','--profile','/not-created/profile','--browser','/not-opened/chrome','--evidence','/not-created/evidence'];
 for(const options of [{publicSourceCaseId:'unknown',coldReader:true,existingLifecycle:'code'},{publicSourceCaseId:'fidelity-bound-code',coldReader:true,existingLifecycle:'declared'},{publicSourceCaseId:'empty-source-declared',coldReader:true,existingLifecycle:'declared',existingInputVariant:'changed'}])await assert.rejects(()=>runJavascriptOperator(paths,options),/Public source case requires/);
 for(const extra of [['--source','payload'],['--x11-no-focus']])await assert.rejects(()=>runJavascriptOperator([...paths,...extra],{publicSourceCaseId:'fidelity-bound-code',coldReader:true,existingLifecycle:'code'}));
});

test('complete source proof refuses changed durable ACK and expired original deadline',async()=>{
 const f=fixture('');
 await assert.rejects(()=>readJavascriptPublicExistingSource({...f,prepared,node,deadline:Date.now()+700000,record:async event=>{event.proof.complete=false;return event;}}),/ACK differs/);
 const expired=fixture('');
 await assert.rejects(()=>readJavascriptPublicExistingSource({...expired,prepared,node,deadline:Date.now()-1}),/original deadline/);
 assert.equal(expired.calls.length,0);
});
