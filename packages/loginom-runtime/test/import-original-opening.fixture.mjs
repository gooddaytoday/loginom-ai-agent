import vm from 'node:vm';
import {MessageChannel} from 'node:worker_threads';
import {mkdtemp,open,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.IMPORT_RUNTIME_ROOT?pathToFileURL(process.env.IMPORT_RUNTIME_ROOT+'/'):new URL('../',import.meta.url);
const {createActionRuntime}=await import(new URL('client/lib/executor.mjs',root));
const {createTextImportNodeSupport}=await import(new URL('client/lib/text-import-node.mjs',root));
const {retainCaptureOwner,bindCaptureRuntime,capturePublication}=await import(new URL('src/retained-capture.mjs',root));
const {createImportPreconfigAdapter}=await import(new URL('src/acceptance/import-preconfig-adapter-v1.mjs',root));
export const workflow={workflow_id:'workflow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb',prefix:'MF;TF',navigation_path:[{tid:'workflow-path',label:'Workflow'}]};
const node={document_id:'doc',workflow_id:'workflow',node_id:'original-import'};
export const request=()=>({operation_id:'opening',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
 target:{kind:'existing',type:'imports.text',ref:node},inputs:[],mode:'delimited',parameters:{settings:{},source:{artifact_id:'csv',upload_operation_id:'upload'}},
 mappings:[],finish:'close',read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}});
const upload=()=>({sequence:0,operation_id:'upload',destination:'/account/data.csv',artifact:{artifact_id:'csv',bytes:2,sha256:'a'.repeat(64)},cleanup_confirmed:true,transport_uncertain:false,
 outcome:{operation_id:'upload',action_key:'artifact.upload',status:'SUCCEEDED',cleanup_complete:true,output:{artifact_id:'csv',destination:'/account/data.csv',bytes:2,sha256:'a'.repeat(64),server_copy_verification:{verification_id:'verify',status:'SUCCEEDED',bytes_verified:true,upload_completion_verified:true,destination:'/account/data.csv',bytes:2,sha256:'a'.repeat(64)}}}});
