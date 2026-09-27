import {collectNativeRuntime} from '../../client/lib/collapse-native-runtime.mjs';

// Serialized private input-only snapshot. No model calls or dynamic capabilities.
export function javascriptNativeInputSnapshot(b){
  const v=(o,k)=>Object.getOwnPropertyDescriptor(o??{},k)?.value;
  const need=(x,m)=>{if(!x)throw Error('Native input binding: '+m);};
  const cookie=value=>{
    const encode=(x,depth)=>{
      if(x===null||['string','boolean','number'].includes(typeof x)){need(typeof x!=='number'||Number.isFinite(x),'cookie number');return x;}
      need(x&&typeof x==='object'&&depth<3,'cookie shape');
      const ds=Object.getOwnPropertyDescriptors(x),keys=Object.keys(ds).sort();need(keys.length>0&&keys.length<=16,'cookie bound');
      return keys.map(k=>{need('value' in ds[k],'cookie accessor');return [k,encode(ds[k].value,depth+1)];});
    };
    const result=JSON.stringify(encode(value,0));need(result.length<=4096,'cookie bytes');return result;
  };
  const prep=globalThis.__loginomDockPreparationV1;
  need(prep?.document===document&&prep.id===b.document_id&&location.origin===b.origin&&bg.app.Version==='7.4.2','document/build');
  const receipts=[...prep.receipts.values()].filter(r=>r.phase==='verified'&&r.workflowId===b.workflow_id&&r.nodeTargetWorkflowNode);
  need(receipts.length===1,'unique workflow receipt');const receipt=receipts[0];
  need(receipt.tab===document.querySelector('[data-tid='+JSON.stringify(b.tab_tid)+']')&&receipt.tab.classList.contains('x-tab-active'),'workflow tab');
  const card=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab(),model=card.Controller.FController;
  let treeNode=card.Controller.Node?.data?.node,workflow,pack;
  for(let i=0;treeNode&&i<32;i++,treeNode=treeNode.ParentNode){
    if(treeNode instanceof bg.app.WorkFlowTreeNode)workflow=treeNode;
    if(treeNode instanceof bg.app.PackageTreeNode){pack=treeNode;break;}
  }
  need(workflow===receipt.nodeTargetWorkflowNode&&pack===receipt.packageNode,'workflow/package owner');
  const diagram=model.FDiagram,nodes=diagram.FNodes.FCollection,links=diagram.FLinks.FCollection;
  need(Array.isArray(nodes)&&nodes.length<=2&&Array.isArray(links)&&links.length===0,'input-only topology');
  const imports=nodes.filter(n=>n.FIconCls==='bg-vendor-icon-importtextfile');need(imports.length===1,'one import only');const node=imports[0];
  need(node.FGuid===b.node_id&&node.FStatus===1&&node.FRunning===false
    &&nodes.filter(n=>n!==node).every(n=>n.FIconCls==='bg-vendor-icon-modelvariables'&&n.FStatus===0&&n.FRunning===false),'no JS/dynamic nodes');
  need(model.FCreateDraggedNodeStarted===false&&model.FDraggingOverGraph===false&&!model.FDraggedNode,'graph interaction');
  const manager=v(model,'FPreviewManager'),form=v(manager,'FPreviewForm'),port=v(form,'FCurrentPreviewPort');
  need(v(manager,'FPreviewVisible')===true&&v(form,'FCurrentPreviewNode')===node&&port?.parent===node&&port.FGuid===b.port_guid
    &&node.FPorts[1].FCollection.length===1&&node.FPorts[1].FCollection[0]===port
    &&node.FPorts[0].FCollection.length===0&&port.FType===1&&port.FSubType===1&&port.FParam===0&&port.FStatus===1
    &&manager.FShowDataLastCall.Node===node&&manager.FShowDataLastCall.Port===port,'owned import output0 Preview');
  const tree=document.querySelector('[data-tid="ConsoleForm;ProgressForm;trpProgress;treepanel;tree"]');need(tree,'process tree');
  const processStore=Ext.getCmp(tree.id).getStore(),processRoot=processStore.getRoot();
  need(!processStore.isLoading()&&processRoot.data.loaded===true,'loaded process root');
  const parts=b.execution.execution_id.slice(b.document_id.length+1).split(':');
  need(b.execution.status==='completed'&&b.execution.execution_id.startsWith(b.document_id+':')&&parts.length===2
    &&String(processRoot.internalId)===parts[0]&&b.completed_child.group_id===parts[1],'execution root/group');
  const records=[],parents=new Map();const walk=(ns,parent)=>{need(records.length+ns.length<=2000,'process bound');for(const r of ns){need(!r.data.loading&&!parents.has(r),'process loading/cycle');parents.set(r,parent);records.push(r);walk(r.childNodes??[],r);}};walk(processRoot.childNodes,processRoot);
  const groups=records.filter(r=>String(r.data.id)===parts[1]);
  need(groups.length===1&&groups[0].data.Status===3&&groups[0].data.ErrorDetails===''&&groups[0].data.loaded===true,'completed group');
  const children=records.filter(r=>r.data.ModelNode===node.data);
  const child=children.filter(r=>String(r.data.id)===b.completed_child.process_id&&String(r.internalId)===b.completed_child.process_record_id);
  need(child.length===1&&child[0].data.Status===3&&child[0].data.ErrorDetails===''
    &&String(child[0].data.id).startsWith(parts[1]+'.')
    &&!children.some(r=>Number(String(r.data.id).split('.')[0])>Number(parts[1])),'latest owned import child');
  let ancestor=parents.get(child[0]);while(ancestor&&ancestor!==groups[0])ancestor=parents.get(ancestor);
  need(ancestor===groups[0]&&parents.get(groups[0])===processRoot,'owned process hierarchy');
  const root=document.querySelector('[data-tid='+JSON.stringify(b.prefix+';ModelForm;PreviewWindow;PreviewForm;DataSetForm')+']');
  need(root?.checkVisibility({checkVisibilityCSS:true}),'visible native dataset');
  const dc=v(Ext.getCmp(root.id),'Controller'),dt=v(dc,'FDataTable'),ds=v(dc,'FDataSource'),store=v(dt,'FDataSourceStore');
  const helper=v(ds,'$FHelper'),identity=v(ds,'$');
  need(dc.FModelNode===node.data&&ds===v(dt,'FDataSource')&&v(v(store,'proxy'),'dataSource')===ds
    &&v(helper,'FBaseProxy')===ds&&v(ds,'$S')===node.data.$S,'datasource identity');
  need(v(identity,'$I')===116&&Number.isInteger(v(identity,'$OW'))&&v(identity,'$OW')>=0&&Number.isInteger(v(identity,'$O')),'interface116');
  if(b.source)need(v(identity,'$OW')===b.source.owner&&v(identity,'$O')===b.source.object,'remote source replaced');
  need(!store.loading&&v(helper,'$FCacheInitialized')===true&&v(helper,'$FData'),'loaded cache');
  const fields=v(v(v(dc,'FColumnInfosStore'),'data'),'items');
  need(Array.isArray(fields)&&fields.length===1,'one field');const field=v(fields[0],'data');
  need(field.Name==='Value'&&field.DisplayName==='Value'&&field.DataType===3,'fixed real schema');
  need(v(dt,'FTotalRowCount')===4&&v(helper,'$FRowCount')===4,'four native rows');
  const runtime=globalThis.__loginomJavascriptNativeRuntimeV1;
  need(runtime?.document===document&&runtime.binding_id===b.runtime_binding_id,'loaded runtime binding');runtime.check(v(ds,'$S'));
  return {prep,receipt,card,model,diagram,nodes,links,node,nodeData:node.data,port,portData:port.data,manager,form,workflow,pack,fields,field,
    processStore,processRoot,group:groups[0],child:child[0],
    processFingerprint:JSON.stringify(records.map(r=>[r.internalId,r.data.id,parents.get(r)?.internalId,r.data.Status,r.data.ErrorDetails,r.data.ModelNode===node.data])),
    root,dc,dt,ds,store,helper,identity,count:4,cache:v(helper,'$FData'),owner:v(identity,'$OW'),object:v(identity,'$O'),
    dataCookie:v(helper,'$FDataChangeCookie'),stateCookie:v(helper,'$FStateChangeCookie'),
    dataCookieValue:cookie(v(helper,'$FDataChangeCookie')),stateCookieValue:cookie(v(helper,'$FStateChangeCookie'))};
}

