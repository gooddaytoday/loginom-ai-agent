// Actual managed-entry/bridge/executor/MCP/IPC/FS. Only external services,
// authenticated Page/context, native graph drivers and preparation are doubles.
import {registerHooks,createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.REPLACEMENT_STOCK_RUNTIME_ROOT,lib=pathToFileURL(join(root,'client/lib/')).href;
const url=p=>pathToFileURL(join(root,p)).href;
const actual=await import(lib+'executor.mjs?original');
const catalog=await import(lib+'action-catalog.mjs?original'),skill=await import(lib+'skill.mjs?original');
const require=createRequire(join(root,'client/package.json'));
const workflow={workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Own'}]};
const target={profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'};
let owner,session,operation,bridgeOptions;
const scenario=process.env.REPLACEMENT_STOCK_SCENARIO;
const page={isClosed:()=>false},context={pages:()=>[page]};
const request={operation_id:'apply',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
 target:{kind:'existing',type:'transform.replace_columns',ref:{document_id:'doc',workflow_id:'wf',node_id:'node'}},inputs:[],mode:'exact',parameters:{},mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
function change(){
 if(scenario==='owner')owner.page={};
 if(scenario==='session')session.metadata.sessionId='foreign';
 if(scenario==='opening')operation.nodeApply.phases.find(p=>p.phase==='open').value.opening_operation_id='foreign';
 if(scenario==='epoch')operation.nodeApply.phases.find(p=>p.phase==='open').value.epoch='foreign';
 if(scenario==='request')operation.nodeApply.request.parameters.changed=true;
 if(scenario==='deadline')operation.nodeApply.deadline=Date.now()-1;
 if(scenario==='pending')operation.nodeApply.pending={phase:'unknown'};
 if(scenario==='abort'){const c=new AbortController();c.abort(Error('ORIGINAL_ABORT',{cause:0}));operation.captureSignal=c.signal;}
 if(scenario==='resource')bridgeOptions.acceptanceCapture.retained.state.bridge={};
}
globalThis.__stock={
 async loginBrowser({owner:o,candidate}){owner=o;Object.assign(o,{id:'startup',account:candidate.username,origin:'https://fixture.invalid',page,context});o.close=async()=>{o.closed=o.contextClosed=true;return o.receipt={cleanup_complete:true,fixture:true}};return {context};},
 async createSession(config,{managed}){await mkdir(managed.directory,{recursive:true});const browserConfig=join(managed.directory,'fixture-browser.json');await writeFile(browserConfig,'{}');return session={directory:managed.directory,browserConfig,metadata:{sessionId:'session',client:'fixture',clientRevision:'fixture'},save:async()=>{},artifactStore:{list:()=>[],releaseUploads:async()=>{}}};},
 createConnection:async()=>({connect:async()=>{},close:async()=>{}}),
 Client:class {constructor(identity){this.browser=identity.name==='loginom-dock-browser';}async connect(t){this.t=t;}async close(){this.t?.onclose?.();}async listTools(){return {tools:[{name:this.browser?'browser_run_code_unsafe':'read',inputSchema:{type:'object'}}]};}async callTool({arguments:{code}}){
  let value;if(code.includes('async function prepareWorkspace'))value={status:'READY',authenticated:true,target_verified:true,target,loginom_account:'account',document_id:'doc',created_draft:true,effect_possible:true,workflow_ref:workflow,package_ref:{path:null}};
  else if(code.includes('async function observeGeometry'))value={version:1,source:'prepare_same_browser_page',observed:{document_id:'doc'}};else throw Error('NO_NATIVE_GESTURE');
  return {content:[{type:'text',text:JSON.stringify(value)}]};}},
 Transport:class {},
 pin:async()=>({pins:{},compatibility:target,manifest:{compatibility:target},actions:new Map()}),
 loader:()=>({prepare:async()=>({main:'/fixture/skill',directory:'/fixture',detail:{revision:'fixture',source:'fixture',content:'fixture'}})}),
 runtime(options){
  const ok=extra=>async()=>({verified:true,cleanup_complete:true,effect_possible:false,...extra});
  const graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[{ref:request.target.ref,type:scenario==='generic-import'?'imports.text':'transform.replace_columns',label:'Own',position:{x:1,y:1},inputs:[0],outputs:[0]}],links:[],foreign_links:[]};
  const rt=actual.createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},allowCandidate:true,execute:async()=>{throw Error('NO_NATIVE_GESTURE')},artifactStore:options.artifactStore,
   nodeTargetAdapterFactory:()=>({observe:async()=>structuredClone(graph),preflight:async()=>{},positionMatches:()=>true,reconcile:ok(),mutate:async()=>{throw Error('NO_NATIVE_MUTATION')}}),
   nodeApplyHandlers:new Map([['imports.text',{revision:'fixture',modes:['delimited'],validate(){},configure:ok()}],['transform.replace_columns',{revision:'fixture',modes:['exact'],validate(){},configure:ok()}]]),
   nodeApplyDriverFactory:c=>{operation=c.operation;return {verifySource:ok(),mapPorts:ok(),openWizard:ok({opening_operation_id:'native-opening',epoch:'epoch'}),finish:ok({mode:'done',execution_started:false,execution_id:null}),waitExecution:ok(),readOutput:ok(),verifyContinuation:async()=>true}},onRecord:options.onRecord});
  return rt;
 },
 wrapBridge(actual){return async(...args)=>{bridgeOptions=args[2];const bridge=await actual(...args);const accessor=bridge.replacementOriginalReply;
  if(accessor)bridge.replacementOriginalReply=(input,result)=>{
   if(scenario==='missing-slot')return accessor({name:'dock_node_wait',arguments:{operation_id:'foreign'}},result);
   if(scenario==='foreign-result')result={...result,content:[{type:'text',text:'foreign'}]};
   if(scenario==='holes')result={...result,content:new Array(1)};
   if(scenario==='getter')Object.defineProperty(result,'extra',{enumerable:true,get(){throw Error('GETTER_EXECUTED')}});
   change();return accessor(input,result);
  };return bridge;};}
};
const esm=n=>pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/'+n+'.js')).href.replace('/cjs/','/esm/');
const replacements=new Map([
 [url('src/connection-check.mjs'),`export const loginBrowser=globalThis.__stock.loginBrowser;export const checkConnection=async()=>{};export const loginomAddress=u=>u;`],
 [lib+'session.mjs',`export const createSession=globalThis.__stock.createSession;`],
 [esm('index'),`export const Client=globalThis.__stock.Client;`],
 [esm('stdio'),`export const StdioClientTransport=globalThis.__stock.Transport;export const getDefaultEnvironment=()=>({});`],
 [esm('streamableHttp'),`export const StreamableHTTPClientTransport=globalThis.__stock.Transport;`],
 [lib+'workspace.mjs',`export * from ${JSON.stringify(lib+'workspace.mjs?original')};import {makeWorkspacePrepareCode as original} from ${JSON.stringify(lib+'workspace.mjs?original')};export const makeWorkspacePrepareCode=o=>original({...o,platform:'darwin'});`],
 [lib+'bridge.mjs',`import {createBridge as actual} from ${JSON.stringify(lib+'bridge.mjs?original')};export const createBridge=globalThis.__stock.wrapBridge(actual);`],
 [lib+'executor.mjs',`export * from ${JSON.stringify(lib+'executor.mjs?original')};export const createActionRuntime=globalThis.__stock.runtime;`],
 [lib+'action-catalog.mjs',`export * from ${JSON.stringify(lib+'action-catalog.mjs?original')};export const pinActionCatalog=globalThis.__stock.pin;`],
 [lib+'skill.mjs',`export * from ${JSON.stringify(lib+'skill.mjs?original')};export const createSkillLoader=globalThis.__stock.loader;export const skillTransport=()=>({});`],
]);
const clientPath=require.resolve('@modelcontextprotocol/sdk/client/index.js'),originalClient=require(clientPath);
require.cache[clientPath].exports={...originalClient,Client:class extends originalClient.Client {async callTool(...args){try{
 const result=await super.callTool(...args);
 if(args[0].name==='dock_node_wait' && scenario.startsWith('primary-')){
  owner.page={};const values={undefined:undefined,null:null,false:false,zero:0,empty:'',error:Error('LOGINOM_STORE_READ_FAILED',{cause:0})};
  throw values[scenario.slice(8)];
 }
 return result;
}catch(error){console.error('FIXTURE_SDK_ERROR',error);throw error}}}};
const mcp=require.resolve('@playwright/mcp');require.cache[mcp]={id:mcp,filename:mcp,loaded:true,exports:{createConnection:globalThis.__stock.createConnection}};
registerHooks({resolve(specifier,context,next){const r=next(specifier,context);return replacements.has(r.url)?{...r,url:r.url+'?fixture'}:r;},load(u,context,next){const key=u.replace(/\?fixture$/,'');if(u!==key&&replacements.has(key))return {format:'module',source:replacements.get(key),shortCircuit:true};return next(u,context);}});
