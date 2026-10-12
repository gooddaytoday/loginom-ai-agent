// Whole managed module; real filesystem/Node IPC. Bridge/native/Page are doubles.
import vm from 'node:vm';
import * as fs from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import * as module from 'node:module';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as url from 'node:url';
import * as os from 'node:os';
const [entryPath,directory,scenario]=process.argv.slice(2), events=[];
const context=vm.createContext({process,URL,AbortController,setImmediate,console,Error,Promise,Map,Set});
const fsDriver={...fs,async open(p,...args){const h=await fs.open(p,...args);return {async sync(){events.push('managed_sync');await h.sync()},async close(){events.push('managed_file_close');await h.close()}}}};
const builtins={'node:module':module,'node:fs/promises':fsDriver,'node:crypto':crypto,'node:path':path,'node:url':url,'node:os':os};
const dependencies={'./resources.mjs':{verifyResources(){}},'./start-input.mjs':{validateStartInput(){}},'./connection-check.mjs':{loginBrowser(){},checkConnection(){},loginomAddress(){}},'../client/lib/session.mjs':{createSession(){}},'../client/lib/artifacts.mjs':{admitStartupArtifacts(){}},'../client/lib/bridge.mjs':{createBridge(){}}};
const entry=new vm.SourceTextModule(await fs.readFile(entryPath,'utf8')+'\nexport {state};',{context,identifier:url.pathToFileURL(entryPath).href,initializeImportMeta(m){m.url=url.pathToFileURL(entryPath).href}});
await entry.link(s=>{const exports=builtins[s]??dependencies[s];return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v)},{context})});await entry.evaluate();
const state=entry.namespace.state;state.session={directory};state.browserProfile=path.join(directory,'profile');await fs.mkdir(state.browserProfile);
state.authenticatedReadiness=true;state.browser={async close(){events.push('browser_release')}};state.client={async close(){events.push('client_release')}};
let receipt={browser_transport_closed:true,cleanup_complete:true,native_logout_confirmed:true};
if(scenario==='cleanup-missing')delete receipt.cleanup_complete;
if(scenario==='cleanup-false')receipt.cleanup_complete=false;
if(scenario==='logout-missing')delete receipt.native_logout_confirmed;
if(scenario==='logout-false')receipt.native_logout_confirmed=false;
state.bridge={async close(){events.push('native_bridge_close');return receipt}};
if(scenario==='readiness-empty'){state.browser=undefined;state.bridge=undefined}
if(scenario==='browser-no-bridge')state.bridge=undefined;
if(scenario.startsWith('foreign-')){
 state.bridge=undefined;const original={id:'own',account:'own',origin:'https://own.invalid',context:state.browser,page:{},async close(){events.push('owner_close');return {cleanup_complete:true}}};state.startupOwner=original;state.startupBinding={owner:original,id:original.id,account:original.account,origin:original.origin,context:original.context,page:original.page};
 if(scenario==='foreign-owner')state.startupOwner={...original};
 if(scenario==='foreign-page')original.page={};
 if(scenario==='foreign-context')original.context={};
}
process.on('message',m=>{if(m.fixture==='probe')setImmediate(async()=>{let exists=true;try{await fs.stat(state.browserProfile)}catch{exists=false}process.send({fixture:'probe',events,profile_exists:exists,shutdown:state.shutdown})});if(m.fixture==='dispose')process.exit(0)});
process.send({fixture:'ready'});

process.on('exit',code=>writeFileSync(path.join(directory,'terminal.json'),JSON.stringify({code,events,shutdown:state.shutdown})));
