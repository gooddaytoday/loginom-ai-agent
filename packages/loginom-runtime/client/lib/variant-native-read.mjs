// Private Collapse capability. Fixed321/interface116, no generic RPC or fallback.
export async function readNativeVariant(page,b,decode,options={}) {
 return page.evaluate(async ({b,decoder,options})=>{
  const decode=eval("("+decoder+")");
  const v=(o,k)=>Object.getOwnPropertyDescriptor(o??{},k)?.value,need=(x,m)=>{if(!x)throw Error(m);};
  need(b.port===0&&b.method===321&&b.interface===116&&Number.isInteger(b.offset)&&b.offset>=0&&Number.isInteger(b.rows)&&b.rows>=0&&b.rows<=50&&b.offset===0&&b.rows===b.row_count&&Array.isArray(b.columns)&&b.columns.length>0&&b.columns.length<=8&&new Set(b.columns).size===b.columns.length,'fixed bounds');
  need(b.execution.status==='completed'&&b.execution.execution_id.startsWith(b.document_id+':'),'completed execution');
  const prep=globalThis.__loginomDockPreparationV1;
  const runtime=globalThis.__loginomDockCollapseRuntimeV1;
  need(runtime?.document===document&&runtime.binding_id===b.runtime_binding_id&&typeof b.runtime_binding_id==='string','loaded runtime proof required');
  need(prep?.document===document&&prep.id===b.document_id&&bg.app.Version==='7.4.2'&&location.origin===b.origin,'document/build');
  const receipt=[...prep.receipts.values()].find(r=>r.phase==='verified'&&r.workflowId===b.workflow_id&&r.nodeTargetWorkflowNode);
  need(receipt&&receipt.tab===document.querySelector('[data-tid='+JSON.stringify(b.tab_tid)+']')&&receipt.tab.classList.contains('x-tab-active'),'workflow receipt');
  const snapshot=()=>{
   const card=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab(),model=card.Controller.FController;
   let treeNode=card.Controller.Node?.data?.node,workflow,packageNode;for(let i=0;treeNode&&i<32;i++,treeNode=treeNode.ParentNode){if(treeNode instanceof bg.app.WorkFlowTreeNode)workflow=treeNode;if(treeNode instanceof bg.app.PackageTreeNode){packageNode=treeNode;break;}}
   need(workflow===receipt.nodeTargetWorkflowNode&&packageNode===receipt.packageNode,'workflow/package owner');
   const manager=v(model,'FPreviewManager'),form=v(manager,'FPreviewForm'),node=v(form,'FCurrentPreviewNode'),port=v(form,'FCurrentPreviewPort');
   need(v(manager,'FPreviewVisible')===true&&node?.FGuid===b.node_id&&port?.parent===node&&port.FGuid===b.port_guid&&port.FType===1&&port.FSubType===1&&port.FParam===0,'preview owner/port');
   need(manager.FShowDataLastCall.Node===node&&manager.FShowDataLastCall.Port===port&&node.FStatus===1&&node.FRunning===false&&port.FStatus===1,'active execution');
   const tree=document.querySelector('[data-tid="ConsoleForm;ProgressForm;trpProgress;treepanel;tree"]');
   need(tree,'execution tree unavailable');const processStore=Ext.getCmp(tree.id).getStore(),processRoot=processStore.getRoot();
   need(!processStore.isLoading()&&processRoot.data.loaded===true,'execution tree not complete');
   const parts=b.execution.execution_id.slice(b.document_id.length+1).split(':');
   need(parts.length===2&&String(processRoot.internalId)===parts[0],'execution root changed');
   const records=[];const walk=ns=>{need(records.length+ns.length<=2000,'execution bound');for(const r of ns){need(!r.data.loading,'execution loading');records.push(r);walk(r.childNodes??[]);}};walk(processRoot.childNodes);
   const groups=records.filter(r=>String(r.data.id)===parts[1]);need(groups.length===1&&groups[0].data.Status===3&&groups[0].data.ErrorDetails===''&&groups[0].data.loaded===true,'execution incomplete');
   const sourceNode=model.FDiagram.FNodes.FCollection.find(n=>n.FGuid===b.static_source.node_id);
   need(sourceNode?.FIconCls==='bg-vendor-icon-importtextfile'&&sourceNode.FStatus===1&&sourceNode.FRunning===false,'static source active');
   const sourceParts=b.static_source.execution_id.slice(b.document_id.length+1).split(':');
   need(sourceParts.length===2&&sourceParts[0]===parts[0],'static source execution root');
   const sourceProcesses=records.filter(r=>r.data.ModelNode===sourceNode.data);
   need(sourceProcesses.some(r=>String(r.data.id).startsWith(sourceParts[1]+'.')&&r.data.Status===3&&r.data.ErrorDetails==='')
    &&!sourceProcesses.some(r=>Number(String(r.data.id).split('.')[0])>Number(sourceParts[1])),'stale static source execution');
   const graphNodes=model.FDiagram.FNodes.FCollection;
   need(graphNodes.filter(n=>n.FIconCls==='bg-vendor-icon-importtextfile').length===1
    &&graphNodes.filter(n=>n!==node&&n!==sourceNode).every(n=>n.FIconCls==='bg-vendor-icon-modelvariables'&&n.FStatus===0&&n.FRunning===false),'unknown/dynamic graph source');
   // Test IDs normalize node labels (for example spaces become underscores).
   // Bind the real native edge and its port owners, independent of display names.
   const graphLinks=model.FDiagram.FLinks.FCollection,graphLink=graphLinks[0];
   need(graphLinks.length===1&&typeof graphLink?.FGuid==='string'&&graphLink.FGuid.length>0,'static topology changed');
   const sourcePort=graphLink.FSourcePort,inputPort=graphLink.FTargetPort;
   // FPortIndex is absent after native package reopen; use collection position.
   need(sourcePort?.parent===sourceNode&&sourceNode.FPorts[1].FCollection[0]===sourcePort
    &&inputPort?.parent===node&&node.FPorts[0].FCollection[0]===inputPort
    &&sourcePort.FType===1&&inputPort.FType===0
    &&[sourcePort,inputPort].every(p=>p.FSubType===1&&p.FParam===0&&typeof p.FGuid==='string'&&p.FGuid.length>0),'static topology changed');
   need(model.FCreateDraggedNodeStarted===false&&model.FDraggingOverGraph===false&&!model.FDraggedNode,'concurrent graph interaction');
   const ownProcesses=records.filter(r=>r.data.ModelNode===node.data);
   need(ownProcesses.some(r=>String(r.data.id).startsWith(parts[1]+'.')&&r.data.Status===3&&r.data.ErrorDetails===''),'execution node owner');
   need(!ownProcesses.some(r=>Number(String(r.data.id).split('.')[0])>Number(parts[1])),'stale execution');
   const processFingerprint=JSON.stringify(records.map(r=>[r.internalId,r.data.id,r.data.Status,r.data.ErrorDetails==='',r.data.ModelNode===node.data]));
   const root=document.querySelector('[data-tid='+JSON.stringify(b.prefix+';ModelForm;PreviewWindow;PreviewForm;DataSetForm')+']');
   need(root?.checkVisibility({checkVisibilityCSS:true}),'visible dataset');
   const dc=v(Ext.getCmp(root.id),'Controller'),dt=v(dc,'FDataTable'),ds=v(dc,'FDataSource'),store=v(dt,'FDataSourceStore'),helper=v(ds,'$FHelper'),identity=v(ds,'$');
   need(globalThis.__loginomDockCollapseRuntimeV1===runtime,'loaded runtime guard replaced');runtime.check(v(ds,'$S'));
   need(dc.FModelNode===node.data&&ds===v(dt,'FDataSource')&&v(v(store,'proxy'),'dataSource')===ds&&v(helper,'FBaseProxy')===ds,'datasource binding');
   need(v(identity,'$OW')===b.source.owner&&v(identity,'$O')===b.source.object,'datasource identity changed');
   need(v(identity,'$I')===116&&Number.isInteger(v(identity,'$OW'))&&v(identity,'$OW')>=0&&Number.isInteger(v(identity,'$O')),'interface116');
   need(!store.loading,'loaded cache');
   if(b.row_count===0){
    const proxy=v(store,'proxy'),names=v(proxy,'FDataFieldNames'),getters=v(proxy,'FValueGetters');
    need(v(dc,'FTotalRowCount')===0&&v(proxy,'FTotalRowCount')===0&&v(store,'totalCount')===0
     &&Array.isArray(names)&&JSON.stringify(names)===JSON.stringify(b.schema.map(c=>c.name))
     &&Array.isArray(getters)&&getters.length===b.schema.length&&getters.every(g=>typeof g==='function')
     &&Object.keys(v(proxy,'pendingOperations')).length===0&&Object.keys(v(store,'pageRequests')).length===0
     &&v(helper,'$FCacheInitialized')===false&&v(helper,'$FData')===null,'empty native count/schema attestation');
   }else need(v(helper,'$FCacheInitialized')===true&&v(helper,'$FData')&&v(helper,'$FDataChangeCookie')&&v(helper,'$FStateChangeCookie'),'loaded cache');
   const schema=v(v(v(dc,'FColumnInfosStore'),'data'),'items').map(r=>{const d=v(r,'data');return {name:d.Name,label:d.DisplayName,type:d.DataType};});
   need(JSON.stringify(schema)===JSON.stringify(b.schema)&&schema.length<=8&&b.columns.length===schema.length,'schema');
   const count=v(dt,'FTotalRowCount');need(count===b.row_count&&count===v(helper,'$FRowCount')&&b.offset+b.rows<=count&&b.columns.every(c=>Number.isInteger(c)&&c>=0&&c<schema.length),'row/column bounds');
   return {sourceNode,sourceData:sourceNode.data,graphLink,sourcePort,inputPort,graphFingerprint:JSON.stringify([graphLink.FGuid,sourcePort.FGuid,inputPort.FGuid]),processRoot,processFingerprint,node,port,dc,dt,ds,store,helper,cache:v(helper,'$FData'),identity,owner:v(identity,'$OW'),object:v(identity,'$O'),schema:JSON.stringify(schema),count};
  };
  need(Object.keys(options).every(k=>['operationId','timeoutMs','requireAtomicSnapshot','maxBytes'].includes(k)),'diagnostic option allowlist');
  need(options.requireAtomicSnapshot!==true,'atomic snapshot unavailable for fixed321');
  const maxBytes=options.maxBytes??1048576;need(Number.isSafeInteger(maxBytes)&&maxBytes>=60&&maxBytes<=1048576,'byte budget');
  const timeoutMs=options.timeoutMs??10000;
  need(Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=30000,'deadline bounds');
  const key='__loginomDockCollapseNativeV1';
  const state=globalThis[key]??(globalThis[key]={document,active:null,last:null,poisoned:false,used:new Set()});
  need(state.document===document&&!state.poisoned&&!state.active,'diagnostic session busy or retired; close own browser');
  const initial=snapshot(),equal=s=>Object.keys(initial).every(k=>initial[k]===s[k]);
  const op={id:options.operationId??'read-'+Date.now(),status:'running',pending:0,requests:0,releasedRequests:0,releasedResponses:0,lateResponses:0,published:false,nativeCancelled:false,receivedBytes:0,serializedBytes:new TextEncoder().encode(JSON.stringify(b)).length};
  need(typeof op.id==='string'&&op.id.length>0&&op.id.length<=128,'operation id');
  need(state.used.size<128&&!state.used.has(op.id),'operation id reused or diagnostic session limit');state.used.add(op.id);
  state.active=op;
  const deadline=Date.now()+timeoutMs;
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
export async function cancelNativeVariant(page,operationId) {
 return page.evaluate(id=>{
  const s=globalThis.__loginomDockCollapseNativeV1;
  if(!s||s.document!==document||s.active?.id!==id)return {cancelled:false};
  return {cancelled:s.active.stop('cancelled'),native_cancelled:false};
 },operationId);
}
export async function nativeVariantStatus(page) {
 return page.evaluate(()=>{
  const s=globalThis.__loginomDockCollapseNativeV1;
  if(!s||s.document!==document)return null;
  const o=s.active??s.last;if(!o)return null;
  const {stop,...record}=o;return {...record,retired:s.poisoned};
 });
}
