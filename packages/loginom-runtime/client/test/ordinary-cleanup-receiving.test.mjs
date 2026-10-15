import test, {mock,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// Bridge lifecycle test: external services and the action executor are fixtures.
// The serialized Loginom close body is exercised separately in package-cleanup.test.
const {fileURLToPath}=await import('node:url');
const entry=process.env.CLEANUP_ENTRY; if(!entry)throw Error('EXACT_RECEIVING_ENTRY_REQUIRED');
const {createRequire}=await import('node:module');const actualRequire=createRequire(new URL('../package.json','file://'+entry));
const executor=await import(new URL('./executor.mjs','file://'+entry));
const catalog=await import(new URL('./action-catalog.mjs','file://'+entry));
const skill=await import(new URL('./skill.mjs','file://'+entry));
const workspace=await import(new URL('./workspace.mjs','file://'+entry));
let current;
const target={profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'};
const path='/test-2/packages/result.lgp';
class ExternalClient {
  constructor(identity){this.browser=identity.name==='loginom-dock-browser';this.f=current;}
  async connect(t){this.transport=t;}
  async close(){this.f.events.push(this.browser?'browser-close':'remote-close');this.transport?.onclose?.();if(!this.browser&&this.f.case.startsWith('transport-')){throw failValues[this.f.case.slice(10)]}}
  async listTools(){return {tools:[{name:this.browser?'browser_run_code_unsafe':'read',inputSchema:{type:'object'}}]};}
  async callTool({arguments:{code}}){
    assert.ok(code.includes('logoutReadiness'));
    this.f.events.push('readiness-logout-double');
    const value={version:1,status:'SUCCEEDED',session_id:'own-session',document_id:'own-doc',account:'test-2',loginom_build:'7.4.2',package_closed:false,logged_out:true,effect_possible:true,packages_before:0,packages_after:0,reason:null};
    if(this.f.fault==='directory')this.f.session.directory=this.f.replacement;
    if(this.f.fault==='id')this.f.session.metadata.sessionId='foreign-session';
    if(this.f.fault==='metadata-ref')this.f.session.metadata={...this.f.session.metadata};
    return {content:[{type:'text',text:JSON.stringify(value)}]};
  }
}
const failValues={error:Error('transport primary',{cause:0}),undefined:undefined,null:null,false:false,zero:0,empty:''};
class ExternalTransport{}
mock.module(actualRequire.resolve('@modelcontextprotocol/sdk/client/index.js').replace('/dist/cjs/','/dist/esm/'),{namedExports:{Client:ExternalClient}});
mock.module(actualRequire.resolve('@modelcontextprotocol/sdk/client/stdio.js').replace('/dist/cjs/','/dist/esm/'),{namedExports:{StdioClientTransport:ExternalTransport,getDefaultEnvironment:()=>({})}});
mock.module(actualRequire.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js').replace('/dist/cjs/','/dist/esm/'),{namedExports:{StreamableHTTPClientTransport:ExternalTransport}});
mock.module(new URL('./action-catalog.mjs','file://'+entry).href,{namedExports:{...catalog,pinActionCatalog:async()=>({pins:{},compatibility:target,manifest:{compatibility:target},actions:new Map()})}});
mock.module(new URL('./skill.mjs','file://'+entry).href,{namedExports:{...skill,skillTransport:()=>({}),createSkillLoader:()=>({prepare:async()=>({main:'/test/skill',directory:'/test',detail:{revision:'test',source:'test',content:'test'}})})}});
mock.module(new URL('./workspace.mjs','file://'+entry).href,{namedExports:{...workspace,
  makeWorkspacePrepareCode:options=>workspace.makeWorkspacePrepareCode({...options,platform:'darwin'})}});
mock.module(new URL('./executor.mjs','file://'+entry).href,{namedExports:{...executor,createActionRuntime:()=>{
  const f=current;return {tools:[],describe:()=>({actions:[],node_types:[],available_node_types:[]}),assertPreparationAllowed(){if(f.busy||f.unknown)throw Error('busy');},
    hasUnsettledWork:()=>!!f.unknown,hasActiveWork:()=>!!f.busy,
    run:async(key,parameters,{operationId})=>{f.saves++;return {status:'SUCCEEDED',cleanup_complete:f.scenario!=='managed-unsettled-save',action_key:key,operation_id:operationId,output:{package_ref:{path:parameters.path}}};},
  };
}}});


import {pathToFileURL} from 'node:url';
import * as fs from 'node:fs/promises';
import * as callbackFs from 'node:fs';
const descriptorPaths=new Map();
const trace=(operation,path)=>{if(current)current.trace.push({operation,path:typeof path==='number'?descriptorPaths.get(path)??'<unknown-fd>':String(path)});};
mock.module('node:fs',{defaultExport:{},namedExports:{...callbackFs,open(name,flags,mode,callback){trace('callback.open',name);return callbackFs.open(name,flags,mode,(error,fd)=>{if(!error)descriptorPaths.set(fd,String(name));callback(error,fd);});},writeFile(fd,...args){trace('callback.write',fd);return callbackFs.writeFile(fd,...args);},rename(a,b,...args){trace('callback.rename.from',a);trace('callback.rename.to',b);return callbackFs.rename(a,b,...args);},unlink(name,...args){trace('callback.unlink',name);return callbackFs.unlink(name,...args);}}});
mock.module('node:fs/promises',{namedExports:{...fs,open:async(name,...args)=>{trace('promise.open',name);return fs.open(name,...args);},writeFile:async(name,...args)=>{trace('promise.write',name);if(current?.case.startsWith('transport-')&&['shutdown-receipt.json','bridge-shutdown-failure.json'].some(x=>String(name).endsWith('/'+x))){current.events.push('secondary-publication-false');throw false;}return fs.writeFile(name,...args);}}});
const {createBridge}=await import(pathToFileURL(entry));

const cases=['canonical','directory','id','metadata-ref',...Object.keys(failValues).map(k=>'transport-'+k)];
for(const scenario of cases)test('receiving contract '+scenario,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'receiving79-')),replacement=directory+'-B';await fs.mkdir(replacement);
 const f=current={case:scenario,fault:scenario,directory,replacement,events:[],trace:[],saves:0};
 const metadata={client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)};
 const session=f.session={directory,metadata,async save(){},artifactStore:{list:()=>[],async releaseUploads(){f.events.push('release')}}};
 const bridge=await createBridge({mode:'executor-replay',resultProfile:'user-v1',apiKey:'fixture',endpoint:'https://dock.invalid/mcp',stateDir:directory,loginomUrl:'http://loginom.invalid/app/?testable=true'},session,{browserTransport:new ExternalTransport(),authenticatedReadiness:{account:'test-2',documentId:'own-doc',loginomBuild:'7.4.2'}});
 const call=()=>bridge.close().then(result=>({ok:true,result}),error=>({ok:false,error}));
 const inspect=async()=>({foreignAttempts:f.trace.filter(x=>x.path===replacement||x.path.startsWith(replacement+'/')),dispatchTrace:[...f.trace],foreignFiles:await fs.readdir(replacement),originalReceipt:await fs.readFile(join(directory,'package-cleanup.json'),'utf8').then(JSON.parse,()=>null),helper:f.events.filter(x=>x==='readiness-logout-double').length,release:f.events.filter(x=>x==='release').length,transport:f.events.filter(x=>x==='browser-close').length});
 const rejection=v=>v instanceof Error?{kind:'Error',name:v.name,message:v.message,...('cause'in v?{cause:rejection(v.cause)}:{})}:{kind:'value',value:v===undefined?null:v,is_undefined:v===undefined};
 const serial=r=>r.ok?r:{ok:false,rejection:rejection(r.error)};
 const history=[];
 try{
  const first=await call(),initial=await inspect();history.push({phase:'first',reply:serial(first),facts:initial});
  if(scenario==='canonical'){assert.equal(first.ok,true);assert.equal(initial.helper,1);assert.equal(initial.release,1);assert.equal(first.result.native_logout_confirmed,true);}
  else if(scenario.startsWith('transport-')){
    assert.equal(first.ok,false);assert.equal(first.error.message,'LOGINOM_BRIDGE_CLEANUP_FAILED');assert.equal(first.error.cause,failValues[scenario.slice(10)]);assert.equal(initial.release,0);assert.equal(f.events.filter(x=>x==='secondary-publication-false').length,2);
  }else{
    assert.equal(first.ok,false,'post-helper changed original tuple must refuse');
    assert.deepEqual(initial.foreignAttempts,[],'zero foreign IO dispatch attempts before first refusal');assert.deepEqual(initial.foreignFiles,[]);assert.equal(initial.originalReceipt,null);assert.equal(initial.release,0);assert.equal(initial.transport,0);assert.equal(initial.helper,1);
    const second=await call(),refused=await inspect();history.push({phase:'foreign-retry',reply:serial(second),facts:refused});
    assert.equal(second.ok,false);assert.deepEqual(refused.foreignAttempts,[],'zero foreign IO dispatch attempts before repeated refusal');assert.deepEqual(refused.foreignFiles,[]);assert.equal(refused.helper,1);assert.equal(refused.release,0);assert.equal(refused.transport,0);
    session.directory=directory;session.metadata=metadata;metadata.sessionId='own-session';f.fault=null;
    const third=await call(),repaired=await inspect();history.push({phase:'exact-original-repair',reply:serial(third),facts:repaired});
    assert.equal(third.ok,true);assert.equal(repaired.helper,1,'confirmed original helper must not replay');assert.equal(repaired.release,1);assert.equal(third.result.cleanup_complete,true);assert.equal(third.result.native_logout_confirmed,true);assert.equal(repaired.originalReceipt.session_id,'own-session');assert.deepEqual(repaired.foreignAttempts,[]);assert.deepEqual(repaired.foreignFiles,[]);
  }
 }finally{
  if(process.env.RESULTS)await fs.writeFile(join(process.env.RESULTS,scenario+'.json'),JSON.stringify(history,null,2));
  await fs.rm(directory,{recursive:true,force:true});await fs.rm(replacement,{recursive:true,force:true});
 }
});
