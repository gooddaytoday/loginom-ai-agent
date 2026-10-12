import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createArtifactStore} from '../../lib/artifacts.mjs';
import {javascriptParametersSchema} from '../../lib/node-api.mjs';
import {createBundledSkillFixture} from './bundled-skill-fixture.mjs';
import {createActionCatalogFixture} from './action-catalog-fixture.mjs';

// Real bridge, factories, bundled skill, MCP Server/Client and schemas; only
// external catalog delivery and browser transport are simulated. No browser/model is run.
test('user-v1 final reply budgets and prepare knowledge admission over real MCP',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'loginom-bridge-budget-'));
 const resources=await createBundledSkillFixture(t);
 const compatibility={profile_id:'protocol-linux-742-fixture',loginom_build:'7.4.2',platform:'linux',browser:'chromium'};
 const catalog=await createActionCatalogFixture(compatibility);
 let browserCalls=0;
 class ExternalClient {
  constructor(identity){this.browser=identity.name==='loginom-dock-browser';}
  async connect(transport){this.transport=transport;}
  async close(){this.transport?.onclose?.();}
  async listTools(){return {tools:[{name:this.browser?'browser_run_code_unsafe':'read',inputSchema:{type:'object'}}]};}
  async callTool(request){
   if(!this.browser){
    assert.equal(request.name,'read');
    const text=catalog.files.get(request.arguments.uris[0]);assert.equal(typeof text,'string');
    return {content:[{type:'text',text}]};
   }
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
 const {createBridge}=await import('../../lib/bridge.mjs');
 let bridge,client;
 try{
  const session={directory,browserCli:'/unit/browser.mjs',browserConfig:'/unit/browser.json',browserRoot:'/unit/browser',
    metadata:{client:'unit',clientRevision:'d'.repeat(64),sessionId:'protocol-budget-session'},async save(){},
    artifactStore:await createArtifactStore({directory:join(directory,'input')})};
  bridge=await createBridge({resources:resources.resources,actionManifestUri:catalog.manifestUri,actionManifestSha256:catalog.manifestSha256,
    endpoint:'http://memory.invalid/mcp',apiKey:'UNIT_NONSECRET',loginomUrl:'http://loginom.test/app/',
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

  // Real admitted inputs overflow the first prepare reply. Removing those
  // unpublished inputs permits delivery without changing the pinned skill.
  const sourcePath=join(directory,'source.csv');await writeFile(sourcePath,'fixture');
  const artifacts=await Promise.all(Array.from({length:128},(_,index)=>session.artifactStore.admit({
    sourcePath,name:'input-'+index+'-'+ 'x'.repeat(180)+'.csv',bytes:7,
    sha256:createHash('sha256').update('fixture').digest('hex')})));
  const refusedPrepare=await call('dock_prepare');
  assert.equal(refusedPrepare.isError,true);assert.equal(parse(refusedPrepare).result_delivery,'refused');
  assert.ok(size(refusedPrepare)<2000);
  await session.artifactStore.discardUnpublished(artifacts.map(artifact=>artifact.artifact_id));
  const prepared=await call('dock_prepare'),full=parse(prepared);
  assert.notEqual(prepared.isError,true);assert.equal(full.prepared,true);assert.equal(full.knowledge.version,'user-v1');
  assert.ok(full.knowledge.node_types.some(node=>node.type==='programming.javascript'));assert.equal(full.knowledge.reused,undefined);
  const preparedJs=full.knowledge.node_types.find(node=>node.type==='programming.javascript');
  assert.match(preparedJs.limitations.at(-2),/ASCII Name.*DisplayName.*schema\/readback/);
  assert.match(preparedJs.limitations.at(-1),/integer\/real\/datetime data_kind=Непрерывный/);
  assert.ok(size(prepared)<=46000);assert.equal(Object.hasOwn(full,'instructions'),false);
  assert.equal(full.source,'bundled');assert.match(full.skillRevision,/^[a-f0-9]{64}$/);
  assert.match(client.getInstructions(),/activate.*loginom-automation/i);
  const revision=full.skillRevision;
  const reused=await call('dock_prepare');assert.equal(parse(reused).knowledge.reused,true);
  assert.equal(parse(reused).instructions,undefined);assert.ok(size(reused)<=46000);

  const before=browserCalls;
  const single=await call('dock_action_describe',{node_types:['programming.javascript']});
  assert.notEqual(single.isError,true);assert.ok(size(single)<=20000);
  const js=parse(single).node_types[0];assert.deepEqual(js.parameter_schema,javascriptParametersSchema);
  assert.equal(js.javascript_knowledge.validated_for.loginom_build,'7.4.2');assert.equal(js.javascript_knowledge.examples.length,2);
  assert.equal(js.javascript_knowledge.version,'1.2.0');
  assert.equal(js.knowledge_sha256,preparedJs.knowledge_sha256);
  assert.deepEqual(js.javascript_knowledge.column_names.observed_pairs.map(pair=>[pair.requested_name,pair.actual_name,pair.display_name]),
    [['Value','Value','Value'],['Сумма','Summa','Value'],['Value Total','Value_Total','Value'],['1Value','_1Value','Value'],['Value','Value','Сумма ё']]);
  assert.equal(js.javascript_knowledge.column_names.normalization_algorithm_verified,false);
  assert.equal(js.javascript_knowledge.column_names.add_column_verified,false);
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
