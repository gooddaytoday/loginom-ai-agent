import {assertCaptureOwner,captureData,assertCapturePublication} from '../retained-capture.mjs';
import {compileReplacementReadContract,validateReplacementReadContract} from '../../client/lib/replacement-fixed-abi.mjs';
import {readPreparedNodeContext} from '../../client/lib/node-context.mjs';

export const captureMode='readonly';
const resourcePath='runtime/src/acceptance/replacement-input0-readonly-v1.mjs';
const kind='replacement-input0-readonly-v1';
const issued=new WeakMap(); // Result/request correlation only; not an owner registry.
const rootKeys=['document_id','workflow_id','node_id','session_id','account','package_path'];
// Fixed process-local adapter. IPC cannot supply handles, scripts or module paths.
export async function captureReplacement({binding,identity,retained,runtime,session,node,publication,signal,deadline}) {
 const owner=retained?.owner,page=retained?.page,context=retained?.context;
 const guard=()=>{
  assertCaptureOwner(retained);node.assertCurrent();
  signal?.throwIfAborted();node.signal.throwIfAborted();
  if(binding!==retained.binding || binding.harness!==kind || retained.resource.path!==resourcePath
    ||session!==retained.session ||retained.runtime.bridge!==retained.state.bridge
    ||retained.state.controller?.signal!==signal ||!signal ||deadline!==node.deadline
    ||Date.now()>=deadline ||owner!==retained.owner ||page!==owner.page ||context!==owner.context
    ||node.request.target?.type!=='transform.replace_columns' ||node.state.node?.node_id!==publication.node_id
    ||node.request.document_id!==publication.document_id ||node.request.workflow_ref.workflow_id!==publication.workflow_id
    ||node.requestSha256!==publication.request_sha256 ||node.openingSha256!==publication.opening_sha256
    ||publication.resource_path!==resourcePath ||publication.resource_sha256!==retained.resource.sha256
    ||publication.account!==binding.account ||publication.package_path!==binding.packagePath
    ||publication.session_id!==binding.session ||publication.owner!==binding.owner ||publication.run!==binding.run
    ||publication.lease!==binding.lease ||publication.generation!==binding.generation ||publication.chat!==binding.chat
    ||publication.admission!==binding.admission ||publication.deadline!==deadline
    ||publication.opening_operation_id!==node.opening.receipt_id
    ||Object.keys(identity).some(k=>identity[k]!==publication[k])
    ||runtime.hasActiveWork()!==false ||runtime.hasUnsettledWork()!==false)
   throw Error('REPLACEMENT_FIXED_OWNER_REFUSED');
 };
 guard();
 const nativeBinding={document_id:node.request.document_id,workflow_ref:node.request.workflow_ref,node:node.state.node};
 // Compile the browser half of the actual canonical reader, not a caller
 // callback/proof. It must run synchronously inside the terminal RPC snapshot.
 const readerSource=await readPreparedNodeContext({evaluate:fn=>fn.toString()},nativeBinding);guard();
 const terminalSafety=new Function('return q=>('+readOwnSafety.toString()+')(q,('+readerSource+'))')();
 // Checks wrap every asynchronous read on the same original Page. No gestures.
 const readPage=new Proxy(page,{get(target,key){
  if(key==='evaluate')return async(...args)=>{guard();const value=await target.evaluate(...args);guard();return value;};
  const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;
 }});
 const safety=async nativeProof=>{guard();const raw=await readPage.evaluate(nativeProof?terminalSafety:readOwnSafety,{document_id:publication.document_id,
  account:binding.account,package_path:binding.packagePath,origin:retained.startup.origin,build:identity.loginom_build,
  ...(nativeProof?{native_binding:nativeBinding,native_proof:nativeProof}:{})});guard();
  if(raw?.owned!==true ||raw.running!==false ||raw.modified!==false ||raw.read_only!==false ||raw.packages!==1)
   throw Error('REPLACEMENT_FIXED_NATIVE_SAFETY_REFUSED');return raw;};
 await safety();
 const proof=await readPreparedNodeContext(readPage,nativeBinding);guard();
 // The phase receipt ID pins publication; its value pins the native opening.
 // Those two IDs are intentionally different in the real node runner.
 const port=proof?.input_port;
 if(proof?.verified!==true ||proof.surface!=='wizard' ||proof.node_id!==publication.node_id
   ||proof.document_id!==publication.document_id ||proof.workflow_id!==publication.workflow_id
   ||proof.tid!==nativeBinding.workflow_ref.prefix+';WizrdMCF' ||proof.output_port
   ||port?.direction!=='input' ||port.port!==0 ||port.native_index!==0 ||typeof port.port_guid!=='string' ||!port.port_guid
   ||port.opening_operation_id!==node.opening.value?.opening_operation_id)
  throw Error('REPLACEMENT_FIXED_NATIVE_BINDING_REFUSED');
 const request={binding:nativeBinding,account:binding.account,package_path:binding.packagePath,origin:retained.startup.origin,
  build:identity.loginom_build,port_guid:port.port_guid,opening_operation_id:port.opening_operation_id};
 // Compiler is fixed immutable code; operands are strict data. No user callback.
 const read=new Function('return ('+compileReplacementReadContract(request)+')')();
 const diagnostic=await read(readPage);guard();
 validateReplacementReadContract(diagnostic,request);
 await safety();guard();
 const finalProof=await readPreparedNodeContext(readPage,nativeBinding);guard();
 if(JSON.stringify(finalProof)!==JSON.stringify(proof))throw Error('REPLACEMENT_FIXED_NATIVE_CHANGED');
 // One browser evaluation checks resource AND canonical native binding on
 // both sides of the dirty RPC. No independent read is moved past this await.
 await safety(proof);guard();
 const receipt={...diagnostic,admission_confirmed:false,settings_applied:false,execution_started:false,
  publication:{...publication},root:Object.fromEntries(rootKeys.map(k=>[k,publication[k]]))};
 captureData(receipt);assertCapturePublication(receipt,publication);issued.set(receipt,{request,node,retained,publication});return receipt;
}
export function validateCaptureResult(receipt,{retained,node,publication}) {
 assertCaptureOwner(retained);node.assertCurrent();captureData(receipt);assertCapturePublication(receipt,publication);
 if(retained.binding.harness!==kind ||retained.resource.path!==resourcePath ||receipt.native_capture_admitted!==false
   ||receipt.execution_started!==false ||receipt.settings_applied!==false)throw Error('REPLACEMENT_FIXED_RESULT');
 const pin=issued.get(receipt);
 if(!pin ||pin.node!==node ||pin.retained!==retained ||pin.publication!==publication)throw Error('REPLACEMENT_FIXED_RESULT');
 const request=pin.request,port=receipt.native_before?.input_port;
 if(receipt.status==='DIAGNOSTIC_READ'&&(!port ||port.opening_operation_id!==node.opening.value?.opening_operation_id))throw Error('REPLACEMENT_FIXED_RESULT');
 validateReplacementReadContract(receipt,request);return true;
}
// Native facts, no caller ready/verified/admission flags. Snapshot proxy identity
// and inventory around the async dirty-state RPC; unknown/falsy is not false.
function readOwnSafety(q,nativeRead){return (async()=>{
 const app=globalThis.bg?.app,main=app?.Application?.FInstance?.FMainForm,map=main?.FMapTree,prep=globalThis.__loginomDockPreparationV1;
 const no=()=>{throw Error('REPLACEMENT_FIXED_NATIVE_RESOURCE_REFUSED');};
 const snapshot=()=>{
  if(globalThis.bg?.app!==app||app?.Application?.FInstance?.FMainForm!==main||main?.FMapTree!==map
    ||globalThis.__loginomDockPreparationV1!==prep
    ||location.origin!==q.origin ||app?.Version!==q.build ||prep?.document!==document ||prep.id!==q.document_id
    ||map?.FServerConnection?.Connected!==true ||map.FServerConnection.UserName!==q.account)no();
  const tab=main.Items?.Workspace?.getActiveTab?.(),controller=tab?.Controller;let n=controller?.Node?.data?.node,pack;
  const seen=new Set();for(let i=0;n&&i<32&&!seen.has(n);i++,n=n.ParentNode){seen.add(n);if(n instanceof app.PackageTreeNode){pack=n;break;}}
  const inventory=map.PackageNodes,count=inventory?.Count;
  if(!pack ||pack.PackageFileName!==q.package_path ||pack.ReadOnly!==false ||count!==1 ||inventory.Items(0)!==pack
    ||typeof pack.HasRunningNodes!=='function' ||pack.HasRunningNodes()!==false ||!pack.Package
    ||typeof map.FServerConnection.Session?.IsPackageModified!=='function')no();
  const linked={};
  if(nativeRead){
   const proof=nativeRead(q.native_binding);
   if(proof?.verified!==true||JSON.stringify(proof)!==JSON.stringify(q.native_proof))
    throw Error('REPLACEMENT_FIXED_NATIVE_BINDING_REFUSED');
   const wizard=controller?.FController,portTree=controller?.Node?.data?.node?.ParentNode;
   const openings=[...(prep.inputPortOpenReceipts?.values()??[])].filter(o=>o.phase==='verified'
    &&o.document_id===q.native_binding.document_id&&o.workflow_id===q.native_binding.workflow_ref.workflow_id
    &&o.node_id===q.native_binding.node.node_id&&o.wizard===wizard&&o.portTree===portTree);
   if(openings.length!==1)throw Error('REPLACEMENT_FIXED_NATIVE_BINDING_REFUSED');
   const o=openings[0];Object.assign(linked,{preparation:prep,receipts:prep.receipts,openings:prep.inputPortOpenReceipts,
    opening:o,operation:o.operation_id,wizard,wizardTree:controller.Node.data.node,portTree,
    nodeTree:o.nodeTree,workflow:o.workflow,node:o.node,nodeData:o.nodeData,port:o.port,portData:o.portData,engine:o.enginePort});
  }
  return {tab,controller,pack,proxy:pack.Package,connection:map.FServerConnection,session:map.FServerConnection.Session,inventory,count,...linked};
 };
 const before=snapshot(),modified=await before.session.IsPackageModified(before.proxy),after=snapshot();
 if(Object.keys(before).some(k=>before[k]!==after[k]) ||typeof modified!=='boolean')no();
 return {owned:true,running:false,modified,read_only:false,packages:before.count};
})();}
