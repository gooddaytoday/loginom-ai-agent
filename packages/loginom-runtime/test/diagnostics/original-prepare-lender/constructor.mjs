import {mock} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {join,resolve} from 'node:path';import {mkdir,writeFile} from 'node:fs/promises';
const [rawRoot,rawOutput,phase]=process.argv.slice(2),root=resolve(rawRoot),output=resolve(rawOutput),lib=p=>pathToFileURL(join(root,'client/lib',p)).href;
await mkdir(output,{recursive:true});const require=createRequire(join(root,'client/package.json')),sdk=p=>pathToFileURL(require.resolve('@modelcontextprotocol/sdk/'+p).replace('/cjs/','/esm/')).href;
let current;
class LabelledClient{
 constructor(identity){this.browser=identity.name==='loginom-dock-browser'}
 async connect(){current.events.push('connect');if(this.browser&&current.mode==='connect-swap')current.owner.page={}}
 async close(){current.events.push('transport-close')}
 async listTools(){current.events.push('catalog');if(this.browser&&current.mode==='catalog-swap')current.session.metadata={...current.session.metadata};return {tools:[{name:this.browser?'browser_run_code_unsafe':'read',inputSchema:{type:'object'}}]}}
 async callTool(){throw Error('LABELLED_BROWSER_DISPATCH_FORBIDDEN')}
}
class LabelledTransport{}
mock.module(sdk('client/index.js'),{namedExports:{Client:LabelledClient}});mock.module(sdk('client/stdio.js'),{namedExports:{StdioClientTransport:LabelledTransport,getDefaultEnvironment:()=>({})}});mock.module(sdk('client/streamableHttp.js'),{namedExports:{StreamableHTTPClientTransport:LabelledTransport}});
const {createBridge}=await import(lib('bridge.mjs'));const lender=await import(pathToFileURL(join(root,'src/original-prepare-lender.mjs')));
const results=[];
for(const mode of ['original','unregistered-options','initial-page','connect-swap','catalog-swap','save-swap','preabort-false','expired','guard-undefined','owned-false','owned-undefined']){
 const controller=new AbortController(),page={isClosed:()=>false},context={pages:()=>[page]},owner={id:'labelled-original',account:'worker',origin:'https://labelled.invalid',generation:1,chat:'labelled-chat',page,context,signal:controller.signal,deadline:Date.now()+60000},startup=Object.freeze({...owner,owner}),readiness={documentId:'labelled-doc',account:'worker',loginomBuild:'7.4.2'},directory=join(output,mode);await mkdir(directory,{recursive:true});
 const events=[],session={directory,browserConfig:join(directory,'browser.json'),browserRoot:directory,browserCli:'labelled',metadata:{client:'labelled',sessionId:'original'},artifactStore:{releaseUploads:async()=>{throw Error('LABELLED_RELEASE_FORBIDDEN')}},save:async()=>{
  events.push('metadata-save');if(mode==='save-swap')owner.chat='foreign';if(mode==='owned-false')throw false;if(mode==='owned-undefined')throw undefined;
  await writeFile(join(directory,'labelled-catalog.json'),'{}');
 }};current={mode,owner,session,events};let retained,bridge,error;
 if(mode==='initial-page')owner.page={};if(mode==='preabort-false')controller.abort(false);if(mode==='expired')owner.deadline=Date.now()-1;
 try{
  if(mode!=='unregistered-options')retained=lender.retainOriginalPrepareStartup(session,{startup,owner,readiness,assertStartup(){if(mode==='guard-undefined')throw undefined;}});
  bridge=await createBridge({mode:'classic',endpoint:'https://labelled.invalid',apiKey:'labelled',stateDir:directory,loginomUrl:'https://labelled.invalid/app'},session,{originalStartup:startup,owner,page,deadline:Date.now()+120000,browserTransport:new LabelledTransport()});
 }catch(value){error={value}}
 if(['original','unregistered-options'].includes(mode)){
  assert(bridge);const actual=lender.originalPrepareLenderForBridge(bridge);
  if(mode==='unregistered-options')assert.equal(actual,undefined,'ordinary options cannot register a Page');
  else{assert.equal(actual,retained);const facts=actual.original();for(const [k,v]of Object.entries({startup,owner,page,context,session,readiness}))assert.equal(facts[k],v);assert.throws(()=>actual.requireInvocation(),/INVOCATION_UNAVAILABLE/);owner.page={};assert.throws(()=>actual.original(),/OWNER_CHANGED/)}
 }else{
  assert(error,mode);assert.equal(bridge,undefined);
  if(mode==='preabort-false'||mode==='owned-false')assert.equal(error.value,false);
  if(mode==='guard-undefined'||mode==='owned-undefined')assert.equal(error.value,undefined);
  if(['initial-page','preabort-false','expired','guard-undefined'].includes(mode))assert.equal(events.length,0,'refuse before production constructor dispatch');
 }
 results.push({mode,pass:true,events,nativeAuthority:false,prepareInvocation:false});console.log(phase,mode,'PASS');
}
await writeFile(join(output,'results.json'),JSON.stringify({phase,cases:results.length,results,Page:'labelled double',SDK:'labelled double',native:false,all4authority:false},null,2)+'\n');
