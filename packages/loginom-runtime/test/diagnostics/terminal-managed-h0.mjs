import {mock} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';import {join,resolve} from 'node:path';import {mkdir} from 'node:fs/promises';
const [rawRoot,rawOutput,phase]=process.argv.slice(2),root=resolve(rawRoot),output=resolve(rawOutput);await mkdir(output,{recursive:true});
const require=createRequire(join(root,'client/package.json')),sdk=p=>pathToFileURL(require.resolve('@modelcontextprotocol/sdk/'+p).replace('/cjs/','/esm/')).href;
let dispatches=0,writes=0,getters=0;
class Client{constructor(identity){this.browser=identity.name==='loginom-dock-browser'}async connect(){}async close(){}async listTools(){return {tools:[{name:this.browser?'browser_run_code_unsafe':'read',inputSchema:{type:'object'}}]}}async callTool(){dispatches++;throw Error('FORBIDDEN')}}
class Transport{}
mock.module(sdk('client/index.js'),{namedExports:{Client}});mock.module(sdk('client/stdio.js'),{namedExports:{StdioClientTransport:Transport,getDefaultEnvironment:()=>({})}});mock.module(sdk('client/streamableHttp.js'),{namedExports:{StreamableHTTPClientTransport:Transport}});
const {createBridge}=await import(pathToFileURL(join(root,'client/lib/bridge.mjs')));
const {beginTerminalManagedCall}=await import(pathToFileURL(join(root,'src/terminal-managed-call.mjs')));
for(const drift of ['none','input-accessor']){
 const directory=join(output,drift);await mkdir(directory,{recursive:true});
 const session={directory,browserConfig:join(directory,'browser.json'),browserRoot:directory,browserCli:'labelled',metadata:{client:'labelled',sessionId:'original'},artifactStore:{releaseUploads:async()=>writes++},save:async()=>writes++};
 const bridge=await createBridge({mode:'classic',endpoint:'https://labelled.invalid',apiKey:'labelled',stateDir:directory,loginomUrl:'https://labelled.invalid/app'},session,{browserTransport:new Transport()});
 const before=writes,message={id:'original-child',operation:'call',input:{name:'dock_prepare',arguments:{intent:'new_draft'}}},state={controller:undefined,session,bridge,client:{callTool(){dispatches++;throw Error('FORBIDDEN')}}};
 const token=beginTerminalManagedCall(message,state);token.bindTask(Promise.resolve());await token.beforeDispatch();state.controller=new AbortController();token.bindController(state.controller);
 if(drift==='input-accessor')Object.defineProperty(message,'input',{get(){getters++;return {}}});
 const extra=Object.defineProperty({},'signal',{get(){getters++;throw Error('EXTRA_NOT_AUTHORITY')}});
 await assert.rejects(bridge.server._requestHandlers.get('tools/call')({method:'tools/call',params:{name:'dock_prepare',arguments:{intent:'new_draft'}}},extra),new RegExp(drift==='none'?'INVOCATION_UNAVAILABLE':'ORIGINAL_CALL_CHANGED'));
 assert.equal(dispatches,0);assert.equal(writes,before);assert.equal(getters,0);assert.equal(token.inspect().parentOriginQualified,false);assert.equal(token.inspect().nativeAuthority,false);
 console.log(phase,drift,'PASS getter0 dispatch0 writes0 authority=false');
}
