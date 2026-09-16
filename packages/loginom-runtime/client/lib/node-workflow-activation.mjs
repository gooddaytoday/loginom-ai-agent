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
    const expected=request.workflow_ref.navigation_path;
    if(crumbs.length!==expected.length||crumbs.some((c,i)=>c.tid!==expected[i].tid||c.label!==expected[i].label))
      throw Error('Prepared workflow navigation changed');
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
