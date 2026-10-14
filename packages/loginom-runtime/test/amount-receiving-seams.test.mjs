import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import * as compatibility from '../../../scripts/node-acceptance/ui-scan-collector.mjs';
const root=process.env.AMOUNT_RUNTIME??new URL('..',import.meta.url).pathname;
const runtime=await import(pathToFileURL(root+'/src/acceptance/ui-scan-collector.mjs'));
const amount=await import(pathToFileURL(root+'/src/acceptance/amount-import-type-v1.mjs'));
const observer=await import(pathToFileURL(root+'/client/lib/workspace-ui.mjs'));
const source=await readFile(root+'/src/acceptance/amount-import-type-v1.mjs','utf8');
const start=source.indexOf('function readCapturePreparation(identity) {');
const preparation=source.slice(start,source.indexOf('\n}',start)+2);
test('receiving Amount uses its own observer pin and unchanged preparation body without Calculator module',()=>{
 assert.equal(createHash('sha256').update(observer.workspaceUiCapability.toString()).digest('hex'),amount.AMOUNT_OBSERVER_SHA256);
 assert.equal(amount.AMOUNT_OBSERVER_SHA256,'c29a962c543f89793197b0e5220d8b438576e3f35aca2ce3fe24f3b8fc382033');
 assert.equal(createHash('sha256').update(preparation).digest('hex'),'efd522e6fd54d1384d9087984c7a1da46e1e2821c268e952f949cf4135bd6958');
 assert.ok(!source.includes('calculator-grouped-before-done-v1'));
});
test('compatibility and runtime import paths preserve exports and identical collector serialization',()=>{
 assert.deepEqual(Object.keys(compatibility),Object.keys(runtime));
 assert.equal(compatibility.collectUiScan.toString(),runtime.collectUiScan.toString());
 assert.equal(compatibility.observerSha256,runtime.observerSha256);
});
for(const scenario of ['valid','document','build','account','tab','inactive','receipt','ambiguous']){
 test('receiving preparation guard: '+scenario,()=>{
  const document={},tab={getAttribute:()=>scenario==='tab'?'foreign':'tab',classList:{contains:()=>scenario!=='inactive'}};
  const receipt={phase:scenario==='receipt'?'pending':'verified',tab,packageNode:{},workflowId:'workflow',crumbs:[{tid:'workflow',label:'Workflow'}]};
  const p={document:scenario==='document'?{}:document,id:'doc',receipts:new Map([['receipt',receipt]])};
  if(scenario==='ambiguous')p.receipts.set('other',{...receipt,packageNode:{}});
  const bg={app:{Version:scenario==='build'?'foreign':'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:scenario==='account'?'foreign':'user'}}}}}}};
  const fn=vm.runInNewContext('('+preparation+')',{document,bg,__loginomDockPreparationV1:p,location:{origin:'https://fixture.invalid'}});
  const args={document_id:'doc',tab_tid:'tab',account:'user',loginom_build:'7.4.2'};
  if(scenario==='valid')assert.deepEqual(JSON.parse(JSON.stringify(fn(args))),{origin:'https://fixture.invalid',workflow_ref:{tab_tid:'tab',prefix:'MF;TF',workflow_id:'workflow',navigation_path:receipt.crumbs}});
  else assert.throws(()=>fn(args),/LOGINOM_CAPTURE_PREPARATION/);
 });
}
