import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
process.umask(0o077);
const [resourcesPath,configPath,outputPath]=process.argv.slice(2);
const dir=resolve(outputPath)+'/';await fs.mkdir(dir,{recursive:true});
const root=resolve(resourcesPath)+'/';
const load=n=>import(pathToFileURL(root+'runtime/'+n));
const cfg=JSON.parse(await fs.readFile(configPath)).loginom;
const {verifyResources}=await load('src/resources.mjs'),resources=await verifyResources(root);
const {loginBrowser}=await load('src/connection-check.mjs');
const {makeWorkspacePrepareCode}=await load('client/lib/workspace.mjs');const {makePackageCleanupCode}=await load('client/lib/package-cleanup.mjs');
const {createActionRuntime}=await load('client/lib/executor.mjs');const {createCandidateNodeSupport}=await load('client/lib/node-support.mjs');
const {createNodeTargetBrowserAdapter}=await load('client/lib/node-target-browser.mjs');const {prepareNodeTarget}=await load('client/lib/node-target.mjs');
const {readPreparedNodeContext}=await load('client/lib/node-context.mjs');
const {createNodeProcedure}=await load('client/lib/node-procedure.mjs');
const {withBrowserReceipt}=await load('client/lib/executor.mjs');
const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs');
const {closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
const sid=randomUUID(),path='/'+cfg.username+'/navigation-diagnostic-'+sid+'.lgp';
const save=async(name,value)=>{await fs.writeFile(dir+name+'.json',JSON.stringify(value,null,2)+'\n');if(['cleanup','error-cleanup'].includes(name))cleanupConfirmed=value?.status==='SUCCEEDED'&&value.package_closed===true&&value.logged_out===true&&value.session_id===sid&&value.document_id===prepared?.document_id&&value.account===cfg.username&&value.package_path===path;};
export const {context}=await loginBrowser({browserPath:resources.browserPath,profile:dir+'browser',candidate:cfg,headless:true,keepOpen:true});const page=context.pages()[0];
export const execute=code=>new Function('page',`return (${code})(page)`)(page);
let prepared,graphReturned=false,runtime,channel,binding,cleanupConfirmed=false,failed=false;
const preflight=async()=>page.evaluate(async()=>{const m=bg.app.Application.FInstance.FMainForm,t=m.FMapTree,c=t.FServerConnection,n=t.PackageNodes.Count?t.PackageNodes.Items(t.PackageNodes.Count-1):null;return {account:c.UserName,packages:t.PackageNodes.Count,connection:c.constructor.name,connected:c.Connected,session:c.Session.constructor.name,sessionIds:Object.fromEntries(Object.keys(c.Session).filter(k=>/^(F?SessionId|F?SessionID|F?Id|F?ID)$/i.test(k)).map(k=>[k,c.Session[k]]).filter(([,v])=>['string','number'].includes(typeof v))),path:n?.PackageFileName?'/'+n.PackageFileName.replaceAll('\\','/').replace(/^\/+/, ''):null,readOnly:n?.ReadOnly,running:t.HasRunningNodes(),packageRunning:n?.HasRunningNodes(),dirty:n?await c.Session.IsPackageModified(n.Package):false};});
try{
 const fresh=await preflight();await save('resources',fresh);if(fresh.account!==cfg.username||fresh.packages!==0||fresh.connected!==true)throw Error('Fresh diagnostic context is not empty and quiet');
 const actions=JSON.parse(await fs.readFile(root+'runtime/executor/catalog/actions.json')).actions,selectors=JSON.parse(await fs.readFile(root+'runtime/executor/catalog/selectors.json')).selectors;
 actions.find(a=>a.action_key==='package.save_checkpoint').effect.allowed_roots=['/'+cfg.username];
 const rc={targetOrigin:new URL(cfg.url).origin,targetBuild:'7.4.2'};
 const record=async e=>{await fs.appendFile(dir+'journal.jsonl',JSON.stringify(e)+'\n');return e;};
 runtime=createActionRuntime({pinned:{actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s])),pins:{}},execute,onRecord:record,...rc,allowCandidate:true,...createCandidateNodeSupport(rc)});
 const compatibility={loginom_build:'7.4.2',platform:'linux',browser:'chromium'};
 prepared=await execute(makeWorkspacePrepareCode({loginomUrl:cfg.url,compatibility,sessionId:sid,operationId:'new-diagnostic',intent:'new_draft'}));await save('draft',prepared);
 const saved=await runtime.run('package.save_checkpoint',{path,conflict_policy:'fail'},{operationId:'save-diagnostic'});await save('saved',saved);if(saved.status!=='SUCCEEDED')throw Error('Save failed');prepared.package_ref=saved.output.package_ref;
 prepared=await execute(makeWorkspacePrepareCode({loginomUrl:cfg.url,compatibility,sessionId:sid,operationId:'refresh-diagnostic',intent:'open_package',packagePath:path}));await save('prepared',prepared);
 const quiet=await preflight();await save('pre-create',quiet);if(quiet.account!==cfg.username||quiet.path!==path||quiet.dirty!==false||quiet.running!==false||quiet.packageRunning!==false||quiet.readOnly!==false)throw Error('Diagnostic pre-create context is not clean and quiet');
 const request={document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,target:{kind:'new',type:'imports.text',label:'NavigationDiagnostic',position:{x:180,y:180}},inputs:[]};
 const adapter=createNodeTargetBrowserAdapter({execute,origin:rc.targetOrigin,build:'7.4.2'});
 const target=await prepareNodeTarget({request,operation:{id:'diagnostic-create',deadline:Date.now()+60000},adapter,record});await save('target',target);if(target.status!=='SUCCEEDED')throw Error('Target failed');
 binding={document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:target.node.ref};
 const snapshot=()=>page.evaluate(b=>{const p=globalThis.__loginomDockPreparationV1,a=bg.app,r=[...p.receipts.values()].find(r=>r.workflowId===b.workflow_ref.workflow_id),card=a.Application.FInstance.FMainForm.Items.Workspace.getActiveTab();
 const connection=a.Application.FInstance.FMainForm.FMapTree.FServerConnection;const objects=[r.packageNode,r.nodeTargetWorkflowNode,card.Controller.FController.FModelNode??card.Controller.FController.FDiagram?.FNodes.FCollection.find(n=>n.FGuid===b.node.node_id)?.data,connection,connection.Session];const previous=globalThis.__lab70NativeProof;globalThis.__lab70NativeProof??={objects,guids:objects.map(n=>n?.FGuid??null)};return {sameNativeObjects:!previous||objects.every((n,i)=>n===previous.objects[i]),sameNativeGuids:!previous||objects.every((n,i)=>(n?.FGuid??null)===previous.guids[i]),guids:objects.map(n=>n?.FGuid??null),contextController:card.Controller.FController.constructor.name,crumbs:[...document.querySelectorAll('[data-tid^='+JSON.stringify(b.workflow_ref.prefix+';cnrNaviMode;b.s_')+']')].map(e=>{const c=Ext.getCmp(e.id),n=c?._node?.data?.node;return {tid:e.getAttribute('data-tid'),label:e.textContent.trim(),nativeClass:n?.constructor?.name,package:n===r.packageNode,workflow:n===r.nodeTargetWorkflowNode,componentBound:c?.el?.dom===e};})};},binding);
 await save('before',await snapshot());const before=await readPreparedNodeContext(page,binding);await save('context-before',before);if(!before.verified)throw Error('Before context failed');
 await save('identity',{sid,path,binding});
 channel=createNodeProcedure({operation:{id:'diagnostic-wizard',action:{action_key:'acceptance.navigation',revision:'1'},deadline:Date.now()+120000},execute,record,...rc,maxSteps:4096,preparedNodeContext:binding,
 wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{receipt_namespace:sid,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
 const initial=await channel.observe({condition:'own prepared graph',ready:s=>s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='graph'});
 await selectPreparedGraphNode(channel,initial,'select own diagnostic node');
 await save('opened',await openPreparedWizard(channel));
 await save('after',await snapshot());await save('context-after',await readPreparedNodeContext(page,binding));
 await save('closed-wizard',await closePreparedWizard(channel));graphReturned=true;
 await save('graph-returned',await readPreparedNodeContext(page,binding));
 await save('final-save',await runtime.run('package.save_checkpoint',{path,conflict_policy:'replace'},{operationId:'save-diagnostic-node'}));
 const final=await preflight();await save('pre-cleanup',final);if(final.dirty!==false||final.running!==false||final.path!==path)throw Error('Diagnostic checkpoint is not clean');
 await save('cleanup',await execute(makePackageCleanupCode({sessionId:sid,documentId:prepared.document_id,account:cfg.username,packagePath:path,loginomUrl:cfg.url,loginomBuild:'7.4.2',tabTid:prepared.workflow_ref.tab_tid})));
}catch(e){failed=true;await save('error',{error:e.message});process.exitCode=1;
 // Cancellation is a distinct, exactly owned action, never a repeated opening.
 if(binding&&channel)try{const current=await readPreparedNodeContext(page,binding);await save('error-context',current);if(current.verified&&current.surface==='wizard'){await save('error-wizard-close',await closePreparedWizard(channel));graphReturned=true;}}catch(closeError){await save('error-close',{error:closeError.message});}
 if(prepared?.package_ref?.path===path&&runtime)try{const own=await preflight();await save('error-pre-cleanup',own);if(own.account===cfg.username&&own.path===path&&own.running===false&&own.packageRunning===false&&(graphReturned||!binding)){if(own.dirty===true)await save('error-save',await runtime.run('package.save_checkpoint',{path,conflict_policy:'replace'},{operationId:'preserve-diagnostic-on-stop'}));await save('error-cleanup',await execute(makePackageCleanupCode({sessionId:sid,documentId:prepared.document_id,account:cfg.username,packagePath:path,loginomUrl:cfg.url,loginomBuild:'7.4.2',tabTid:prepared.workflow_ref.tab_tid})));}}catch(cleanupError){await save('error-cleanup-error',{error:cleanupError.message});}
}
finally{
 try{if(await page.evaluate(account=>{const t=bg?.app?.Application?.FInstance?.FMainForm?.FMapTree;return t?.PackageNodes?.Count===0&&t.FServerConnection.UserName===account&&t.FServerConnection.Connected===true;},cfg.username)){
 const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']');await at('MF;cntMain;tlbMainToolbar;btnAvatar').click({timeout:8000});await at('MF;AppMenuForm;btnLogOut').click({timeout:8000});await at('LoginForm;Login;edtUsername').locator('input').waitFor({state:'visible',timeout:8000});await save('empty-session-logout',{logged_out:true,packages:0,account:cfg.username});
 }}catch(e){await save('empty-session-logout-error',{error:e.message});}
 if(cleanupConfirmed&&!failed)await context.close();
 else await save('recovery-required',{context_retained:true,sessionId:sid,documentId:prepared?.document_id,packagePath:path,profile:dir+'browser',cleanup_confirmed:cleanupConfirmed,process_exit_safe:false});
}

