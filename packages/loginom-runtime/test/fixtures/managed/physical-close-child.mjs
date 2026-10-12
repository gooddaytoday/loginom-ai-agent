// Whole installed/source managed module. Real Node fs callbacks/descriptors/IPC;
// Page/bridge/native/context are labelled doubles. Only fault replies are injected.
import vm from 'node:vm';import * as fs from 'node:fs';import * as promises from 'node:fs/promises';
import * as module from 'node:module';import * as crypto from 'node:crypto';import * as path from 'node:path';
import * as url from 'node:url';import * as os from 'node:os';
const entryPath=process.env.PHYSICAL_ENTRY,directory=process.env.PHYSICAL_DIRECTORY,scenario=process.env.PHYSICAL_SCENARIO;
const events=[],fds=new Set(),metadata=new Map();let native=0,selected=false,selectedFd,scheduled,originalCallback,kernelFinished=false,callbackDelivered=false,blocker;
const values={error:Error('primary sync',{cause:0}),undefined:undefined,null:null,false:false,zero:0,empty:''};
let state;
const eligible=fd=>!selected&&state?.shutdown?.stages.some(s=>s.stage==='bridge'&&s.status==='returned')&&metadata.get(fd)===(scenario==='directory-lost'?'directory':'file');
const builtinFs={...fs,
 open(p,flags,mode,callback){
  if(selected&&!kernelFinished)events.push({event:'new-open-before-kernel',physicalOpen:physicalOpen()});
  fs.open(p,flags,mode,(error,fd)=>{if(!error){fds.add(fd);metadata.set(fd,p===directory?'directory':'file')}events.push({event:'open-callback',kind:metadata.get(fd)});callback(error,fd)});
 },
 writeFile(fd,bytes,callback){events.push({event:'write',kind:metadata.get(fd)});fs.writeFile(fd,bytes,callback)},
 fsync(fd,callback){
  if(eligible(fd)&&scenario.startsWith('sync-')){selected=true;selectedFd=fd;throw values[scenario.slice(5)]}
  fs.fsync(fd,error=>{events.push({event:'sync-callback',kind:metadata.get(fd),succeeded:error===null||error===undefined});callback(error)});
 },
 close(fd,callback){
  const target=eligible(fd)||(fd===selectedFd&&scenario.startsWith('sync-')&&!scheduled);
  if(target){selected=true;selectedFd=fd;
   if(scenario==='callback-error'){callback(Error('native close callback failed'));return}
   originalCallback=callback;
   // Genuine queued kernel close; return/throw projection cannot prove completion.
   blocker=new Promise((resolve,reject)=>crypto.pbkdf2('fixture','fixture',1000000,8,'sha256',e=>e?reject(e):resolve()));
   scheduled=new Promise(resolve=>fs.close(fd,error=>{
    kernelFinished=true;fds.delete(fd);events.push({event:'kernel-close-callback',succeeded:error===null||error===undefined,physicalOpen:physicalOpen()});
    if(scenario==='missing-callback'){originalCallback=()=>{callbackDelivered=true;callback(error)}}
    else {callbackDelivered=true;callback(error)}
    process.send?.({fixture:'kernel-complete'});resolve();
   }));
   events.push({event:'close-scheduled',physicalOpen:physicalOpen()});
   if(scenario==='normal')return;
   if(scenario==='early-fulfilled'||scenario==='missing-callback')return Promise.resolve('status-projection-only');
   throw scenario.startsWith('sync-')?false:0;
  }
  fs.close(fd,error=>{if(error===null||error===undefined)fds.delete(fd);events.push({event:'close-callback',kind:metadata.get(fd),succeeded:error===null||error===undefined});callback(error)});
 }
};
function physicalOpen(){if(selectedFd===undefined)return null;try{fs.fstatSync(selectedFd);return true}catch{return false}}
const context=vm.createContext({process,URL,AbortController,setImmediate,console,Error,Promise,Map,Set});
const builtins={'node:module':module,'node:crypto':crypto,'node:path':path,'node:url':url,'node:os':os,'node:fs/promises':promises,'node:fs':builtinFs};
const entry=new vm.SourceTextModule(await promises.readFile(entryPath,'utf8')+'\nexport {state,requests};',{context,identifier:url.pathToFileURL(entryPath).href,initializeImportMeta(meta){meta.url=url.pathToFileURL(entryPath).href}});
await entry.link(name=>{const exports=builtins[name]??{
 './resources.mjs':{verifyResources(){throw Error('fixture forbids start')}},'./start-input.mjs':{validateStartInput(){throw Error('fixture forbids start')}},
 './connection-check.mjs':{loginBrowser(){throw Error('fixture forbids login')},checkConnection(){throw Error('fixture forbids login')},loginomAddress(){}},
 '../client/lib/session.mjs':{createSession(){}},'../client/lib/artifacts.mjs':{admitStartupArtifacts(){}},'../client/lib/bridge.mjs':{createBridge(){}},
}[name];if(!exports)throw Error('unexpected module '+name);return new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v)},{context})});await entry.evaluate();state=entry.namespace.state;
state.session={directory};state.authenticatedReadiness={account:'own'};
state.bridge={async close(){native++;events.push({event:'native-cleanup-double'});return {cleanup_complete:true,browser_transport_closed:true,native_logout_confirmed:true}}};
state.browser={async close(){events.push({event:'context-close-double'})}};
state.client={async close(){events.push({event:'client-close'});process.send({fixture:'release-proof',events,native,kernelFinished,callbackDelivered,writers:state.evidenceWriters.size})}};
state.browserServer={async close(){events.push({event:'server-close'})}};
const keepAlive=setInterval(()=>{},1000);
process.on('message',async message=>{
 if(message.fixture==='probe')process.send({fixture:'probe',tag:message.tag,native,selected,kernelFinished,callbackDelivered,physicalOpen:physicalOpen(),writers:state.evidenceWriters?.size,events,shutdown:state.shutdown,evidencePrimary:state.evidencePrimary&&{phase:state.evidencePrimary.phase,rejection:serial(state.evidencePrimary.value)}});
 if(message.fixture==='deliver-original-callback'){if(kernelFinished&&scenario==='missing-callback')originalCallback()}
 if(message.fixture==='dispose'){
  if(blocker)await blocker;if(scheduled)await scheduled;
  for(const fd of fds)await new Promise(resolve=>fs.close(fd,()=>resolve()));
  clearInterval(keepAlive);process.exit(0); // fixture-only disposal; no production ACK
 }
});
function serial(value){return value instanceof Error?{kind:'Error',message:value.message,...('cause'in value?{cause:serial(value.cause)}:{})}:{kind:'value',value:value===undefined?null:value,is_undefined:value===undefined}}
process.send({fixture:'ready'});
