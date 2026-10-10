// A declared UI phase, never part of the read-only graph observer.
export async function activatePreparedWorkflow(page, task) {
  let effectPossible=false, cleanup=true;
  const trace=[];
  const remaining=()=>{const n=task.deadline-Date.now();if(n<=0)throw Error('Workflow activation deadline');return n;};
  const inspect=()=>page.evaluate(({request,origin,build})=>{
    const p=globalThis.__loginomDockPreparationV1;
    if(location.origin!==origin||globalThis.bg?.app?.Version!==build||p?.document!==document||p.id!==request.document_id)
      throw Error('Prepared workflow document changed');
    const records=[...p.receipts.values()].filter(r=>r.phase==='verified'&&r.workflowId===request.workflow_ref.workflow_id);
    const r=records[0];
    if(!r||records.some(v=>v.tab!==r.tab||v.packageNode!==r.packageNode)||!r.packageNode)throw Error('Prepared workflow receipt changed');
    const exact=tid=>document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']');
    const tabs=exact(request.workflow_ref.tab_tid);
    const visible=e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
    if(tabs.length!==1||tabs[0]!==r.tab||!r.tab.isConnected||!visible(r.tab))throw Error('Prepared workflow tab changed');
    if([...document.querySelectorAll('[role="dialog"],.bg-mask-message,.x-mask-msg')].some(visible))throw Error('Workflow activation blocked');
    const crumbs=[...document.querySelectorAll('[data-tid^='+JSON.stringify(request.workflow_ref.prefix+';cnrNaviMode;b.s_')+']')]
      .map(e=>({tid:e.getAttribute('data-tid'),label:e.textContent.trim()}));
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
    if(!verifyNavigation(request.workflow_ref,r,crumbs,true))throw Error('Prepared workflow navigation changed');
    return {document_id:p.id,workflow_ref:request.workflow_ref,tab_tid:request.workflow_ref.tab_tid,
      active:r.tab.classList.contains('x-tab-active')};
  },task);
  try{
    remaining();const before=await inspect();trace.push({event:'prepared_workflow_observed',...before});
    if(!before.active){
      if(task.observeOnly===true)throw Error('Prepared workflow is no longer active');
      remaining();const tab=page.locator('[data-tid='+JSON.stringify(task.request.workflow_ref.tab_tid)+']');
      await tab.click({trial:true,timeout:remaining()});
      const checked=await inspect();
      if(JSON.stringify(checked)!==JSON.stringify(before))throw Error('Workflow changed before activation');
      effectPossible=true;cleanup=false;
      await tab.click({timeout:remaining()});cleanup=true;
      trace.push({event:'prepared_workflow_clicked',tab_tid:before.tab_tid});
    }
    remaining();const after=await inspect();
    if(!after.active)throw Error('Prepared workflow did not become active');
    trace.push({event:'prepared_workflow_active',...after});
    return {status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:effectPossible,
      document_id:after.document_id,workflow_ref:after.workflow_ref,trace};
  }catch(error){
    if(!cleanup){try{await page.mouse.up();cleanup=true;}catch{}}
    return {status:effectPossible?'AMBIGUOUS':'NOT_APPLIED',verified:false,cleanup_complete:cleanup,
      effect_possible:effectPossible,error:String(error.message).slice(0,500),trace};
  }
}