// UI/native/owner/transport/delivery facts are explicit counterfactual doubles.
// Actual production procedures mint both slots; no prebuilt node handle is fed in.
export async function fixture(options={}) {
 const directory=await mkdtemp(join(tmpdir(),'import-opening71-')),file=await open(join(directory,'events.jsonl'),'a',0o600);
 const events=[],calls=[],dispatch={configure:0,mapping:0,finish:0,execute:0},controller=new AbortController();let heldOperation,stage='graph',counter=0;
 const page={isClosed:()=>false},context={pages:()=>[page]};
 const binding=Object.freeze({revision:1,harness:'import-before-configure-v1',owner:'owner',run:'run',lease:'owner:run',generation:7,chat:'chat',account:'account',session:'session',admission:'admission',packagePath:'/account/left.lgp',expires:Date.now()+(options.grantBudget??60000)});
 const identity=Object.freeze({session_id:'session',document_id:'doc',tab_tid:workflow.tab_tid,account:'account',package_path:binding.packagePath,loginom_build:'7.4.2'});
 const owner={id:'owner-id',page,context,account:'account',origin:'https://fixture.invalid',generation:7,chat:'chat'};
 const session={directory,metadata:{sessionId:'session',clientRevision:'a'.repeat(40),workspacePreparation:{attempted:true,state:{document_id:'doc'}}}};
 const state={startupOwner:owner,session,controller};state.captureStartupBinding=Object.freeze({...owner,owner});
 const retained=retainCaptureOwner(state,binding,Object.freeze({path:'runtime/src/acceptance/import-preconfig-adapter-v1.mjs',sha256:'a'.repeat(64)}));
 state.bridge={};state.client={callTool(){throw Error('No alternate Page transport');}};bindCaptureRuntime(retained,state.bridge,state.client);
 const native=vm.createContext({Date});
 vm.runInContext(`
 class ModelForm{};class WizardTreeNode{};class ModelNodeTreeNode{};class WizardModelComponentForm{};
 const document={querySelectorAll(q){return q===sel('${workflow.tab_tid}')?[tab]:q===sel('MF;TF;ModelForm;cmpDiagram')?[graphRoot]:q===sel('MF;TF;WizrdMCF')?(opened?[wizardRoot]:[]):q===sel('MF;TF;WizrdMCF;ImportTextFilePreviewWizard;edtFileName;ValueControl')?[inputOwner]:[];}};
 function sel(t){return '[data-tid='+JSON.stringify(t)+']';}
 const location={origin:'https://fixture.invalid'},tab={classList:{contains:k=>k==='x-tab-active'}};
 const graphRoot={contains:b=>b===body},body={getAttribute:()=> 'MF;TF;Graph;Import'},wizardRoot={contains:b=>b===inputOwner};
 const input={value:'/account/data.csv'},inputOwner={querySelectorAll:()=>[input]};
 const data={},port={data:{},FGuid:'output',FPortIndex:0},group={FCollection:[port]},n={FGuid:'original-import',data,FCell:{},FPorts:[group]};port.parent=n;
 const workflow={},pack={},record={phase:'verified',workflowId:'workflow',tab,packageNode:pack,nodeTargetWorkflowNode:workflow};
 const graph=new ModelForm();graph.FDiagram={FNodes:{FCollection:[n]},FmxGraph:{container:graphRoot,view:{getState:()=>({shape:{node:body}})}}};
 let opened=false;const card={Controller:{FController:graph,Node:{data:{node:workflow}}}};
 const workspace={getActiveTab:()=>card},connection={Connected:true,UserName:'account',Session:{}};
 const bg={app:{Version:'7.4.2',ModelForm,WizardTreeNode,ModelNodeTreeNode,Application:{FInstance:{FMap:{FServerConnection:connection},FMainForm:{Items:{Workspace:workspace}}}}}};
 const __loginomDockPreparationV1={document,id:'doc',receipts:new Map([['prepared',record]])};
 function completeWizard(){opened=true;const nt=new ModelNodeTreeNode();nt.ParentNode=workflow;nt.FGuid='original-import';nt.FModelNode=data;const wt=new WizardTreeNode();wt.ParentNode=nt;
  const model=new WizardModelComponentForm();model.FModelNode=data;model.FView={el:{dom:wizardRoot}};card.Controller={FController:model,Node:{data:{node:wt}}};}
 Object.assign(globalThis,{document,location,bg,__loginomDockPreparationV1,completeWizard,card,workspace,connection,port,n,record,input,wizardRoot});
 `,native);
 page.evaluate=(fn,arg)=>vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',native);
 const observed=()=>{
  const opened=stage==='wizard',tid=opened?'MF;TF;WizrdMCF':'MF;TF;Graph;Import';
  const opening={node:{node_label:'Import'},workflow_path:workflow.navigation_path};
  return {origin:owner.origin,authenticated:true,loginom_build:'7.4.2',workflow_ref:workflow,dom_epoch:{document:'doc'},scan:{complete:true},
   prepared_node_context:{...node,verified:true,surface:opened?'wizard':'graph',tid},
   ui:{masks:[],dialogs:[],truncated:{masks:false,dialogs:false},elements:[
    {ref:'ui-graph',tid:'MF;TF;ModelForm;cmpDiagram'},
    {ref:'ui-body',tid:'MF;TF;Graph;Import',graph_node:{part:'body'},allowed_actions:['click']},
    {ref:'ui-setting',tid:'MF;TF;Graph;Import;Setting',wizard_open:opening,allowed_actions:['begin_wizard']},
    {ref:'ui-label',tid:'MF;TF;Graph;Import;Label;Label',label:'Import',graph_node:{part:'label'}}]},
   wizard:opened?{status:'observed',stage:'text_import_file',root_tid:tid,root_ref:'ui-wizard',owner_context:{status:'observed',node:{tid:'workflow-path>Import',label:'Import'},path:[...workflow.navigation_path,{tid:'workflow-path>Import',label:'Import'},{tid:'settings',label:'Настройка'}]},
    import_source:{fields:Object.fromEntries(Object.entries({source_path:'/account/data.csv',connection:'Local',encoding:'UTF-8',rows_to_skip:'0',first_line_as_title:true}).map(([k,value])=>[k,{status:'observed',truncated:false,value}]))}}:{status:'absent'}};
 };
 const channel=new MessageChannel(),waiting=new Map();
 channel.port2.on('message',r=>{const entry=waiting.get(r.id);waiting.delete(r.id);r.failure?entry.reject(r.failure.value):entry.resolve(r.value);});
 const jsonTask=code=>{let at=code.lastIndexOf('{"mode":'),level=0,quoted=false,escaped=false;for(let i=at;i<code.length;i++){const c=code[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')level++;else if(c==='}'&&--level===0)return JSON.parse(code.slice(at,i+1));}throw Error('Missing fixed task');};
 channel.port1.on('message',async({id,code,opts})=>{
  try {
   calls.push({code:code.includes('importOpeningPage')?'native': 'ui',mode:code.includes('importOpeningPage')?code.match(/"mode":"(reserve|complete|assert|read)"/)?.[1]:undefined,timeout:opts?.timeout});
   options.beforeTransport?.({state,native,code,heldOperation});
   let value;
   if(code.includes('function importOpeningPage')) {
    value=await vm.runInNewContext('('+code+')(page)',{page});
   } else {
    const task=jsonTask(code);
    if(task.mode==='act') {
     calls.push({verb:task.action.verb});
     if(task.action.verb==='begin_wizard'){stage='wizard';vm.runInContext('completeWizard()',native);}
    }
    value={status:'SUCCEEDED',output:{value:{status:'SUCCEEDED',action_key:task.mode==='act'?'ui.act':'workspace.observe',
     operation_id:task.operation_id,action_revision:'1',effect_possible:task.mode==='act',cleanup_complete:true,output:observed(),error:null,trace:[]}}};
   }
   options.afterTransport?.({state,native,code,heldOperation});channel.port1.postMessage({id,value});
  }catch(error){channel.port1.postMessage({id,failure:{value:error}});}
 });
 const execute=(code,opts)=>new Promise((resolve,reject)=>{const id=++counter;waiting.set(id,{resolve,reject});channel.port2.postMessage({id,code,opts});});
 const onRecord=async event=>{events.push(event);options.beforeRecord?.({event,state,native,heldOperation});await file.writeFile(JSON.stringify(event)+'\n');await file.sync();options.afterRecord?.({event,state,native,heldOperation});return event;};
 const support=createTextImportNodeSupport({targetOrigin:owner.origin,targetBuild:'7.4.2'});
 const graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[{ref:node,type:'imports.text',label:'Import',inputs:[],outputs:[0]}],links:[],foreign_links:[]};
 const runtime=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},execute,onRecord,targetOrigin:owner.origin,targetBuild:'7.4.2',
  nodeTargetAdapterFactory:()=>({observe:async()=>structuredClone(graph),preflight:async()=>{},mutate:async()=>{throw Error('No create');}}),
  nodeApplyHandlers:support.nodeApplyHandlers,nodeApplyDriverFactory:c=>{
   heldOperation=c.operation;
   // Explicit fixture of stored verified delivery. Not a current native upload.
   const deliveries=[upload()];options.mutateDelivery?.(deliveries);
   const driver=support.nodeApplyDriverFactory({...c,verifiedUploads:()=>deliveries,uploadHistory:()=>({complete:true,records:deliveries})});
   for(const [name,key] of [['configureTextImport','configure'],['mapPorts','mapping'],['finish','finish'],['waitExecution','execute']]) {
    const original=driver[name];driver[name]=(...args)=>{dispatch[key]++;return original(...args);};
   }
   return driver;
  }});
 const openNode=()=>runtime.openImportPreconfig(request(),{signal:controller.signal,retained,identity});
 const contextFor=node=>({retained,node,identity,publication:capturePublication(retained,node,identity),runtime,
  browser:{callTool(){throw Error('No foreign resource transport');}},record:onRecord,signal:controller.signal});
 const adapterFor=node=>createImportPreconfigAdapter(contextFor(node));
 return {runtime,native,state,retained,identity,controller,events,calls,dispatch,openNode,adapterFor,contextFor,operation:()=>heldOperation,
  async cleanup(){channel.port1.close();channel.port2.close();await file.close();await rm(directory,{recursive:true,force:true});}};
}
