import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createArtifactStore} from '../../lib/artifacts.mjs';
import {createRedactor} from '../../lib/redact.mjs';
import {createJavascriptCodeNodeSupport} from '../../lib/javascript-code-node.mjs';
import {javascriptParametersSchema} from '../../lib/node-api.mjs';

// Real bridge, factories, MCP Server/Client and schemas; only external catalog,
// skill delivery and browser transport are simulated. No browser/model is run.
test('user-v1 final reply budgets and prepare knowledge admission over real MCP',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'loginom-bridge-budget-'));
 const actionCatalog=await import('../../lib/action-catalog.mjs');
 const skill=await import('../../lib/skill.mjs');
 const {createCandidateNodeSupport}=await import('../../lib/node-support.mjs');
 const {actions,selectors}=await import('./executor-fixture.mjs');
 const compatibility={profile_id:'protocol-linux-742-fixture',loginom_build:'7.4.2',platform:'linux',browser:'chromium'};
 const pins={capabilityAbi:1,executorRevision:'1.3.0',actionCatalogVersion:'protocol-fixture',actionCatalogDigest:'a'.repeat(64),
   selectorCatalogDigest:'b'.repeat(64),e2eCommit:'c'.repeat(40),actionManifestDigest:'d'.repeat(64),
   catalogLifecycleStatus:'candidate',acceptanceVerified:false,acceptanceDigest:null,compatibilityProfile:compatibility};
 let browserCalls=0,revision='r'.repeat(64);
 class ExternalClient {
  constructor(identity){this.browser=identity.name==='loginom-dock-browser';}
  async connect(transport){this.transport=transport;}
  async close(){this.transport?.onclose?.();}
  async listTools(){return {tools:[{name:this.browser?'browser_run_code_unsafe':'read',inputSchema:{type:'object'}}]};}
  async callTool(request){
   assert.equal(this.browser,true);assert.equal(request.name,'browser_run_code_unsafe');browserCalls++;
   const code=request.arguments.code;
   const value=code.includes('async function prepareWorkspace(')?{status:'READY',target:compatibility,
     authenticated:true,created_draft:true,effect_possible:true,target_verified:true,loginom_account:'protocol-fixture',
     document_id:'fixture-document',package_ref:{path:null,persisted:false},workflow_ref:{workflow_id:'fixture-workflow',
       tab_tid:'fixture-tab',prefix:'fixture-prefix',navigation_path:[{tid:'fixture-scenario',label:'Fixture scenario'}]}}
    :code.includes('async function observeGeometry(')?{version:1,source:'prepare_same_browser_page',observed:{document_id:'fixture-document'},fixture:true}
      :assert.fail('Unexpected browser operation');
   return {content:[{type:'text',text:JSON.stringify(value)}]};
  }
 }
 class ExternalTransport {}
 mock.module('@modelcontextprotocol/sdk/client/index.js',{namedExports:{Client:ExternalClient}});
 mock.module('@modelcontextprotocol/sdk/client/stdio.js',{namedExports:{StdioClientTransport:ExternalTransport,getDefaultEnvironment:()=>({})}});
 mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js',{namedExports:{StreamableHTTPClientTransport:ExternalTransport}});
 mock.module(new URL('../../lib/action-catalog.mjs',import.meta.url).href,{namedExports:{...actionCatalog,
   pinActionCatalog:async()=>({actions,selectors,pins,compatibility,manifest:{compatibility}})}});
 mock.module(new URL('../../lib/skill.mjs',import.meta.url).href,{namedExports:{...skill,
   skillTransport:()=>({}),createSkillLoader:()=>({prepare:async()=>({main:'/unit/SKILL.md',directory:'/unit',
     detail:{revision,source:'protocol-fixture',content:'Inert fixture skill.'}})})}});
 mock.module(new URL('../../lib/node-support.mjs',import.meta.url).href,{namedExports:{createCandidateNodeSupport:config=>{
  const ordinary=createCandidateNodeSupport(config),javascript=createJavascriptCodeNodeSupport({...config,redactor:createRedactor()});
  return {...ordinary,nodeApplyHandlers:new Map([...ordinary.nodeApplyHandlers,...javascript.nodeApplyHandlers])};
 }}});
 const {createBridge}=await import('../../lib/bridge.mjs');
 let bridge,client;
 try{
  const session={directory,browserCli:'/unit/browser.mjs',browserConfig:'/unit/browser.json',browserRoot:'/unit/browser',
    metadata:{client:'unit',clientRevision:'d'.repeat(64),sessionId:'protocol-budget-session'},async save(){},
    artifactStore:await createArtifactStore({directory:join(directory,'input')})};
  bridge=await createBridge({endpoint:'http://memory.invalid/mcp',apiKey:'UNIT_NONSECRET',loginomUrl:'http://loginom.test/app/',
    mode:'executor-replay',resultProfile:'user-v1',stateDir:directory},session);
  client=new Client({name:'budget-protocol-client',version:'1'});
  const [agentTransport,bridgeTransport]=InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(agentTransport),bridge.server.connect(bridgeTransport)]);
  const call=(name,args={})=>client.callTool({name,arguments:args});
  const parse=reply=>JSON.parse(reply.content[0].text);
  const size=reply=>Buffer.byteLength(JSON.stringify(reply));
  const inventory=await call('dock_action_describe');
  assert.ok(parse(inventory).available_node_types.includes('programming.javascript'));
  assert.equal(browserCalls,0);

  // Oversized opaque revision is a delivery stress fixture, not a valid staged
  // knowledge hash. It proves a refused first reply does not consume the bundle.
  revision='r'.repeat(50000);
  const refusedPrepare=await call('dock_prepare');
  assert.equal(refusedPrepare.isError,true);assert.equal(parse(refusedPrepare).result_delivery,'refused');
  assert.ok(size(refusedPrepare)<2000);
  revision='r'.repeat(64);
  const prepared=await call('dock_prepare'),full=parse(prepared);
  assert.notEqual(prepared.isError,true);assert.equal(full.prepared,true);assert.equal(full.knowledge.version,'user-v1');
  assert.ok(full.knowledge.node_types.some(node=>node.type==='programming.javascript'));assert.equal(full.knowledge.reused,undefined);
  assert.ok(size(prepared)<=46000);assert.equal(typeof full.instructions,'string');
  const reused=await call('dock_prepare');assert.equal(parse(reused).knowledge.reused,true);
  assert.equal(parse(reused).instructions,undefined);assert.ok(size(reused)<=46000);

  const before=browserCalls;
  const single=await call('dock_action_describe',{node_types:['programming.javascript']});
  assert.notEqual(single.isError,true);assert.ok(size(single)<=20000);
  const js=parse(single).node_types[0];assert.deepEqual(js.parameter_schema,javascriptParametersSchema);
  assert.equal(js.javascript_knowledge.validated_for.loginom_build,'7.4.2');assert.equal(js.javascript_knowledge.examples.length,2);
  assert.equal(js.session_manifest.skillRevision,revision);assert.equal(js.knowledge_sha256.length,64);
  const all=await call('dock_action_describe',{node_types:parse(inventory).available_node_types});
  assert.equal(all.isError,true);assert.equal(parse(all).error.scope,'whole_response');assert.ok(size(all)<2000);
  const pair=await call('dock_action_describe',{node_types:['imports.text','programming.javascript']});
  assert.notEqual(pair.isError,true);assert.equal(parse(pair).node_types.length,2);assert.ok(size(pair)<=46000);
  assert.deepEqual(parse(pair).node_types[1].parameter_schema,js.parameter_schema);assert.equal(browserCalls,before);

  session.metadata.stress='"'.repeat(24000);
  const diagnostic=await call('dock_diagnostics',{checkConnections:false});
  assert.equal(diagnostic.isError,true);assert.ok(size(diagnostic)<2000);assert.equal(browserCalls,before);
  assert.equal(bridge.hasUnsettledWork(),false);
 }finally{
  await client?.close();await bridge?.close();mock.restoreAll();await rm(directory,{recursive:true,force:true});
 }
});
