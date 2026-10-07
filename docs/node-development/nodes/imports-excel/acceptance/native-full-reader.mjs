/** Stage-0 diagnostic prototype only: no product bridge/admission/model preview changes.
 * Caller must independently open the exact package, read persisted wizard settings,
 * download current original server bytes, capture baseline process IDs BEFORE its
 * native execute gesture, wait for completion, and open this exact output preview.
 * Initial preview cache changes fail closed; stabilize before a new audit.
 * No atomic server snapshot guarantee is claimed.
 */
export async function readFullNative(page, binding) {
 if (!binding || !/^MF;TF(?:-\d+)?$/.test(binding.prefix) || !binding.nodeId || !binding.portGuid
     || !binding.packagePath?.startsWith('/') || !Array.isArray(binding.baseline)
     || !Number.isInteger(binding.rowCount) || binding.rowCount < 0 || !Array.isArray(binding.schema))
   throw Error('EXACT_DIAGNOSTIC_BINDING_REQUIRED');

return await page.evaluate(async binding=>{
 const tid=binding.prefix+';ModelForm;PreviewWindow;PreviewForm;DataSetForm',el=document.querySelector('[data-tid='+JSON.stringify(tid)+']'),d=Ext.getCmp(el.id).Controller,ds=d.FDataSource,helper=ds.$FHelper;
 const model=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController,form=model.FPreviewManager.FPreviewForm,node=form.FCurrentPreviewNode,port=form.FCurrentPreviewPort;
 const schema=()=>d.FColumnInfosStore.data.items.map(r=>({name:r.data.Name,label:r.data.DisplayName,type:r.data.DataType}));
 const fields=schema(),count=d.FDataTable.FTotalRowCount,dc=helper.$FDataChangeCookie,sc=helper.$FStateChangeCookie,cache=helper.$FData;
 const progress=document.querySelector('[data-tid="ConsoleForm;ProgressForm;trpProgress;treepanel;tree"]');const store=Ext.getCmp(progress.id).getStore(),root=store.getRoot();
 const processes=()=>{const records=[];const walk=ns=>{for(const r of ns){records.push(r);walk(r.childNodes??[]);}};walk(root.childNodes);return records;};
 if(node.FGuid!==binding.nodeId || port.FGuid!==binding.portGuid || port.FParam!==0)throw Error('WRONG_NODE_PORT');
 const packages=bg.app.Application.FInstance.FMainForm.FMapTree.PackageNodes;
 if(packages.Count!==1 || '/'+packages.Items(0).PackageFileName.replace(/^\/+/, '')!==binding.packagePath)throw Error('WRONG_PACKAGE');
 const owned=processes().filter(r=>r.data.ModelNode===node.data&&r.data.Status===3&&r.data.ErrorDetails===''&&!binding.baseline.includes(String(r.data.id)));if(!owned.length)throw Error('NO_COMPLETED_OWNED_EXECUTION');
 const execution=owned.sort((a,b)=>Number(String(b.data.id).split('.')[0])-Number(String(a.data.id).split('.')[0]))[0];
 const id=String(execution.data.id),processFingerprint=()=>JSON.stringify(processes().map(r=>[r.internalId,r.data.id,r.data.Status,r.data.ErrorDetails,r.data.ModelNode===node.data]));const fingerprint=processFingerprint();
 const need=(x,m)=>{if(!x)throw Error(m);};
 const check=()=>{need(packages.Count===1 && '/'+packages.Items(0).PackageFileName.replace(/^\/+/, '')===binding.packagePath,'PACKAGE_CHANGED');need(document.querySelector('[data-tid='+JSON.stringify(tid)+']')===el&&model.FPreviewManager.FPreviewForm===form&&form.FCurrentPreviewNode===node&&form.FCurrentPreviewPort===port&&port.parent===node&&port.FParam===0,'OWNER_CHANGED');need(node.FStatus===1&&node.FRunning===false&&port.FStatus===1,'EXECUTION_NOT_ACTIVE');need(d.FDataSource===ds&&d.FDataTable.FDataSource===ds&&helper===ds.$FHelper&&helper.$FDataChangeCookie===dc&&helper.$FStateChangeCookie===sc&&helper.$FData===cache,'DATASOURCE_COOKIE_CHANGED');need(d.FDataTable.FTotalRowCount===count&&helper.$FRowCount===count&&JSON.stringify(schema())===JSON.stringify(fields),'COUNT_SCHEMA_CHANGED');need(processFingerprint()===fingerprint,'EXECUTION_HISTORY_CHANGED');};
 check();need(count===binding.rowCount&&JSON.stringify(fields)===JSON.stringify(binding.schema),'UNEXPECTED_SCHEMA_COUNT');const task=t=>new Promise((resolve,reject)=>t.continueWith(t=>{try{resolve(t.getAwaitedResult());}catch(e){reject(e);}}));
 const rows=[];for(let r=0;r<count;r++){
  if(r%100===0)check();const row=[];
  for(let c=0;c<fields.length;c++){
   const is_null=await task(ds.IsNull(r,c));let value=is_null?null:await task(ds.AsVariant(r,c));
   if(value instanceof Date)value=value.toISOString().slice(0,-1);
   if(fields[c].type===4&&!is_null)need(Number.isSafeInteger(value),'UNSAFE_INTEGER');
   row.push({is_null,value});
  }
  rows.push(row);if(r%100===99)check();
 }check();
 return {node_id:node.FGuid,port_guid:port.FGuid,port:0,execution:{root:String(root.internalId),process:id,status:execution.data.Status,error:execution.data.ErrorDetails},source:{owner:ds.$.$OW,object:ds.$.$O},row_count:count,schema:fields,rows,coverage:{rows:rows.length,cells:rows.length*fields.length,complete:rows.length===count,ordered:true},binding_rechecked:true,consistency:'observed_local_only',atomic_snapshot_verified:false,helper_block_size:helper.$FBlockSize,helper_block_source:helper.$CacheBlockAsync.toString(),fresh_execution_verified:true};
},binding);
}
