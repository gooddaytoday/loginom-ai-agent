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
    // A save can rekey Package1 only when the original rendered/native path
    // was bound before the transition. Labels alone never establish ownership.
    const verifyNavigation = (wf, receipt, observed, capture=false) => {
      const expected=wf.navigation_path, samePath=(a,b)=>Array.isArray(a)&&a.length===b.length
        &&a.every((c,i)=>c.tid===b[i].tid&&c.label===b[i].label);
      if(!Array.isArray(expected)||!expected.length||expected.length>32||observed.length!==expected.length
        ||new Set(observed.map(c=>c.tid)).size!==observed.length)return null;
      const peers=[...globalThis.__loginomDockPreparationV1.receipts.values()].filter(v=>v.phase==='verified'&&v.workflowId===wf.workflow_id);
      if(peers.some(v=>v.tab!==receipt.tab||v.packageNode!==receipt.packageNode
        ||v.nodeTargetWorkflowNode&&receipt.nodeTargetWorkflowNode&&v.nodeTargetWorkflowNode!==receipt.nodeTargetWorkflowNode)
        ||receipt.crumbs&&!samePath(receipt.crumbs,expected))return null;
      const native=observed.map(c=>{const es=exact(c.tid),e=es.length===1&&es[0],cmp=e&&globalThis.Ext?.getCmp?.(e.id);
        return cmp?.el?.dom===e?cmp?._node?.data?.node:null;});
      const main=globalThis.bg?.app?.Application?.FInstance?.FMainForm;
      const account=main?.FMapTree?.FServerConnection?.UserName;
      const packagePath=receipt.packageNode?.PackageFileName;
      const baseline=receipt.nodeNavigationBinding;
      if(baseline) {
        if(!samePath(expected,baseline.path)||baseline.tab!==receipt.tab||baseline.packageNode!==receipt.packageNode
          ||baseline.workflow!==receipt.nodeTargetWorkflowNode||baseline.account!==account||baseline.connection!==main?.FMapTree?.FServerConnection||baseline.packagePath!==packagePath
          ||native.length!==baseline.native.length||native.some((n,i)=>!n||n!==baseline.native[i]||n.FGuid!==baseline.guids[i]||i>0&&n.ParentNode!==native[i-1]))return null;
      }
      if(samePath(expected,observed)) {
        if(capture&&!baseline&&samePath(receipt.crumbs,expected)&&typeof account==='string'&&account
          &&typeof packagePath==='string'&&packagePath&&native.every((n,i)=>n&&(!i||n.ParentNode===native[i-1]))
          &&native.filter(n=>n===receipt.packageNode).length===1&&native.at(-1)===receipt.nodeTargetWorkflowNode)
          receipt.nodeNavigationBinding={path:expected.map(c=>({...c})),native,guids:native.map(n=>n.FGuid),tab:receipt.tab,packageNode:receipt.packageNode,
            workflow:receipt.nodeTargetWorkflowNode,account,connection:main.FMapTree.FServerConnection,packagePath};
        return {verified:true};
      }
      if(!baseline)return null;
      const index=native.indexOf(receipt.packageNode),old=expected[index],current=observed[index];
      if(index<1||!old||current.label!==old.label||receipt.packageNode.PackageName!==old.label
        ||current.tid!==expected[index-1].tid+'>'+receipt.packageNode.PackageName)return null;
      if(observed.some((c,i)=>c.label!==expected[i].label||c.tid!==(i<index?expected[i].tid:
        i===index?current.tid:expected[i].tid.startsWith(old.tid+'>')?current.tid+expected[i].tid.slice(old.tid.length):null)))return null;
      return {verified:true,rebinding:{prepared_path:expected.map(c=>({...c})),observed_path:observed.map(c=>({...c}))}};
    };
    const navigation=verifyNavigation(b.workflow_ref,r,crumbs.slice(0,b.workflow_ref.navigation_path.length));
    if(!navigation)return reject('navigation');
    if(new Set(crumbs.map(c=>c.tid)).size!==crumbs.length)return reject('navigation');
    const model=card?.Controller?.FController;
    let surface, tid, locked, outputPort, graphRoot, pendingWizardNode;
    if(app.ModelForm && model instanceof app.ModelForm) {
      const d=model.FDiagram, nodes=d?.FNodes?.FCollection, roots=exact(b.workflow_ref.prefix+';ModelForm;cmpDiagram');
      if(roots.length===0)return pending();
      if(!Array.isArray(nodes) || nodes.length>200 || roots.length!==1 || d.FmxGraph?.container!==roots[0])return reject('graph_binding');
      graphRoot=roots[0];
      const matches=nodes.filter(n=>n.FGuid===b.node.node_id);
      if(matches.length!==1)return reject('graph_node');
      const dom=d.FmxGraph.view.getState(matches[0].FCell)?.shape?.node;
      if(!dom || !roots[0].contains(dom))return pending();
      tid=dom.getAttribute('data-tid'); surface='graph';
      locked=matches[0].FLocked===true;
      // Before deactivation is confirmed the active controller still owns the
      // workflow. The two rendered breadcrumb components already own the exact
      // pending node and wizard tree objects, including duplicate-name keys.
      if(crumbs.length===b.workflow_ref.navigation_path.length+2&&crumbs.at(-1).label==='Настройка') {
        const nodeElements=exact(crumbs.at(-2).tid),wizardElements=exact(crumbs.at(-1).tid);
        const nc=nodeElements.length===1&&globalThis.Ext?.getCmp(nodeElements[0].id);
        const wc=wizardElements.length===1&&globalThis.Ext?.getCmp(wizardElements[0].id);
        const nt=nc?._node?.data?.node,wt=wc?._node?.data?.node;
        if(nc?.el?.dom===nodeElements[0]&&wc?.el?.dom===wizardElements[0]
          &&app.ModelNodeTreeNode&&nt instanceof app.ModelNodeTreeNode
          &&app.WizardTreeNode&&wt instanceof app.WizardTreeNode&&wt.ParentNode===nt
          &&nt.ParentNode===workflowNode&&nt.FGuid===b.node.node_id&&nt.FModelNode===matches[0].data)
          pendingWizardNode=crumbs.at(-2);
      }
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
    const elements=graphRoot?[...exact(tid)].filter(e=>graphRoot.contains(e)):exact(tid);
    if(elements.length===0)return pending();
    if(elements.length!==1)return reject('surface_ambiguous');
    if(elements[0].getBoundingClientRect().width<=0 || elements[0].getBoundingClientRect().height<=0
      || getComputedStyle(elements[0]).visibility==='hidden')return pending();
    if(navigation.rebinding&&surface!=='graph') {
      // The rebuilt owner suffix must belong to the current native node/wizard,
      // including port/group ancestors. A duplicate label cannot bind it.
      const tail=[],visited=new Set();let owner=card.Controller.Node?.data?.node;
      while(owner&&owner!==workflowNode&&tail.length<32&&!visited.has(owner)) {
        visited.add(owner);tail.unshift(owner);owner=owner.ParentNode;
      }
      const suffix=crumbs.slice(b.workflow_ref.navigation_path.length);
      if(owner!==workflowNode||suffix.length!==tail.length||suffix.some((c,i)=>{
        const es=exact(c.tid),e=es.length===1&&es[0],cmp=e&&globalThis.Ext?.getCmp?.(e.id);
        return cmp?.el?.dom!==e||cmp?._node?.data?.node!==tail[i];
      }))return reject('navigation_owner');
    }
    verifyNavigation(b.workflow_ref,r,crumbs.slice(0,b.workflow_ref.navigation_path.length),true);
    return {verified:true,...(navigation.rebinding?{navigation_rebinding:navigation.rebinding}:{}),document_id:b.document_id,workflow_id:b.workflow_ref.workflow_id,node_id:b.node.node_id,surface,tid,
      ...(outputPort?{[outputPort.direction==='input'?'input_port':'output_port']:outputPort}:{}),
      ...(surface==='graph'?{locked,...(nodeTree&&crumbs.length===b.workflow_ref.navigation_path.length+1?{navigation_node:crumbs.at(-1)}:{}),
        ...(pendingWizardNode?{pending_wizard_node:pendingWizardNode}:{})}:{} )};
  },binding);
}
