// Full managed module; bridge/context/process inputs are labelled doubles.
// The companion cleanup-managed-refusal test observes the actual bridge result.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as fs from 'node:fs/promises';
import * as callbacks from 'node:fs';
import * as module from 'node:module';
import * as crypto from 'node:crypto';
import * as url from 'node:url';
import * as paths from 'node:path';
import * as os from 'node:os';
const entry=process.env.MANAGED_ENTRY??url.fileURLToPath(new URL('../src/managed-entry.mjs',import.meta.url));
const cases={error:Error('first bridge failure',{cause:0}),undefined:undefined,null:null,false:false,zero:0,empty:''};
async function fixture(action){
 const directory=await fs.mkdtemp(paths.join(os.tmpdir(),'managed-boundary-'));
 const events=[],messages=[],facade={...process,connected:true,on(){},umask:process.umask.bind(process),send(m,cb){messages.push(m);cb?.()},disconnect(){this.connected=false},exit(){throw Error('unexpected exit')}};
 const ctx=vm.createContext({process:facade,URL,Promise,Error,Map,Set,AbortController,setImmediate,setTimeout,clearTimeout,console});
 const synthetic=value=>new vm.SyntheticModule(Object.keys(value),function(){for(const[k,v]of Object.entries(value))this.setExport(k,v)},{context:ctx});
 const builtins={'node:fs':callbacks,'node:fs/promises':fs,'node:module':module,'node:crypto':crypto,'node:url':url,'node:os':os,'node:path':paths};
 const defaults={'./resources.mjs':{verifyResources(){}},'./start-input.mjs':{validateStartInput(){}},'./connection-check.mjs':{loginBrowser(){},checkConnection(){},loginomAddress(){}},'../client/lib/session.mjs':{createSession(){}},'../client/lib/artifacts.mjs':{admitStartupArtifacts(){}},'../client/lib/bridge.mjs':{createBridge(){}}};
 const code=new vm.SourceTextModule(await fs.readFile(entry,'utf8')+'\nexport {state,handle};',{context:ctx,identifier:url.pathToFileURL(entry).href,initializeImportMeta(meta){meta.url=url.pathToFileURL(entry).href}});
 await code.link(spec=>synthetic(builtins[spec]??defaults[spec]));await code.evaluate();
 const state=code.namespace.state;state.session={directory};state.browserProfile=paths.join(directory,'profile');await fs.mkdir(state.browserProfile);
 state.bridge={async close(){events.push('bridge');return action()}};state.browser={async close(){events.push('context')}};state.client={async close(){events.push('client')}};
 return {directory,state,events,messages,handle:code.namespace.handle,async dispose(){await fs.rm(directory,{recursive:true,force:true})}};
}
for(const [label,value]of Object.entries(cases))test('full managed preserves raw first thrown '+label+' on retry',async()=>{
 const f=await fixture(()=>{throw value});
 try{await f.handle({id:'first',operation:'close'});const first=f.state.closeFailure;
  await f.handle({id:'again',operation:'close'});assert.equal(f.state.bridgeCloseFailure,value);
  assert.equal(first,value);
  assert.deepEqual(f.events,['bridge']);assert.equal(f.state.release.browser_profile,undefined);assert.ok((await fs.stat(f.state.browserProfile)).isDirectory());
  assert.equal(f.messages.some(m=>m.result?.closed===true),false);
  const durable=JSON.parse(await fs.readFile(paths.join(f.directory,'managed-shutdown.json'),'utf8'));
  assert.equal(durable.primaryFailure.stage,'bridge');assert.equal(durable.stages.some(s=>s.stage==='outer_acknowledgement'),false);
 }finally{await f.dispose()}
});
for(const [label,value]of Object.entries({...cases,missing:undefined}))test('full managed refuses nonaffirmative cleanup flag '+label,async()=>{
 const receipt={browser_transport_closed:true,...(label==='missing'?{}:{cleanup_complete:value})};const f=await fixture(()=>receipt);
 try{await f.handle({id:'close',operation:'close'});assert.deepEqual(f.events,['bridge']);assert.equal(f.state.bridgeCloseFailure.cause,receipt);assert.equal(f.state.bridgeCleanup,undefined);assert.equal(f.messages[0].error,'LOGINOM_RUNTIME_CLEANUP_FAILED');assert.equal(f.state.release.browser_profile,undefined)}finally{await f.dispose()}
});
