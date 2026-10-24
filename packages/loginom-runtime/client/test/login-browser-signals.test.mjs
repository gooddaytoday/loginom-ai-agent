import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loginBrowser} from '../../src/connection-check.mjs';

for(const keepOpen of [true,false])test('browser signal ownership follows keepOpen='+keepOpen,async()=>{
 let launched,closed=0;
 const context={addInitScript:async()=>{},pages:()=>[{}],close:async()=>{closed++;}};
 const run=vm.runInNewContext('('+loginBrowser.toString()+')',{
  require:()=>({chromium:{launchPersistentContext:async(_path,options)=>{launched=options;return context;}}}),
  browserLaunch:()=>({args:[],viewport:{width:1280,height:800}}),mkdir:async()=>{},
  browserEnvironment:()=>({}),browserLoggingArguments:()=>[],browserDownloadScript:()=>'',
  loginPage:async()=>({authenticated:true}),process:{platform:'linux',env:{}},
 });
 const result=await run({browserPath:'/own/chromium',profile:'/own/profile',candidate:{url:'https://loginom.invalid'},headless:true,keepOpen});
 for(const key of ['handleSIGINT','handleSIGTERM','handleSIGHUP'])assert.equal(launched[key],!keepOpen,key);
 assert.equal(closed,keepOpen?0:1);assert.equal(result.authenticated,true);
});
