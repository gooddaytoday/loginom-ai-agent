import {mock} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {join,resolve} from 'node:path';import {mkdir,writeFile} from 'node:fs/promises';
const [rawRoot,rawOutput,phase]=process.argv.slice(2),root=resolve(rawRoot),output=resolve(rawOutput),lib=p=>pathToFileURL(join(root,'client/lib',p)).href;
await mkdir(output,{recursive:true});const require=createRequire(join(root,'client/package.json')),sdk=p=>pathToFileURL(require.resolve('@modelcontextprotocol/sdk/'+p).replace('/cjs/','/esm/')).href;
let current;
class LabelledClient{
 constructor(identity){this.browser=identity.name==='loginom-dock-browser'}
 async connect(){current.events.push('connect');if(this.browser&&current.mode==='connect-swap')current.owner.page={};if(this.browser&&current.mode==='connect-owned-false'){current.owner.page={};throw false}}
 async close(){current.events.push('transport-close')}
 async listTools(){current.events.push('catalog');if(this.browser&&current.mode==='catalog-swap')current.session.metadata={...current.session.metadata};return {tools:[{name:this.browser?'browser_run_code_unsafe':'read',inputSchema:{type:'object'}}]}}
 async callTool(){current.dispatches++;throw Error('LABELLED_BROWSER_DISPATCH_FORBIDDEN')}
}
class LabelledTransport{}
mock.module(sdk('client/index.js'),{namedExports:{Client:LabelledClient}});mock.module(sdk('client/stdio.js'),{namedExports:{StdioClientTransport:LabelledTransport,getDefaultEnvironment:()=>({})}});mock.module(sdk('client/streamableHttp.js'),{namedExports:{StreamableHTTPClientTransport:LabelledTransport}});
const {createBridge}=await import(lib('bridge.mjs'));const lender=await import(pathToFileURL(join(root,'src/original-prepare-lender.mjs')));
const results=[];
const cases=['missing','serialized','copied','foreign','late','getter','owner-page','owner-context','owner-session','owner-account','owner-generation','owner-chat','expiry','abort-false','abort-zero','abort-null','abort-undefined','abort-empty','abort-error','first-false','first-undefined','first-null','first-empty','first-error'];
for(const mode of cases){
 const controller=new AbortController(),page={isClosed:()=>false},context={pages:()=>[page]},owner={id:'labelled-original',account:'worker',origin:'https://labelled.invalid',generation:1,chat:'labelled-chat',page,context,signal:controller.signal,deadline:Date.now()+60000},startup=Object.freeze({...owner,owner}),readiness={documentId:'labelled-doc',account:'worker',loginomBuild:'7.4.2'},directory=join(output,mode);await mkdir(directory,{recursive:true});
 const events=[],session={directory,browserConfig:join(directory,'browser.json'),browserRoot:directory,browserCli:'labelled',metadata:{client:'labelled',sessionId:'original'},artifactStore:{releaseUploads:async()=>{events.push('release');throw Error('LABELLED_RELEASE_FORBIDDEN')}},save:async()=>{events.push('metadata-save');await writeFile(join(directory,'labelled-catalog.json'),'{}')}};
 current={mode,owner,session,events,dispatches:0};let primary;
 const retained=lender.retainOriginalPrepareStartup(session,{startup,owner,readiness,assertStartup(){if(primary)throw primary.value}});
 const bridge=await createBridge({mode:'classic',endpoint:'https://labelled.invalid',apiKey:'labelled',stateDir:directory,loginomUrl:'https://labelled.invalid/app'},session,{browserTransport:new LabelledTransport()});
 assert.equal(lender.originalPrepareLenderForBridge(bridge),retained);const before=events.slice();
 let getterCalls=0;const args={intent:'new_draft',operation_id:'original',timeout_ms:120000};
 if(['serialized','copied','foreign','late'].includes(mode))Object.assign(args,{originalInvocation:{...startup,owner:mode==='foreign'?{}:{...owner},signal:controller.signal,deadline:Date.now()+120000,typedCreation:{intent:'new_draft'}},page,context});
 
 if(mode.startsWith('owner-')){const key=mode.slice(6);if(key==='session')session.metadata={...session.metadata};else owner[key]={foreign:true};}
 const reasons={false:false,zero:0,null:null,undefined:undefined,empty:'',error:new Error('original',{cause:0})};let expected;
 if(mode.startsWith('abort-')){expected={value:reasons[mode.slice(6)]};controller.abort(expected.value);expected={value:controller.signal.reason}}
 if(mode.startsWith('first-')){expected={value:reasons[mode.slice(6)]};primary=expected;owner.page={foreign:true};controller.abort(new Error('secondary'));}
 const now=Date.now;if(mode==='expiry')Date.now=()=>startup.deadline;
 const extra={signal:new AbortController().signal,deadline:Date.now()+120000,originalInvocation:{...startup},typedCreation:args};
 if(mode==='getter')Object.defineProperty(extra,'originalInvocation',{get(){getterCalls++;return {...startup}}});
 let rejection;try{await bridge.server._requestHandlers.get('tools/call')({method:'tools/call',params:{name:'dock_prepare',arguments:args}},extra)}catch(value){rejection={value}}finally{Date.now=now}
 assert(rejection,mode);if(expected)assert.equal(rejection.value,expected.value,mode);else if(mode.startsWith('owner-'))assert.match(rejection.value.message,/OWNER_CHANGED/);else if(mode==='expiry')assert.match(rejection.value.message,/STARTUP_EXPIRED/);else assert.match(rejection.value.message,/INVOCATION_UNAVAILABLE/);
 assert.equal(getterCalls,0);assert.equal(current.dispatches,0);assert.deepEqual(events,before);assert.equal(session.metadata.skillRevision,undefined);
 let replay;try{await bridge.server._requestHandlers.get('tools/call')({method:'tools/call',params:{name:'dock_prepare',arguments:args}},extra)}catch(value){replay={value}}assert(replay);if(expected)assert.equal(replay.value,expected.value);assert.equal(current.dispatches,0);assert.deepEqual(events,before);
 results.push({mode,pass:true,getterCalls,dispatches:0,Prepare:0,writesAfterConstructor:0,release:0,all4authority:false});console.log(phase,mode,'PASS');
}
await writeFile(join(output,'results.json'),JSON.stringify({phase,cases:results.length,results,Page:'labelled double',SDKTransport:'labelled double',handler:'actual production',native:false},null,2)+'\n');
