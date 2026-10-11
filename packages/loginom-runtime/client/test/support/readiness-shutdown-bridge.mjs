import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mkdtemp,readFile,writeFile,rm,mkdir,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client as RealClient} from '@modelcontextprotocol/sdk/client/index.js';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import * as catalog from '../../lib/action-catalog.mjs';
import * as executor from '../../lib/executor.mjs';
import * as skill from '../../lib/skill.mjs';

// Real bridge, SDK Client/Server, InMemory transports, serial gate, serialized
// native logout body and filesystem journal. Loginom DOM/server state is a VM
// Page fixture; no Loginom, browser process, model or saved package is touched.
let current;
const target={profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'};
class ExternalClient {
 constructor(identity){if(identity.name==='loginom-dock-browser')return new RealClient(identity);this.f=current;}
 async connect(){}
 async close(){this.f.events.push('remote-close');if(this.f.remoteRejected)throw this.f.remoteRejection;}
 async listTools(){return {tools:[{name:'read',inputSchema:{type:'object'}}]};}
}
mock.module('@modelcontextprotocol/sdk/client/index.js',{namedExports:{Client:ExternalClient}});
mock.module(new URL('../../lib/action-catalog.mjs',import.meta.url).href,{namedExports:{...catalog,
 pinActionCatalog:async()=>({pins:{},compatibility:target,manifest:{compatibility:target},actions:new Map()})}});
mock.module(new URL('../../lib/skill.mjs',import.meta.url).href,{namedExports:{...skill,
 skillTransport:()=>({}),createSkillLoader:()=>({})}});
mock.module(new URL('../../lib/executor.mjs',import.meta.url).href,{namedExports:{...executor,
 createActionRuntime:()=>({tools:[],describe:()=>({actions:[],node_types:[],available_node_types:[]}),
  assertPreparationAllowed(){if(current.unsettled)throw Error('unsettled');},
  hasUnsettledWork:()=>current.unsettled,hasActiveWork:()=>false})}});
const {createBridge}=await import('../../lib/bridge.mjs');
const managedSource=await readFile(process.env.SHUTDOWN_MANAGED_SOURCE??new URL('../../../src/managed-entry.mjs',import.meta.url),'utf8');
const managedCode=managedSource.slice(managedSource.includes('function closeRejection(')?managedSource.indexOf('function closeRejection('):managedSource.indexOf('function close()'),managedSource.indexOf('const stop ='));

for(const scenario of ['ready','unconfigured','foreign-account','foreign-document','package-present','running','dialog',
 'unsettled','native-no-effect','native-error','lost-reply','transport-error','missing-onclose','receipt-write-failure','journal-write-failure','transport-receipt-write-failure'])
 test('authenticated readiness shutdown: '+scenario,async()=>{
  const directory=await mkdtemp(join(tmpdir(),'readiness-shutdown-'));
  const f=current={events:[],unsettled:scenario==='unsettled',logout:0};
  const m={FServerConnection:{Connected:true,UserName:scenario==='foreign-account'?'foreign':'user'},
    PackageNodes:{Count:scenario==='package-present'?1:0},HasRunningNodes:()=>scenario==='running'};
  const document={querySelectorAll:()=>scenario==='dialog'?[{getBoundingClientRect:()=>({width:1,height:1})}]:[]};
  const context=vm.createContext({document,location:{origin:'https://loginom.invalid'},
    bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:m}}}}},
    getComputedStyle:()=>({visibility:'visible'}),console});
  context.__loginomDockReadinessV1={document:scenario==='foreign-document'?{}:document,
    documentId:'original-document',sessionId:'original-session',account:'user',loginomBuild:'7.4.2'};
  const page={
    evaluate:async(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',context),
    locator(selector){
      const avatar=selector.includes('btnAvatar'),logout=selector.includes('btnLogOut'),login=selector.includes('edtUsername');
      return {locator(){return this;},innerText:async()=>m.FServerConnection.UserName,
        async click(){f.events.push(logout?'native-logout':'avatar');
          if(logout){f.logout++;if(scenario==='native-error')throw Error('native rejected');
            if(scenario!=='native-no-effect')m.FServerConnection.Connected=false;}},
        async waitFor(){if(login&&m.FServerConnection.Connected)throw Error('LoginForm not confirmed');},
        async isVisible(){return avatar&&m.FServerConnection.Connected;}};
    },
  };
  const browserServer=new Server({name:'fixture-browser',version:'1'},{capabilities:{tools:{}}});
  browserServer.setRequestHandler(ListToolsRequestSchema,()=>({tools:[{name:'browser_run_code_unsafe',inputSchema:{type:'object'}}]}));
  browserServer.setRequestHandler(CallToolRequestSchema,async request=>{
    f.events.push('native-body');
    const fn=vm.runInContext('('+request.params.arguments.code+')',context);
    const value=await fn(page);
    if(scenario==='lost-reply')return {isError:true,content:[{type:'text',text:'reply lost'}]};
    return {content:[{type:'text',text:JSON.stringify(value)}]};
  });
  const [a,b]=InMemoryTransport.createLinkedPair();await browserServer.connect(b);
  const originalClose=a.close.bind(a);
  a.close=async()=>{f.events.push('browser-transport-close');
    if(scenario==='transport-error')throw 0;
    if(scenario==='missing-onclose')return;
    await originalClose();};
  const session={directory,browserRoot:'/fixture',async save(){},metadata:{client:'test',clientRevision:'a'.repeat(64),sessionId:'original-session'},
    artifactStore:{list:()=>[],async releaseUploads(){f.events.push('release');}}};
  let bridge;
  try{
    bridge=await createBridge({mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',stateDir:directory,
      loginomUrl:'https://loginom.invalid/app',endpoint:'https://fixture.invalid/mcp'},session,
      {browserTransport:a,...(scenario==='unconfigured'?{}:{authenticatedReadiness:{account:'user',documentId:'original-document',loginomBuild:'7.4.2'}})});
    if(scenario==='receipt-write-failure')await mkdir(join(directory,'package-cleanup.json'));
    if(scenario==='journal-write-failure')await mkdir(join(directory,'execution-events.jsonl'));
    if(scenario==='transport-receipt-write-failure')await mkdir(join(directory,'shutdown-receipt.json'));
    let result,error;
    const linked=['ready','unconfigured','lost-reply','transport-error','native-no-effect'].includes(scenario);
    if(linked){
      // The actual managed close function consumes this actual bridge receipt.
      // Only the external context/server handles are lifecycle fixtures.
      const owner={session,authenticatedReadiness:scenario==='unconfigured'?undefined:{},
        bridge:{close:async()=>{result=await bridge.close();return result;}},
        controller:{abort:()=>f.events.push('managed-abort')},
        client:{close:async()=>f.events.push('managed-client-close')},
        browser:{close:async()=>f.events.push('managed-context-close')}};
      const close=vm.runInNewContext(managedCode+';close',{state:owner,requests:new Set(),writeFile,join,rm,Promise,Error});
      try{await close();}catch(e){error=e;}
    }else try{result=await bridge.close();}catch(e){error=e;}
    const success=['ready','unconfigured'].includes(scenario);
    if(success){assert.equal(result.browser_transport_closed,true);
      assert.equal(f.logout,scenario==='ready'?1:0);
      if(scenario==='ready'){
        assert.equal(result.browser_process_terminated,false);assert.equal(result.native_logout_confirmed,true);
        const proof=JSON.parse(await readFile(join(directory,'shutdown-receipt.json'),'utf8'));
        assert.equal(proof.native_logout_confirmed,true);
      }
      assert.ok(f.events.indexOf('browser-transport-close')<f.events.indexOf('release'));
      assert.ok(f.events.includes('managed-context-close'));
    }else{
      assert.equal(f.events.includes('release'),false);
      if(linked)assert.equal(f.events.includes('managed-context-close'),false);
      if(result)assert.equal(result.browser_transport_closed,false);
      else assert.ok(error!==undefined);
      if(['foreign-account','foreign-document','package-present','running','dialog','unsettled'].includes(scenario)){
        assert.equal(f.logout,0);assert.equal(f.events.includes('browser-transport-close'),false);
      }
      if(['native-no-effect','native-error','lost-reply'].includes(scenario)){
        assert.equal(f.logout,1);try{await bridge.close();}catch{}
        assert.equal(f.logout,1);assert.equal(f.events.includes('browser-transport-close'),false);
      }
      if(['receipt-write-failure','journal-write-failure','transport-receipt-write-failure'].includes(scenario)){
        assert.equal(f.logout,1);assert.equal(f.events.includes('browser-transport-close'),scenario==='transport-receipt-write-failure');
        const file=join(directory,scenario==='receipt-write-failure'?'package-cleanup.json':scenario==='journal-write-failure'?'execution-events.jsonl':'shutdown-receipt.json');
        await rename(file,file+'.failed');result=await bridge.close();
        assert.equal(result.browser_transport_closed,true);assert.equal(result.native_logout_confirmed,true);assert.equal(f.logout,1);
      }
      if(scenario==='transport-error'){
        const proof=JSON.parse(await readFile(join(directory,'shutdown-receipt.json'),'utf8'));
        assert.deepEqual(proof.rejection,{kind:'value',value:0,is_undefined:false});assert.equal(proof.native_logout_confirmed,true);
      }
    }
    if(process.env.READINESS_RESULTS_DIR)await import('node:fs/promises').then(fs=>fs.writeFile(join(process.env.READINESS_RESULTS_DIR,scenario+'.json'),
      JSON.stringify({scenario,result:result??null,error:error?String(error):null,events:f.events,native_logout_calls:f.logout,live:false},null,2)+'\n'));
  }finally{
    // Only our local InMemory fixture transports, never a production browser.
    a.close=originalClose;await originalClose();await browserServer.close();await rm(directory,{recursive:true,force:true});
  }
 });


