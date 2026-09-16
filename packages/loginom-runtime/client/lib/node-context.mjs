import {validateNodeReference, validateNodeTargetRequest} from './node-contracts.mjs';

// Host-only binding, independent of the workspace observer's DOM document ID.
export function validatePreparedNodeContext(binding) {
  if (!binding || Object.keys(binding).sort().join(',') !== 'document_id,node,workflow_ref')
    throw new Error('Exact prepared node context required');
  validateNodeReference(binding.node);
  validateNodeTargetRequest({document_id:binding.document_id,workflow_ref:binding.workflow_ref,
    target:{kind:'existing',type:'imports.text',ref:binding.node},inputs:[]});
}

// Serialized together with workspaceUiCapability. Only cached UI tree objects
// and rendered graph nodes are read; data proxies are never dereferenced.
export async function readPreparedNodeContext(page, binding) {
  return page.evaluate(b => {
    const reject = reason => ({verified:false,reason});
    const pending = () => ({verified:false,surface_pending:true});
    const p=globalThis.__loginomDockPreparationV1, app=globalThis.bg?.app;
    if (p?.document!==document || p.id!==b.document_id || !app) return reject('document');
    const records=[...p.receipts.values()].filter(r=>r.phase==='verified' && r.workflowId===b.workflow_ref.workflow_id);
    if (!records.length || records.some(r=>r.tab!==records[0].tab || r.packageNode!==records[0].packageNode)) return reject('receipt');
    const r=records.find(r=>r.nodeTargetWorkflowNode);
    if (!r) return reject('workflow_unbound');
    const exact=tid=>document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']');
    const tabs=exact(b.workflow_ref.tab_tid);
    if(tabs.length!==1 || tabs[0]!==r.tab || !tabs[0].classList.contains('x-tab-active')) return reject('tab');
    const crumbs=[...document.querySelectorAll('[data-tid^='+JSON.stringify(b.workflow_ref.prefix+';cnrNaviMode;b.s_')+']')]
      .map(e=>({tid:e.getAttribute('data-tid'),label:e.textContent.trim()}));
    const card=app.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab();
    let n=card?.Controller?.Node?.data?.node, packageNode, workflowNode, nodeTree;
    const seen=new Set();
    for(let i=0;n && i<32 && !seen.has(n);i++,n=n.ParentNode) {
      seen.add(n);
      if(app.ModelNodeTreeNode && n instanceof app.ModelNodeTreeNode) nodeTree=n;
      if(app.WorkFlowTreeNode && n instanceof app.WorkFlowTreeNode) workflowNode=n;
      if(app.PackageTreeNode && n instanceof app.PackageTreeNode) {packageNode=n;break;}
    }
    if(packageNode!==r.packageNode || workflowNode!==r.nodeTargetWorkflowNode) return reject('package_or_workflow');
    if(nodeTree && nodeTree.FGuid!==b.node.node_id)return reject('node_guid');
    if (crumbs.length<b.workflow_ref.navigation_path.length) {
      if(crumbs.every((c,i)=>c.tid===b.workflow_ref.navigation_path[i].tid && c.label===b.workflow_ref.navigation_path[i].label))return pending();
      return reject('navigation');
    }
    if(b.workflow_ref.navigation_path.some((c,i)=>c.tid!==crumbs[i].tid || c.label!==crumbs[i].label))return reject('navigation');
    const model=card?.Controller?.FController;
    let surface, tid, locked, outputPort;
    if(app.ModelForm && model instanceof app.ModelForm) {
      const d=model.FDiagram, nodes=d?.FNodes?.FCollection, roots=exact(b.workflow_ref.prefix+';ModelForm;cmpDiagram');
      if(roots.length===0)return pending();
      if(!Array.isArray(nodes) || nodes.length>200 || roots.length!==1 || d.FmxGraph?.container!==roots[0])return reject('graph_binding');
      const matches=nodes.filter(n=>n.FGuid===b.node.node_id);
      if(matches.length!==1)return reject('graph_node');
      const dom=d.FmxGraph.view.getState(matches[0].FCell)?.shape?.node;
      if(!dom || !roots[0].contains(dom))return pending();
      tid=dom.getAttribute('data-tid'); surface='graph';
      locked=matches[0].FLocked===true;
    } else if(model?.constructor?.name==='WizardModelComponentForm') {
      if(!nodeTree)return pending();
      if(!nodeTree.FModelNode || model.FModelNode!==nodeTree.FModelNode) {
        const w=card.Controller.Node?.data?.node,portTree=w?.ParentNode,group=portTree?.ParentNode;
        const openings=[...(p.outputPortOpenReceipts?.values()??[]),...(p.inputPortOpenReceipts?.values()??[])].filter(o=>o.phase==='verified'
          &&o.document_id===b.document_id&&o.workflow_id===b.workflow_ref.workflow_id&&o.node_id===b.node.node_id
          &&o.wizard===model&&o.nodeTree===nodeTree&&o.portTree===portTree);
        const o=openings[0],input=o?.direction==='input',groupType=input?app.ModelInputPortsTreeNode:app.ModelOutputPortsTreeNode,roots=exact(b.workflow_ref.prefix+';WizrdMCF');
        if(openings.length!==1||!app.WizardTreeNode||!(w instanceof app.WizardTreeNode)
          ||!app.ModelPortTreeNode||!(portTree instanceof app.ModelPortTreeNode)
          ||!groupType||!(group instanceof groupType)||group.ParentNode!==nodeTree
          ||o.workflow!==workflowNode||o.packageNode!==packageNode||o.node.FGuid!==o.node_id
          ||o.node.data!==o.nodeData||o.port.data!==o.portData||o.port.FGuid!==o.portGuid||o.node.data!==nodeTree.FModelNode
          ||o.port.data!==portTree.FModelNodePort||o.port.parent!==o.node||o.port.FPortIndex!==undefined&&o.port.FPortIndex!==o.nativeIndex
          ||portTree.FIndex!==o.nativeIndex||!o.enginePort||(input?model.FModelSocket:model.FModelEnginePort)!==o.enginePort||model.FModelNode
          ||roots.length!==1||model.FView?.el?.dom!==roots[0])return reject('wizard_model');
        outputPort={direction:input?'input':'output',port:o.portIndex,native_index:o.nativeIndex,port_guid:o.port.FGuid,opening_operation_id:o.operation_id};
      }
      tid=b.workflow_ref.prefix+';WizrdMCF'; surface='wizard';
    } else if(model?.constructor?.name==='ViewsForm') {
      if(!nodeTree)return pending();
      if(!nodeTree.FModelNode || model.FModelNode!==nodeTree.FModelNode)return reject('views_model');
      tid=b.workflow_ref.prefix+';ViewsForm';surface='views';
      const roots=exact(tid);
      if(roots.length && (roots.length!==1 || model.FView?.el?.dom!==roots[0]))return reject('views_binding');
    } else return pending();
    const elements=exact(tid);
    if(elements.length===0)return pending();
    if(elements.length!==1)return reject('surface_ambiguous');
    if(elements[0].getBoundingClientRect().width<=0 || elements[0].getBoundingClientRect().height<=0
      || getComputedStyle(elements[0]).visibility==='hidden')return pending();
    return {verified:true,document_id:b.document_id,workflow_id:b.workflow_ref.workflow_id,node_id:b.node.node_id,surface,tid,
      ...(outputPort?{[outputPort.direction==='input'?'input_port':'output_port']:outputPort}:{}),
      ...(surface==='graph'?{locked}:{})};
  },binding);
}
