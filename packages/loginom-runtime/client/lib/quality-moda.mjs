import {randomUUID} from 'node:crypto';
import {bindLoadedNativeRuntime,collectNativeRuntime,verifyLoadedNativeRuntime} from './collapse-native-runtime.mjs';
import {decodeVariantFrame} from './variant-native-decode.mjs';
import {makeNodePortOutputCode} from './node-port-output.mjs';

// Private, single-column capability. The ordinary completed-port reader owns
// document/workflow/node/port/execution/source guards and proxy disposal.
export async function readQualityPortOutput(execute,binding,request,options){
 if(request.port!==4||request.rowOffset!==undefined)throw Error('Quality Moda requires output 4 without a private row window');
 const binding_id='quality-'+randomUUID();
 const args={document_id:binding.document_id,node_id:binding.node.node_id,origin:options.origin,binding_id};
 const proof=await execute(`async page=>(${bindLoadedNativeRuntime.toString()})(page,${JSON.stringify(args)},${collectNativeRuntime.toString()})`,{timeout:10000});
 verifyLoadedNativeRuntime(proof,{binding_id,document_id:binding.document_id});
 return execute(makeNodePortOutputCode(binding,request,options,{binding_id,read:readQualityModa,decode:decodeVariantFrame}),{timeout:Math.max(5000,options.deadline-Date.now()+5000)});
}

// Serialized with the existing bounded frame decoder, never an AsVariant
// conversion: that conversion loses the native variant subtype.
export async function readQualityModa({source,node,port,portIndex,rowCount,rows,schema,bindingId,deadline,stable},decode){
 const need=(v,m)=>{if(!v)throw Error('Quality Moda: '+m);};
 need(node?.FIconCls==='bg-vendor-icon-quality'&&port?.parent===node&&portIndex===4
  &&node.FPorts[1].FCollection.filter(p=>p.FSubType===1)[4]===port,'owned Quality summary port');
 need(Number.isInteger(rowCount)&&rowCount>=0&&rowCount<=50&&Number.isInteger(rows)&&rows>=0&&rows<=rowCount,'50-row bound');
 const labels=['N','DisplayName','DataType','DataKind','Null','Out','Extr','Avg','Moda','Median'];
 need(schema.length===10&&schema.every((f,i)=>f.index===i&&f.name==='Col'+i&&f.label===labels[i])&&schema[8].type==='variant','fixed summary schema');
 const runtime=globalThis.__loginomDockCollapseRuntimeV1,session=source.$S,identity=source.$;
 need(runtime?.document===document&&runtime.binding_id===bindingId&&identity.$I===116,'pinned interface116 runtime');
 runtime.check(session);stable();
 const timeout=Math.min(30000,deadline-Date.now());need(timeout>0,'deadline');
 const key='__loginomDockCollapseNativeV1',state=globalThis[key]??(globalThis[key]={document,active:null,last:null,poisoned:false,used:new Set()});
 need(state.document===document&&!state.poisoned&&!state.active&&state.used.size<128&&!state.used.has(bindingId),'native lifecycle unavailable');
 const op={id:bindingId,status:'running',pending:0,requests:0,releasedRequests:0,releasedResponses:0,lateResponses:0,published:false,nativeCancelled:false,receivedBytes:0,serializedBytes:0};
 state.used.add(bindingId);state.active=op;
 let stopPending;
 op.stop=reason=>{if(op.status!=='running')return false;op.status=reason;state.poisoned=true;stopPending?.();return true;};
 const timer=setTimeout(()=>op.stop('deadline_exceeded'),timeout),cells=[],messages=new Set();
 const live=()=>{need(op.status==='running'&&Date.now()<deadline,'deadline or cancellation');stable();runtime.check(session);};
 try{
  for(let row=0;row<rows;row++){
   live();need(op.receivedBytes+60<=1048576,'native byte bound');
   let request,response,callbackOwns=false;
   const releaseRequest=()=>{if(request){request.Release();request=null;op.releasedRequests++;}};
   const releaseResponse=r=>{if(r){r.Release();op.releasedResponses++;}};
   try{
    request=session.$M.GetDynamicData();runtime.check(session,request);request.set_StaticDataSize(32);
    request.InitializeMethodCallMessage(identity.$OW,identity.$O,321,0);
    request.WriteParameter(0,row);request.WriteParameter$a(8,8);
    response=await new Promise((resolve,reject)=>{
     op.pending++;op.requests++;callbackOwns=true;
     stopPending=()=>reject(Error('native cancellation unproven'));
     try{session.DispatchMessageAsync(request,false).continueWith(t=>{
      let received;
      try{received=t.getAwaitedResult();if(op.status!=='running'){op.lateResponses++;releaseResponse(received);releaseRequest();return;}callbackOwns=false;resolve(received);}
      catch(e){callbackOwns=false;releaseResponse(received);releaseRequest();reject(e);}
      finally{op.pending--;stopPending=null;}
     });}catch(e){op.pending--;callbackOwns=false;stopPending=null;reject(e);}
    });
    live();runtime.check(session,response);
    need(response.get_MessageType()===1&&response.get_MessageID()===request.get_MessageID()&&!messages.has(response.get_MessageID()),'value response identity');
    messages.add(response.get_MessageID());response.set_StaticDataSize(12);
    const bytes=response.$FData,size=response.$FDataSize;
    need(bytes instanceof Uint8Array&&Number.isInteger(size)&&size>=60&&size<=65536&&size<=bytes.length&&size<=1048576-op.receivedBytes,'frame bounds');op.receivedBytes+=size;
    const payload=Array.from(bytes.subarray(12,size)),d=decode(payload,size);
    need([1,5,8,20].includes(d.tag),'unsupported Moda subtype');
    const value=d.type==='null'?null:d.type==='integer'?d.decimal:d.type==='real'?d.representation:d.value;
    const cell={type:'variant',cell_type:d.type,is_null:d.type==='null',value,precision:'exact_native',
     representation:d.type==='real'?'binary64_decimal':d.type==='integer'?'decimal_integer':d.type==='null'?'native_null':'native_string',
     ...(['real','integer'].includes(d.type)?{decimal:value}:{}),
     native:{tag:d.tag,encoding:{1:'null',5:'ieee754-binary64-le',8:'utf8',20:'signed-int64-le'}[d.tag],...(d.tag===8?{utf8_hex:Array.from(new TextEncoder().encode(d.value)).map(n=>n.toString(16).padStart(2,'0')).join('')}:{}),...(d.tag===20?{bits:64,bytes_le:payload.slice(2,10).map(n=>n.toString(16).padStart(2,'0')).join('')}:{}),...(d.bytes_le?{bits:d.bits,bytes_le:d.bytes_le}:{} )}};
    op.serializedBytes+=new TextEncoder().encode(JSON.stringify(cell)).length;need(op.serializedBytes<=1048576,'serialized byte bound');cells.push(cell);
   }finally{releaseResponse(response);if(!callbackOwns)releaseRequest();}
  }
  live();need(op.pending===0&&op.requests===rows&&op.releasedRequests===rows&&op.releasedResponses===rows,'native cleanup');
  op.status='completed';op.published=true;return cells;
 }catch(error){if(op.status==='running')op.status='failed';if(op.requests>0)state.poisoned=true;error.qualityNativeUncertain=op.pending>0;throw error;}
 finally{clearTimeout(timer);delete op.stop;state.last=op;state.active=null;}
}
