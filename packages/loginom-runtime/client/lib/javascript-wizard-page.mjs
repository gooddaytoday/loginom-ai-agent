import {withJavascriptWizardAddress} from './javascript-wizard-settlement.mjs';
import {withJavascriptWizardMasks} from './javascript-wizard-masks.mjs';

// Shared native/DOM owner and page inspector for operator and managed JS route.
export const wizardReadiness=withJavascriptWizardAddress(withJavascriptWizardMasks(function wizardReadiness({prefix,owned,account,id,binding,addressEpoch,expectedWizard,expectedRoot,inspect=false,inputOnly=true,initialPages=[],afterIndex=null,afterPageTid=null}) {
  const app=globalThis.bg?.app,f=app?.Application?.FInstance?.FMainForm,m=f?.FMapTree;
  const tab=f?.Items?.Workspace?.getActiveTab?.(),native=tab?.Controller?.Node?.data?.node,model=tab?.Controller?.FController;
  const visible=e=>!!e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
  const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')].filter(visible);
  const roots=exact(prefix+';WizrdMCF'),root=roots.length===1?roots[0]:null;
  const title=exact(prefix+';WizrdMCF;cardWizardPanel;p.h;p.t'),close=exact(prefix+';WizrdMCF;btnClose');
  const pageBase=prefix+';WizrdMCF;';
  const pages=root?[...root.querySelectorAll('[data-tid]')].filter(e=>{
    const tid=e.getAttribute('data-tid');
    return tid.startsWith(pageBase)&&/^[^;]*Wizard$/.test(tid.slice(pageBase.length))&&visible(e);
  }):[];
  const inputPage=pages.length===1&&pages[0].getAttribute('data-tid')===pageBase+'TuneDataSourceInputPortWizard';
  const activePage=pages.length===1&&globalThis.Ext?.getCmp?.(pages[0].id);
  const pageOwners=new Set();
  for(let c=activePage;c&&pageOwners.size<16&&!pageOwners.has(c);c=c.ownerCt)pageOwners.add(c);
  const indicatorRoots=exact(pageBase+'rgpBottom');
  const indicatorGroup=indicatorRoots.length===1&&globalThis.Ext?.getCmp?.(indicatorRoots[0].id);
  const indicatorItems=[],indicatorQueue=indicatorGroup?[indicatorGroup]:[],indicatorSeen=new Set();
  let indicatorOverflow=false;
  while(indicatorQueue.length&&indicatorSeen.size<32){
    const component=indicatorQueue.shift();
    if(!component||indicatorSeen.has(component))continue;
    indicatorSeen.add(component);
    const children=component.items?.items;
    if(Array.isArray(children)&&children.length<=32)indicatorQueue.push(...children);
    if(Array.isArray(children)&&children.length>32)indicatorOverflow=true;
    const dom=component.el?.dom,tid=dom?.getAttribute('data-tid');
    if(tid?.startsWith(pageBase+'rgpBottom;')&&/^radiofield(?:-\d+)?$/.test(tid.slice((pageBase+'rgpBottom;').length)))indicatorItems.push(component);
  }
  const indicators=indicatorItems.map(c=>{
    const dom=c.el.dom,tid=dom.getAttribute('data-tid');
    const inputs=[...document.querySelectorAll('[data-tid='+JSON.stringify(tid+';InputEl')+']')];
    const chain=new Set();for(let p=c;p&&chain.size<16&&!chain.has(p);p=p.ownerCt)chain.add(p);
    return {id:dom.id,tid,native_class:c.$className??null,checked:typeof c.checked==='boolean'?c.checked:null,
      dom_checked:dom.classList.contains('x-form-cb-checked'),input_tag:c.inputEl?.dom?.tagName??null,
      input_type:c.inputEl?.dom?.getAttribute('type')??null,
      visible:visible(dom),
      bound:indicatorRoots.length===1&&indicatorGroup?.el?.dom===indicatorRoots[0]&&indicatorRoots[0].contains(dom)
        &&chain.has(indicatorGroup)&&dom.isConnected&&inputs.length===1&&inputs[0]===c.inputEl?.dom&&dom.contains(inputs[0])
        &&typeof c.checked==='boolean'&&c.checked===dom.classList.contains('x-form-cb-checked')};
  });
  const indicatorDom=indicatorRoots.length===1?[...indicatorRoots[0].querySelectorAll('[data-tid]')].filter(e=>
    e.getAttribute('data-tid').startsWith(pageBase+'rgpBottom;')&&/^radiofield(?:-\d+)?$/.test(e.getAttribute('data-tid').slice((pageBase+'rgpBottom;').length))):[];
  const indicatorBinding=indicators.length>=2&&indicators.length<=12&&!indicatorQueue.length&&!indicatorOverflow&&indicators.every(e=>e.bound)
    &&indicatorDom.length===indicators.length&&indicatorDom.every((e,i)=>e.id===indicators[i].id);
  const checked=indicators.map((e,i)=>e.checked===true?i:-1).filter(i=>i>=0);
  const pageIndex=indicatorBinding&&checked.length===1&&indicators[checked[0]].visible?checked[0]:null;
  const crumbs=[...document.querySelectorAll('[data-tid^='+JSON.stringify(prefix+';cnrNaviMode;b.s_')+']')].filter(visible);
  const overlays=[...document.querySelectorAll('.bg-mask-message,.x-mask-msg,.x-mask,[role="dialog"],.x-message-box')].filter(visible);
  // Ext masks a disabled delete-all column even when the wizard is ready.
  // Match only that observed control, never arbitrary .x-mask elements.
  const {maskObservations,deleteHeaders,header,column,columnOwners}=classifyJavascriptWizardMasks({prefix,root,model,binding,pages,overlays});
  const blockers=maskObservations.filter(m=>!m.disabled_delete_mask).map(m=>m.element);
  const lineage=[],seen=new Set();
  for(let n=native;n&&lineage.length<32&&!seen.has(n);n=n.ParentNode){seen.add(n);lineage.push(n);}
  const nodeTree=native?.ParentNode;
  const address=inspectJavascriptWizardAddress({prefix,id,binding,native,model,crumbs,epoch:addressEpoch});
  const checks={
    account:m?.FServerConnection?.UserName===account,
    package_count:m?.PackageNodes?.Count===1,
    package_identity:m?.PackageNodes?.Count===1&&m.PackageNodes.Items(0)===owned,
    root_unique:roots.length===1,
    native_wizard_class:native?.constructor?.name==='WizardTreeNode',
    controller_present:!!model,
    no_visible_blockers:blockers.length===0,
    title_unique:title.length===1,
    title_nonempty:title.length===1&&!!title[0].textContent.trim(),
    page_unique:pages.length===1,
    input_page_expected:!inputOnly||inputPage||pageIndex===0&&pages.length===1&&initialPages.includes(pages[0].getAttribute('data-tid')),
    native_page_identity:pages.length===1&&activePage?.el?.dom===pages[0],
    native_page_root_owner:!!root&&[...pageOwners].some(c=>c.el?.dom===root),
    expected_page_transition:afterIndex===null||Number.isInteger(pageIndex)&&pageIndex>afterIndex
      &&pages.length===1&&pages[0].getAttribute('data-tid')!==afterPageTid,
    close_unique:close.length===1,
    close_enabled:close.length===1&&!close[0].closest('.x-item-disabled,.x-btn-disabled'),
    node_breadcrumb:address.ready,
    wizard_breadcrumb:address.checks.wizard_binding&&address.checks.wizard_text,
    native_wizard_instance:!!app?.WizardTreeNode&&native instanceof app.WizardTreeNode,
    native_node_instance:!!app?.ModelNodeTreeNode&&nodeTree instanceof app.ModelNodeTreeNode,
    node_guid:nodeTree?.FGuid===id,
    model_class:model?.constructor?.name==='WizardModelComponentForm',
    model_node_identity:!!nodeTree?.FModelNode&&model?.FModelNode===nodeTree.FModelNode,
    original_node_identity:!!binding&&nodeTree?.FModelNode===binding.nodeData,
    original_workflow_identity:!!binding&&nodeTree?.ParentNode===binding.workflow,
    original_tab_identity:!!binding&&tab===binding.tab,
    package_ancestry:lineage.includes(owned),
    native_root_identity:!!root&&model?.FView?.el?.dom===root,
    page_within_root:!!root&&pages.length===1&&root.contains(pages[0]),
    title_within_root:!!root&&title.length===1&&root.contains(title[0]),
    close_within_root:!!root&&close.length===1&&root.contains(close[0]),
    close_aria_enabled:close.length===1&&close[0].getAttribute('aria-disabled')!=='true',
    retained_wizard_identity:!expectedWizard||native===expectedWizard,
    retained_root_identity:!expectedRoot||root===expectedRoot
  };
  const failed=Object.keys(checks).filter(k=>!checks[k]);
  const fatal=!checks.account||!checks.package_count||!checks.package_identity||roots.length>1
    ||!checks.original_tab_identity||!checks.retained_wizard_identity||!checks.retained_root_identity
    ||checks.native_node_instance&&(!checks.node_guid||!checks.original_node_identity||!checks.original_workflow_identity);
  if(!inspect&&!fatal&&failed.length)return false;
  const describe=e=>({tid:e.getAttribute('data-tid'),id:e.id,classes:String(e.className).slice(0,240),
    parent_tid:e.parentElement?.closest('[data-tid]')?.getAttribute('data-tid')??null,
    display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility,opacity:getComputedStyle(e).opacity,
    within_root:!!root&&root.contains(e),contains_root:!!root&&e.contains(root),
    rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}});
  return {ready:failed.length===0,fatal,checks,failed,address,
    transition:afterIndex===null?null:{from_index:afterIndex,to_index:pageIndex,from_tid:afterPageTid,
      skipped_indices:Number.isInteger(pageIndex)&&pageIndex>afterIndex?Array.from({length:pageIndex-afterIndex-1},(_,i)=>afterIndex+i+1):[]},
    native_class:native?.constructor?.name??null,model_class:model?.constructor?.name??null,
    node_guid:typeof nodeTree?.FGuid==='string'?nodeTree.FGuid:null,
    page:pages.length===1?{tid:pages[0].getAttribute('data-tid'),title:title.length===1?title[0].textContent.trim().slice(0,200):null,
      index:pageIndex,indicator_count:indicators.length,indicators:indicators.slice(0,12),visible_editors:[...pages[0].querySelectorAll('.CodeMirror')].filter(visible).length}:null,
    page_ownership:{native_class:activePage?.$className??null,
      owners:[...pageOwners].map(c=>({class:c.$className??null,id:c.el?.dom?.id??null})),
      checked_indicators:checked.slice(0,12),indicator_binding:indicatorBinding,indicator_bound_exceeded:indicatorOverflow||indicators.length>12||indicatorQueue.length>0,
      indicator_group_class:indicatorGroup?.$className??null,indicator_native_items:indicatorSeen.size,
      indicator_dom:indicatorDom.slice(0,12).map(e=>({id:e.id,tid:e.getAttribute('data-tid'),checked_class:e.classList.contains('x-form-cb-checked')}))},
    lineage_classes:lineage.map(n=>n.constructor?.name??null),lineage_bound_reached:lineage.length===32,
    counts:{roots:roots.length,titles:title.length,pages:pages.length,close:close.length,crumbs:crumbs.length,overlays:overlays.length,blockers:blockers.length},
    roots:roots.slice(0,2).map(describe),close:close.slice(0,2).map(describe),
    titles:title.slice(0,2).map(e=>(e.textContent??'').slice(0,200)),
    crumbs:crumbs.slice(-12).map(e=>({tid:e.getAttribute('data-tid'),raw:(e.textContent??'').slice(0,200),trimmed:(e.textContent??'').trim().slice(0,200)})),
    blockers:blockers.slice(0,16).map(describe),blockers_truncated:blockers.length>16,
    mask_classification:maskObservations.slice(0,16).map(m=>({element:describe(m.element),
      disabled_delete_mask:m.disabled_delete_mask,checks:m.checks,
      markup:{role:m.element.getAttribute('role'),text_length:(m.element.textContent??'').length,
        direct_children:m.element.children.length,
        descendants:[...m.element.querySelectorAll('*')].slice(0,8).map(e=>({tag:e.tagName,classes:String(e.className).slice(0,160),
          role:e.getAttribute('role'),visible:visible(e),text_length:(e.textContent??'').length})),
        descendants_truncated:m.element.querySelectorAll('*').length>8}})),
    delete_header:{matches:deleteHeaders.length,element:header?describe(header):null,
      native_class:column?.$className??null,disabled:column?.disabled??null,
      cached_mask_id:header?._extData?.maskEl?.dom?.id??null,
      native_owners:columnOwners.map(c=>({class:c.$className??null,id:c.el?.dom?.id??null})),
      owner_bound_reached:columnOwners.length===16}};
}));
