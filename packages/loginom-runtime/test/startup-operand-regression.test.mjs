import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,writeFile,mkdir,mkdtemp,rm,rename} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';

const sourcePath=process.env.STARTUP_SOURCE??new URL('../src/connection-check.mjs',import.meta.url).pathname;
assert.ok(sourcePath);
const source=await readFile(sourcePath,'utf8');
const code=source.slice(source.indexOf('export function browserEnvironment')).replaceAll('export ','');
const {startupOwner}=vm.runInNewContext(code+';({startupOwner})',{
 writeFile,mkdir,readFile,createHash,join,dirname,randomUUID,URL,process,Error,runtimeModulePath:sourcePath,
});
const serial=value=>value instanceof Error?{kind:'Error',name:value.name,message:value.message,
 ...('cause' in value?{cause:serial(value.cause)}:{})}:{kind:'value',value:value===undefined?null:value,is_undefined:value===undefined};
async function fixture({running=()=>false,count=0,blocked=false}={}) {
 const directory=await mkdtemp(join(tmpdir(),'review-first-operand-'));
 const events=[],document={querySelectorAll:()=>[]};
 const map={FServerConnection:{Connected:true,UserName:'own'},PackageNodes:{},FPackagesParentNode:{},HasRunningNodes:running};
 Object.defineProperty(map.PackageNodes,'Count',{get:typeof count==='function'?count:()=>count});
 const app={Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:map}}}};
 const state=vm.createContext({document,location:{origin:'https://own.invalid'},
  bg:{app},getComputedStyle:()=>({visibility:'visible'}),Error});
 const owner={directory,artifacts:{fixture:true}};
 startupOwner(owner,directory,{username:'own',url:'https://own.invalid'});
 state.__loginomStartupV1={document,id:owner.id,account:'own'};
 owner.page={evaluate:async(fn,arg)=>vm.runInContext('('+fn.toString()+')',state)(arg),
  locator:()=>({click:async()=>{events.push('native_menu');throw Error('fixture stops before native gesture')}})};
 owner.context={pages:()=>[owner.page],close:async()=>events.push('context_close')};
 if(blocked)await mkdir(join(directory,'startup-cleanup.json'));
 return {owner,events,directory,map,app,dispose:()=>rm(directory,{recursive:true,force:true})};
}

for(const [label,value] of [['Error',Error('original running getter',{cause:0})],['undefined',undefined],['null',null],['false',false],['zero',0],['empty','']]) {
 for(const blocked of [false,true])test('running getter preserves original '+label+' writable='+!blocked,async()=>{
  const f=await fixture({running:()=>{throw value},blocked});
  let caught,rejected=false;
  try {
   try{await f.owner.close()}catch(error){caught=error;rejected=true}
   assert.equal(rejected,true);assert.deepEqual(f.events,[]);assert.notEqual(f.owner.nativeAttempted,true);
   const result={label,blocked,fixture:true,production:sourcePath,caller:serial(caught),original:serial(value),
    exact_caller:caught===value,exact_cleanup_failure:f.owner.cleanupFailure===value,evidence:f.owner.evidence};
   if(process.env.REVIEW_RESULTS)await writeFile(join(process.env.REVIEW_RESULTS,label+'-'+blocked+'.json'),JSON.stringify(result,null,2)+'\n');
   assert.equal(caught,value,'guard read must preserve its exact first rejection');
   assert.equal(f.owner.cleanupFailure,value,'persistence must not replace the original guard rejection');
   assert.equal(JSON.stringify(f.owner.evidence.guard_rejection),JSON.stringify(serial(value)));
   const first=JSON.stringify(f.owner.evidence.first_guard);
   if(blocked)await rename(join(f.directory,'startup-cleanup.json'),join(f.directory,'failed-write'));
   f.map.HasRunningNodes=()=>{throw Error('later different rejection')};
   let retry;try{await f.owner.close()}catch(e){retry=e}
   assert.equal(retry,value);assert.equal(f.owner.cleanupFailure,value);assert.equal(JSON.stringify(f.owner.evidence.first_guard),first);
   assert.deepEqual(JSON.parse(await readFile(join(f.directory,'startup-cleanup.json'),'utf8')).guard_rejection,serial(value));
  } finally {await f.dispose()}
 });
}

