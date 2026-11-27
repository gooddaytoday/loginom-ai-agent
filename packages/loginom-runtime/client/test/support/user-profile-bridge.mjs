import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm,writeFile } from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {runInContext,runInNewContext} from 'node:vm';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createArtifactStore } from '../../lib/artifacts.mjs';
import { packageReadOnlyAdvice } from '../../lib/workspace.mjs';
import { createBundledSkillFixture } from './bundled-skill-fixture.mjs';
import { createActionCatalogFixture } from './action-catalog-fixture.mjs';
import { Page } from './workspace-ui-fixture.mjs';
import {withStorageIdentity} from '../../lib/storage-policy.mjs';
import {createNodeOperationRunner} from '../../lib/node-operation-runner.mjs';

test('managed user preparation returns local pins and dynamic knowledge without static workflow instructions', async t => {
  const resources = await createBundledSkillFixture(t);
  const directory = await mkdtemp(join(tmpdir(), 'loginom-user-bridge-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const platform = { darwin: 'macos', win32: 'windows', linux: 'linux' }[process.platform];
  const compatibility = { profile_id: `unit-${platform}-chromium`, loginom_build: '7.4.2', platform, browser: 'chromium' };
  const catalog = await createActionCatalogFixture(compatibility);
  const browserCalls=[];
  let reopenSaved, nativeReloadReply, loseReloadOpenReply=false;
  const nativeReloadOpens=[], modifiedReadbacks=[];
  const reloadLogins=[];
  let connectionPage=null;
  let stepFixture=null;
  const stepJobs=createNodeOperationRunner({validate:()=> 'step-fixture',progress:()=>null,run:request=>{
    stepFixture.admissions.push(request);
    return {status:'SUCCEEDED',operation_id:request.operation_id,cleanup_complete:true};
  }});
  const packageDeliveries=[];let expectedPackage=null,expectedPackageReadOnly=false,expectedOperation=null,openFailure=null,deliveryAbort=null,unconfirmedUpload=false,reloadedPage=null,identityPage=null,identityFault=null;
  class ExternalClient {
    constructor(identity) { this.browser = identity.name === 'loginom-dock-browser'; }
    async connect(transport) { this.transport = transport; }
    async close() { this.transport?.onclose?.(); }
    async listTools() { return { tools: [{ name: this.browser ? 'browser_run_code_unsafe' : 'read', inputSchema: { type: 'object' } }] }; }
    async callTool(request) {
      if (!this.browser) {
        assert.equal(request.name, 'read');
        const text = catalog.files.get(request.arguments.uris[0]);
        assert.equal(typeof text, 'string');
        return { content: [{ type: 'text', text }] };
      }
      assert.equal(request.name, 'browser_run_code_unsafe');
      browserCalls.push(request);
      const code = request.arguments.code;
      if(nativeReloadReply&&code.includes('"recoveryAccount":"user"')){
        const options=JSON.parse(code.slice(code.lastIndexOf('(page, {')+7,-1));
        nativeReloadOpens.push(options);
        if(loseReloadOpenReply){
          loseReloadOpenReply=false;
          throw Error('Interrupted after the native Open gesture');
        }
        return {content:[{type:'text',text:JSON.stringify(nativeReloadReply)}]};
      }
      if(nativeReloadReply&&code.includes("action_key:'workspace.reload_graph'"))
        return {content:[{type:'text',text:JSON.stringify({status:'SUCCEEDED',action_key:'workspace.reload_graph',
          action_revision:'1',operation_id:'fixture-reload',phase:'observed',effect_possible:false,error:null,
          trace:[],output:{complete:true,document_id:nativeReloadReply.document_id,
            package_modified:modifiedReadbacks.length?modifiedReadbacks.shift():false}})}]};
      if(stepFixture&&code.includes("action_key:'workspace.step'")){
        stepFixture.reads++;
        if(stepFixture.output instanceof Error)throw stepFixture.output;
        return {content:[{type:'text',text:JSON.stringify({status:'SUCCEEDED',action_key:'workspace.step',action_revision:'1',
          phase:'observed',effect_possible:false,output:stepFixture.output,error:null,trace:[]})}]};
      }
      if(connectionPage&&code.includes('async function observeGeometry('))
        return {content:[{type:'text',text:JSON.stringify(await runInNewContext(code)(connectionPage))}]};
      if(identityPage&&code.includes('"identityOnly":true')){
        if(identityFault==='transport')throw Error('Identity probe reply was lost');
        const state=await runInNewContext(code)(identityPage);
        if(identityFault==='missing_effect')delete state.effect_possible;
        if(identityFault==='effectful')state.effect_possible=true;
        if(identityFault==='created_draft')state.created_draft=true;
        return {content:[{type:'text',text:JSON.stringify(state)}]};
      }
      if(reloadedPage&&code.includes('async function prepareWorkspace('))
        return {content:[{type:'text',text:JSON.stringify(await runInNewContext(code)(reloadedPage))}]};
      if(expectedPackage&&code.includes('async function prepareWorkspace(')&&!code.includes('"identityOnly":true'))
        assert.equal(session.metadata.workspaceReady,false,'open must not reuse the prior READY');
      if(openFailure&&code.includes('async function prepareWorkspace(')&&!code.includes('"identityOnly":true')){
        const failure=openFailure;openFailure=null;
        return {content:[{type:'text',text:JSON.stringify({status:'NOT_READY',reason:'UI_BLOCKED',authenticated:true,
          trace:[{blocking_windows:{windows:[{message_box:{title:'Loginom',text:'UNIT-NONSECRET',buttons:[]}}]}}],
          created_draft:false,target:compatibility,effect_possible:failure.effect_possible,operation_id:expectedOperation})}]};
      }
      let output = code.includes('"identityOnly":true')
        ? {status:'BOUND',target:compatibility,authenticated:true,created_draft:false,effect_possible:false,
          document_id:'fixture-document',loginom_account:'user',target_verified:true}
        : code.includes('async function prepareWorkspace(')
        ? { status: 'READY', target: compatibility, authenticated: true, created_draft: !expectedPackage,
          effect_possible: true, document_id: 'fixture-document', target_verified: true,
          operation_id:expectedOperation??'prepare',package_ref: { path: expectedPackage, persisted: !!expectedPackage, ...(expectedPackageReadOnly?{read_only:true}:{}) },loginom_account:'user',
          workflow_ref: { tab_tid: 'fixture-tab', prefix: 'fixture-prefix', workflow_id: expectedPackage?'local-workflow':'fixture-workflow', navigation_path: [] } }
        : { version: 1, source: 'prepare_same_browser_page', observed: { document_id: 'fixture-document' }, fixture: true };
      assert.ok(code.includes('async function prepareWorkspace(') || code.includes('async function observeGeometry('));
      if(stepFixture&&code.includes('async function prepareWorkspace(')){
        const options=JSON.parse(code.slice(code.lastIndexOf('(page, ')+7,-1));
        stepFixture.prepares.push(options);
        output=stepFixture.blockPrepare
          ?{status:'NOT_READY',reason:'UI_BLOCKED',authenticated:true,created_draft:false,effect_possible:false,target:compatibility}
          :{...output,native_step_owner:true,operation_id:options.operationId,workflow_ref:stepFixture.prepareRef};
      }
      return { content: [{ type: 'text', text: JSON.stringify(output) }] };
    }
  }
  class ExternalTransport {}
  mock.module('@modelcontextprotocol/sdk/client/index.js', { namedExports: { Client: ExternalClient } });
  mock.module('@modelcontextprotocol/sdk/client/stdio.js', { namedExports: { StdioClientTransport: ExternalTransport, getDefaultEnvironment: () => ({}) } });
  mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js', { namedExports: { StreamableHTTPClientTransport: ExternalTransport } });
  // Native upload/completion has its own serialized browser tests; isolate only
  // that boundary here to exercise bridge preparation and its real session gate.
  const executor=await import('../../lib/executor.mjs');
  mock.module(new URL('../../lib/executor.mjs',import.meta.url).href,{namedExports:{...executor,
    createActionRuntime:options=>{
      reopenSaved=options.reopenNodePackage;
      const runtime=executor.createActionRuntime(options);
      return {...runtime,
        nodeApplyWorkflow:id=>stepFixture?stepJobs.workflow?.(id):runtime.nodeApplyWorkflow?.(id),
        startNodeApply:(request,opts)=>{
          if(!stepFixture)return runtime.startNodeApply(request,opts);
          if(stepFixture.pending)throw Error('Resolve the pending Dock operation before applying');
          return stepJobs.start(request,opts);
        },
        hasUnsettledWork:()=>stepFixture?stepFixture.pending:runtime.hasUnsettledWork(),
        async deliverPackageArtifact(request,{signal}){
      signal.throwIfAborted();packageDeliveries.push(request);
      const artifact=options.artifactStore.getUploadGrant(request.artifact_id,request.upload_grant_id);
      assert.equal(session.metadata.storageBinding.document_id,'fixture-document');
      if(unconfirmedUpload)return {outcome:{status:'AMBIGUOUS',cleanup_complete:false}};
      deliveryAbort?.abort();deliveryAbort=null;
      return {outcome:{status:'SUCCEEDED',destination:artifact.upload.destination,bytes:artifact.bytes,source_sha256:artifact.sha256,
        upload_completion_verified:true,cleanup_complete:true,files_entry:{document_id:'fixture-document',tab_tid:'fixture-tab',directory:'/user'}}};
    }};}}});
  const { createBridge } = await import('../../lib/bridge.mjs');
  const session = { directory, browserCli: '/external/browser', browserConfig: '/external/config', browserRoot: '/external/browsers',
    artifactStore: await createArtifactStore({ directory: join(directory, 'input') }),
    metadata: { client: 'unit-test', clientRevision: 'd'.repeat(64), sessionId: 'user-session' }, async save() {} };
  const config = { resources: resources.resources, endpoint: 'https://dock.invalid/mcp', apiKey: 'UNIT-NONSECRET',
    loginomUrl: 'https://loginom.invalid/?testable=true', mode: 'executor-replay', resultProfile: 'user-v1',
    actionManifestUri: catalog.manifestUri, actionManifestSha256: catalog.manifestSha256,
    storageDirectories:{inputs:'/user',packages:'/user',exports:'/user'} };
  const bridge = await createBridge(config, session, {reauthenticateReload:async options=>{
    reloadLogins.push(options);
    return true;
  }});
  const client = new Client({ name: 'unit-agent', version: '1' });
  try {
    const [agent, server] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(agent), bridge.server.connect(server)]);
    assert.match(client.getInstructions(), /activate.*loginom-automation/i);
    assert.match(client.getInstructions(), /Help, diagnostics, and package reports do not require/i);
    const describeTool=(await client.listTools()).tools.find(tool=>tool.name==='dock_action_describe');
    assert.match(describeTool.description,/Pass JSON arrays directly for action_keys, node_types and modes/);
    for(const key of ['action_keys','node_types','modes'])assert.equal(describeTool.inputSchema.properties[key].type,'array');
    const connection={Connected:true,UserName:'user',FRemoteSession:{},FSession:{}};
    const packageNode={PackageFileName:''};
    const form={FReconnecting:false,FMapTree:{FServerConnection:connection,PackageNodes:{Count:1,Items:()=>packageNode}}};
    const native={document:{},location:{origin:'https://loginom.invalid',pathname:'/'},
      bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:form}}}},__loginomDockPreparationV1:{id:'fixture-document'},
      innerWidth:1280,innerHeight:800,outerWidth:1280,outerHeight:800,screenX:0,screenY:0,screen:{}};
    let restores=0,deliveryReads=0;
    connectionPage={viewportSize:()=>({width:1280,height:800}),
      evaluate:async(fn,input)=>runInNewContext('('+fn.toString()+')(input)',{...native,input}),
      locator:selector=>({waitFor:async()=>{},count:async()=>1,isVisible:async()=>true,
        innerText:async()=>selector.includes('p.h;p.t')?'Восстановление сессии':selector.includes('tlb;yes')?'Восстановить':'Обнаружен разрыв связи. Восстановить сессию?',
        click:async()=>{restores++;connection.Connected=true;form.FReconnecting=false;}}),
      waitForFunction:async fn=>assert.equal(await connectionPage.evaluate(fn),true),
      deliveryRead:()=>++deliveryReads};
    const reply = await client.callTool({ name: 'dock_prepare', arguments: {} });
    assert.notEqual(reply.isError, true, JSON.stringify(reply));
    assert.equal(reply.content.length, 1);
    const result = JSON.parse(reply.content[0].text);
    assert.equal(result.prepared, true);
    assert.equal(result.result_version, 'user-v1');
    assert.equal(result.source, 'bundled');
    assert.match(result.skillRevision, /^[a-f0-9]{64}$/);
    assert.equal(session.metadata.skillPath, resources.directory);
    assert.equal(Object.hasOwn(result, 'instructions'), false);
    assert.deepEqual(result.input_artifacts, []);
    assert.ok(result.knowledge.node_types.length > 0);
    for(const type of ['imports.lgd','exports.lgd'])assert.ok(result.knowledge.node_types.some(node=>node.type===type));
    assert.ok(result.knowledge.actions.some(action => action.action_key === 'package.save_checkpoint'));
    assert.equal(session.metadata.storageBinding.document_id,'fixture-document');
    const describe=arguments_=>client.callTool({name:'dock_action_describe',arguments:arguments_});
    const nativeArgs={action_keys:['package.save_checkpoint'],node_types:['imports.text'],modes:['delimited']};
    const encodedArgs=Object.fromEntries(Object.entries(nativeArgs).map(([key,value])=>[key,JSON.stringify(value)]));
    const actual=await describe(encodedArgs);
    const decoded=JSON.parse(actual.content[0].text);
    assert.equal(decoded.error,undefined,JSON.stringify(decoded.error));
    const repeated=JSON.parse((await describe(nativeArgs)).content[0].text);
    assert.deepEqual(repeated.actions,decoded.actions);
    assert.deepEqual(repeated.node_types,[]);
    assert.deepEqual(repeated.reused_node_types.map(({type,cache_key})=>({type,cache_key})),
      decoded.node_types.map(({type,cache_key})=>({type,cache_key})));
    const mixed=JSON.parse((await describe({node_types:['imports.text','transform.group_data'],modes:['delimited','aggregate']})).content[0].text);
    assert.deepEqual(mixed.reused_node_types.map(card=>card.type),['imports.text']);
    assert.deepEqual(mixed.node_types.map(card=>card.type),['transform.group_data']);
    const refreshReply=await describe({...nativeArgs,refresh:true});
    assert.notEqual(refreshReply.isError,true,refreshReply.content[0].text);
    assert.deepEqual(JSON.parse(refreshReply.content[0].text),decoded);
    assert.match(repeated.description_notice,/refresh: true/);
    assert.equal(describeTool.inputSchema.properties.refresh.type,'boolean');
    assert.deepEqual(JSON.parse((await describe({...nativeArgs,refresh:false})).content[0].text),repeated);
    for(const args of [{action_keys:'['},{action_keys:'null'},{node_types:'"imports.text"'},{modes:'[1]',node_types:'["imports.text"]'},{action_keys:'["node.add"]'},
      {...nativeArgs,refresh:'true'},{refresh:true},{action_key:'package.save_checkpoint',refresh:true}]){
      const denied=await describe(args);
      assert.equal(JSON.parse(denied.content[0].text).error.code,'REQUEST_REJECTED');
    }
    const oversized=await client.callTool({name:'dock_action_describe',arguments:{node_types:result.knowledge.node_types.map(card=>card.type)}});
    assert.equal(oversized.isError,true);
    assert.equal(JSON.parse(oversized.content[0].text).error.code,'USER_RESPONSE_BUDGET');
    const refreshBatch=await describe({node_types:result.knowledge.node_types.map(card=>card.type),refresh:true});
    assert.equal(refreshBatch.isError,true);
    const refusedRefresh=JSON.parse(refreshBatch.content[0].text);
    assert.equal(refusedRefresh.error.code,'USER_RESPONSE_BUDGET');
    const {arguments:firstRetry,remaining_requests}=refusedRefresh.next_step;
    assert.ok([firstRetry,...remaining_requests].every(args=>args.refresh===true));
    const importRetry=[firstRetry,...remaining_requests].find(args=>args.node_types.includes('imports.text'));
    const recovered=await describe(importRetry);
    assert.notEqual(recovered.isError,true,recovered.content[0].text);
    assert.ok(JSON.parse(recovered.content[0].text).node_types.find(card=>card.type==='imports.text')?.parameter_schema);
    const undescribed={operation_id:'without-description',contract_revision:'1.0.0',
      document_id:result.workspace.document_id,workflow_ref:{workflow_id:result.workspace.workflow_ref.workflow_id},
      target:{kind:'new',type:'transform.sorting'},inputs:[],mode:'keys',parameters:{},finish:'done'};
    const beforeDescription=browserCalls.length;
    for(const kind of ['new','existing']){
      const blocked=await client.callTool({name:'dock_node_apply',arguments:{...undescribed,target:{...undescribed.target,kind,...(kind==='existing'?{ref:{document_id:undescribed.document_id,workflow_id:undescribed.workflow_ref.workflow_id,node_id:'existing-sorting'}}:{})}}});
      const refusal=JSON.parse(blocked.content[0].text);
      assert.equal(refusal.error.code,'NODE_TYPE_NOT_DESCRIBED',JSON.stringify(refusal));assert.equal(refusal.effect_possible,false);
      assert.equal(browserCalls.length,beforeDescription,'undelivered cards cannot mutate the browser');
    }
    await client.callTool({name:'dock_action_describe',arguments:{node_types:['transform.sorting']}});
    const indexed=await client.callTool({name:'dock_node_apply',arguments:undescribed});
    assert.equal(JSON.parse(indexed.content[0].text).error.code,'NODE_TYPE_NOT_DESCRIBED');
    const unknownType=await client.callTool({name:'dock_node_apply',arguments:{...undescribed,target:{kind:'new',type:'unknown.type'}}});
    assert.equal(JSON.parse(unknownType.content[0].text).error.code,'REQUEST_REJECTED');
    const cardReply=await client.callTool({name:'dock_action_describe',arguments:{node_types:['transform.sorting'],modes:['keys']}});
    assert.notEqual(cardReply.isError,true,JSON.stringify(cardReply));
    const card=JSON.parse(cardReply.content[0].text).node_types[0];
    assert.match(card.guidance,/Сортировка/);assert.deepEqual(card.guidance_modes,['keys']);
    const invalidMode=await client.callTool({name:'dock_node_apply',arguments:{...undescribed,mode:'invented'}});
    assert.equal(JSON.parse(invalidMode.content[0].text).error.code,'REQUEST_REJECTED');
    assert.equal(browserCalls.length,beforeDescription,'mode validation remains before mutation');

    const initialRef={tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb',prefix:'MF;TF',
      workflow_id:'fixture-workflow',navigation_path:[{tid:'crumb',label:'Original'}]};
    const refreshedRef={...initialRef,navigation_path:[{tid:'crumb',label:'Manual Save'}]};
    stepFixture={prepareRef:initialRef,prepares:[],reads:0,admissions:[],pending:false};
    const firstStep=await client.callTool({name:'dock_prepare',arguments:{}});
    assert.equal(JSON.parse(firstStep.content[0].text).prepared,true);
    const priorPrepare={operation_id:'step-prepare',intent:'existing_workflow',
      workflow_ref:{...initialRef,document_id:'fixture-document'}};
    stepFixture.prepareRef=refreshedRef;
    const preparedStep=await client.callTool({name:'dock_prepare',arguments:priorPrepare});
    assert.equal(JSON.parse(preparedStep.content[0].text).prepared,true);
    const samePrepare=await client.callTool({name:'dock_prepare',arguments:priorPrepare});
    assert.equal(samePrepare.isError,undefined,JSON.stringify(samePrepare));
    assert.equal(JSON.parse(samePrepare.content[0].text).prepared,true);
    assert.deepEqual(stepFixture.prepares.at(-1).workflowRef,priorPrepare.workflow_ref);
    assert.equal(stepFixture.prepares.at(-1).refreshVerified,true);
    stepFixture.blockPrepare=true;
    const blockedPrepare=await client.callTool({name:'dock_prepare',arguments:priorPrepare});
    assert.equal(JSON.parse(blockedPrepare.content[0].text).workspace.reason,'UI_BLOCKED');
    stepFixture.blockPrepare=false;
    const recoveredPrepare=await client.callTool({name:'dock_prepare',arguments:priorPrepare});
    assert.equal(JSON.parse(recoveredPrepare.content[0].text).prepared,true,JSON.stringify(recoveredPrepare));
    assert.deepEqual(stepFixture.prepares.at(-1).workflowRef,priorPrepare.workflow_ref);
    await client.callTool({name:'dock_action_describe',arguments:{node_types:['transform.sorting'],modes:['keys']}});
    const nextRef={...refreshedRef,navigation_path:[{tid:'crumb',label:'Current browser navigation'}]};
    const packageRef={path:'/user/manual-save.lgp',name:'manual-save',persisted:true};
    stepFixture.output={status:'READY',document_id:'fixture-document',workflow_ref:nextRef,package_ref:packageRef};
    const apply=(id,args={})=>client.callTool({name:'dock_node_apply',arguments:{...undescribed,operation_id:id,...args}});
    const accepted=await apply('step-apply');
    assert.equal(accepted.isError,undefined,JSON.stringify(accepted));
    assert.equal(stepFixture.reads,1);
    assert.deepEqual(stepFixture.admissions[0].workflow_ref,nextRef);
    assert.deepEqual(session.metadata.workspacePreparation.state.package_ref,packageRef);
    assert.ok(accepted.content.some(block=>JSON.parse(block.text).package_ref?.path===packageRef.path));
    assert.equal((await apply('step-apply')).isError,undefined);
    assert.equal(stepFixture.reads,1,'replay retains its original scope without another preflight');
    assert.equal(stepFixture.admissions.length,1);
    const changed=await apply('step-apply',{target:{...undescribed.target,label:'different'}});
    assert.match(JSON.parse(changed.content[0].text).error.message,/different parameters/);
    assert.equal(stepFixture.admissions.length,1);
    stepFixture.pending=true;
    const pending=await apply('step-pending');
    assert.equal(JSON.parse(pending.content[0].text).request_rejected,true);
    assert.equal(stepFixture.reads,1,'pending work forbids a new preflight');
    stepFixture.pending=false;
    stepFixture.output={status:'NOT_READY',reason:'WORKFLOW_CHANGED'};
    const unready=await apply('step-unready');
    assert.equal(JSON.parse(unready.content[0].text).status,'NOT_APPLIED');
    assert.match(JSON.parse(unready.content[0].text).error.message,/WORKFLOW_CHANGED/);
    assert.equal(stepFixture.admissions.length,1);
    stepFixture.output=Error('Lost workspace preflight reply');
    const lostStep=await apply('step-lost');
    assert.equal(JSON.parse(lostStep.content[0].text).status,'NOT_APPLIED');
    assert.match(JSON.parse(lostStep.content[0].text).error.message,/Lost workspace preflight reply/);
    assert.equal(stepFixture.admissions.length,1);
    const beforeReadOnlyStep=session.metadata.workspacePreparation;
    stepFixture.output={status:'READY',document_id:'fixture-document',workflow_ref:nextRef,
      package_ref:{...packageRef,read_only:true}};
    const readOnlyStep=JSON.parse((await apply('step-read-only')).content[0].text);
    assert.equal(readOnlyStep.status,'NOT_APPLIED');
    assert.equal(readOnlyStep.error.message,packageReadOnlyAdvice);
    assert.equal(stepFixture.admissions.length,1,'native read-only refresh must not start Apply');
    assert.equal(session.metadata.workspacePreparation.state.package_ref.read_only,true);
    session.metadata.workspacePreparation=beforeReadOnlyStep;
    stepFixture=null;
    // LAB-450: prepare -> local profile/scan/sample/admit (no browser calls)
    // -> first sample-delivery observation after native connection loss.
    connection.Connected=false;form.FReconnecting=true;
    const firstDeliveryRead=runInNewContext(withStorageIdentity('async page=>page.deliveryRead()',session.metadata.storageBinding));
    assert.equal(await firstDeliveryRead(connectionPage),1);
    assert.equal(restores,1);assert.equal(deliveryReads,1);
    connectionPage=null;
    reloadedPage=new Page();reloadedPage.app.Version=compatibility.loginom_build;
    Object.assign(reloadedPage.location,{origin:'https://loginom.invalid',pathname:'/'});
    Object.assign(reloadedPage.context,{innerWidth:1000,innerHeight:800,outerWidth:1000,outerHeight:900,screen:{availWidth:1000,availHeight:900}});
    class PackageTreeNode {constructor(path){this.PackageFileName=path;}}
    let openedPackage=null,openedPath=null,openDialog=null;
    reloadedPage.app.PackageTreeNode=PackageTreeNode;
    reloadedPage.app.Application={FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{Node:{data:{node:openedPackage}}}})}},FMapTree:{FServerConnection:{UserName:'user'}}}}};
    reloadedPage.add('button','MF;TF-1;HomePage;btnCreateUnsavedPackage');
    reloadedPage.url=()=>config.loginomUrl;
    reloadedPage.evaluate=async(fn,args)=>{reloadedPage.context.args=args;return runInContext(`(${fn.toString()})(args)`,reloadedPage.context);};
    reloadedPage.locator=selector=>({isVisible:async()=>true,locator:()=>({isVisible:async()=>true,fill:async value=>{openedPath=value;}}),click:async()=>{
      reloadedPage.events.push(selector);
      if(selector.includes('btnOpenPackage')){
        const element=reloadedPage.add('div','OpenDialogForm');element.id='reloaded-open-picker';element.attrs.class='x-window';
        openDialog={$className:'bg.filedialog.view.OpenDialogForm',el:{dom:element},hidden:false};
        reloadedPage.context.Ext={getCmp:id=>id===element.id?openDialog:null};
      }
      if(selector.includes('OpenDialogForm;btnOpen')){
        openDialog.hidden=true;
        openedPackage=new PackageTreeNode(openedPath);
        for(const name of ['cmpDiagram','pnlWorkarea'])reloadedPage.add('div','MF;TF-1;ModelForm;'+name);
        for(const [i,label] of ['Server','Packages','Package','Module','Workflow'].entries())reloadedPage.add('div','MF;TF-1;cnrNaviMode;b.s_'+i,label);
      }
    }});
    const reopened=await client.callTool({name:'dock_prepare',arguments:{intent:'open_package',operation_id:'server-after-reload',package_path:'/user/existing.lgp'}});
    assert.notEqual(reopened.isError,true,JSON.stringify(reopened));
    const rebound=JSON.parse(reopened.content[0].text);
    assert.equal(rebound.prepared,true,JSON.stringify(rebound.workspace));assert.equal(rebound.workspace.status,'READY');
    assert.equal(rebound.workspace.package_ref.path,'/user/existing.lgp');
    assert.notEqual(rebound.workspace.document_id,'fixture-document');
    assert.equal(session.metadata.storageBinding.document_id,rebound.workspace.document_id);
    const afterPrepare=await client.callTool({name:'dock_node_apply',arguments:{...undescribed,
      document_id:rebound.workspace.document_id,workflow_ref:{workflow_id:rebound.workspace.workflow_ref.workflow_id}}});
    assert.equal(JSON.parse(afterPrepare.content[0].text).error.code,'NODE_TYPE_NOT_DESCRIBED');
    const refreshed=JSON.parse((await describe({node_types:['transform.sorting'],modes:['keys']})).content[0].text);
    assert.equal(refreshed.node_types[0].type,'transform.sorting');
    assert.equal(reloadedPage.events.filter(selector=>selector.includes('OpenDialogForm;btnOpen')).length,1);
    reloadedPage=null;
    const original=session.metadata.workspacePreparation.state;
    const reopen=reload=>reopenSaved({documentId:original.document_id,deadline:Date.now()+5000,reload});
    const browserBeforeReload=browserCalls.length;
    const originalAccount=original.loginom_account;
    original.loginom_account='other';
    assert.deepEqual(await reopen(),{reason:'ORIGINAL_WORKSPACE_UNVERIFIED'});
    original.loginom_account=originalAccount;
    const originalPackage=original.package_ref;
    original.package_ref={...originalPackage,persisted:false};
    assert.deepEqual(await reopen(),{reason:'ORIGINAL_SAVED_PATH_UNVERIFIED'});
    original.package_ref=originalPackage;
    assert.equal(browserCalls.length,browserBeforeReload);
    assert.deepEqual(reloadLogins,[]);

    const nativeOpened={...original,document_id:'fixture-reloaded-doc',
      package_ref:{...originalPackage,read_only:false}};
    for(const reply of [
      {...nativeOpened,document_id:original.document_id},
      {...nativeOpened,loginom_account:'other'},
      {...nativeOpened,package_ref:{...nativeOpened.package_ref,path:'/user/other.lgp'}},
      {...nativeOpened,package_ref:{...nativeOpened.package_ref,read_only:undefined}},
    ]){
      nativeReloadReply=reply;
      const before=browserCalls.length;
      assert.deepEqual(await reopen(),{reloaded:true,reason:'ORIGINAL_SAVED_PACKAGE_OPEN_UNVERIFIED'});
      assert.equal(browserCalls.length,before+1,'an invalid native Open must never observe the graph');
    }
    nativeReloadReply=nativeOpened;
    const beforeVerified=browserCalls.length;
    const verification=await reopen();
    assert.equal(verification.readOnly,false);
    assert.equal(verification.ref.document_id,nativeOpened.document_id);
    assert.deepEqual(verification.first,verification.second);
    assert.equal(browserCalls.length,beforeVerified+3,'one native Open and two reads');
    const reload={};
    loseReloadOpenReply=true;
    const beforeInterruptedOpen=browserCalls.length;
    await assert.rejects(reopen(reload),/Interrupted after the native Open gesture/);
    assert.equal(browserCalls.length,beforeInterruptedOpen+1);
    await reopen(reload);
    const [open,reconcile]=nativeReloadOpens.slice(-2);
    assert.equal(open.recoverOnly,false);
    assert.equal(reconcile.recoverOnly,true);
    assert.equal(reconcile.operationId,open.operationId);
    assert.equal(reconcile.packagePath,originalPackage.path);
    assert.equal(browserCalls.length,beforeInterruptedOpen+4,'reconcile and read twice without sending another Open');

    nativeReloadReply={...nativeOpened,effect_possible:false};
    const beforeDirty=browserCalls.length;
    modifiedReadbacks.push(true);
    assert.deepEqual(await reopen(),{reloaded:true,reason:'REOPENED_PACKAGE_DIRTY'});
    assert.equal(browserCalls.length,beforeDirty+2,'dirty package must stop after the first read');
    modifiedReadbacks.push(false,true);
    assert.deepEqual(await reopen(),{reloaded:true,reason:'REOPENED_PACKAGE_DIRTY'});
    modifiedReadbacks.push(null);
    assert.deepEqual(await reopen(),{reloaded:true,reason:'REOPENED_GRAPH_UNAVAILABLE'});
    for(const auth of reloadLogins){
      assert.equal(auth.origin,'https://loginom.invalid');
      assert.equal(auth.account,'user');
      assert.equal(auth.packagePath,originalPackage.path);
    }
    nativeReloadReply=null;
    original.package_ref={...originalPackage,read_only:true};
    const beforeReadOnly=browserCalls.length;
    for(const request of [
      {name:'dock_node_resume',arguments:{operation_id:'interrupted-node'}},
      {name:'dock_action_run',arguments:{operation_id:'readonly-save',action_key:'package.save_checkpoint'}},
    ]){
      const reply=JSON.parse((await client.callTool(request)).content[0].text);
      assert.equal(reply.error.code,'PACKAGE_READ_ONLY',JSON.stringify(reply));
      assert.equal(reply.effect_possible,false);
      const advice=request.name==='dock_action_run'?reply.output.user_action:reply.next_step.instruction;
      assert.equal(advice,packageReadOnlyAdvice);
    }
    assert.equal(browserCalls.length,beforeReadOnly);
    original.package_ref=originalPackage;

    const rejected=await client.callTool({name:'dock_action_describe',arguments:{action_key:'package.save_checkpoint',node_types:['imports.text','transform.join_data','exports.text']}});
    const failure=JSON.parse(rejected.content[0].text);
    assert.equal(failure.request_rejected,true);
    assert.equal(failure.next_step.tool,'dock_action_describe');
    const example=JSON.parse(/For example: (\{.*\})\./.exec(failure.next_step.instruction)[1]);
    const corrected=await client.callTool({name:'dock_action_describe',arguments:example});
    assert.notEqual(corrected.isError,true);
    const description=JSON.parse(corrected.content[0].text);
    assert.deepEqual(description.actions.map(a=>a.action_key),['package.save_checkpoint']);
    assert.deepEqual(description.node_types.map(n=>n.type),example.node_types);
    assert.equal(typeof bridge.prepareLocalPackage,'function');
    const callsBefore=browserCalls.length,metadataBefore=structuredClone(session.metadata);
    await assert.rejects(()=>bridge.prepareLocalPackage({intent:'open_package',operation_id:'local-package'},
      {artifactID:'foreign-artifact',uploadGrantID:'foreign-grant'},{signal:new AbortController().signal}),/not authorized|not admitted/);
    assert.equal(browserCalls.length,callsBefore);
    assert.deepEqual(session.metadata,metadataBefore);
    for(const argument of [{local_package_path:'/private/source.lgp'},{identityOnly:true},{packageArtifact:{artifactID:'fake'}}]){
      const spoofed=await client.callTool({name:'dock_prepare',arguments:{intent:'open_package',...argument}});
      assert.equal(spoofed.isError,true);assert.equal(browserCalls.length,callsBefore);
    }
    const sourcePath=join(directory,'package.lgp');await writeFile(sourcePath,'package bytes');
    const artifact=await session.artifactStore.admit({sourcePath,name:'local-copy.lgp',bytes:13,
      sha256:createHash('sha256').update('package bytes').digest('hex'),upload:{directory:'/user',overwrite:'reject'}});
    expectedPackage=artifact.upload.destination;expectedOperation='local-package';
    identityPage=new Page();identityPage.app.Version=compatibility.loginom_build;
    Object.assign(identityPage.location,{origin:'https://loginom.invalid',pathname:'/'});
    Object.assign(identityPage.context,{innerWidth:1000,innerHeight:800,
      __loginomDockPreparationV1:{document:identityPage.document,id:'fixture-document',receipts:new Map()}});
    identityPage.app.Application={FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>null}},
      FMapTree:{FServerConnection:{UserName:'user'}}}}};
    identityPage.url=()=>config.loginomUrl;
    identityPage.evaluate=async(fn,args)=>{identityPage.context.args=args;return runInContext(`(${fn.toString()})(args)`,identityPage.context);};
    identityPage.locator=()=>({isVisible:async()=>true});
    // #1272 waits for a settled Home/Files/workflow before binding identity.
    // A loading mask is pending; an unknown dialog must still refuse before upload.
    identityPage.add('button','MF;TF-1;HomePage;btnCreateUnsavedPackage');
    const mask=identityPage.add('div','preparation-blocker');mask.attrs.class='x-window';
    const refused=await bridge.prepareLocalPackage({intent:'open_package',operation_id:expectedOperation},
      {artifactID:artifact.artifact_id,uploadGrantID:artifact.upload.grant_id},{signal:new AbortController().signal});
    assert.equal(packageDeliveries.length,0,'identity refusal must precede upload');
    assert.equal(session.metadata.workspaceReady,false);
    assert.equal(session.metadata.workspacePreparation.operation_id,expectedOperation);
    assert.equal(session.metadata.workspacePreparation.effect_possible,false,'verified identity refusal must settle without an effect');
    assert.equal(session.metadata.workspacePreparation.state.reason,'STORAGE_IDENTITY_UNAVAILABLE');
    assert.equal(session.metadata.workspacePreparation.state.created_draft,false);
    assert.equal(JSON.parse(refused.content[0].text).prepared,false);
    assert.equal(bridge.hasActiveWork(),false);assert.equal(bridge.hasUnsettledWork(),false);
    mask.remove();
    const local=await bridge.prepareLocalPackage({intent:'open_package',operation_id:expectedOperation},
      {artifactID:artifact.artifact_id,uploadGrantID:artifact.upload.grant_id},{signal:new AbortController().signal});
    assert.notEqual(local.isError,true,JSON.stringify(local));
    const opened=JSON.parse(local.content[0].text);
    assert.equal(packageDeliveries.length,1);assert.equal(packageDeliveries[0].artifact_id,artifact.artifact_id);
    assert.equal(packageDeliveries[0].upload_grant_id,artifact.upload.grant_id);
    assert.equal(opened.prepared,true);assert.equal(opened.workspace.operation_id,expectedOperation);
    assert.equal(opened.workspace.package_ref.path,expectedPackage);
    assert.equal(session.metadata.workspaceReady,true);
    assert.equal(opened.local_package_upload.source_sha256,artifact.sha256);
    openFailure={effect_possible:false};expectedOperation='failed-open';
    const failed=await bridge.prepareLocalPackage({intent:'open_package',operation_id:expectedOperation},
      {artifactID:artifact.artifact_id,uploadGrantID:artifact.upload.grant_id},{signal:new AbortController().signal});
    assert.equal(failed.isError,true,JSON.stringify(failed));
    const openRefusal=JSON.parse(failed.content[0].text);
    assert.deepEqual(openRefusal.next_step.arguments,{intent:'open_package',operation_id:expectedOperation,package_path:expectedPackage});
    assert.equal(session.metadata.workspaceReady,false);
    assert.equal(session.metadata.workspacePreparation.state.trace[0].blocking_windows.windows[0].message_box.text,'[redacted]');
    const deliveriesBefore=packageDeliveries.length;
    expectedPackageReadOnly=true;
    const resumed=await client.callTool({name:openRefusal.next_step.tool,arguments:openRefusal.next_step.arguments});
    expectedPackageReadOnly=false;
    assert.notEqual(resumed.isError,true,JSON.stringify(resumed));
    const readOnlyOpen=JSON.parse(resumed.content[0].text);
    assert.equal(readOnlyOpen.prepared,true);
    assert.equal(readOnlyOpen.workspace.package_ref.read_only,true);
    const advice=readOnlyOpen.next_step.instruction;
    assert.equal(advice,packageReadOnlyAdvice);
    assert.ok(advice.includes('package.save_as'));
    assert.ok(advice.includes('workspace.package_ref.read_only'));
    assert.equal(packageDeliveries.length,deliveriesBefore,'server-path continuation must not upload again');
    const opening=browserCalls.filter(call=>call.arguments.code.includes('async function prepareWorkspace(')).at(-1);
    assert.match(opening.arguments.code,/"recoverOnly":false/);
    openFailure={effect_possible:true};expectedOperation='uncertain-open';
    const uncertain=await bridge.prepareLocalPackage({intent:'open_package',operation_id:expectedOperation},
      {artifactID:artifact.artifact_id,uploadGrantID:artifact.upload.grant_id},{signal:new AbortController().signal});
    assert.equal(uncertain.isError,true);
    const continuation=JSON.parse(uncertain.content[0].text).next_step;
    const reconciled=await client.callTool({name:continuation.tool,arguments:continuation.arguments});
    assert.notEqual(reconciled.isError,true,JSON.stringify(reconciled));
    const reconcileCode=browserCalls.filter(call=>call.arguments.code.includes('async function prepareWorkspace(')).at(-1).arguments.code;
    assert.match(reconcileCode,/"recoverOnly":true/);
    assert.equal(packageDeliveries.length,deliveriesBefore+1);
    deliveryAbort=new AbortController();const cancelledSignal=deliveryAbort.signal;expectedOperation='cancel-before-open';
    const opensBefore=browserCalls.filter(call=>call.arguments.code.includes('async function prepareWorkspace(')&&!call.arguments.code.includes('"identityOnly":true')).length;
    const cancelled=await bridge.prepareLocalPackage({intent:'open_package',operation_id:expectedOperation},
      {artifactID:artifact.artifact_id,uploadGrantID:artifact.upload.grant_id},{signal:cancelledSignal});
    assert.equal(cancelled.isError,true);
    assert.equal(session.metadata.workspacePreparation.effect_possible,false);
    assert.equal(browserCalls.filter(call=>call.arguments.code.includes('async function prepareWorkspace(')&&!call.arguments.code.includes('"identityOnly":true')).length,opensBefore);
    const afterCancel=JSON.parse(cancelled.content[0].text).next_step;
    assert.notEqual((await client.callTool({name:afterCancel.tool,arguments:afterCancel.arguments})).isError,true);
    unconfirmedUpload=true;expectedOperation='unknown-upload';
    const callsBeforeUnknown=browserCalls.filter(call=>call.arguments.code.includes('async function prepareWorkspace(')&&!call.arguments.code.includes('"identityOnly":true')).length;
    const unknown=await bridge.prepareLocalPackage({intent:'open_package',operation_id:expectedOperation},
      {artifactID:artifact.artifact_id,uploadGrantID:artifact.upload.grant_id},{signal:new AbortController().signal});
    assert.equal(unknown.isError,true);assert.doesNotMatch(JSON.stringify(unknown),/next_step|package_path/);
    assert.equal(session.metadata.workspaceReady,false);
    assert.equal(browserCalls.filter(call=>call.arguments.code.includes('async function prepareWorkspace(')&&!call.arguments.code.includes('"identityOnly":true')).length,callsBeforeUnknown);
    identityPage.document.body.append(mask);
    for(const fault of ['missing_effect','effectful','created_draft','transport']){
      identityFault=fault;
      const isolatedSession={...session,metadata:{client:'unit-test',clientRevision:'d'.repeat(64),sessionId:'identity-'+fault}};
      const isolated=await createBridge(config,isolatedSession);
      try{
        const operation_id='uncertain-'+fault,deliveriesBefore=packageDeliveries.length;
        const args={intent:'open_package',operation_id},pair={artifactID:artifact.artifact_id,uploadGrantID:artifact.upload.grant_id};
        const refused=await isolated.prepareLocalPackage(args,pair,{signal:new AbortController().signal});
        assert.equal(refused.isError,true,fault);
        assert.equal(packageDeliveries.length,deliveriesBefore,fault);
        assert.equal(isolatedSession.metadata.workspaceReady,false);
        assert.equal(isolatedSession.metadata.workspacePreparation.operation_id,operation_id);
        assert.equal(isolatedSession.metadata.workspacePreparation.effect_possible,true,fault);
        assert.equal(isolatedSession.metadata.workspacePreparation.state,undefined,fault);
        const callsBefore=browserCalls.length;
        const repeated=await isolated.prepareLocalPackage(args,pair,{signal:new AbortController().signal});
        assert.equal(repeated.isError,true);assert.match(repeated.content[0].text,/Reconcile the original/);
        const replaced=await isolated.prepareLocalPackage({...args,operation_id:operation_id+'-new'},pair,{signal:new AbortController().signal});
        assert.equal(replaced.isError,true);assert.match(replaced.content[0].text,/operation conflict/);
        assert.equal(browserCalls.length,callsBefore,'uncertain preparation must not repeat identity or upload');
        assert.equal(packageDeliveries.length,deliveriesBefore);
      }finally{await isolated.close();}
    }
  } finally { await client.close(); await bridge.close(); }
});
