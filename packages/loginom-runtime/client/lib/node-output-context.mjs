import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

// Read-only host capability. Native UI ports and view descriptors establish
// ownership; no data source, model port or RPC proxy properties are invoked.
export function makeNodeOutputContextCode(binding) {
  validatePreparedNodeContext(binding);
  return `async page=>{const readNode=${readPreparedNodeContext.toString()};return (${readOutputContext.toString()})(page,${JSON.stringify(binding)},readNode)}`;
}

export async function readOutputContext(page,binding,readNode=readPreparedNodeContext) {
  const before=await readNode(page,binding);
  if(!before.verified)return {verified:false,reason:'node_context',node_context:before};
  const output=await page.evaluate(({binding:b,context})=>{
    const fail=reason=>({verified:false,reason});
    const exact=tid=>document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']');
    const app=globalThis.bg?.app,card=app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab(),model=card?.Controller?.FController;
    const guid=v=>typeof v==='string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
    if(context.surface==='graph') {
      const d=model?.FDiagram,nodes=d?.FNodes?.FCollection;
      const node=Array.isArray(nodes)?nodes.filter(n=>n.FGuid===b.node.node_id):[];
      if(node.length!==1 || !Array.isArray(node[0].FPorts) || node[0].FPorts.length>16)return fail('graph_node');
      const ports=[];
      for(const list of node[0].FPorts) {
        if(!Array.isArray(list.FCollection)||list.FCollection.length>100)return fail('port_bound');
        for(const p of list.FCollection) {
          const el=d.FmxGraph.view.getState(p.FCell)?.shape?.node,tid=el?.getAttribute('data-tid');
          if(!tid?.startsWith(context.tid+';Output_Data-'))continue;
          const index=tid.slice((context.tid+';Output_Data-').length);
          if(!/^[0-9]{1,2}$/.test(index) || !guid(p.FGuid) || exact(tid).length!==1 || !d.FmxGraph.container.contains(el))return fail('port_identity');
          const images=[...el.querySelectorAll('image')];
          if(images.length!==1)return fail('port_icon');
          const href=images[0].getAttribute('href')??images[0].getAttribute('xlink:href');
          const icon=href?.split('/').at(-1);
          ports.push({native_index:Number(index),port_guid:p.FGuid,tid,label:p.FDisplayName,
            active:['output_table_active.svg','output_table_active_no_automapping.svg'].includes(icon),activity_source:'rendered_port_icon'});
        }
      }
      if(new Set(ports.map(p=>p.native_index)).size!==ports.length || new Set(ports.map(p=>p.port_guid)).size!==ports.length)return fail('duplicate_ports');
      ports.sort((a,b)=>a.native_index-b.native_index);
      const selected=d.FmxGraph.getSelectionCells();
      return {verified:true,surface:'graph',node_selected:selected.length===1 && selected[0]===node[0].FCell,
        ports:ports.map((p,index)=>({...p,index})),execution_freshness_verified:false};
    }
    if(context.surface!=='views')return fail('unsupported_surface');
    const ports=model.FPortList,views=model.FViewDescList;
    if(!ports || !views || Object.keys(ports).length>100 || Object.keys(views).length>100)return fail('view_bound');
    const portPanels=[];
    for(const [id,p] of Object.entries(ports)) {
      if(p.Type!==0)continue; // UI group type 0 is a data port; 1 is the component.
      const tid=b.workflow_ref.prefix+';ViewsForm;cntPorts;'+id,els=exact(tid);
      if(!guid(id)||els.length!==1||p.Panel?.el?.dom!==els[0])return fail('view_port_binding');
      portPanels.push({port_guid:id,tid});
    }
    const descriptors=[];
    for(const [id,v] of Object.entries(views)) {
      if(v.Vendor?.constructor?.name!=='BrowseViewVendor')continue;
      const matching=portPanels.filter(p=>ports[p.port_guid].Panel===v.PortPanel);
      const nativeCard=v.ViewerCard?.FView?.el?.dom;
      const cardTid=nativeCard?.getAttribute('data-tid'),cardBase=b.workflow_ref.prefix+';ViewsForm;ViewerCard';
      if(!guid(id)||matching.length!==1||!nativeCard || !v.PortPanel.el.dom.contains(nativeCard)
        || !cardTid?.startsWith(cardBase)||!/^(-[0-9]+)?$/.test(cardTid.slice(cardBase.length)))return fail('table_card_binding');
      const active=model.FActiveViewGuid===id;
      let tableTid=null;
      if(active) {
        const base=v.BaseView,el=base?.FView?.el?.dom;
        tableTid=el?.getAttribute('data-tid');
        if(base?.constructor?.name!=='BrowseView' || !new RegExp('^'+b.workflow_ref.prefix+';ViewsForm;BrowseView(?:-\\d+)?$').test(tableTid??'')
          || exact(tableTid).length!==1 || exact(tableTid)[0]!==el)return fail('active_table_binding');
      }
      descriptors.push({view_guid:id,port_guid:matching[0].port_guid,active,table_tid:tableTid});
    }
    return {verified:true,surface:'views',port_panels:portPanels,tables:descriptors,execution_freshness_verified:false};
  },{binding,context:before});
  const after=await readNode(page,binding);
  if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'node_context_changed'};
  return {...output,node_context:after};
}
