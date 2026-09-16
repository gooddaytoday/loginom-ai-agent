// Independent read-only graph evidence: cached UI nodes and rendered SVG ports.
// No data proxies, engine calls or reuse of the node.apply graph driver.
export function missingValuesGraphCode({prepared,sourceNodeId,targetNodeId}){
 async function inspect(page,args){return page.evaluate(({prepared,sourceNodeId,targetNodeId})=>{
  const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
  const p=globalThis.__loginomDockPreparationV1,app=globalThis.bg?.app;
  if(p?.document!==document||p.id!==prepared.document_id)throw Error('Prepared document differs');
  const receipts=[...p.receipts.values()].filter(r=>r.phase==='verified'&&r.workflowId===prepared.workflow_ref.workflow_id);
  const tabs=exact(prepared.workflow_ref.tab_tid);
  if(!receipts.length||tabs.length!==1||receipts.some(r=>r.tab!==tabs[0])||!tabs[0].classList.contains('x-tab-active'))throw Error('Prepared workflow differs');
  const controller=app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller;
  let ancestor=controller.Node?.data?.node,packageNode;
  for(let i=0;ancestor&&i<32;i++,ancestor=ancestor.ParentNode)if(ancestor instanceof app.PackageTreeNode){packageNode=ancestor;break;}
  if(receipts.some(r=>r.packageNode!==packageNode))throw Error('Prepared package differs');
  const diagram=controller.FController?.FDiagram,graph=diagram?.FmxGraph,roots=exact(prepared.workflow_ref.prefix+';ModelForm;cmpDiagram');
  if(roots.length!==1||graph?.container!==roots[0]||roots[0].getBoundingClientRect().width<=0)throw Error('Rendered graph unavailable');
  const items=diagram.FNodes.FCollection;if(!Array.isArray(items)||items.length>200)throw Error('Graph inventory bound');
  const ports=new Map();
  const nodes=items.filter(n=>[sourceNodeId,targetNodeId].includes(n.FGuid)).map(n=>{
   const e=graph.view.getState(n.FCell)?.shape?.node,tid=e?.getAttribute('data-tid');
   if(!tid||!roots[0].contains(e)||exact(tid).length!==1)throw Error('Node DOM binding differs');
   for(const group of n.FPorts??[])for(const port of group.FCollection??[]){
    const element=graph.view.getState(port.FCell)?.shape?.node,key=element?.getAttribute('data-tid');
    if(!key||!roots[0].contains(element))continue;
    const match=/^(Input|Output)_Data-(\d+)$/.exec(key.slice(tid.length+1));
    if(match)ports.set(key,{node_id:n.FGuid,direction:match[1],native_index:Number(match[2]),port_guid:port.FGuid});
   }
   if(n.FLabel?.parent!==n||typeof n.FLabel.FRawValue!=='string')throw Error('Node label binding differs');
   return {node_id:n.FGuid,icon:n.FIconCls,tid,label:n.FLabel.FRawValue};
  });
  if(nodes.length!==2||nodes.find(n=>n.node_id===sourceNodeId)?.icon!=='bg-vendor-icon-importtextfile'||nodes.find(n=>n.node_id===targetNodeId)?.icon!=='bg-vendor-icon-datarecovery')throw Error('Source/target identity differs');
  const links=[];
  for(const e of roots[0].querySelectorAll('[data-tid]')){
   const tid=e.getAttribute('data-tid'),parts=tid.split(';Graph;');if(parts.length!==2||parts[1].includes(';'))continue;
   const bits=parts[1].split('|');if(bits.length!==4)continue;
   const from=ports.get(parts[0]+';Graph;'+bits[0]+';'+bits[1]),to=ports.get(parts[0]+';Graph;'+bits[2]+';'+bits[3]);
   if(to?.node_id===targetNodeId){if(!from||from.direction!=='Output'||to.direction!=='Input'||exact(tid).length!==1)throw Error('Foreign target connection');links.push({source:from,target:to,tid});}
  }
  if(links.length!==1||links[0].source.node_id!==sourceNodeId)throw Error('Expected sole source edge missing');
  return {verified:true,document_id:prepared.document_id,workflow_id:prepared.workflow_ref.workflow_id,package_path:prepared.package_ref.path,nodes,links,read_only:true};
 },args);}
 return 'async page=>('+inspect.toString()+')(page,'+JSON.stringify({prepared,sourceNodeId,targetNodeId})+')';
}
