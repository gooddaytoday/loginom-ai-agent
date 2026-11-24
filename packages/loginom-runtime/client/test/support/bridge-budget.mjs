import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createArtifactStore} from '../../lib/artifacts.mjs';
import {javascriptParametersSchema} from '../../lib/node-api.mjs';
import {describeJavascriptKnowledge} from '../../lib/javascript-knowledge.mjs';
import {createBundledSkillFixture} from './bundled-skill-fixture.mjs';
import {createActionCatalogFixture} from './action-catalog-fixture.mjs';
import {userResultSchema} from '../../lib/user-results.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';

// Real bridge, factories, bundled skill, MCP Server/Client and schemas; only
// external catalog delivery and browser transport are simulated. No browser/model is run.
test('user-v1 final reply budgets and prepare knowledge admission over real MCP',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'loginom-bridge-budget-'));
 const resources=await createBundledSkillFixture(t);
 const platform={darwin:'macos',linux:'linux',win32:'windows'}[process.platform];
 const compatibility={profile_id:`loginom-7.4.2-${platform}-chromium-ru`,loginom_build:'7.4.2',platform,browser:'chromium'};
 const catalog=await createActionCatalogFixture(compatibility);
 const openPackage=process.env.LOGINOM_TEST_OPEN_PACKAGE==='1';
 const threeFiles=process.env.LOGINOM_TEST_THREE_FILES;
 const sevenFiles=process.env.LOGINOM_TEST_SEVEN_FILES==='1';
 const smoothingHp=process.env.LOGINOM_TEST_SMOOTHING_HP==='1',fullWorkspace=openPackage||smoothingHp||sevenFiles;
 const describeBatch=process.env.LOGINOM_TEST_DESCRIBE_BATCH==='1',applied=[];
 const account=(smoothingHp?'lab111-3-reviewer-':'lab-66-monkey-')+'a'.repeat(36),documentId='d'.repeat(36),operationId=smoothingHp?'prepare':'o'.repeat(36);
 let packageArtifact;
 const workflow=()=>({tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-2',prefix:'MF;TF-2',
  navigation_path:['Сервер','Пакеты',(smoothingHp||sevenFiles?'Package1':packageArtifact.name.replace(/[.-]/g,'_')),'Модуль1','Сценарий'].map((label,index,labels)=>({
   tid:'MF;TF-2;cnrNaviMode;b.s_'+labels.slice(0,index+1).join('>'),label:index===0?'':label})),workflow_id:documentId+'-1'});
 let browserCalls=0,prepareDebug=false;
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
   if(fullWorkspace){
   const value=code.includes('"identityOnly":true')?{status:'BOUND',target:compatibility,authenticated:true,
      created_draft:false,effect_possible:false,document_id:documentId,loginom_account:account,target_verified:true}
     :code.includes('async function prepareWorkspace(')?{status:'READY',reason:null,phase:'exact_workflow_ready',target:compatibility,
      authenticated:true,created_draft:smoothingHp||sevenFiles,effect_possible:true,operation_id:operationId,session_id:'s'.repeat(36),
      trace:['ui_build','login_or_workspace','workspace_entry_ready','package_menu_ready','open_package_dialog','exact_workflow_ready']
       .map(condition=>({condition,satisfied:true})),document_id:documentId,loginom_account:account,workflow_ref:workflow(),
      package_ref:smoothingHp||sevenFiles?{path:null,name:'Package1',persisted:false}:{path:packageArtifact.upload.destination,name:packageArtifact.name.replace(/[.-]/g,'_'),persisted:true},
      preserved_workflows:[],ownership_verified:false,target_verified:true,interaction_readiness:'driver_verification_required',
      window:{width:1280,height:800,outer_width:1280,outer_height:800,available_width:1280,available_height:800}}
     :{version:1,source:'prepare_same_browser_page',session_id:'s'.repeat(36),operation_id:operationId,document_id:documentId,
      runtime_revision:'r'.repeat(64),manifest_sha256:catalog.manifestSha256,workflow_ref:workflow(),
      observed_at:'2026-11-06T00:00:00.000Z',viewport:{width:1280,height:800},observed:{document_id:documentId}};
    return {content:[{type:'text',text:JSON.stringify(value)}]};
   }
   const value=code.includes('async function prepareWorkspace(')?{status:'READY',target:compatibility,
     operation_id:'prepare',
     authenticated:true,created_draft:true,effect_possible:true,target_verified:true,loginom_account:'protocol-fixture',
     ...(prepareDebug?{trace:[{condition:'exact_workflow_ready',satisfied:true,blocking_windows:{windows:[{tid:'native-loading',class_name:'x'.repeat(12000)}]}}]}:{}),
     document_id:'fixture-document',package_ref:{path:null,persisted:false},workflow_ref:{workflow_id:'fixture-workflow',
       tab_tid:'fixture-tab',prefix:'fixture-prefix',navigation_path:[{tid:'fixture-scenario',label:'Fixture scenario'}]}}
    :code.includes('async function observeGeometry(')?{version:1,source:'prepare_same_browser_page',observed:{document_id:'fixture-document',...(prepareDebug?{debug:'x'.repeat(12000)}:{})},fixture:true}
      :assert.fail('Unexpected browser operation');
   return {content:[{type:'text',text:JSON.stringify(value)}]};
  }
 }
 class ExternalTransport {}
 // Supply a completed worker receipt upstream of the real bridge/reply/budget
 // path. Neither the production serializer nor its schema validation is mocked.
 const worker={operation_id:'large-worker',attempt:1,state:'settled',outcome:{status:'SUCCEEDED',effect_possible:true,
  cleanup_complete:true,action_key:'node.apply',phase:'read',output:{configuration:{verified:true,readback:{kind:'javascript'}},
   output:{status:'complete',ports:[{port:0,schema:[{index:0,name:'Value',label:'Value',type:'string'}],row_count:1,
    sample_rows:1,sample_complete:true,sample:[[{type:'string',is_null:false,value:'x'.repeat(24000),precision:'source_text'}]]}]}}}};
 const nodeApi=await import('../../lib/node-api.mjs');
 mock.module('../../lib/node-api.mjs',{namedExports:{...nodeApi,
  dispatchNodeApi:async(runtime,name,args,options)=>['dock_node_wait','dock_node_status'].includes(name)
   ?worker:describeBatch&&name==='dock_node_apply'
     ?(applied.push(args),{...worker,operation_id:args.operation_id}):nodeApi.dispatchNodeApi(runtime,name,args,options)}});
 const inspection={operation_id:worker.operation_id,status:'SUCCEEDED',action_key:'operation.inspect',effect_possible:false,
  output:{state:'resolved',cleanup_confirmed:true,effect_state:'verified',outcome:worker.outcome}};
 const executor=await import('../../lib/executor.mjs');
 mock.module('../../lib/executor.mjs',{namedExports:{...executor,createActionRuntime:options=>{
  const runtime=executor.createActionRuntime(options);
  return {...runtime,inspect:async args=>args.operationId===worker.operation_id?inspection:runtime.inspect(args),
  ...(openPackage?{async deliverPackageArtifact(request){
   const artifact=options.artifactStore.getUploadGrant(request.artifact_id,request.upload_grant_id);
   return {outcome:{status:'SUCCEEDED',artifact_id:artifact.artifact_id,destination:artifact.upload.destination,bytes:artifact.bytes,
    bytes_source:'native_file_store',upload_completion_verified:true,load_count:3,
    files_entry:{document_id:documentId,tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb',directory:'/'+account},
    source_sha256:artifact.sha256,cleanup_complete:true}};
  }}:{})};}}});
 mock.module('@modelcontextprotocol/sdk/client/index.js',{namedExports:{Client:ExternalClient}});
 mock.module('@modelcontextprotocol/sdk/client/stdio.js',{namedExports:{StdioClientTransport:ExternalTransport,getDefaultEnvironment:()=>({})}});
 mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js',{namedExports:{StreamableHTTPClientTransport:ExternalTransport}});
 const {createBridge}=await import('../../lib/bridge.mjs');
 let bridge,client;
 try{
  const session={directory,browserCli:'/unit/browser.mjs',browserConfig:'/unit/browser.json',browserRoot:'/unit/browser',
    metadata:{client:'unit',clientRevision:'d'.repeat(64),sessionId:fullWorkspace?'s'.repeat(36):'protocol-budget-session'},async save(){},
    artifactStore:await createArtifactStore({directory:join(directory,'input')})};
  bridge=await createBridge({resources:resources.resources,actionManifestUri:catalog.manifestUri,actionManifestSha256:catalog.manifestSha256,
    endpoint:'http://memory.invalid/mcp',apiKey:'UNIT_NONSECRET',loginomUrl:'http://loginom.test/app/',
    mode:'executor-replay',resultProfile:'user-v1',stateDir:directory,
    ...(fullWorkspace||threeFiles?{storageDirectories:{inputs:'/'+account,packages:'/'+account,exports:'/'+account}}:{})},session);
  client=new Client({name:'budget-protocol-client',version:'1'});
  const [agentTransport,bridgeTransport]=InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(agentTransport),bridge.server.connect(bridgeTransport)]);
  const call=(name,args={})=>client.callTool({name,arguments:args});
  const parse=reply=>JSON.parse(reply.content[0].text);
  const size=reply=>Buffer.byteLength(JSON.stringify(reply));
  const inventory=await call('dock_action_describe');
  assert.ok(parse(inventory).available_node_types.includes('programming.javascript'));
  assert.equal(browserCalls,0);

  if(describeBatch){
   const prepared=parse(await call('dock_prepare'));
   assert.equal(prepared.prepared,true);
   const before=browserCalls;
   const apply=type=>call('dock_node_apply',{operation_id:'apply-'+applied.length,contract_revision:'1.0.0',
    document_id:'fixture-document',workflow_ref:{workflow_id:'fixture-workflow'},target:{kind:'new',type},
    inputs:[],mode:type==='transform.sorting'?'keys':'expression',parameters:{},finish:'execute'});
   await call('dock_action_describe',{node_types:['transform.sorting'],modes:['keys']});
   assert.equal(parse(await apply('transform.sorting')).status,'SUCCEEDED');
   assert.equal(applied.length,1);
   const args={node_types:['imports.text','programming.javascript','integration.rest_request','transform.calculator'],
    modes:['delimited','script','request','expression']};
   const refused=await call('dock_action_describe',args);
   assert.equal(refused.isError,true);
   assert.equal(parse(refused).error.code,'USER_RESPONSE_BUDGET');
   assert.equal(parse(await apply('transform.calculator')).error.code,'NODE_TYPE_NOT_DESCRIBED');
   assert.equal(applied.length,1,'refused cards must not authorize node application');
   assert.equal(parse(await apply('transform.sorting')).status,'SUCCEEDED');
   assert.equal(applied.length,2,'earlier descriptions survive a later delivery refusal');
   const next=parse(refused).next_step;
   assert.deepEqual([next.arguments,...next.remaining_requests],args.node_types.map((type,index)=>({node_types:[type],modes:[args.modes[index]]})));
   for(const request of [next.arguments,...next.remaining_requests]){
    const delivered=await call(next.tool,request);
    assert.notEqual(delivered.isError,true,JSON.stringify(delivered));
    assert.ok(size(delivered)<=46000);
    assert.equal(parse(delivered).node_types[0].type,request.node_types[0]);
    assert.ok(parse(delivered).node_types[0].parameter_schema);
    assert.ok(parse(delivered).node_types[0].guidance);
   }
   assert.equal(parse(await apply('transform.calculator')).status,'SUCCEEDED');
   assert.equal(applied.length,3);
   assert.equal(browserCalls,before);
   return;
  }

  if(sevenFiles){
   const sourcePath=join(directory,'source.csv');await writeFile(sourcePath,'Branch,Amount\nA,1\n');
   for(let index=1;index<=7;index++)await session.artifactStore.admit({sourcePath,
    name:'a'.repeat(64)+'-'+index+'-branch-0'+index+'.csv',bytes:18,
    sha256:createHash('sha256').update('Branch,Amount\nA,1\n').digest('hex'),upload:{directory:'/'+account,overwrite:'reject'}});
   const prepared=await call('dock_prepare',{intent:'new_draft',operation_id:operationId});
   const diagnosticPath=join(directory,'diagnostics',createHash('sha256').update('dock:'+session.metadata.sessionId).digest('hex'),'events.jsonl');
   const retained=JSON.parse((await readFile(diagnosticPath,'utf8')).trim().split('\n')[0]).result;
   t.diagnostic('seven-file full prepare envelope bytes: '+size({content:[{type:'text',text:JSON.stringify(retained)}]}));
   t.diagnostic('seven-file prepare envelope bytes: '+size(prepared));
   assert.notEqual(prepared.isError,true,JSON.stringify(prepared));
   const delivered=parse(prepared);
   assert.equal(delivered.prepared,true);assert.equal(delivered.workspace.status,'READY');
   assert.equal(delivered.workspace.operation_id,operationId);
   assert.equal(delivered.workspace.document_id,documentId);
   assert.deepEqual(delivered.input_artifacts,session.artifactStore.list());
   assert.ok(size(prepared)<=46000);
   assert.deepEqual(delivered.knowledge.node_types.map(node=>node.type),retained.knowledge.node_types.map(node=>node.type));
   assert.equal(delivered.next_step.tool,'dock_action_describe');
   assert.ok(retained.knowledge.node_types.some(node=>node.limitations?.length));
   for(const node of delivered.knowledge.node_types){
    const full=retained.knowledge.node_types.find(item=>item.type===node.type);
    assert.deepEqual(node.modes,full.modes);
    assert.equal(node.candidate_node_apply_available,full.candidate_node_apply_available);
   }
   const described=parse(await call('dock_action_describe',{node_types:['imports.text'],modes:['delimited']}));
   assert.ok(described.node_types[0].parameter_schema);
   const reused=await call('dock_prepare',{intent:'new_draft',operation_id:operationId});
   assert.notEqual(reused.isError,true);assert.equal(parse(reused).knowledge.reused,true);
   assert.equal(parse(reused).workspace.document_id,documentId);
   return;
  }

  if(threeFiles||smoothingHp){
   const root=new URL('../../../../../',import.meta.url);
   const data=new URL(smoothingHp?'docs/node-development/nodes/preprocessing-smoothing/acceptance/data/':threeFiles==='s4'
    ?'docs/testing/loginom-ai-agent/demo-2026-10-22/s4-branches/data/'
    :'docs/node-development/nodes/union/acceptance/union-auto-match/data/',root);
   const names=smoothingHp?['series.csv','update.csv']:threeFiles==='s4'?['central.csv','north.csv','south.csv']:['main.csv','second.csv','third.csv'];
   const inputs=await Promise.all(names.map(async(name,index)=>{
    const sourcePath=new URL(name,data).pathname,buffer=await readFile(sourcePath);
    return session.artifactStore.admit({sourcePath,name:'a'.repeat(64)+'-'+index+'-'+name,bytes:buffer.length,
     sha256:createHash('sha256').update(buffer).digest('hex'),upload:{directory:'/'+account,overwrite:'reject'}});
   }));
   const prepared=await call('dock_prepare'),delivered=parse(prepared);
   t.diagnostic((smoothingHp?'smoothing-hp':threeFiles)+' prepare envelope bytes: '+size(prepared));
   assert.notEqual(prepared.isError,true,JSON.stringify(prepared));
   assert.ok(size(prepared)<=(smoothingHp?46000:43000),smoothingHp?'HP two-file prepare must fit its unchanged wire budget':'three-file prepare must leave at least 3000 bytes of wire headroom');
   assert.deepEqual(delivered.input_artifacts,session.artifactStore.list());
   for(const input of inputs)assert.deepEqual(delivered.input_artifacts.find(item=>item.artifact_id===input.artifact_id),input);
   const diagnosticPath=join(directory,'diagnostics',createHash('sha256').update('dock:'+session.metadata.sessionId).digest('hex'),'events.jsonl');
   const retained=JSON.parse((await readFile(diagnosticPath,'utf8')).trim().split('\n')[0]).result;
   assert.deepEqual(delivered.knowledge,retained.knowledge);
   assert.ok(delivered.knowledge.session_manifest.actionManifestDigest);
   for(const node of delivered.knowledge.node_types){
    assert.equal(node.cache_key,undefined);
    const described=parse(await call('dock_action_describe',{node_types:[node.type]})).node_types[0];
    assert.match(described.cache_key,/^[a-f0-9]{64}$/);
    for(const key of Object.keys(node)){
     // Prepare retains its compact limitations; describe routes details to the
     // verified reference without duplicating the diagnostic knowledge asset.
     const expected=node.type==='programming.javascript'&&key==='limitations'
      ?describeJavascriptKnowledge('7.4.2').limitations:described[key];
     assert.deepEqual(node[key],expected,node.type+': '+key);
    }
   }
   const imported=parse(await call('dock_action_describe',{node_types:['imports.text']})).node_types[0];
   assert.ok(imported.parameter_schema);
   return;
  }

  if(openPackage){
   // Local package and CSV names have the same host-admission lengths as a
   // seeded 72-node package. Browser/upload boundaries are fixtures; preparation,
   // first knowledge bundle, local retention and final budget are production code.
   const sourcePath=join(directory,'source');await writeFile(sourcePath,'fixture');
   const artifacts=await Promise.all(['pressure.lgp','customers.csv'].map(name=>session.artifactStore.admit({sourcePath,
    name:'a'.repeat(64)+'-0-'+name,bytes:7,sha256:createHash('sha256').update('fixture').digest('hex'),
    upload:{directory:'/'+account,overwrite:'reject'}})));
   packageArtifact=artifacts[0];
   const prepared=await bridge.prepareLocalPackage({intent:'open_package',operation_id:operationId},
    {artifactID:packageArtifact.artifact_id,uploadGrantID:packageArtifact.upload.grant_id},{signal:new AbortController().signal});
   const diagnosticPath=join(directory,'diagnostics',createHash('sha256').update('dock:'+session.metadata.sessionId).digest('hex'),'events.jsonl');
   const retained=JSON.parse((await readFile(diagnosticPath,'utf8')).trim().split('\n')[0]).result;
   const original=structuredClone(retained);
   for(const step of original.workspace.trace)delete step.blocking_windows;
   delete original.workspace.browser_geometry.observed;
   t.diagnostic('previous open_package envelope bytes: '+size({content:[{type:'text',text:JSON.stringify(original)}]}));
   assert.notEqual(prepared.isError,true,JSON.stringify(prepared));
   assert.ok(size(prepared)<=46000);
   const delivered=parse(prepared);
   assert.equal(delivered.prepared,true);assert.equal(delivered.workspace.operation_id,operationId);
   assert.deepEqual(delivered.workspace.workflow_ref,retained.workspace.workflow_ref);
   assert.deepEqual(delivered.workspace.package_ref,retained.workspace.package_ref);
   assert.deepEqual(delivered.knowledge,retained.knowledge);
   assert.deepEqual(delivered.input_artifacts,retained.input_artifacts);
   assert.deepEqual(delivered.local_package_upload,retained.local_package_upload);
   assert.equal(delivered.workspace.browser_geometry,undefined);
   assert.deepEqual(retained.workspace.browser_geometry.workflow_ref,retained.workspace.workflow_ref);
   assert.equal(retained.workspace.browser_geometry.observed.document_id,documentId);
   assert.deepEqual(session.metadata.workspacePreparation.state.browser_geometry,retained.workspace.browser_geometry);
   const reused=await call('dock_prepare',{intent:'open_package',operation_id:operationId,package_path:packageArtifact.upload.destination});
   assert.notEqual(reused.isError,true);assert.equal(parse(reused).knowledge.reused,true);
   assert.equal(parse(reused).workspace.browser_geometry,undefined);
   return;
  }

  // Real admitted inputs overflow the first prepare reply. Removing those
  // unpublished inputs permits delivery without changing the pinned skill.
  const sourcePath=join(directory,'source.csv');await writeFile(sourcePath,'fixture');
  const artifacts=await Promise.all(Array.from({length:128},(_,index)=>session.artifactStore.admit({
    sourcePath,name:'input-'+index+'-'+ 'x'.repeat(180)+'.csv',bytes:7,
    sha256:createHash('sha256').update('fixture').digest('hex')})));
  const refusedPrepare=await call('dock_prepare');
  assert.equal(refusedPrepare.isError,true);assert.equal(parse(refusedPrepare).result_delivery,'refused');
  assert.ok(size(refusedPrepare)<2000);
  assert.equal(parse(refusedPrepare).original_operation_id,'prepare');
  assert.deepEqual(parse(refusedPrepare).next_step.arguments,{operation_id:'prepare'});
  assert.match(parse(refusedPrepare).next_step.instruction,/without the input artifact list or knowledge bundle/);
  const beforeInspect=browserCalls,preparationBefore=structuredClone(session.metadata.workspacePreparation);
  const receipt=await call('dock_operation_inspect',{operation_id:'prepare'});
  assert.notEqual(receipt.isError,true,JSON.stringify(receipt));assert.ok(size(receipt)<=46000);
  assert.equal(parse(receipt).phase,'retained_preparation_receipt');
  assert.deepEqual(parse(receipt).output.receipt,preparationBefore.state);
  assert.equal(parse(receipt).effect_possible,false);
  assert.equal(browserCalls,beforeInspect);
  assert.deepEqual(session.metadata.workspacePreparation,preparationBefore);
  session.metadata.workspacePreparation.state.operation_id='foreign-preparation';
  const foreignReceipt=parse(await call('dock_operation_inspect',{operation_id:'prepare'}));
  assert.equal(foreignReceipt.status,'FAILED');assert.equal(foreignReceipt.request_rejected,true);
  session.metadata.workspacePreparation=preparationBefore;
  await session.artifactStore.discardUnpublished(artifacts.map(artifact=>artifact.artifact_id));
  prepareDebug=true;
  const prepared=await call('dock_prepare'),full=parse(prepared);
  assert.notEqual(prepared.isError,true);assert.equal(full.prepared,true);assert.equal(full.knowledge.version,'user-v1');
  assert.ok(full.knowledge.node_types.some(node=>node.type==='programming.javascript'));assert.equal(full.knowledge.reused,undefined);
  const preparedJs=full.knowledge.node_types.find(node=>node.type==='programming.javascript');
  // Knowledge revisions append limitations; check presence, not position.
  assert.ok(preparedJs.limitations.some(text=>/ASCII Name.*DisplayName.*schema\/readback/.test(text)));
  assert.ok(preparedJs.limitations.some(text=>/integer\/real\/datetime data_kind=Непрерывный/.test(text)));
  assert.ok(preparedJs.limitations.some(text=>/DataType\.Float/.test(text)));
  assert.ok(size(prepared)<=46000);assert.equal(Object.hasOwn(full,'instructions'),false);
  assert.equal(full.source,'bundled');assert.match(full.skillRevision,/^[a-f0-9]{64}$/);
  assert.deepEqual(full.workspace.trace,[{condition:'exact_workflow_ready',satisfied:true}]);
  assert.equal(full.workspace.browser_geometry.observed,undefined);
  assert.match(client.getInstructions(),/activate.*loginom-automation/i);
  const revision=full.skillRevision;
  const reused=await call('dock_prepare');assert.equal(parse(reused).knowledge.reused,true);
  assert.equal(parse(reused).instructions,undefined);assert.ok(size(reused)<=46000);

  const before=browserCalls;
  const single=await call('dock_action_describe',{node_types:['programming.javascript']});
  assert.notEqual(single.isError,true);assert.ok(size(single)<=20000);
  const js=parse(single).node_types[0];assert.deepEqual(js.parameter_schema,javascriptParametersSchema);
  assert.equal(js.validated_for.loginom_build,'7.4.2');
  assert.equal(js.javascript_knowledge,undefined);
  assert.equal(js.knowledge_reference,'references/nodes/programming.javascript.md');
  assert.equal(js.knowledge_sha256,preparedJs.knowledge_sha256);
  const guided=parse(await call('dock_action_describe',{node_types:['programming.javascript'],modes:['script']})).node_types[0];
  assert.ok(Buffer.byteLength(JSON.stringify(guided))<=12000);
  assert.match(guided.guidance,/DataType\.Float/);
  assert.match(guided.guidance,/OutputTable\.AssignColumns/);
  assert.match(guided.guidance,/Сумма→Summa/);
  assert.equal(js.session_manifest.skillRevision,revision);assert.equal(js.knowledge_sha256.length,64);
  const waitTool=(await client.listTools()).tools.find(tool=>tool.name==='dock_node_wait');
  assert.deepEqual(waitTool.outputSchema,userResultSchema);
  const beforeWorker=JSON.stringify(worker),wait=await call('dock_node_wait',{operation_id:worker.operation_id});
  assert.notEqual(wait.isError,true);
  assert.ok(size(wait)<=46000);
  assert.equal(parse(wait).output.ports[0].sample[0][0].value,'x'.repeat(24000));
  const expectedMetadata=structuredClone(parse(wait));delete expectedMetadata.output.ports;
  assert.deepEqual(wait.structuredContent,expectedMetadata);
  assert.equal(new AjvJsonSchemaValidator().getValidator(waitTool.outputSchema)(wait.structuredContent).valid,true);
  assert.equal(JSON.stringify(worker),beforeWorker);
  const diagnosticPath=join(directory,'diagnostics',createHash('sha256').update('dock:'+session.metadata.sessionId).digest('hex'),'events.jsonl');
  const logged=(await readFile(diagnosticPath,'utf8')).trim().split('\n').map(JSON.parse)
   .find(event=>event.tool_name==='dock_node_wait');
  assert.deepEqual(logged.result,worker);
  const preparation=(await readFile(diagnosticPath,'utf8')).trim().split('\n').map(JSON.parse)
   .find(event=>event.tool_name==='dock_prepare'&&event.result.workspace?.trace);
  assert.equal(preparation.result.workspace.trace[0].blocking_windows.windows[0].class_name.length,12000);
  assert.equal(preparation.result.workspace.browser_geometry.observed.debug.length,12000);
  const status=await call('dock_node_status',{operation_id:worker.operation_id});
  assert.notEqual(status.isError,true);assert.ok(size(status)<=46000);
  assert.equal(parse(status).status,'SUCCEEDED');assert.equal(parse(status).output.ports[0].sample_rows,0);
  const retainedInspection=JSON.stringify(inspection);
  const inspected=await call('dock_operation_inspect',{operation_id:worker.operation_id});
  assert.notEqual(inspected.isError,true);assert.ok(size(inspected)<=46000);
  const original=parse(inspected).output;
  assert.equal(original.state,'resolved');assert.equal(original.cleanup_confirmed,true);assert.equal(original.outcome.status,'SUCCEEDED');
  assert.equal(original.outcome.output.output.ports[0].sample_rows,1);
  // Now both status and inspection must shrink a cell larger than a single-copy envelope.
  worker.outcome.output.output.ports[0].sample[0][0].value='"'.repeat(24000);
  const oversizedWorker=JSON.stringify(worker),oversizedInspection=JSON.stringify(inspection);
  for(const tool of ['dock_node_wait','dock_node_status','dock_operation_inspect']){
   const bounded=await call(tool,{operation_id:worker.operation_id});assert.notEqual(bounded.isError,true);assert.ok(size(bounded)<=46000);
   const output=tool==='dock_operation_inspect'?parse(bounded).output.outcome.output:parse(bounded);
   assert.equal(output.output.ports[0].sample_rows,0);assert.equal(output.output.ports[0].sample_complete,false);
   assert.deepEqual(output.configuration,worker.outcome.output.configuration);
  }
  assert.equal(JSON.stringify(worker),oversizedWorker);assert.equal(JSON.stringify(inspection),oversizedInspection);
  assert.notEqual(retainedInspection,oversizedInspection);
  const all=await call('dock_action_describe',{node_types:[...parse(inventory).available_node_types.filter(t=>t!=='programming.javascript').slice(0,31),'programming.javascript']});
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
