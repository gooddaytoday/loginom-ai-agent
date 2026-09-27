// Private roundtrip transport. Keeps Collapse transport/release rules; its original reader is unchanged.
export async function readJavascriptNativeRoundtrip(page,b,decode,options={}) {
 return page.evaluate(async ({b,decoder,options})=>{
  const decode=eval("("+decoder+")");
  const v=(o,k)=>Object.getOwnPropertyDescriptor(o??{},k)?.value,need=(x,m)=>{if(!x)throw Error(m);};
  need(b.port===0&&b.method===321&&b.interface===116&&Number.isInteger(b.offset)&&b.offset>=0&&Number.isInteger(b.rows)&&b.rows>=0&&b.rows<=50&&b.offset===0&&b.rows===b.row_count&&Array.isArray(b.columns)&&b.columns.length>0&&b.columns.length<=8&&new Set(b.columns).size===b.columns.length,'fixed bounds');
  need(b.execution.status==='completed'&&b.execution.execution_id.startsWith(b.document_id+':'),'completed execution');
  const prep=globalThis.__loginomDockPreparationV1;
  const runtime=globalThis.__loginomJavascriptNativeRuntimeV1;
  need(runtime?.document===document&&runtime.binding_id===b.runtime_binding_id&&typeof b.runtime_binding_id==='string','loaded runtime proof required');
  need(prep?.document===document&&prep.id===b.document_id&&bg.app.Version==='7.4.2'&&location.origin===b.origin,'document/build');
  const receipt=[...prep.receipts.values()].find(r=>r.phase==='verified'&&r.workflowId===b.workflow_id&&r.nodeTargetWorkflowNode);
  need(receipt&&receipt.tab===document.querySelector('[data-tid='+JSON.stringify(b.tab_tid)+']')&&receipt.tab.classList.contains('x-tab-active'),'workflow receipt');
  const captured=globalThis.__loginomJavascriptNativeRoundtripV1?.bindings.get(b.roundtrip_role);
  need(captured?.document===document&&captured.id===b.runtime_binding_id,'private native input binding required');
  const slice={real:[4,3],boolean:[3,1],string:[8,5],'integer-safe':[4,4],'integer-outside-safe':[3,4],'civil-datetime':[3,2]}[b.fixture_id??'real'];
  need(Array.isArray(slice)&&b.rows===slice[0]&&b.row_count===slice[0]&&b.columns.length===1&&b.columns[0]===0
    &&JSON.stringify(b.schema)===JSON.stringify([{name:'Value',label:'Value',type:slice[1]}]),'fixed native slice');
  const snapshot=()=>captured.capture(b);
  const bound=()=>{const s=snapshot();need(Object.keys(captured.initial).every(k=>captured.initial[k]===s[k]),'native input changed since binding');return s;};
  need(Object.keys(options).every(k=>['operationId','timeoutMs','requireAtomicSnapshot','maxBytes'].includes(k)),'diagnostic option allowlist');
  need(options.requireAtomicSnapshot!==true,'atomic snapshot unavailable for fixed321');
  const maxBytes=options.maxBytes??65536;need(Number.isSafeInteger(maxBytes)&&maxBytes>=60&&maxBytes<=65536,'byte budget');
  const timeoutMs=Math.min(options.timeoutMs??10000,b.deadline-Date.now());
  need(Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=30000,'deadline bounds');
  const key='__loginomJavascriptNativeRoundtripReadV1';
  const state=globalThis[key]??(globalThis[key]={document,active:null,last:null,poisoned:false,used:new Set()});
  need(state.document===document&&!state.poisoned&&!state.active,'diagnostic session busy or retired; close own browser');
  const initial=bound(),equal=s=>Object.keys(initial).every(k=>initial[k]===s[k]);
  const op={id:options.operationId??'read-'+Date.now(),status:'running',pending:0,requests:0,releasedRequests:0,releasedResponses:0,lateResponses:0,published:false,nativeCancelled:false,receivedBytes:0,serializedBytes:new TextEncoder().encode(JSON.stringify(b)).length};
  need(typeof op.id==='string'&&op.id.length>0&&op.id.length<=128,'operation id');
  need(state.used.size<128&&!state.used.has(op.id),'operation id reused or diagnostic session limit');state.used.add(op.id);
  need(!captured.readStarted,'native read binding reused; no replay');
  state.active=op;
  const deadline=Math.min(Date.now()+timeoutMs,b.deadline);
  let stopPending;
  op.stop=reason=>{if(op.status!=='running')return false;op.status=reason;state.poisoned=true;stopPending?.();return true;};
  const timer=setTimeout(()=>op.stop('deadline_exceeded'),timeoutMs);
  const live=()=>{if(Date.now()>=deadline)op.stop('deadline_exceeded');need(op.status==='running',op.status+'; native cancellation unproven');};
  try {
  const output=[];
  for(let row=b.offset;row<b.offset+b.rows;row++)for(const column of b.columns){
   live();need(maxBytes-op.receivedBytes>=60&&op.serializedBytes<maxBytes,'byte budget before dispatch');need(equal(snapshot()),'stale owner/schema/cache before read');
   const session=v(initial.ds,'$S');let request,response,callbackOwns=false;
   const releaseRequest=()=>{if(request){request.Release();request=null;op.releasedRequests++;}};
   const releaseResponse=x=>{if(x){x.Release();op.releasedResponses++;}};
   try{
    captured.readStarted=true; // Reserve before the first native request; new IDs cannot replay this binding.
    request=session.$M.GetDynamicData();runtime.check(session,request);request.set_StaticDataSize(32);
    request.InitializeMethodCallMessage(initial.owner,initial.object,321,0);
    request.WriteParameter(0,row);request.WriteParameter$a(8,column);
    // false avoids exception-object unmarshalling through another remote interface.
    response=await new Promise((resolve,reject)=>{
     op.pending++;op.requests++;callbackOwns=true;
     stopPending=()=>reject(Error(op.status+'; native cancellation unproven; close own browser'));
     try {session.DispatchMessageAsync(request,false).continueWith(t=>{
      let received;
      try {received=t.getAwaitedResult();
       if(op.status!=='running'){op.lateResponses++;releaseResponse(received);releaseRequest();return;}
       callbackOwns=false;resolve(received);
      }catch(e){callbackOwns=false;releaseResponse(received);releaseRequest();reject(e);}
      finally{op.pending--;stopPending=null;}
     });}catch(e){op.pending--;callbackOwns=false;stopPending=null;reject(e);}
    });
    live();
    need(equal(snapshot()),'stale owner/schema/cache after read');
    runtime.check(session,response);
    need(response.get_MessageType()===1,'non-value response; no exception unmarshalling');
    need(response.get_MessageID()===request.get_MessageID(),'response ID mismatch');
    response.set_StaticDataSize(12);
    const bytes=v(response,'$FData'),size=v(response,'$FDataSize');
    need(bytes instanceof Uint8Array&&Number.isInteger(size)&&size>=22&&size<=65536&&size<=bytes.length,'payload bounds');
    need(size<=maxBytes-op.receivedBytes,'native byte budget before copy');op.receivedBytes+=size;
    const payload=Array.from(bytes.subarray(12,size)),tag=new DataView(Uint8Array.from(payload).buffer).getInt16(0,true);
    need([1,3,4,5,7,8,11,20].includes(tag),'unknown/interface tag');
    const decoded=decode(payload,size);
    const cell={row,column,tag,payload:payload.slice(0,decoded.consumed_bytes),frame_size:size,decoded,message_id:response.get_MessageID()};
    const cost=new TextEncoder().encode(JSON.stringify(cell)).length+1;need(cost<=maxBytes-op.serializedBytes,'serialized byte budget before append');op.serializedBytes+=cost;output.push(cell);
   } finally {releaseResponse(response);if(!callbackOwns)releaseRequest();}
  }
  live();need(equal(snapshot()),'final stale binding');
  const result={empty_count_attested:b.row_count===0,read_id:op.id,workflow_id:b.workflow_id,package_id:b.package_id,method:321,interface:116,document_id:b.document_id,execution:b.execution,node_id:b.node_id,port_guid:b.port_guid,port:0,source:{owner:initial.owner,object:initial.object},row_count:initial.count,schema:b.schema,cells:output,owner_rechecked:true,cache_identity_rechecked:true,consistency:'observed_local_only',atomic_snapshot_verified:false,native_cancellation_supported:false};
  need(new TextEncoder().encode(JSON.stringify(result)).length<=maxBytes,'final serialization byte budget');op.status='completed';op.published=true;return result;
  }catch(e){if(op.status==='running')op.status='failed';if(op.requests>0)state.poisoned=true;throw e;}finally{clearTimeout(timer);delete op.stop;state.last=op;state.active=null;}
 },{b,decoder:decode.toString(),options});
}

// Local diagnostic latch only. No native RPC, transport patch or server cancellation.
export async function cancelJavascriptNativeRoundtrip(page,operationId) {
 return page.evaluate(id=>{
  const s=globalThis.__loginomJavascriptNativeRoundtripReadV1;
  if(!s||s.document!==document||s.active?.id!==id)return {cancelled:false};
  return {cancelled:s.active.stop('cancelled'),native_cancelled:false};
 },operationId);
}
export async function javascriptNativeRoundtripStatus(page) {
 return page.evaluate(()=>{
  const s=globalThis.__loginomJavascriptNativeRoundtripReadV1;
  if(!s||s.document!==document)return null;
  const o=s.active??s.last;if(!o)return null;
  const {stop,...record}=o;return {...record,retired:s.poisoned};
 });
}