export async function bindJavascriptNativeRuntime(page,args,collect){
  const proof=await page.evaluate(({a,code})=>{
    const need=(x,m)=>{if(!x)throw Error('Native input runtime: '+m);};
    const prep=globalThis.__loginomDockPreparationV1;
    need(prep?.document===document&&prep.id===a.document_id&&location.origin===a.origin&&bg.app.Version==='7.4.2','document');
    const model=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;
    const node=model.FDiagram.FNodes.FCollection.find(n=>n.FGuid===a.node_id),session=node?.data?.$S;need(session,'session');
    need(!globalThis.__loginomJavascriptNativeRuntimeV1,'runtime already bound; no rebinding');
    const capture=eval('('+code+')'),initial=capture(session),sources=Object.fromEntries(Object.entries(initial.functions).map(([k,f])=>[k,Function.prototype.toString.call(f)]));
    const check=(s,message)=>{
      need(document===prep.document&&globalThis.__loginomDockPreparationV1===prep&&s===session,'document/session changed');
      need(session.$FDisposed===false&&session.$FPendingDisconnect===false&&session.$FTransportStatus===0
        &&session.$T.FFinished===false&&session.$T.FDisconnected===false&&session.$T.$FSocket?.readyState===1,'transport live');
      const current=capture(s);need(initial.objects.every((o,i)=>o===current.objects[i])
        &&JSON.stringify(initial.constants)===JSON.stringify(current.constants)
        &&Object.keys(sources).every(k=>initial.functions[k]===current.functions[k]),'loaded runtime replaced');
      if(message)for(const [k,f]of Object.entries(initial.functions))if(k.startsWith('message.'))need(message[k.slice(8)]===f,'message method changed');
    };
    check(session);globalThis.__loginomJavascriptNativeRuntimeV1={document,binding_id:a.binding_id,session,check};
    return {binding_id:a.binding_id,document_id:a.document_id,sources,constants:initial.constants};
  },{a:args,code:collect.toString()});
  return proof;
}

