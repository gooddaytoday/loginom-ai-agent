import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {loginPage} from '../src/connection-check.mjs';
for(const primary of [Error('original'),undefined,null,false,0,''])test('private asset refusal settles before credentials and preserves original '+String(primary),async()=>{
 const page=new EventEmitter();let credentials=0,stops=0;
 page.goto=async()=>{};page.evaluate=async()=>{};
 page.locator=()=>({or(){return this},first(){return this},waitFor:()=>new Promise(()=>{}),locator(){return this},fill:async()=>{credentials++}});
 const failure=Promise.reject(primary);failure.catch(()=>{});
 const owner={id:'original',account:'own',origin:'https://own.invalid',evidence:{},staticLoader:{failure,stop:async()=>{stops++;throw Error('secondary cleanup')}}};
 let rejected=false,result;try{await loginPage(page,{url:'https://own.invalid/app/',username:'own',password:'unused'},owner)}catch(e){rejected=true;result=e}
 assert.equal(rejected,true);assert.equal(result,primary);assert.equal(credentials,0);assert.equal(stops,1);assert.equal(owner.loginSubmitted,undefined);assert.equal(owner.evidence.startup_diagnostics.stopped,true);
});
test('visible widget does not authorize credentials when asset settlement refuses',async()=>{
 const primary=Error('asset settlement');const page=new EventEmitter();let credentials=0;
 page.goto=async()=>{};page.evaluate=async()=>{};
 page.locator=()=>({or(){return this},first(){return this},waitFor:async()=>{},locator(){return this},fill:async()=>{credentials++}});
 const owner={id:'original',account:'own',origin:'https://own.invalid',evidence:{},staticLoader:{failure:new Promise(()=>{}),stop:async()=>{throw primary}}};
 await assert.rejects(loginPage(page,{url:'https://own.invalid/app/',username:'own',password:'unused'},owner),e=>e===primary);assert.equal(credentials,0);assert.equal(owner.loginSubmitted,undefined);
});
