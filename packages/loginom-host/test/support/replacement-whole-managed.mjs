// Offline boot hooks around whole managed-entry/bridge/executor modules.
// Auth, external SDK transport, preparation/save and native driver are doubles.
// Registration/host/IPC/FS/retained node/reader/observer/result validation are real.
import {registerHooks,createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=runtimeRoot,lib=pathToFileURL(join(root,'client/lib/')).href;
process.env.CAPTURE_RUNTIME_ROOT=root;
const {captureFixture}=await import(pathToFileURL(nativeFixture).href);
const cap=await captureFixture(),f={...cap.f,...cap},page=f.page;
const nativeTab=f.main.Items.Workspace.getActiveTab();f.main.Items.Workspace.getActiveTab=()=>nativeTab;
const connection=f.main.FMapTree.FServerConnection;connection.Connected=true;connection.Session={IsPackageModified:async()=>false};
f.pkg.Package={};f.pkg.ReadOnly=false;f.pkg.HasRunningNodes=()=>false;f.main.FMapTree.PackageNodes={Count:1,Items:()=>f.pkg};
const evaluate=page.evaluate;page.evaluate=async(...a)=>JSON.parse(JSON.stringify(await evaluate(...a)));page.isClosed=()=>false;
const actual=await import(lib+'executor.mjs?original');
const catalog=await import(lib+'action-catalog.mjs?original'),skill=await import(lib+'skill.mjs?original');
const target={profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'};
const workflow=f.binding.workflow_ref,document=f.binding.document_id,nodeId=f.binding.node.node_id;
const sessionId='fixture-managed-session',events=[];let originalOwner;
connection.Session.IsPackageModified=async()=>{
 const values={undefined:undefined,null:null,false:false,zero:0,empty:''};if(Object.hasOwn(values,fixtureScenario))throw values[fixtureScenario];if(fixtureScenario==='native-error')throw Error('FIXTURE_PRIMARY',{cause:0});
 if(fixtureScenario==='late-owner')originalOwner.page={};if(fixtureScenario==='input0')f.port.FIndex=1;if(fixtureScenario==='opening')f.prep.inputPortOpenReceipts.values().next().value.operation_id='foreign';return fixtureScenario==='dirty';
};
f.pkg.HasRunningNodes=()=>fixtureScenario==='running'?true:fixtureScenario==='unknown-running'?undefined:false;
const saveAction=JSON.parse(await readFile(join(root,'executor/catalog/actions.json'),'utf8')).actions.find(x=>x.action_key==='package.save_checkpoint');
const require=createRequire(join(root,'client/package.json'));
const sdkClient=pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href.replace('/cjs/','/esm/');
const sdkStdio=pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href.replace('/cjs/','/esm/');
const sdkHttp=pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js')).href.replace('/cjs/','/esm/');
globalThis.__replacementFixture={
 async loginBrowser({owner,candidate}){originalOwner=owner;Object.assign(owner,{id:'fixture-native-owner',account:candidate.username,origin:'https://loginom.test',page,context:{pages:()=>[page]}});owner.close=async()=>{owner.closed=true;owner.contextClosed=true;owner.receipt={cleanup_complete:true,fixture:true};return owner.receipt};return {context:owner.context};},
 async createSession(config,{managed}){const directory=managed.directory;await mkdir(directory,{recursive:true});const browserConfig=join(directory,'fixture-browser.json');await writeFile(browserConfig,'{}');return {directory,browserConfig,metadata:{sessionId,client:'test',clientRevision:'fixture-whole-revision'},save:async()=>{},artifactStore:{list:()=>[],releaseUploads:async()=>{events.push('uploads-release')}}};},
 createConnection:async()=>({connect:async()=>{},close:async()=>{events.push('browser-server-close')}}),
 Client:class {
  constructor(identity){this.browser=identity.name==='loginom-dock-browser';}
  async connect(){}async close(){events.push('external-close')}
  async listTools(){return {tools:[{name:this.browser?'browser_run_code_unsafe':'read',inputSchema:{type:'object'}}]}}
  async callTool({arguments:{code}}){let v;
   if(code.includes('async function prepareWorkspace'))v={status:'READY',authenticated:true,target_verified:true,target,loginom_account:connection.UserName,document_id:document,created_draft:true,effect_possible:true,workflow_ref:workflow,package_ref:{path:null}};
   else if(code.includes('async function observeGeometry'))v={version:1,source:'prepare_same_browser_page',observed:{document_id:document}};
   else if(code.includes('function readSavedPackageState'))v={version:1,session_id:sessionId,document_id:document,account:connection.UserName,package_path:f.packagePath,modified:false,observation:'after_confirmed_save',read_only:true,persisted_content_verified:false};
   else throw Error('UNEXPECTED_NATIVE_FIXTURE_CODE');
   return {content:[{type:'text',text:JSON.stringify(v)}]};
  }
 },
 Transport:class {},
 pin:async()=>({pins:{},compatibility:target,manifest:{compatibility:target},actions:new Map([[saveAction.action_key,saveAction]])}),
 loader:()=>({prepare:async()=>({main:'/fixture/skill',directory:'/fixture',detail:{revision:'fixture',source:'fixture',content:'fixture'}})}),
 runtime(options){const graph={complete:true,document_id:document,workflow_ref:workflow,nodes:[{ref:structuredClone(f.binding.node),type:'transform.replace_columns',label:'NullDiagnostic',position:{x:320,y:280},inputs:[0],outputs:[0]}],links:[],foreign_links:[]};
  const adapter={observe:async()=>structuredClone(graph),preflight:async()=>{},positionMatches:()=>true,reconcile:async()=>({verified:true,cleanup_complete:true}),mutate:async()=>{throw Error('NO_GRAPH_MUTATION')}};
  const ok=extra=>async()=>({verified:true,cleanup_complete:true,effect_possible:false,...extra});
  const runtime=actual.createActionRuntime({pinned:{...options.pinned,selectors:new Map()},allowCandidate:true,execute:async()=>{throw Error('NO_NATIVE_GESTURE')},artifactStore:options.artifactStore,nodeTargetAdapterFactory:()=>adapter,
   nodeApplyHandlers:new Map([['imports.text',{revision:'fixture',modes:['delimited'],validate(){},configure:ok()}],['transform.replace_columns',{revision:'fixture',modes:['exact'],validate(){},configure:ok()}]]),
   nodeApplyDriverFactory:()=>({verifySource:ok(),mapPorts:ok(),openWizard:ok({opening_operation_id:f.proof.result.input_port.opening_operation_id,epoch:'fixture'}),finish:ok({mode:'done',execution_started:false,execution_id:null}),waitExecution:ok(),readOutput:ok(),verifyContinuation:async()=>true}),onRecord:options.onRecord});
  return {...runtime,run:async(key,parameters,{operationId})=>({status:'SUCCEEDED',cleanup_complete:true,action_key:key,operation_id:operationId,output:{package_ref:{path:parameters.path}}})};
 }
};
const url=n=>pathToFileURL(join(root,n)).href;
const replacements=new Map([
 [url('src/connection-check.mjs'),`export const loginBrowser=globalThis.__replacementFixture.loginBrowser;export const checkConnection=async()=>{};export const loginomAddress=u=>u;`],
 [lib+'session.mjs',`export const createSession=globalThis.__replacementFixture.createSession;`],
 [sdkClient,`export const Client=globalThis.__replacementFixture.Client;`],
 [sdkStdio,`export const StdioClientTransport=globalThis.__replacementFixture.Transport;export const getDefaultEnvironment=()=>({});`],
 [sdkHttp,`export const StreamableHTTPClientTransport=globalThis.__replacementFixture.Transport;`],
 [lib+'workspace.mjs',`export * from ${JSON.stringify(lib+'workspace.mjs?original')};import {makeWorkspacePrepareCode as original} from ${JSON.stringify(lib+'workspace.mjs?original')};export const makeWorkspacePrepareCode=o=>original({...o,platform:'darwin'});`],
 [lib+'bridge.mjs',`import {createBridge as actual} from ${JSON.stringify(lib+'bridge.mjs?original')};import {writeFile} from 'node:fs/promises';export const createBridge=async(...args)=>{try{return await actual(...args)}catch(e){await writeFile(args[1].directory+'/fixture-stack.txt',e.stack??String(e));throw e}};`],
 [lib+'executor.mjs',`export * from ${JSON.stringify(lib+'executor.mjs?original')};export const createActionRuntime=globalThis.__replacementFixture.runtime;`],
 [lib+'action-catalog.mjs',`export * from ${JSON.stringify(lib+'action-catalog.mjs?original')};export const pinActionCatalog=globalThis.__replacementFixture.pin;`],
 [lib+'skill.mjs',`export * from ${JSON.stringify(lib+'skill.mjs?original')};export const createSkillLoader=globalThis.__replacementFixture.loader;export const skillTransport=()=>({});`],
]);
// CJS createConnection is the only require() seam; host MCP Client/transport
// remain the genuine SDK. This replacement does not produce native proof.
const clientPath=require.resolve('@modelcontextprotocol/sdk/client/index.js'), originalClient=require(clientPath);
require.cache[clientPath].exports={...originalClient,Client:class extends originalClient.Client {async callTool(...args){try{return await super.callTool(...args)}catch(e){await writeFile(join(root,'../whole-sdk-error.txt'),e.stack??String(e));throw e}}}};
const mcp=require.resolve('@playwright/mcp');require.cache[mcp]={id:mcp,filename:mcp,loaded:true,exports:{createConnection:globalThis.__replacementFixture.createConnection}};
registerHooks({resolve(specifier,context,next){const r=next(specifier,context);return replacements.has(r.url)?{...r,url:r.url+'?fixture'}:r;},load(url,context,next){const key=url.replace(/\?fixture$/,'');if(url!==key&&replacements.has(key))return {format:'module',source:replacements.get(key),shortCircuit:true};return next(url,context);}});
await import(url('src/managed-entry-core.mjs'));