export async function bindJavascriptNativeInput(page,args,snapshot){
  return page.evaluate(({args,code})=>{
    const capture=eval('('+code+')'),initial=capture(args);
    if(globalThis.__loginomJavascriptNativeInputBindingV1)throw Error('Native input already bound; no replay');
    globalThis.__loginomJavascriptNativeInputBindingV1={document,id:args.runtime_binding_id,initial,capture};
    return {...args,source:{owner:initial.owner,object:initial.object},
      count_loader_sources:{PrepareColumnInfoAndRowCount:initial.dc.PrepareColumnInfoAndRowCount.toString(),
        InitOutput:initial.dc.InitOutput.toString(),DataSourceProxyRead:initial.store.proxy.read.toString()}};
  },{args,code:snapshot.toString()});
}

// Both executor and browser realms receive every dependency explicitly.
// Runtime hashes are verified only by the host after the raw proof returns.
export function javascriptNativeRuntimeCode(args){
  return `async page=>(${bindJavascriptNativeRuntime.toString()})(page,${JSON.stringify(args)},${collectNativeRuntime.toString()})`;
}
export function javascriptNativeInputCode(args){
  return `async page=>(${bindJavascriptNativeInput.toString()})(page,${JSON.stringify(args)},${javascriptNativeInputSnapshot.toString()})`;
}
