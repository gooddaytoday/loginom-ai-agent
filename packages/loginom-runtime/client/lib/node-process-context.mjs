import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function makeNodeProcessContextCode(binding) {
  validatePreparedNodeContext(binding);
  return `async page=>{const readNode=${readPreparedNodeContext.toString()};return (${readNodeProcesses.toString()})(page,${JSON.stringify(binding)},readNode)}`;
}

export async function readNodeProcesses(page,binding,readNode=readPreparedNodeContext) {
  const before=await readNode(page,binding);
  if(!before.verified)return {verified:false,reason:'node_context'};
  const result=await page.evaluate(nodeId=>{
    const fail=reason=>({verified:false,reason});
    const exact=tid=>document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']');
    const body=exact('ConsoleForm;ProgressForm;trpProgress;treepanel;tree'),right=exact('ConsoleForm;ProgressForm;trpProgress;grd;tbl');
    if(body.length!==1||right.length!==1)return fail('console_grids');
    const view=globalThis.Ext?.getCmp?.(body[0].id),rightView=globalThis.Ext?.getCmp?.(right[0].id);
    if(view?.el?.dom!==body[0]||rightView?.el?.dom!==right[0])return fail('console_binding');
    const store=view.getStore?.();
    if(store?.$className!=='Ext.data.TreeStore'||rightView.getStore?.()!==store||store.isLoading?.())return fail('console_store');
    const root=store.getRoot?.()??store.getRootNode?.();
    if(!root?.isModel||!String(root.internalId??'')||!Array.isArray(root.childNodes)||root.childNodes.length>1000||root.data?.loading || root.data?.loaded!==true)return fail('process_root');
    const menu=exact('mnContextMenu;mniShowCompletedProcesses');
    if(menu.length!==1)return fail('completed_filter_unobserved');
    const checked=menu[0].classList.contains('x-menu-item-checked'),unchecked=menu[0].classList.contains('x-menu-item-unchecked');
    if(checked===unchecked)return fail('completed_filter_ambiguous');
    const visible=e=>e.getBoundingClientRect().width>0 && e.getBoundingClientRect().height>0 && getComputedStyle(e).visibility!=='hidden' && getComputedStyle(e).display!=='none';
    if(!visible(body[0])||!visible(right[0])||[...document.querySelectorAll('.x-mask-msg,.bg-mask-message')].some(visible))return fail('console_not_ready');
    const nativeRows=[...body[0].querySelectorAll('table.x-grid-item')],nativeRight=[...right[0].querySelectorAll('table.x-grid-item')];
    if(nativeRows.length>200||nativeRight.length>200)return fail('render_bound');
    const processes=[],seen=new Set();let visited=0;
    const nodes=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.()
      ?.Controller?.FController?.FDiagram?.FNodes?.FCollection;
    const owners=typeof nodeId==='string'&&Array.isArray(nodes)&&nodes.length<=200?nodes.filter(n=>n.FGuid===nodeId):[];
    const owner=owners.length===1&&owners[0].data&&nodes.filter(n=>n.data===owners[0].data).length===1?owners[0]:null;
    const rowIds=rows=>rows.map(r=>r.getAttribute('data-recordid'));
    if([nativeRows,nativeRight].some(rows=>rowIds(rows).some(id=>!id)||new Set(rowIds(rows)).size!==rows.length))return fail('duplicate_rendered_record');
    const walk=(nodes,parent)=>{
      for(const n of nodes) {
        if(++visited>2000||!n.isModel||seen.has(n))throw Error('tree_bound');seen.add(n);
        const d=n.data,id=String(d?.id??''),record=String(n.internalId??'');
        if(!/^[1-9][0-9]*(?:\.[1-9][0-9]*)*$/.test(id)||!record||d.loading)throw Error('process_identity');
        if(parent===null?id.includes('.'):id.slice(0,id.lastIndexOf('.'))!==parent)throw Error('process_parent');
        const rows=nativeRows.filter(r=>r.getAttribute('data-recordid')===record),rs=nativeRight.filter(r=>r.getAttribute('data-recordid')===record);
        let rendered=false,path=null,selected=false,expander_tid=null,expanded=null;
        if(rows.length===1&&rs.length===1) {
          const cells=[...rows[0].querySelectorAll('td[data-tid]')],progress=[...rs[0].querySelectorAll('td[data-tid]')].filter(e=>e.getAttribute('data-tid')?.startsWith('ConsoleForm;ProgressForm;colProgress_'));
          const ids=cells.filter(e=>e.getAttribute('data-tid')?.startsWith('ConsoleForm;ProgressForm;colId_'));
          const texts=cells.filter(e=>e.getAttribute('data-tid')?.startsWith('ConsoleForm;ProgressForm;colProcess_'));
          if(ids.length===1&&texts.length===1&&progress.length===1&&ids[0].textContent.trim()===id
            && rows[0].getAttribute('data-boundview')===body[0].id&&rs[0].getAttribute('data-boundview')===right[0].id) {
            path=texts[0].getAttribute('data-tid');selected=rows[0].classList.contains('x-grid-item-selected');
            const expanders=texts[0].querySelectorAll('.x-tree-expander');
            if(expanders.length===1){expander_tid=expanders[0].getAttribute('data-tid');expanded=typeof d.expanded==='boolean'?d.expanded:null;}
            rendered=d.Status!==3||progress[0].classList.contains('bg-progress-ptpsCompleted');
          }
        }
        const state=d.Status===3?'completed':'pending_or_failed';
        const error=typeof d.ErrorDetails==='string'?d.ErrorDetails.trim().length>0:true;
        // ProgressForm's cached ProgressBarCls is the source of the rendered
        // progress cell class. Do not guess other numeric enum ordinals.
        const states={ptpsNotStarted:'not_started',ptpsProcessing:'running',ptpsNotResponding:'not_responding',
          ptpsCompleted:'completed',ptpsExplicitCanceled:'cancelled',ptpsError:'failed',
          ptpsParentCanceled:'parent_cancelled',ptpsParentError:'parent_failed'};
        const tokens=typeof d.ProgressBarCls==='string'?d.ProgressBarCls.trim().split(/\s+/):[];
        const recognized=tokens.filter(t=>t.startsWith('bg-progress-ptps'));
        const detailed=recognized.length===1?states[recognized[0].slice('bg-progress-'.length)]:null;
        const terminal=['completed','cancelled','failed','parent_cancelled','parent_failed'].includes(detailed);
        const statusValid=!!detailed&&typeof d.CanCancelProcess==='boolean'
          &&(detailed==='completed')===(d.Status===3)&&!(terminal&&d.CanCancelProcess);
        const progress_state=statusValid?{verified:true,state:detailed,terminal,can_cancel:d.CanCancelProcess,
          source:'native_progress_record'}:{verified:false};
        processes.push({process_id:id,record_id:record,parent_id:parent,state,error,
          ...(error&&typeof d.ErrorDetails==='string'?{error_details:d.ErrorDetails.trim().slice(0,1000)}:{}),rendered,selected,process_tid:path,
          expander_tid,expanded,children_loaded:d.loaded===true,caption:typeof d.text==='string'?d.text.slice(0,240):null,progress_state,
          ...(owner&&d.ModelNode===owner.data?{owner:{verified:true,node_id:nodeId,source:'native_process_model_identity'}}:{})});
        if(Array.isArray(n.childNodes)&&n.childNodes.length)walk(n.childNodes,id);
      }
    };
    try{walk(root.childNodes,null);}catch(e){return fail(e.message);}
    if(new Set(processes.map(p=>p.process_id)).size!==processes.length||new Set(processes.map(p=>p.record_id)).size!==processes.length)return fail('duplicate_process');
    return {verified:true,inventory_complete:true,root_id:String(root.internalId),show_completed:checked,
      filter_source:'cached_native_menu_check_state',processes,execution_freshness_verified:false};
  },before.surface==='graph'?before.node_id:null);
  const after=await readNode(page,binding);
  if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'node_context_changed'};
  return {...result,node_context:after};
}
