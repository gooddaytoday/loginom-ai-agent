// Bounded metadata-only read of the actual retained input mapping. No wizard,
// activation, configuration, synchronization or value access is permitted here.
export async function readCollapseInputBrowser({binding,sources,budgetMs,runtimeBinding}) {
 const need=(v,m)=>{if(!v)throw Error('Collapse input snapshot: '+m);};
 const prep=globalThis.__loginomDockPreparationV1,started=Date.now(),owned=[],released=[];
 need(prep?.document===document&&prep.id===binding.document_id&&bg.app.Version==='7.4.2','document/build');
 const workspace=bg.app.Application.FInstance.FMainForm.Items.Workspace,card=workspace.getActiveTab(),model=card.Controller.FController;
 const diagram=model.FDiagram,nodes=diagram?.FNodes?.FCollection;
 need(Array.isArray(nodes)&&nodes.length<=200,'bounded native graph');
 const matches=nodes.filter(n=>n.FGuid===binding.node.node_id);need(matches.length===1,'node owner');
 const node=matches[0],links=diagram.FLinks.FCollection.filter(l=>l.FTargetPort.parent===node);
 need(node.FIconCls==='bg-vendor-icon-columnflipping'&&links.length===1,'one Collapse input');
 const link=links[0],port=link.FTargetPort;
 need(port.FType===0&&port.FSubType===1&&port.FParam===0&&Array.isArray(node.FPorts[0]?.FCollection)&&node.FPorts[0].FCollection.includes(port),'input port identity');
 const session=node.data.$S,base=Object.getPrototypeOf(Object.getPrototypeOf(node.data));
 const locate=key=>{const split=key.indexOf('.'),owner=key.slice(0,split),name=key.slice(split+1);
  return (owner==='proxy'?base:owner==='session'?session:owner==='message'?rpc.TBGMessageDynamicData.prototype:bg.rpc[owner]?.prototype)?.[name];};
 const functions=Object.fromEntries(Object.entries(sources).map(([key,source])=>{const f=locate(key);need(typeof f==='function'&&Function.prototype.toString.call(f)===source,'unsupported loaded '+key);return [key,f];}));
 const identity=()=>({node:node.FGuid,input:port.FGuid,link:link.FGuid,source:link.FSourcePort.parent.FGuid,source_port:link.FSourcePort.FGuid,
  status:node.FStatus,state:node.FState,input_status:port.FStatus,source_status:link.FSourcePort.FStatus,locked:node.FLocked});
 const before=identity(),runtime=globalThis.__loginomDockCollapseRuntimeV1;
 need(runtime?.binding_id===runtimeBinding&&runtime.session===session,'loaded runtime binding');
 const guard=()=>{
  need(Date.now()-started<budgetMs,'bounded read deadline');
  need(globalThis.__loginomDockCollapseRuntimeV1===runtime,'runtime binding changed');runtime.check(session);
  need(globalThis.__loginomDockPreparationV1===prep&&prep.document===document&&workspace.getActiveTab()===card&&card.Controller.FController===model,'owner changed');
  need(model.FDiagram===diagram&&diagram.FNodes.FCollection.includes(node)&&diagram.FLinks.FCollection.includes(link)&&link.FTargetPort===port&&port.parent===node,'graph changed');
  need(JSON.stringify(identity())===JSON.stringify(before)&&node.data.$S===session,'input state changed');
  need(session.$FDisposed===false&&session.$FPendingDisconnect===false&&session.$FTransportStatus===0,'native session unavailable');
  for(const [key,f] of Object.entries(functions))need(locate(key)===f,'loaded implementation changed');
 };
 const awaitTask=t=>new Promise((resolve,reject)=>{need(t&&typeof t.continueWith==='function','native task required');t.continueWith(t=>{try{resolve(t.getAwaitedResult());}catch(e){reject(e);}});});
 const call=async(o,name,klass,args=[],acquire=false)=>{guard();need(o?.[name]===functions[klass+'.'+name]&&o.$S===session,'method/instance owner '+name);const value=await awaitTask(o[name](...args));if(acquire){owned.push(value);need(value&&value.$S===session,'returned proxy owner');}guard();return value;};
 const object=(o,name,klass,args)=>call(o,name,klass,args,true);
 let result,error;
 try {
  guard();
  const socket=await object(port.data,'get_Socket','TIBGModelNodeInputPort_Proxy');
  const tune=await object(socket,'QueryInterface','proxy',[bg.IBGTuneDataSourceSocket]);
  const ds=await object(tune,'get_TuneDataSource','TIBGTuneDataSourceSocket_Proxy');
  const columns=await object(ds,'get_Columns','TIBGTuneDataSource_Proxy'),defs=await object(ds,'get_ColumnDefs','TIBGTuneDataSource_Proxy');
  const count=await call(columns,'get_Count','TIBGColumns_Proxy'),definitionCount=await call(defs,'get_Count','TIBGTuneColumnDefs_Proxy');
  need(Number.isInteger(count)&&count>=0&&count<=1000&&definitionCount===count,'complete bounded effective input');
  const usage=await call(columns,'get_PresentUsageTypes','TIBGColumns_Proxy');
  const definitionUsage=await call(defs,'get_PresentUsageTypes','TIBGTuneColumnDefs_Proxy');
  need([usage,definitionUsage].every(v=>Number.isInteger(v)&&v>=0&&v<=65535),'usage mask');
  // Before first execution, effective columns can retain Undefined while the
  // saved definitions already carry Information/Transposed. Hash both sets.
  const hashedUsage=usage|definitionUsage;
  const schemaBytes=async()=>{const bytes=await call(ds,'GetColumnsHash','TIBGTuneDataSource_Proxy',[hashedUsage]);need(bytes instanceof Uint8Array&&bytes.length<=65536&&(count===0||bytes.length>0),'native schema fingerprint');return Array.from(bytes);};
  const hashBefore=await schemaBytes(),active=await call(ds,'get_Active','TIBGTuneDataSource_Proxy');need(typeof active==='boolean','active state');
  const scan=async()=>{
   const fields=[];
   for(let i=0;i<count;i++){
    const column=await object(columns,'getItem','TIBGColumns_Proxy',[i]),def=await object(defs,'getItem','TIBGTuneColumnDefs_Proxy',[i]);
    const read=async(o,k)=>({index:await call(o,'get_Index',k),id:await call(o,'get_ID',k),name:await call(o,'get_Name',k),type:await call(o,'get_DataType',k)});
    const actual=await read(column,'TIBGColumn_Proxy'),definition=await read(def,'TIBGTuneColumnDef_Proxy');
    need(JSON.stringify(actual)===JSON.stringify(definition)&&actual.index===i,'effective columns/definitions differ');
    fields.push({...actual,source_name:await call(def,'get_InputColumnInfoName','TIBGTuneColumnDef_Proxy')});
   }
   return fields;
  };
  const fields=await scan(),again=await scan(),hashAfter=await schemaBytes();
  need(JSON.stringify(fields)===JSON.stringify(again)&&JSON.stringify(hashBefore)===JSON.stringify(hashAfter),'schema changed while reading');
  need(await call(columns,'get_Count','TIBGColumns_Proxy')===count&&await call(defs,'get_Count','TIBGTuneColumnDefs_Proxy')===count&&await call(ds,'get_Active','TIBGTuneDataSource_Proxy')===active,'schema count/activity changed');
  need(await call(columns,'get_PresentUsageTypes','TIBGColumns_Proxy')===usage&&await call(defs,'get_PresentUsageTypes','TIBGTuneColumnDefs_Proxy')===definitionUsage,'usage masks changed');
  result={verified:true,document_id:binding.document_id,workflow_id:binding.workflow_ref.workflow_id,node_id:node.FGuid,build:'7.4.2',binding:before,
   fields,native_schema_bytes:hashBefore,usage_types:{columns:usage,definitions:definitionUsage,hashed:hashedUsage},active,complete:true,source:'retained_tune_input_columns_and_definitions',atomic_snapshot:false,
   native_objects:{socket:{...socket.$},datasource:{...ds.$}},mutation_calls:0};
 } catch(e){error=e;}
 finally {
  for(const o of owned.reverse())try{need(o.disposeAsync===functions['proxy.disposeAsync'],'release implementation changed');await awaitTask(o.disposeAsync(true));released.push(true);}catch(e){error??=e;}
 }
 if(error){error.snapshotCleanupComplete=owned.length===released.length;throw error;}
 guard();need(owned.length===released.length,'native references not released');
 return {...result,cleanup_complete:true,references_acquired:owned.length,references_released:released.length,elapsed_ms:Date.now()-started};
}
