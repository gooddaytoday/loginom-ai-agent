// Managed loader projection only. Auth/Page/native opening and node handles are
// fixtures; host mint, private IPC, resource verification and fixed consumer are real.
import vm from 'node:vm';
import {readFile,realpath,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
let registration,input,root,loaded;
process.on('message',async m=>{
 try {
  if(m.operation==='start'){
   input=m.input;root=input.resources;
   await writeFile(join(root,'fixture-processes.jsonl'),JSON.stringify({pid:process.pid,chat:input.chat,fixture:true})+'\n',{flag:'a'});
   const {validateStartInput}=await import(pathToFileURL(startReader).href);
   const {acceptanceCapture}=validateStartInput(input);
   const {verifyResources}=await import(pathToFileURL(resourceVerifier).href);
   const resources=await verifyResources(root);
   if(acceptanceCapture){
    const source=await readFile(loaderSource,'utf8'),begin=source.indexOf('      let captureHarness'),end=source.indexOf('      // A new process',begin);
    if(begin<0||end<0)throw Error('EXACT_LOADER_BLOCK_UNAVAILABLE');
    const context=vm.createContext({acceptanceCapture,resources,input,Error,Date,join,pathToFileURL,realpath,readFile,createHash});
    registration=await new vm.Script('(async()=>{'+source.slice(begin,end)+';return {captureHarness,captureRegistration,captureResource}})()', {importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER}).runInContext(context);
    await writeFile(join(root,'loaded-'+input.chat+'.json'),JSON.stringify({binding:acceptanceCapture,resource:registration.captureResource,mode:registration.captureRegistration?.mode,fixture:true}));
   }
   loaded=true;
   process.send({id:m.id,result:{ready:true,protocol:1,generation:input.generation,chat:input.chat}});
  }else if(m.operation==='acceptance.capture'){
   if(!loaded||!registration)throw Error('LOGINOM_CAPTURE_UNAVAILABLE');
   process.env.CAPTURE_RUNTIME_ROOT=join(root,'runtime');
   const {captureFixture}=await import(pathToFileURL(nativeFixture).href);
   const cap=await captureFixture(),f={...cap.f,...cap},page=f.page;
   const tab=f.main.Items.Workspace.getActiveTab();f.main.Items.Workspace.getActiveTab=()=>tab;
   const conn=f.main.FMapTree.FServerConnection;conn.Connected=true;conn.Session={IsPackageModified:async()=>false};
   f.pkg.Package={};f.pkg.ReadOnly=false;f.pkg.HasRunningNodes=()=>false;f.main.FMapTree.PackageNodes={Count:1,Items:()=>f.pkg};
   const evaluate=page.evaluate;page.evaluate=async(...a)=>JSON.parse(JSON.stringify(await evaluate(...a)));page.isClosed=()=>false;
   const directory=join(root,'fixture-session-'+input.chat);await mkdir(directory,{recursive:true});
   const owner={id:'fixture-original-page',page,context:{pages:()=>[page]},account:conn.UserName,origin:'https://loginom.test',generation:input.generation,chat:input.chat};
   const session={directory,metadata:{sessionId:'fixture-session',clientRevision:'fixture-revision'}};
   const state={startupOwner:owner,captureStartupBinding:Object.freeze({...owner,owner}),session,controller:new AbortController()};
   const binding=Object.freeze({...input.acceptanceCapture,session:session.metadata.sessionId});
   const helper=await import(pathToFileURL(join(root,'runtime/src/retained-capture.mjs')).href);
   const retained=helper.retainCaptureOwner(state,binding,registration.captureResource);
   state.bridge={};state.client={};helper.bindCaptureRuntime(retained,state.bridge,state.client);
   const request={operation_id:'fixture-original-node',document_id:f.binding.document_id,workflow_ref:structuredClone(f.binding.workflow_ref),target:{type:'transform.replace_columns'}};
   const opening={value:{opening_operation_id:f.proof.result.input_port.opening_operation_id},receipt_id:f.proof.result.input_port.opening_operation_id};
   const node={request,state:{node:structuredClone(f.binding.node)},opening,signal:new AbortController().signal,deadline:Date.now()+30000,requestSha256:hash(request),openingSha256:hash(opening)};
   const pin={request:hash(request),opening:hash(opening),node:hash(node.state.node),deadline:node.deadline};
   node.assertCurrent=()=>{if(hash(request)!==pin.request||hash(opening)!==pin.opening||hash(node.state.node)!==pin.node||node.deadline!==pin.deadline||Date.now()>=pin.deadline)throw Error('FIXTURE_ORIGINAL_NODE_CHANGED');};
   const identity={session_id:binding.session,document_id:request.document_id,tab_tid:request.workflow_ref.tab_tid,account:owner.account,package_path:f.packagePath,loginom_build:'7.4.2'};
   const publication=helper.capturePublication(retained,node,identity);
   const runtime={hasActiveWork:()=>false,hasUnsettledWork:()=>false};
   const args={binding,identity,retained,runtime,session,node,publication,signal:state.controller.signal,deadline:node.deadline};
   const receipt=await registration.captureHarness(args);
   helper.assertCapturePublication(receipt,publication);helper.captureData(receipt);
   if(await registration.captureRegistration.validate(receipt,args)!==true)throw Error('INVALID_FIXED_RESULT');
   await writeFile(join(directory,'registration-result.json'),JSON.stringify({receipt,fixture:true,gestures:page.events.length}));
   process.send({id:m.id,result:{receipt,diagnosticRead:true,cleanupComplete:false}});
  }else if(m.operation==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
  else if(m.operation==='interrupt')process.send({id:m.id,result:{interrupted:true}});
  else throw Error('FIXTURE_OPERATION_UNAVAILABLE');
 }catch(e){if(root)await writeFile(join(root,'fixture-refusal.json'),JSON.stringify({fixture:true,message:e?.message??String(e)}));process.send({id:m.id,error:e?.message??'LOGINOM_RUNTIME_FAILED'});}
});