// New combinations: a remote close failure with an otherwise confirmed
// browser close, and a primary browser failure followed by receipt failure.
// External services and Page are fixtures; bridge/SDK/gate/disk are actual.
for(const scenario of ['remote-error','remote-zero','remote-false','remote-empty','remote-null','remote-undefined','transport-and-receipt-failure'])
 test('independent primary shutdown evidence: '+scenario,async()=>{
  const directory=await mkdtemp(join(tmpdir(),'review-primary-shutdown-'));
  const rejection=scenario==='remote-error'?Error('original remote close'):scenario==='remote-zero'?0:
   scenario==='remote-false'?false:scenario==='remote-empty'?'':scenario==='remote-null'?null:undefined;
  const f=current={events:[],unsettled:false,remoteRejected:scenario!=='transport-and-receipt-failure',remoteRejection:rejection,logout:0};
  const m={FServerConnection:{Connected:true,UserName:'user'},PackageNodes:{Count:0},HasRunningNodes:()=>false};
  const document={querySelectorAll:()=>[]};
  const context=vm.createContext({document,location:{origin:'https://loginom.invalid'},
   bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:m}}}}}});
  context.__loginomDockReadinessV1={document,documentId:'original-document',sessionId:'original-session',account:'user',loginomBuild:'7.4.2'};
  const page={evaluate:async(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',context),
   locator(selector){const avatar=selector.includes('btnAvatar'),logout=selector.includes('btnLogOut');
    return {locator(){return this},innerText:async()=>m.FServerConnection.UserName,
     async click(){if(logout){f.logout++;m.FServerConnection.Connected=false}},async waitFor(){},
     async isVisible(){return avatar&&m.FServerConnection.Connected}}}};
  const browserServer=new Server({name:'fixture-browser',version:'1'},{capabilities:{tools:{}}});
  browserServer.setRequestHandler(ListToolsRequestSchema,()=>({tools:[{name:'browser_run_code_unsafe',inputSchema:{type:'object'}}]}));
  browserServer.setRequestHandler(CallToolRequestSchema,async request=>({content:[{type:'text',text:JSON.stringify(await vm.runInContext('('+request.params.arguments.code+')',context)(page))}]}));
  const [a,b]=InMemoryTransport.createLinkedPair();await browserServer.connect(b);
  const originalClose=a.close.bind(a);
  a.close=async()=>{f.events.push('browser-close');if(scenario==='transport-and-receipt-failure')throw 0;await originalClose()};
  const session={directory,browserRoot:'/fixture',async save(){},metadata:{client:'test',clientRevision:'a'.repeat(64),sessionId:'original-session'},artifactStore:{list:()=>[],async releaseUploads(){f.events.push('release')}}};
  let bridge;
  try{
   bridge=await createBridge({mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',stateDir:directory,loginomUrl:'https://loginom.invalid/app',endpoint:'https://fixture.invalid/mcp'},session,
    {browserTransport:a,authenticatedReadiness:{account:'user',documentId:'original-document',loginomBuild:'7.4.2'}});
   if(scenario==='transport-and-receipt-failure')await mkdir(join(directory,'shutdown-receipt.json'));
   let result,caught;try{result=await bridge.close()}catch(e){caught=e}
   const read=async path=>{try{return JSON.parse(await readFile(join(directory,path),'utf8'))}catch{return null}};
   const shutdown=await read('shutdown-receipt.json'),failure=await read('bridge-shutdown-failure.json');
   const evidence={scenario,result:result??null,caught:caught?{message:caught.message,code:caught.code,cause:caught.cause}:null,shutdown,failure,events:f.events,nativeLogoutCalls:f.logout};
   if(process.env.READINESS_RESULTS_DIR)await writeFile(join(process.env.READINESS_RESULTS_DIR,scenario+'.json'),JSON.stringify(evidence,null,2)+'\n');
   assert.equal(f.events.includes('release'),false);
   if(scenario==='transport-and-receipt-failure'){
    // The separate persistence failure may be reported, but the primary 0
    // rejection must remain explicitly identifiable, including its phase.
    assert.deepEqual(failure?.primary_rejection??failure?.rejection,{kind:'value',value:0,is_undefined:false});
   }else{
    assert.equal(result.cleanup_complete,false);assert.equal(result.browser_transport_closed,true);
    const expected=rejection instanceof Error?{kind:'Error',name:rejection.name,message:rejection.message}:
     {kind:'value',value:rejection===undefined?null:rejection,is_undefined:rejection===undefined};
    assert.deepEqual(shutdown?.rejection??shutdown?.primary_rejection,expected);
   }
  }finally{a.close=originalClose;await originalClose();await browserServer.close();await rm(directory,{recursive:true,force:true})}
 });
