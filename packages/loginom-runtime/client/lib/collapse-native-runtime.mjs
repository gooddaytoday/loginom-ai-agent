import {createHash} from 'node:crypto';
import {nativeRuntimePins} from './collapse-native-runtime-pins.mjs';
// Only reflects the actually used objects. Never dispatches a native message.
export function collectNativeRuntime(session) {
 const need=(x,m)=>{if(!x)throw Error('Loaded native runtime: '+m);};
 const functions={},message=rpc.TBGMessageDynamicData.prototype,klass=rpc.TBGMessageDynamicData;
 const add=(o,prefix,names)=>{for(const k of names){need(typeof o?.[k]==='function','missing '+prefix+k);functions[prefix+k]=o[k];}};
 add(session,'session.',['DispatchMessageAsync','$DoDispatchMessageAsync','$GetNextMessageID','get_TransportStatus']);
 add(session.$M,'manager.',['GetDynamicData']);
 add(message,'message.',['get_$ParametersOffset','InitializeMethodCallMessage','Release','set_StaticDataSize','$DoSetDataSize','$GrowData','get_MessageType','get_MessageID','set_MessageID','set_Signature','set_MessageType','set_ObjectOwnerID','set_ObjectID','set_MethodID','WriteParameter','WriteParameter$a','CheckSignature','IsSignatureValid','get_Signature','get_MessageFormatVersion']);
 add(klass,'class.',['Acquire']);
 add(session.$T,'transport.',['SendReceive','$SendMessage','Send','InternalSend','DoReceive','DoReceiveMessage','$InvalidateResponseAwaiters','$CancelResponseAwaiters']);
 add(BitConverter,'bit.',['FromInt8','FromUInt8','FromInt16','FromUInt16','FromInt32','FromUInt32','FromBigInt','FromInt64','FromUInt64','ToInt8','ToUInt8','ToInt16','ToUInt16','ToInt32','ToUInt32']);
 add(ss.Task.prototype,'task.',['continueWith','getAwaitedResult']);
 add(ss.TaskCompletionSource.prototype,'completion.',['setResult','setException']);
 const constants=Object.fromEntries(['BGRemoteMessageSignature','$FSignatureOffset','$FMessageTypeOffset','$FMessageFormatVersionOffset','$FMessageIDOffset','$FObjectOwnerIDOffset','$FObjectIDOffset','$FMethodIDOffset'].map(k=>{need(Number.isInteger(klass[k]),'missing constant '+k);return [k,klass[k]];}));
 return {functions,constants,objects:[session,session.$M,session.$T,session.$T.$FSocket,klass,message,BitConverter,ss.Task.prototype,ss.TaskCompletionSource.prototype]};
}
export async function bindLoadedNativeRuntime(page,args,collect=collectNativeRuntime) {
 return page.evaluate(({a,code})=>{
  const need=(x,m)=>{if(!x)throw Error('Loaded native runtime: '+m);};
  const prep=globalThis.__loginomDockPreparationV1;
  need(prep?.document===document&&prep.id===a.document_id&&location.origin===a.origin&&bg.app.Version==='7.4.2','document mismatch');
  const model=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;
  const node=model.FDiagram.FNodes.FCollection.find(n=>n.FGuid===a.node_id),session=node?.data?.$S;
  need(session,'owned node session missing');
  const capture=eval('('+code+')'),initial=capture(session),stringify=Function.prototype.toString;
  const sources=Object.fromEntries(Object.entries(initial.functions).map(([k,f])=>[k,stringify.call(f)]));
  const check=(s,message)=>{
   need(document===prep.document&&globalThis.__loginomDockPreparationV1===prep&&s===session,'session/document changed');
   need(session.$FDisposed===false&&session.$FPendingDisconnect===false&&session.$FTransportStatus===0
    &&session.$T.FFinished===false&&session.$T.FDisconnected===false&&session.$T.$FSocket?.readyState===1,'session transport not live');
   const current=capture(s);
   need(initial.objects.every((o,i)=>o===current.objects[i])&&JSON.stringify(initial.constants)===JSON.stringify(current.constants),'runtime objects/constants changed');
   need(Object.keys(sources).every(k=>initial.functions[k]===current.functions[k]),'critical implementation changed');
   if(message)for(const [key,fn]of Object.entries(initial.functions))if(key.startsWith('message.'))need(message[key.slice(8)]===fn,'message implementation changed');
   return true;
  };
  check(session);
  globalThis.__loginomDockCollapseRuntimeV1={document,binding_id:a.binding_id,session,check};
  return {binding_id:a.binding_id,document_id:a.document_id,sources,constants:initial.constants};
 },{a:args,code:collect.toString()});
}
export function verifyLoadedNativeRuntime(proof,{binding_id,document_id}) {
 if(proof?.binding_id!==binding_id||proof.document_id!==document_id)throw Error('Loaded native runtime identity differs');
 const hashes=Object.fromEntries(Object.entries(proof.sources).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')]));
 if(JSON.stringify(hashes)!==JSON.stringify(nativeRuntimePins.functions)||JSON.stringify(proof.constants)!==JSON.stringify(nativeRuntimePins.constants))throw Error('Loaded critical native implementation differs from supported profile');
 return {binding_id,document_id,functions:hashes,constants:proof.constants};
}
