// Whole production managed module, linked to labelled lifecycle doubles. No login/model/browser.
import vm from 'node:vm';import {readFile} from 'node:fs/promises';
import * as module from 'node:module';import * as crypto from 'node:crypto';import * as path from 'node:path';
import * as url from 'node:url';import * as os from 'node:os';import * as fs from 'node:fs/promises';
const file=process.env.MANAGED_DRAIN_ENTRY,scenario=process.env.MANAGED_DRAIN_SCENARIO;
const context=vm.createContext({process,URL,AbortController,setImmediate,console,Error,Promise,Map,Set});
const builtin={'node:module':module,'node:crypto':crypto,'node:path':path,'node:url':url,'node:os':os,'node:fs/promises':{...fs,writeFile:async(...args)=>{if(scenario==='receipt-failure' && String(args[1]).includes('\"status\": \"returned\"'))throw Error('fixture receipt write rejected');return fs.writeFile(...args)}}};
const entry=new vm.SourceTextModule(await readFile(file,'utf8')+'\nexport {state,requests};',{context,identifier:url.pathToFileURL(file).href,initializeImportMeta(meta){meta.url=url.pathToFileURL(file).href}});
await entry.link(async specifier=>{
 if(specifier==='./terminal-managed-call.mjs')return new vm.SourceTextModule(await readFile(new URL(specifier,url.pathToFileURL(file)),'utf8'),{context,identifier:new URL(specifier,url.pathToFileURL(file)).href});
 const exports=builtin[specifier]??({
 './original-prepare-lender.mjs':{retainOriginalPrepareStartup(){throw Error('fixture forbids start')}},
 './fp-managed-startup.mjs':{retainFPManagedStartup(){throw Error('fixture forbids start')}},
 './resources.mjs':{verifyResources:()=>{throw Error('fixture forbids start')}},
 './start-input.mjs':{validateStartInput:()=>{throw Error('fixture forbids start')}},
 './connection-check.mjs':{loginBrowser(){throw Error('fixture forbids login')},checkConnection(){throw Error('fixture forbids login')},loginomAddress(){}},
 '../client/lib/session.mjs':{createSession(){}},'../client/lib/artifacts.mjs':{admitStartupArtifacts(){}},'../client/lib/bridge.mjs':{createBridge(){}},
 })[specifier];if(!exports)throw Error('Unexpected dependency '+specifier);
 return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v)},{context});
});await entry.evaluate();const {state}=entry.namespace;
const events=[];let release,native=0,bridgeCalls=0;const gate=new Promise(r=>{release=r});
const rejection=()=>scenario==='throw-error'?Error('fixture primary'):scenario==='throw-undefined'?undefined:scenario==='throw-null'?null:scenario==='throw-false'?false:scenario==='throw-empty'?'':0;
state.session={directory:process.env.MANAGED_DRAIN_DIRECTORY};state.authenticatedReadiness={account:'fixture-user'};
state.client={async listTools(){events.push('request-start');process.send({fixture:'in-flight'});await gate;events.push('request-settled');if(scenario==='request-rejection')throw 0;return {tools:[]}},async close(){events.push('client-close')}};
state.browser={async close(){events.push('context-close')}};
state.bridge={async close(){bridgeCalls++;if(!native){native++;events.push('native-cleanup-double')}
 if(scenario.startsWith('throw-'))throw rejection();
 const incomplete=['pending','unknown','unsaved','missing-cleanup'].includes(scenario);
 return {browser_transport_closed:!incomplete,native_logout_confirmed:!incomplete,
 ...(scenario==='missing-cleanup'?{}:{cleanup_complete:!incomplete}),reason:incomplete?scenario:null,
 ...(incomplete?{rejection:{kind:'value',value:0,is_undefined:false}}:{})};
 }};
process.on('message',m=>{
 if(m?.fixture==='release')release();
 if(m?.fixture==='probe')process.send({fixture:'probe',events,native,bridgeCalls,shutdown:state.shutdown,
 closeFailure:state.closeFailure instanceof Error?{message:state.closeFailure.message,cause:state.closeFailure.cause}:state.closeFailure,
 closeFailureUndefined:state.closeFailure===undefined});
});
// Offline refusal fixtures deliberately stay observable until their parent terminates this exact child.
setInterval(()=>{},1000);process.send({fixture:'ready'});