test('first Count sample refuses before native cleanup without re-reading the operand',async()=>{
 let reads=0;
 const f=await fixture({count:()=>++reads===1?1:0});
 try {
  await assert.rejects(f.owner.close());
  const result={fixture:true,production:sourcePath,reads,events:f.events,nativeAttempted:f.owner.nativeAttempted===true,
   evidence:f.owner.evidence};
  if(process.env.REVIEW_RESULTS)await writeFile(join(process.env.REVIEW_RESULTS,'count-one-to-zero.json'),JSON.stringify(result,null,2)+'\n');
  assert.deepEqual(f.events,[],'the original nonempty sample must refuse before a native gesture');
  assert.notEqual(f.owner.nativeAttempted,true);
  if(f.owner.evidence.first_guard)assert.equal(f.owner.evidence.first_guard.count.value,1);
 }finally{await f.dispose()}
});

test('first zero Count snapshot and guard result use the same operand',async()=>{
 let reads=0;
 const f=await fixture({count:()=>++reads===1?0:1});
 try {
  await assert.rejects(f.owner.close());
  const s=f.owner.evidence.first_guard;
  const result={fixture:true,production:sourcePath,reads,events:f.events,evidence:f.owner.evidence};
  if(process.env.REVIEW_RESULTS)await writeFile(join(process.env.REVIEW_RESULTS,'count-zero-to-one.json'),JSON.stringify(result,null,2)+'\n');
  if(s) {
   assert.equal(s.count.value,0);
   assert.equal(s.result.authenticated,true,'a recorded strict idle sample must not be classified using a later Count value');
  }
  assert.deepEqual(f.events,['native_menu']);
 }finally{await f.dispose()}
});

for(const operand of ['build','account','connected','parent'])test('snapshot and decision sample '+operand+' once',async()=>{
 const f=await fixture();let reads=0;
 const values={build:['7.4.2','foreign'],account:['own','foreign'],connected:[true,false],parent:[{},undefined]};
 const target=operand==='build'?f.app:operand==='parent'?f.map:f.map.FServerConnection;
 const key={build:'Version',account:'UserName',connected:'Connected',parent:'FPackagesParentNode'}[operand];
 Object.defineProperty(target,key,{get:()=>values[operand][++reads===1?0:1]});
 try{await assert.rejects(f.owner.close());assert.equal(reads,1);assert.equal(f.owner.evidence.first_guard.result.authenticated,true);assert.deepEqual(f.events,['native_menu'])}
 finally{await f.dispose()}
});
test('separate fresh identity check before logout still refuses changed Count',async()=>{
 let reads=0;const f=await fixture({count:()=>++reads===1?0:1});
 f.owner.page.locator=selector=>({click:async()=>f.events.push(selector.includes('btnLogOut')?'logout':'menu'),innerText:async()=>'own'});
 try{await assert.rejects(f.owner.close(),e=>e.message==='LOGINOM_STARTUP_IDENTITY_CHANGED');
  assert.equal(reads,2);assert.equal(f.owner.evidence.first_guard.count.value,0);assert.equal(f.owner.evidence.first_guard.result.authenticated,true);assert.deepEqual(f.events,['menu']);}
 finally{await f.dispose()}
});
for(const mode of ['cause-omitted','plain-error'])test('browser transport error preserves explicit nested cause: '+mode,async()=>{
 const original=Error('outer getter',{cause:Error('inner getter',{cause:0})});const f=await fixture({running:()=>{throw original}});
 const evaluate=f.owner.page.evaluate;
 f.owner.page.evaluate=async(fn,arg)=>{
  const result=await evaluate(fn,arg);
  if(result.guardFailure)result.guardFailure.value=mode==='cause-omitted'?Error(original.message):{};
  return result;
 };
 try{
  let caught;try{await f.owner.close()}catch(e){caught=e}
  assert.equal(caught.message,'outer getter');assert.equal(caught.cause.message,'inner getter');assert.equal(caught.cause.cause,0);
  assert.equal(f.owner.cleanupFailure,caught);assert.deepEqual(f.events,[]);
  assert.deepEqual(JSON.parse(await readFile(join(f.directory,'startup-cleanup.json'),'utf8')).guard_rejection,serial(original));
 }finally{await f.dispose()}
});
