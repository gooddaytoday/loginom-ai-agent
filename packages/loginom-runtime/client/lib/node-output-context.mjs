import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function makeTreeWizardContextCode(binding){
 validatePreparedNodeContext(binding);
 return `async page=>{const readNode=${readPreparedNodeContext.toString()},b=${JSON.stringify(binding)};const before=await readNode(page,b);if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'tree_wizard_owner'};const value=await page.evaluate(${readTreeWizardBrowser.toString()},b.workflow_ref.prefix);const after=await readNode(page,b);return JSON.stringify(before)===JSON.stringify(after)?{...value,node_context:after}:{verified:false,reason:'tree_wizard_changed'};}`;
}

// Cached form controls and native tree-store records only. Never apply a
// property editor, invoke a tree handler or read a model proxy in this probe.
export function readTreeWizardBrowser(prefix){
 const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
 const roots=['JSONToTreeWizard','TreeToDataWizard'].flatMap(kind=>exact(prefix+';WizrdMCF;'+kind)
  .filter(root=>root.checkVisibility({checkVisibilityCSS:true})).map(root=>({root,kind})));
 const need=(ok,reason)=>{if(!ok)throw Error(reason);};
 try{
  need(roots.length===1,'tree_wizard_root');const {root,kind}=roots[0],base=prefix+';WizrdMCF;'+kind+';';
  const component=key=>{const es=exact(base+key),c=es.length===1&&globalThis.Ext?.getCmp(es[0].id);
   need(es.length===1&&root.contains(es[0])&&c?.el?.dom===es[0],'tree_control_'+key);return {element:es[0],control:c};};
  const bool=key=>{const {element,control}=component(key+';ValueControl');need(typeof control.getValue==='function','tree_checkbox');
   const value=control.getValue();need(typeof value==='boolean','tree_checkbox_value');
   const checked=element.classList.contains('x-form-cb-checked')||element.closest('.x-form-cb-checked')!==null;
   need(value===checked,'tree_checkbox_state');return value;};
  const text=key=>{const {control}=component(key+';ValueControl');need(typeof control.getRawValue==='function','tree_field');
   const value=control.getRawValue();need(typeof value==='string'&&value.length<=512,'tree_field_value');return value;};
  if(kind==='JSONToTreeWizard')return {verified:true,inventory_complete:true,kind:'json_to_tree',base,
   json_field:text('pedSourceColumn'),auto_structure:bool('pedBuildTreeAuto'),strict:bool('pedStrictMode'),exclude_root:bool('pedRootExcluded'),
   root_mode:component('pedRootGeneration;ValueControl').control.getValue()===0?'auto':'unsupported',date_format:text('pedDateTimeFormat')};
  const {element,control}=component('trpDataTree'),store=control.getStore?.(),nativeRoot=store?.getRoot?.();
  need(store&&!store.isLoading()&&nativeRoot&&Array.isArray(nativeRoot.childNodes),'tree_store');
  const nodes=[],seen=new Set(),pointer=name=>name.replaceAll('~','~0').replaceAll('/','~1');let complete=true;
  const walk=(record,parent,path,depth)=>{
   need(depth<=16&&seen.size<256&&!seen.has(record)&&record.isModel===true&&Array.isArray(record.childNodes),'tree_store_bound');seen.add(record);
   const d=record.data;need(d&&typeof d.Name==='string'&&typeof d.IsContainer==='boolean'&&typeof d.IsArray==='boolean','tree_record');
   const name=d.Name,next=parent===null?'':path+'/'+pointer(name),index=nodes.length;
   const rows=[...element.querySelectorAll('[data-recordid]')].filter(e=>e.getAttribute('data-recordid')===String(record.internalId));
   const tids=rows.flatMap(e=>[...e.querySelectorAll('[data-tid]')].map(n=>n.getAttribute('data-tid')));
   const checkbox=tids.filter(t=>t.endsWith(';TreeCheckbox')),expander=tids.filter(t=>t.endsWith(';TreeExpander'));
   if(d.IsContainer&&d.loaded!==true)complete=false;
   nodes.push({index,parent,path:next,name,is_container:d.IsContainer,is_array:d.IsArray,selected:d.checked===true,
    selected_global_index:d.SelectedGlobalIndex===true,record_id:String(record.internalId),
    ...(checkbox.length===1?{checkbox_tid:checkbox[0]}:{}),...(expander.length===1?{expander_tid:expander[0]}:{}),loaded:d.loaded===true});
   const names=new Set();
   for(const child of record.childNodes){
    need(child.parentNode===record,'tree_record_parent');
    if(!child.data.Node){need(child.data.checked!==true,'tree_index_selected');continue;}
    need(!names.has(child.data.Name),'tree_schema_names');names.add(child.data.Name);walk(child,index,next,depth+1);
   }
  };
  need(nativeRoot.childNodes.length===1,'tree_root_count');walk(nativeRoot.childNodes[0],null,'',0);
  return {verified:true,inventory_complete:complete,kind:'tree_to_table',base,nodes,
   repeat_parents:bool('pedRepeatParentNodeValues'),composite_names:bool('pedCompositeColumnNames'),
   composite_labels:bool('pedCompositeColumnDisplayNames'),label_separator:component('pedCompositeDisplayNameSeparator;ValueControl').control.getValue()};
 }catch(error){return {verified:false,reason:error.message};}
}

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
          const match=tid?.startsWith(context.tid+';')&&/^Output_Data(Tree)?-(\d+)$/.exec(tid.slice(context.tid.length+1));
          if(!match)continue;
          const tree=!!match[1],index=match[2];
          if(!/^[0-9]{1,2}$/.test(index) || !guid(p.FGuid) || [...exact(tid)].filter(candidate=>d.FmxGraph.container.contains(candidate)).length!==1 || !d.FmxGraph.container.contains(el))return fail('port_identity');
          const images=[...el.querySelectorAll('image')];
          if(images.length!==1)return fail('port_icon');
          const href=images[0].getAttribute('href')??images[0].getAttribute('xlink:href');
          const icon=href?.split('/').at(-1);
          if(tree&&(!p.data||p.parent!==node[0]||p.FCell.parent!==node[0].FCell||p.FType!==1||!Number.isInteger(p.FSubType)))return fail('tree_port_identity');
          ports.push({native_index:Number(index),port_guid:p.FGuid,tid,label:p.FDisplayName,
            ...(tree?{kind:'tree',native_subtype:p.FSubType,active:p.FStatus===1,activity_source:'native_port_status'}:
             {active:['output_table_active.svg','output_table_active_no_automapping.svg'].includes(icon),activity_source:'rendered_port_icon'})});
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
    const descriptors=[],pending=[];
    for(const [id,v] of Object.entries(views)) {
      if(v.Vendor?.constructor?.name!=='BrowseViewVendor')continue;
      const matching=portPanels.filter(p=>ports[p.port_guid].Panel===v.PortPanel);
      const nativeCard=v.ViewerCard?.FView?.el?.dom;
      const cardTid=nativeCard?.getAttribute('data-tid'),cardBase=b.workflow_ref.prefix+';ViewsForm;ViewerCard';
      if(!guid(id)||matching.length!==1)return fail('table_card_binding');
      // A registered native descriptor can precede creation of its UI card.
      // Preserve only its proved panel identity; it cannot authorize a gesture.
      if(!nativeCard){pending.push({view_guid:id,port_guid:matching[0].port_guid});continue;}
      if(!v.PortPanel.el.dom.contains(nativeCard)
        || !cardTid?.startsWith(cardBase)||!/^(-[0-9]+)?$/.test(cardTid.slice(cardBase.length)))
        return {...fail('table_card_binding'),card_state:'foreign_or_invalid_card',view_guid:id};
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
    return {verified:pending.length===0,...(pending.length?{reason:'table_card_pending',pending_tables:pending}:{}),
      surface:'views',port_panels:portPanels,tables:descriptors,execution_freshness_verified:false};
  },{binding,context:before});
  const after=await readNode(page,binding);
  if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'node_context_changed'};
  return {...output,node_context:after};
}
