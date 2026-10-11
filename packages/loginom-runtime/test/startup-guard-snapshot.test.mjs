import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,writeFile,mkdir,mkdtemp,rm,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
const source=await readFile(process.env.STARTUP_SOURCE??new URL('../src/connection-check.mjs',import.meta.url),'utf8');
const code=source.slice(source.indexOf('export function browserEnvironment')).replaceAll('export ','');
async function fixture({count=0,running=false,parent=true,dialogs=false,foreign=false,build='7.4.2',blocked=false,throwRunning}={}) {
 const directory=await mkdtemp(join(tmpdir(),'first-guard-'));
 const document={querySelectorAll:()=>dialogs?[{getBoundingClientRect:()=>({width:1,height:1})}]:[]};
 const map={FServerConnection:{Connected:true,UserName:foreign?'foreign':'own'},PackageNodes:{Count:count},FPackagesParentNode:parent?{}:undefined,
  HasRunningNodes:()=>{if(throwRunning)throw throwRunning.value;return running}};
 const state=vm.createContext({document,location:{origin:'https://own.invalid'},bg:{app:{Version:build,Application:{FInstance:{FMainForm:{FMapTree:map}}}}},getComputedStyle:()=>({visibility:'visible'}),Error});
 const owner={directory,deadline:1700000000123,artifacts:{fixture:true}},events=[];
 const {startupOwner}=vm.runInNewContext(code+';({startupOwner})',{writeFile,mkdir,join,randomUUID,URL,Error});
 startupOwner(owner,directory,{username:'own',url:'https://own.invalid'});
 state.__loginomStartupV1={document,id:owner.id,account:'own'};
 owner.context={pages:()=>[owner.page],close:async()=>events.push('context')};
 owner.page={evaluate:async(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',state),locator:()=>{throw Error('no native gestures in refused fixture')}};
 if(blocked)await mkdir(join(directory,'startup-cleanup.json'));
 return {owner,map,events,directory,dispose:()=>rm(directory,{recursive:true,force:true})};
}
for(const count of [0,1,'0','1',undefined,null])test('first guard exact Count '+String(count),async()=>{
 const f=await fixture({count:null});f.map.PackageNodes.Count=count;
 try{await assert.rejects(f.owner.close());const s=f.owner.evidence.first_guard;
  assert.equal(s.count.type,typeof count);assert.equal(s.count.is_undefined,count===undefined);assert.equal(s.count.value,count===undefined?null:count);
  assert.equal(s.deadline,1700000000123);assert.equal(s.identity_matches,true);assert.equal(s.build.value,'7.4.2');
  const first=JSON.stringify(s);f.map.PackageNodes.Count=7;await assert.rejects(f.owner.close());assert.equal(JSON.stringify(f.owner.evidence.first_guard),first);
  const durable=JSON.parse(await readFile(join(f.directory,'startup-cleanup.json'),'utf8'));assert.equal(JSON.stringify(durable.first_guard),JSON.stringify(s));
 }finally{await f.dispose()}
});
for(const options of [{running:undefined},{running:null},{running:true},{parent:false,running:undefined},{dialogs:true},{foreign:true},{build:'other'}])test('guard operands '+JSON.stringify(options),async()=>{
 const f=await fixture(options);if(Object.hasOwn(options,'running'))f.map.HasRunningNodes=()=>options.running;
 try{await assert.rejects(f.owner.close());const s=f.owner.evidence.first_guard;assert.equal(s.package_parent_ready,options.parent!==false);
  assert.equal(s.identity_matches,!options.foreign);assert.equal(s.dialogs.visible,!!options.dialogs);assert.deepEqual(f.events,[]);
  assert.equal(s.deadline,1700000000123);assert.ok(s.observed_at);
 }finally{await f.dispose()}
});
for(const value of [Error('running-read'),undefined,null,false,0,''])test('snapshot exact running rejection '+String(value),async()=>{
 const f=await fixture({throwRunning:{value},blocked:true});
 try{let error;try{await f.owner.close()}catch(e){error=e}assert.equal(error.message,'LOGINOM_STARTUP_CLEANUP_BLOCKED');
  assert.equal(f.owner.evidence.first_guard.running.available,false);assert.ok(f.owner.evidence.guard_persistence_failure);
  assert.equal(error.cause.snapshot.running.rejection.is_undefined,value===undefined?true:value instanceof Error?undefined:false);
  const first=JSON.stringify(f.owner.evidence.first_guard);await rename(join(f.directory,'startup-cleanup.json'),join(f.directory,'failed-write'));
  await assert.rejects(f.owner.close());assert.equal(JSON.stringify(f.owner.evidence.first_guard),first);assert.deepEqual(f.events,[]);
  assert.equal(JSON.parse(await readFile(join(f.directory,'startup-cleanup.json'),'utf8')).first_guard.running.available,false);
 }finally{await f.dispose()}
});
