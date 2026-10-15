// Whole production managed module, linked to labelled lifecycle doubles. No login/model/browser.
import vm from 'node:vm';import {readFile} from 'node:fs/promises';
import * as module from 'node:module';import * as crypto from 'node:crypto';import * as path from 'node:path';
import * as url from 'node:url';import * as os from 'node:os';import * as fs from 'node:fs/promises';
const file=process.env.MANAGED_DRAIN_ENTRY,scenario=process.env.MANAGED_DRAIN_SCENARIO;
const fsTrace=[],rawSend=process.send.bind(process);
process.send=(m,...args)=>rawSend(m?.result?.closed===true?{...m,fsTrace:[...fsTrace]}:m,...args);
const context=vm.createContext({process,URL,AbortController,setImmediate,console,Error,Promise,Map,Set});
const builtin={'node:module':module,'node:crypto':crypto,'node:path':path,'node:url':url,'node:os':os,'node:fs/promises':{...fs,open:async(p,...args)=>{const h=await fs.open(p,...args);return {async sync(){await h.sync();fsTrace.push({event:'fsync-completed',receipt:JSON.parse(await fs.readFile(p,'utf8')).stages.at(-1)})},async close(){await h.close()}}},writeFile:async(...args)=>{if(scenario==='receipt-failure' && String(args[1]).includes('\"status\": \"returned\"'))throw Error('fixture receipt write rejected');return fs.writeFile(...args)}}};
const entry=new vm.SourceTextModule(await readFile(file,'utf8')+'\nexport {state,requests};',{context,identifier:url.pathToFileURL(file).href,initializeImportMeta(meta){meta.url=url.pathToFileURL(file).href}});
await entry.link(specifier=>{
 const exports=builtin[specifier]??({
 './resources.mjs':{verifyResources:()=>({browserPath:'/fixture',manifest:{files:[]}})},
 './start-input.mjs':{validateStartInput:()=>({})},
 './connection-check.mjs':{loginBrowser(){throw Error('fixture forbids login')},checkConnection(options){const owner=options.owner;owner.context={close:async()=>events.push('startup-context-close')};owner.close=async()=>{events.push('startup-owner-close');throw Error('fixture UNKNOWN')};const e=Error('LOGINOM_LOGIN_UNAVAILABLE');e.startupOwner=owner;throw e},loginomAddress(){}},
 '../client/lib/session.mjs':{createSession(){}},'../client/lib/artifacts.mjs':{admitStartupArtifacts(){}},'../client/lib/bridge.mjs':{createBridge(){}},
 })[specifier];if(!exports)throw Error('Unexpected dependency '+specifier);
 return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v)},{context});
});await entry.evaluate();const {state}=entry.namespace;
const events=[];let release,native=0,bridgeCalls=0;const gate=new Promise(r=>{release=r});
const rejection=()=>scenario==='throw-error'?Error('fixture primary'):scenario==='throw-undefined'?undefined:scenario==='throw-null'?null:scenario==='throw-false'?false:scenario==='throw-empty'?'':0;
if(!['startup-owner-gap','no-start'].includes(scenario))state.session={directory:process.env.MANAGED_DRAIN_DIRECTORY};if(scenario!=='no-start')state.authenticatedReadiness={account:'fixture-user'};
if(!['startup-owner-gap','no-start'].includes(scenario))state.client={async listTools(){events.push('request-start');process.send({fixture:'in-flight'});await gate;events.push('request-settled');if(scenario==='request-rejection')throw 0;return {tools:[]}},async close(){events.push('client-close');fsTrace.push({event:'client-close'})}};
if(!['startup-owner-gap','no-start'].includes(scenario))state.browser={async close(){events.push('context-close');fsTrace.push({event:'context-close'})}};
if(!['startup-owner-gap','no-start'].includes(scenario))state.bridge={async close(){bridgeCalls++;if(!native){native++;events.push('native-cleanup-double');fsTrace.push({event:'native-cleanup-double'})}
 if(scenario.startsWith('throw-'))throw rejection();
 const incomplete=['pending','unknown','unsaved','missing-cleanup'].includes(scenario);
 return {browser_transport_closed:!incomplete,native_logout_confirmed:!incomplete,
 ...(scenario==='missing-cleanup'?{}:{cleanup_complete:!incomplete}),reason:incomplete?scenario:null,
 ...(incomplete?{rejection:{kind:'value',value:0,is_undefined:false}}:{})};
 }};
process.on('message',m=>{
 if(m?.fixture==='release')release();
 if(m?.fixture==='probe')process.send({fixture:'probe',events,native,bridgeCalls,shutdown:state.shutdown,startupOwnerRetained:!!state.startupOwner,
 closeFailure:state.closeFailure instanceof Error?{message:state.closeFailure.message,cause:state.closeFailure.cause}:state.closeFailure,
 closeFailureUndefined:state.closeFailure===undefined});
});
// Offline refusal fixtures deliberately stay observable until their parent terminates this exact child.
setInterval(()=>{},1000);process.send({fixture:'ready'});
