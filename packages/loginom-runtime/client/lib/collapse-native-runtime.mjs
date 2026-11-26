import {createHash} from 'node:crypto';
import {nativeRuntimePins} from './collapse-native-runtime-pins.mjs';
// Only reflects the actually used objects. Never dispatches a native message.
// The loaded 7.4.2 build is either the canonical or the compact RPC runtime; it is
// detected from the page itself (never from the caller) and an unknown or mixed
// build is refused. Evidence keys stay canonical; slots are the build's own names.
export function collectNativeRuntime(session) {
 const need=(x,m)=>{if(!x)throw Error('Loaded native runtime: '+m);};
 const functions={},message=rpc.TBGMessageDynamicData.prototype,klass=rpc.TBGMessageDynamicData;
 const builds={
  canonical:{session:{},message:{},transport:{},offsets:['$FSignatureOffset','$FMessageTypeOffset','$FMessageFormatVersionOffset','$FMessageIDOffset','$FObjectOwnerIDOffset','$FObjectIDOffset','$FMethodIDOffset'],
   state:{disposed:'$FDisposed',pendingDisconnect:'$FPendingDisconnect',transportStatus:'$FTransportStatus',socket:'$FSocket',data:'$FData',dataSize:'$FDataSize'}},
  compact:{session:{$DoDispatchMessageAsync:'$2',$GetNextMessageID:'$8'},message:{get_$ParametersOffset:'$6',$DoSetDataSize:'$1',$GrowData:'$3'},
   transport:{$SendMessage:'$4',$InvalidateResponseAwaiters:'$1',$CancelResponseAwaiters:'$0'},offsets:['$m','$f','$d','$e','$i','$h','$g'],
   state:{disposed:'$r',pendingDisconnect:'$y',transportStatus:'$F',socket:'$a',data:'$7',dataSize:'$8'}},
 };
 // A build is marked by its complete set of distinctive slots; exactly one may match.
 const marks=Object.entries(builds).filter(([,b])=>b.offsets.every(k=>Number.isInteger(klass[k]))
  &&typeof session?.[b.session.$DoDispatchMessageAsync??'$DoDispatchMessageAsync']==='function'&&typeof message[b.message.$GrowData??'$GrowData']==='function');
 need(marks.length===1,'unknown runtime build');
 const [profile,build]=marks[0];
 const add=(o,prefix,names,slots={})=>{for(const key of names){const slot=slots[key]??key;need(typeof o?.[slot]==='function','missing '+prefix+slot);functions[prefix+key]=o[slot];}};
 add(session,'session.',['DispatchMessageAsync','$DoDispatchMessageAsync','$GetNextMessageID','get_TransportStatus'],build.session);
 add(session.$M,'manager.',['GetDynamicData']);
 add(message,'message.',['get_$ParametersOffset','InitializeMethodCallMessage','Release','set_StaticDataSize','$DoSetDataSize','$GrowData','get_MessageType','get_MessageID','set_MessageID','set_Signature','set_MessageType','set_ObjectOwnerID','set_ObjectID','set_MethodID','WriteParameter','WriteParameter$a','CheckSignature','IsSignatureValid','get_Signature','get_MessageFormatVersion'],build.message);
 add(klass,'class.',['Acquire']);
 add(session.$T,'transport.',['SendReceive','$SendMessage','Send','InternalSend','DoReceive','DoReceiveMessage','$InvalidateResponseAwaiters','$CancelResponseAwaiters'],build.transport);
 add(BitConverter,'bit.',['FromInt8','FromUInt8','FromInt16','FromUInt16','FromInt32','FromUInt32','FromBigInt','FromInt64','FromUInt64','ToInt8','ToUInt8','ToInt16','ToUInt16','ToInt32','ToUInt32']);
 add(ss.Task.prototype,'task.',['continueWith','getAwaitedResult']);
 add(ss.TaskCompletionSource.prototype,'completion.',['setResult','setException']);
 const keys=['BGRemoteMessageSignature','$FSignatureOffset','$FMessageTypeOffset','$FMessageFormatVersionOffset','$FMessageIDOffset','$FObjectOwnerIDOffset','$FObjectIDOffset','$FMethodIDOffset'];
 const constants=Object.fromEntries(['BGRemoteMessageSignature',...build.offsets].map((slot,i)=>{need(Number.isInteger(klass[slot]),'missing constant '+slot);return [keys[i],klass[slot]];}));
 return {profile,slots:{...build.state,message:build.message},functions,constants,objects:[session,session.$M,session.$T,session.$T[build.state.socket],klass,message,BitConverter,ss.Task.prototype,ss.TaskCompletionSource.prototype]};
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
