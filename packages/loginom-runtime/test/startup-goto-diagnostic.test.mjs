import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loginPage} from '../src/connection-check.mjs';

// Actual loginPage; Page/native calls are explicit doubles. No browser/login.
function fixture(goto) {
 const page=new EventEmitter();let identityReads=0,credentials=0;
 const owner={id:'original',account:'own',origin:'https://own.invalid',evidence:{},page};
 page.goto=async(url,options)=>{
  assert.equal(url,'https://own.invalid/app/?private=omitted&testable=true');
  assert.deepEqual(options,{waitUntil:'domcontentloaded',timeout:60_000});
  assert.deepEqual(Object.keys(owner.evidence.goto),['entered_at','settled_at']);
  assert.ok(Number.isFinite(Date.parse(owner.evidence.goto.entered_at)));
  assert.equal(owner.evidence.goto.settled_at,null);
  return goto();
 };
 page.evaluate=async()=>{identityReads++;return identityReads===1?undefined:'own'};
 page.waitForFunction=async()=>{};
 page.locator=()=>({or(){return this},first(){return this},waitFor:async()=>{},isVisible:async()=>true,
  locator(){return this},fill:async()=>{credentials++}});
 return {page,owner,reads:()=>identityReads,credentials:()=>credentials,
  run:()=>loginPage(page,{url:'https://own.invalid/app/?private=omitted',username:'own',password:'unused'},owner)};
}

test('goto evidence remains pending until the original await returns',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r),f=fixture(()=>pending);
 const result=f.run();const original=f.owner.evidence.goto;
 await Promise.resolve();assert.equal(original.settled_at,null);assert.equal(f.reads(),0);
 resolve();assert.deepEqual(await result,{authenticated:true});
 assert.equal(f.owner.evidence.goto,original);
 assert.ok(Date.parse(original.settled_at)>=Date.parse(original.entered_at));
 assert.equal(f.credentials(),0);assert.equal(f.owner.loginSubmitted,undefined);
 assert.deepEqual(Object.keys(original),['entered_at','settled_at']);
});

for(const rejection of [new Error('original goto',{cause:Error('first cause')}),undefined,null,false,0,''])
 test('goto rejection retains original and leaves settled_at null: '+String(rejection),async()=>{
  const f=fixture(async()=>{throw rejection});let rejected=false,value;
  try{await f.run()}catch(error){rejected=true;value=error}
  assert.equal(rejected,true);assert.equal(value,rejection);
  assert.equal(f.owner.evidence.goto.settled_at,null);
  assert.equal(f.reads(),0);assert.equal(f.credentials(),0);
  assert.equal(f.owner.documentBound,undefined);assert.equal(f.owner.loginSubmitted,undefined);
  f.owner.startupDiagnostics.stop();
 });
