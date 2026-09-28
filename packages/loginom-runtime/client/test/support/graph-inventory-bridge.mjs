import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client as ProtocolClient} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createArtifactStore} from '../../lib/artifacts.mjs';
import * as actionCatalog from '../../lib/action-catalog.mjs';
import * as skill from '../../lib/skill.mjs';
import * as workspace from '../../lib/workspace.mjs';
import {actions,selectors} from './executor-fixture.mjs';

test('compact MCP profile reads a prepared graph without exposing low-level actions',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'graph-inventory-bridge-'));
  const compatibility={profile_id:'unit-macos-chromium',loginom_build:'7.4.2',platform:'macos',browser:'chromium'};
  const workflow_ref={tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb',prefix:'MF;TF',
    workflow_id:'fixture-workflow',navigation_path:[]};
  const graph=()=>({complete:true,interaction_ready:true,document_id:'fixture-document',workflow_ref,
    nodes:[{ref:{document_id:'fixture-document',workflow_id:'fixture-workflow',node_id:'source'},
      type:'imports.text',label:'Sales_CSV',inputs:[],outputs:[0]},
      {ref:{document_id:'fixture-document',workflow_id:'fixture-workflow',node_id:'group'},
        type:'transform.group_data',label:'Groups_SwarmInfrastructure',inputs:[0],outputs:[0]}],
    links:[{source:'source',output:0,target:'group',input:0}],foreign_links:[]});
  let browserCalls=0,foreign=false;
  class ExternalClient {
    constructor(identity){this.browser=identity.name==='loginom-dock-browser';}
    async connect(transport){this.transport=transport;}
    async close(){this.transport?.onclose?.();}
    async listTools(){return {tools:[{name:this.browser?'browser_run_code_unsafe':'read',inputSchema:{type:'object',additionalProperties:true}}]};}
    async callTool(request){
      assert.equal(this.browser,true);browserCalls++;
      const code=request.arguments.code;
      const output=code.includes('async function prepareWorkspace(')
        ? {status:'READY',target:compatibility,authenticated:true,created_draft:false,effect_possible:false,
          document_id:'fixture-document',target_verified:true,package_ref:{path:'/agent/test.lgp',persisted:true},workflow_ref}
        : code.includes('async function observeGeometry(')
          ? {version:1,source:'prepare_same_browser_page',observed:{document_id:'fixture-document'}}
          : code.includes('graph.inventory.transport')
            ? {status:'SUCCEEDED',action_key:'graph.inventory.transport',action_revision:'1',operation_id:'inventory',
              phase:'observed',effect_possible:false,trace:[],error:null,
              output:{value:{...graph(),foreign_links:foreign?['other']:[]}}}
            : null;
      assert(output,'Unexpected browser operation');
      return {content:[{type:'text',text:JSON.stringify(output)}]};
    }
  }
  class ExternalTransport {}
  mock.module('@modelcontextprotocol/sdk/client/index.js',{namedExports:{Client:ExternalClient}});
  mock.module('@modelcontextprotocol/sdk/client/stdio.js',{namedExports:{StdioClientTransport:ExternalTransport,getDefaultEnvironment:()=>({})}});
  mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js',{namedExports:{StreamableHTTPClientTransport:ExternalTransport}});
  mock.module(new URL('../../lib/action-catalog.mjs',import.meta.url).href,{namedExports:{...actionCatalog,
    pinActionCatalog:async()=>({actions,selectors,pins:{},compatibility,manifest:{compatibility}})}});
  mock.module(new URL('../../lib/workspace.mjs',import.meta.url).href,{namedExports:{...workspace,
    makeWorkspacePrepareCode:options=>workspace.makeWorkspacePrepareCode({...options,platform:'darwin'})}});
  mock.module(new URL('../../lib/skill.mjs',import.meta.url).href,{namedExports:{...skill,
    skillTransport:()=>({}),createSkillLoader:()=>({prepare:async()=>({main:'/unit/skill',directory:'/unit/skill',
      detail:{revision:'unit-skill',source:'unit-source',content:'Fixture skill'}})})}});
  const {createBridge}=await import('../../lib/bridge.mjs');
  const session={directory,browserCli:'/unit/browser.mjs',browserConfig:'/unit/browser.json',browserRoot:'/unit/browser',
    metadata:{client:'0.1.0-test',clientRevision:'d'.repeat(64),sessionId:'graph-inventory-test'},async save(){}};
  let bridge,client;
  try{
    session.artifactStore=await createArtifactStore({directory:join(directory,'input')});
    bridge=await createBridge({endpoint:'https://dock.invalid/mcp',apiKey:'UNIT-NONSECRET',
      loginomUrl:'https://loginom.invalid/?testable=true',mode:'executor-replay',resultProfile:'user-v1'},session);
    client=new ProtocolClient({name:'test-agent',version:'1.0.0'});
    const [agentTransport,bridgeTransport]=InMemoryTransport.createLinkedPair();
    await Promise.all([bridge.server.connect(bridgeTransport),client.connect(agentTransport)]);
    const tools=(await client.listTools()).tools;
    assert(tools.some(tool=>tool.name==='dock_graph_inventory'&&tool.annotations.readOnlyHint===true));
    assert(!tools.some(tool=>tool.name==='dock_ui_action'));
    const premature=await client.callTool({name:'dock_graph_inventory',arguments:{}});
    assert.equal(premature.isError===true||JSON.parse(premature.content[0].text).status==='FAILED',true);
    assert.equal(browserCalls,0);
    const prepared=await client.callTool({name:'dock_prepare',arguments:{intent:'open_package',package_path:'/agent/test.lgp'}});
    assert.equal(JSON.parse(prepared.content[0].text).prepared,true);
    const count=browserCalls;
    const malformed=await client.callTool({name:'dock_graph_inventory',arguments:{unexpected:true}});
    assert.equal(malformed.isError===true||JSON.parse(malformed.content[0].text).status==='FAILED',true);
    assert.equal(browserCalls,count);
    const result=await client.callTool({name:'dock_graph_inventory',arguments:{}});
    const inventory=JSON.parse(result.content[0].text);
    assert.equal(inventory.status,'SUCCEEDED',JSON.stringify(inventory));
    assert.deepEqual(inventory.output.links,[{source:'source',output:0,target:'group',input:0}]);
    foreign=true;
    const refused=await client.callTool({name:'dock_graph_inventory',arguments:{}});
    assert.equal(refused.isError===true||JSON.parse(refused.content[0].text).status==='FAILED',true);
  }finally{await client?.close();await bridge?.close();mock.restoreAll();await rm(directory,{recursive:true,force:true});}
});
