import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
const base=process.env.IMPORT_RUNTIME_ROOT?pathToFileURL(process.env.IMPORT_RUNTIME_ROOT+'/'):new URL('../',import.meta.url);
const {readImportCleanFacts,createImportCleanModel}=await import(new URL('src/acceptance/import-clean-model-v1.mjs',base));
import {cleanFixture} from './support/import-clean-fixture.mjs';
const fixture=options=>cleanFixture(readImportCleanFacts,options);
test('serialized candidate clean read is synthetic; opaque MODEL proof never authorizes Close',async()=>{
 const f=fixture(),facts=await f.read();assert.equal(facts.status,'OBSERVED_CLEAN_CANDIDATE');
 const m=createImportCleanModel({assertCurrent(){},deadline:Date.now()+60000}),p=m.observe(facts,f.identity);
 assert.equal(p.status,'OFFLINE_MODEL_PROOF');assert.equal(p.native_proof,false);assert.equal(p.close_authority,false);
 assert.equal(m.inspect(p.proof,f.identity).model_clean_verified,true);
 assert.throws(()=>m.requestReadonlyClose(p.proof,f.identity),/GUARDED_CLOSE_SEAM_REQUIRED/);
 assert.deepEqual(JSON.parse(JSON.stringify(p.proof)),{});assert.throws(()=>m.inspect(JSON.parse(JSON.stringify(p.proof)),f.identity));
 const other=createImportCleanModel({assertCurrent(){},deadline:Date.now()+60000});assert.throws(()=>other.inspect(p.proof,f.identity));
 assert.deepEqual(f.events.filter(e=>e==='modified'),['modified']);
});
for(const key of ['account','connection','session','pack','path','workflow','node','card','tab','receipt','request','document','running','node_guid','native_model'])test('serialized clean after awaited native read drift '+key,async()=>{
 const f=fixture({change:f=>{
  if(key==='account')f.connection.UserName='foreign';if(key==='connection')f.map.FServerConnection={...f.connection};if(key==='session')f.connection.Session={};if(key==='pack')f.inventory.Items=()=>({...f.pack});if(key==='path')f.pack.PackageFileName='/foreign/left.lgp';if(key==='workflow')f.workflow.ParentNode={};if(key==='node')f.card.Controller.Node.data.node={};if(key==='card')f.workspace.getActiveTab=()=>({});if(key==='tab')f.receipt.tab={};if(key==='receipt')f.prep.receipts.set('extra',{...f.receipt});if(key==='request')f.receipt.request=JSON.stringify({session:'foreign'});if(key==='document')f.sandbox.document={};if(key==='running')f.pack.HasRunningNodes=()=>true;if(key==='node_guid')f.nativeNode.FGuid='foreign';if(key==='native_model')f.card.Controller.FController.FModelNode={};
 }});const facts=await f.read();assert.equal(facts.status,'UNKNOWN');assert.equal(facts.close_authority,false);
});
for(const value of [undefined,null,true,0,'',Error('native reply lost')])test('native dirty/error/unknown '+String(value),async()=>{
 const f=fixture({modified:value});f.session.IsPackageModified=async()=>value;if(value instanceof Error)f.session.IsPackageModified=async()=>{throw value};assert.equal((await f.read()).status,'UNKNOWN');
});
for(const key of ['missing','accessor','duplicate','dialog'])test('native proof preconditions '+key,async()=>{
 const f=fixture();if(key==='missing')delete f.session.IsPackageModified;if(key==='accessor')Object.defineProperty(f.connection,'Session',{get:()=>f.session});if(key==='duplicate')f.inventory.Count=2;if(key==='dialog')f.sandbox.document.querySelectorAll=s=>s.includes('data-tid')?[f.receipt.tab]:[{getBoundingClientRect:()=>({width:1,height:1})}];assert.equal((await f.read()).status,'UNKNOWN');
});
test('last sibling provider cannot change earlier binding',async()=>{
 let reads=0;const f=fixture({lastProvider:f=>{if(++reads===2)f.connection.UserName='foreign'}});assert.equal((await f.read()).status,'UNKNOWN');
});
for(const key of ['dirty','running','dialogs','inventory','native_identity','read_only_observation','observed_at','account','workflow_id'])test('opaque model refuses insufficient/foreign/stale '+key,async()=>{
 const f=fixture(),facts=await f.read();facts[key]=key==='observed_at'?f.identity.read_started_at-1:'unknown';
 const m=createImportCleanModel({assertCurrent(){},deadline:Date.now()+60000});assert.equal(m.observe(facts,f.identity).proof,null);
});
test('opaque model expiry and current-owner refusal persist',async()=>{
 const f=fixture(),facts=await f.read();let clock=Date.now(),foreign=false;const m=createImportCleanModel({assertCurrent(){if(foreign)throw Error('foreign')},now:()=>clock,deadline:clock+10}),p=m.observe(facts,f.identity);
 clock+=11;assert.throws(()=>m.inspect(p.proof,f.identity));clock-=11;foreign=true;assert.throws(()=>m.inspect(p.proof,f.identity));
});
