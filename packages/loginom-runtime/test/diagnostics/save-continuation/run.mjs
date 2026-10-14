import assert from'node:assert/strict';import vm from'node:vm';import{readFile,mkdir,writeFile}from'node:fs/promises';import{resolve,join}from'node:path';import{pathToFileURL}from'node:url';
const[root,out]=process.argv.slice(2);await mkdir(out,{recursive:true});const {amountSaveContinuation}=await import(pathToFileURL(resolve(root,'src/amount-save-continuation.mjs')));
const {validateActionParameters,assertActionOutcome}=await import(pathToFileURL(resolve(root,'client/lib/action-catalog.mjs')));const catalog=JSON.parse(await readFile(resolve(root,'executor/catalog/actions.json'),'utf8'));const schema=catalog.actions.find(x=>x.action_key==='package.save_as').output_schema;
const text=await readFile(resolve(root,'client/lib/executor.mjs'),'utf8');const pre=text.match(/if\(!keepOpen\)await page\.evaluate\((o=>\{[\s\S]*?\n    \}),\{previous/)[1];const post=text.match(/const continuation=await page\.evaluate\((o=>\{[\s\S]*?\n    \}),\{previous/)[1];const va=text.indexOf('  const verifyReopenedPackage = async before => {'),vb=text.indexOf('  const writeFileName =',va);
const makeVerify=Function('page','ensureReady','resolve','packageIdentity','normalizeStoredPath','graphSnapshot','same','task','initialWorkflow',`let workflow=initialWorkflow,phase='preconditions';const trace=[],record=(event,detail)=>trace.push({at_ms:1,event,...detail}),result=(status,output)=>({status,output,phase,trace,error:null,effect_possible:true,action_key:'package.save_as',action_revision:'2',operation_id:task.operation_id});${text.slice(va,vb)};return verifyReopenedPackage;`);
const rows=[];
for(const mode of ['canonical','copy-original-record','source-request-drift','old-tab-connected','pack-drift','count','running','wrong-path','wrong-navigation','duplicate-continuation','consumed','session-drift','map-drift']){
 class PackageTreeNode{};class WorkFlowTreeNode{};class ModelForm{};const oldPack=new PackageTreeNode(),pack=new PackageTreeNode();Object.assign(pack,{PackageFileName:'/own/new.lgp',ReadOnly:false,HasRunningNodes:()=>mode==='running'});
 const workflowNode=new WorkFlowTreeNode();workflowNode.ParentNode=pack;const oldTab={isConnected:true,classList:{contains:()=>true},getAttribute:()=> 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1'},tab={classList:{contains:()=>true}};
 const graph={},model=new ModelForm();model.FDiagram={FmxGraph:{container:graph}};const card={Controller:{FController:model,Node:{data:{node:workflowNode}}}};
 const doc={},source={phase:'verified',tab:oldTab,packageNode:oldPack,workflowId:'original-workflow',crumbs:[1,2,3],request:JSON.stringify({session:'sdk',intent:'new_draft',packagePath:null})};
 const prep={document:doc,id:'doc',receipts:new Map([['prepare',source]])};const main={Items:{Workspace:{getActiveTab:()=>card}},FMapTree:{FServerConnection:{Connected:true,UserName:'own',Session:{}},PackageNodes:{Count:1,Items:()=>pack}}};
 doc.querySelectorAll=s=>s.includes('cnrNaviMode')?(mode==='wrong-navigation'?[]:[1,2,3].map(i=>({getAttribute:()=> 'crumb'+i,textContent:'nav'+i}))):s.includes('cmpDiagram')?[graph]:[tab];
 const ctx=vm.createContext({document:doc,bg:{app:{PackageTreeNode,WorkFlowTreeNode,ModelForm,Application:{FInstance:{FMainForm:main}}}},__loginomDockPreparationV1:prep});
 const o={previous:{tab_tid:oldTab.getAttribute(),prefix:'MF;TF-1'},current:{tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-3',prefix:'MF;TF-3'},operation:'save',path:'/own/new.lgp',graph:{nodes:[],ports:[],links:[]},previousGraph:{nodes:[],ports:[],links:[]}};
 vm.runInContext('('+pre+')',ctx)(o);oldTab.isConnected=false;
 if(mode==='copy-original-record')prep.receipts.set('prepare',{...source});if(mode==='source-request-drift')source.request='{}';if(mode==='old-tab-connected')oldTab.isConnected=true;
 if(mode==='pack-drift')source.packageNode={};if(mode==='count')main.FMapTree.PackageNodes.Count=2;if(mode==='wrong-path')pack.PackageFileName='/foreign.lgp';if(mode==='duplicate-continuation')prep.receipts.set('save',{});if(mode==='consumed')prep.saveBindings.get('save').consumed=true;if(mode==='session-drift')main.FMapTree.FServerConnection.Session={};if(mode==='map-drift')main.FMapTree={...main.FMapTree};
 let c,actual,failed=false;try{
 const verify=makeVerify({evaluate:(fn,arg)=>vm.runInContext('('+fn.toString()+')',ctx)(arg)},async()=>o.current.prefix,async()=>({innerText:async()=> 'Scenario'}),async()=>({path:o.path}),x=>x,async()=>o.graph,(a,b)=>JSON.stringify(a)===JSON.stringify(b),{operation_id:'save'},o.current);
 actual=await verify({workflow_ref:o.previous,path:o.path,graph:o.previousGraph});c=actual.trace.find(x=>x.event==='save_continuation_observed')?.continuation;
 }catch{failed=true}
 if(mode==='canonical'){
  assert(!failed);const original={attempted:true,operation_id:'prepare',state:{status:'READY',operation_id:'prepare',document_id:'doc',loginom_account:'own',workflow_ref:{...o.previous,workflow_id:'original-workflow'},package_ref:{path:null}}};
  const save={...actual,cleanup_complete:true};
  validateActionParameters(schema,save.output,'output');assertActionOutcome(save);assert.throws(()=>validateActionParameters(schema,{...save.output,save_continuation:c},'output'),/unknown field/);
  const binding={session:'sdk',account:'own',packagePath:o.path};const active=amountSaveContinuation(original,save,binding);
  const bridge=await readFile(resolve(root,'client/lib/bridge.mjs'),'utf8');
  const a=bridge.indexOf('            if ((managedCleanup || acceptanceCapture) && outcome.status'),b=bridge.indexOf('            if (userProfile && outcome.status',a);
  const project=Function('session','outcome','originalAmountSavePreparation','originalAmountSaveBytes','amountAdmission','amountSaveContinuation','config',`let managedCleanup=true,acceptanceCapture=true,managedSave,amountSaveOutcome,amountSavePreparation,amountSavePreparationBytes;${bridge.slice(a,b)};return {managedSave,amountSavePreparation};`);
  const session={metadata:{sessionId:'sdk',targetIdentity:{loginom_build:'7.4.2'},workspacePreparation:original}};
  const projected=project(session,save,original,JSON.stringify(original),{binding},amountSaveContinuation,{loginomUrl:'https://own.test'});
  assert.equal(projected.managedSave.tabTid,o.current.tab_tid);assert.equal(projected.amountSavePreparation,session.metadata.workspacePreparation);
  assert.equal(session.metadata.workspacePreparation.save_continuation.source_preparation,original);
  assert.throws(()=>project({metadata:{...session.metadata,workspacePreparation:{...original}}},save,original,JSON.stringify(original),{binding},amountSaveContinuation,{}),/ORIGINAL_PREPARATION_CHANGED/);
  assert.equal(active.state.workflow_ref.tab_tid,o.current.tab_tid);assert.equal(active.save_continuation.source_preparation,original);assert.equal(original.state.workflow_ref.tab_tid,o.previous.tab_tid);
  for(const key of ['session_id','account','document_id','source_operation_id','operation_id','package_path']){const bad=structuredClone(save);bad.trace.find(x=>x.event==='save_continuation_observed').continuation[key]='foreign';assert.throws(()=>amountSaveContinuation(original,bad,binding));}
  for(const trace of [[],[...save.trace,...save.trace]]){assert.throws(()=>amountSaveContinuation(original,{...save,trace},binding));}
  const bad=structuredClone(save);bad.trace.find(x=>x.event==='save_continuation_observed').continuation.graph.nodes.push('foreign');assert.throws(()=>amountSaveContinuation(original,bad,binding));assert.throws(()=>vm.runInContext('('+post+')',ctx)(o));
 }else assert(failed,mode);rows.push({mode,pass:true});
}
await writeFile(join(out,'results.json'),JSON.stringify({pass:rows.length,rows,limits:'Real serialized producer pre/post binding and private consumer. DOM/native/Page/SDK are named VM doubles, not native cleanup proof.'},null,2)+'\n');console.log(rows.length);
