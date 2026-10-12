import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(process.env.SORTING_BOOTSTRAP_SOURCE??new URL('../src/acceptance/sorting-before-close-v1.mjs',import.meta.url),'utf8');
const begin=source.indexOf('function readCapturePreparation(identity) {'),end=source.indexOf('\n}',begin)+2;
assert.ok(begin>=0&&end>begin);
const body=source.slice(begin,end);
// Real serialized pure bootstrap, explicit preparation/DOM/account doubles.
// This test never supplies a pre-verified node, performs a gesture or reads RPC.
function fixture(){
 const document={},tab={getAttribute:()=> 'MF;tb',classList:{contains:()=>true}},pkg={};
 const receipt={phase:'verified',tab,packageNode:pkg,workflowId:'workflow',crumbs:[{tid:'own',label:'own'}]};
 const prep={document,id:'document',receipts:new Map([['original',receipt]])};
 const app={Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:'account'}}}}}};
 const identity={document_id:'document',tab_tid:'MF;tb',account:'account',loginom_build:'7.4.2'};
 const context={document,__loginomDockPreparationV1:prep,bg:{app},location:{origin:'https://fixture.invalid'}};
 const run=()=>vm.runInNewContext('('+body+')(identity)',{...context,identity});
 return {document,tab,pkg,receipt,prep,app,identity,run};
}
test('bootstrap retains original verified preparation path without Calculator dependency',()=>{
 const f=fixture(),before=JSON.stringify(f.receipt);assert.deepEqual(JSON.parse(JSON.stringify(f.run())),{
  origin:'https://fixture.invalid',workflow_ref:{tab_tid:'MF;tb',prefix:'MF;TF',workflow_id:'workflow',navigation_path:f.receipt.crumbs}});
 assert.equal(JSON.stringify(f.receipt),before);
});
for(const [name,change] of Object.entries({
 document:f=>f.prep.document={},epoch:f=>f.prep.id='foreign',build:f=>f.app.Version='foreign',
 account:f=>f.identity.account='foreign',missing:f=>f.prep.receipts.clear(),pending:f=>f.receipt.phase='pending',
 tab:f=>f.identity.tab_tid='foreign',inactive:f=>f.tab.classList.contains=()=>false,
 foreignPackage:f=>f.prep.receipts.set('foreign',{...f.receipt,packageNode:{}}),
}))test('bootstrap refuses '+name,()=>{const f=fixture();change(f);assert.throws(f.run,/LOGINOM_CAPTURE_PREPARATION/)});
