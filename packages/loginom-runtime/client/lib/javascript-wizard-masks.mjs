// Exact existing disabled delete-all header mask classification. This reads
// cached Ext identities only; it never calls getData() or changes the DOM.
export function classifyJavascriptWizardMasks({prefix,root,model,binding,pages,overlays}) {
  const visible=e=>!!e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
  const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')].filter(visible);
  const pageBase=prefix+';WizrdMCF;';
  const mappingPage=pages.length===1&&['TuneDataSourceInputPortWizard','JavaScriptColumnsWizard'].includes(pages[0].getAttribute('data-tid').slice(pageBase.length))?pages[0].getAttribute('data-tid'):null;
  const deleteHeaders=mappingPage?exact(mappingPage+';colTargetDelete'):[];
  const grids=mappingPage?exact(mappingPage+';grdTargetColumns'):[];
  const header=deleteHeaders.length===1?deleteHeaders[0]:null;
  const column=header&&globalThis.Ext?.getCmp?.(header.id);
  const grid=grids.length===1&&globalThis.Ext?.getCmp?.(grids[0].id);
  const pageComponent=pages.length===1&&globalThis.Ext?.getCmp?.(pages[0].id);
  const columnOwners=[],ownerSeen=new Set();
  for(let c=column;c&&columnOwners.length<16&&!ownerSeen.has(c);c=c.ownerCt){ownerSeen.add(c);columnOwners.push(c);}
  const maskObservations=overlays.map(element=>{
    const rect=element.getBoundingClientRect(),bounds=header?.getBoundingClientRect();
    const checks={
      exact_delete_header:!!header&&element.parentElement===header,
      disabled_native_column:!!column&&column.disabled===true,
      column_dom_identity:!!header&&column?.el?.dom===header,
      grid_dom_identity:grids.length===1&&grid?.el?.dom===grids[0],
      page_dom_identity:pages.length===1&&pageComponent?.el?.dom===pages[0],
      native_grid_owner:!!grid&&columnOwners.includes(grid),
      native_page_owner:!!pageComponent&&columnOwners.includes(pageComponent),
      dom_grid_owner:!!header&&grids.length===1&&grids[0].contains(header),
      dom_page_owner:!!header&&pages.length===1&&pages[0].contains(header),
      owned_root:!!root&&!!header&&root.contains(header)&&model?.FView?.el?.dom===root
        &&!!binding&&model?.FModelNode===binding.nodeData,
      plain_mask:element.classList.contains('x-mask')&&[...element.classList].every(c=>['x-mask','x-border-box'].includes(c)),
      // Ext Element.mask() keeps a presentation/message subtree even without
      // a message. Read the existing cache only; getData() can create it.
      cached_mask_identity:!!header&&column?.el?.dom===header&&header._extData?.maskEl?.dom===element,
      no_mask_component:!globalThis.Ext?.getCmp?.(element.id),
      no_visible_loading_content:!element.matches('[role="dialog"],.x-message-box')
        &&![...element.querySelectorAll('.x-mask-msg,.bg-mask-message,[role="dialog"],.x-message-box')].some(visible),
      header_bounds:!!bounds&&['x','y','width','height'].every(k=>Math.abs(rect[k]-bounds[k])<=1/64)
    };
    return {element,checks,disabled_delete_mask:Object.values(checks).every(Boolean)};
  });
  return {maskObservations,deleteHeaders,header,column,columnOwners};
}

// Playwright serializes only the passed function. Embed the fixed classifier
// into both inspectors so neither relies on a host-side import in the browser.
export function withJavascriptWizardMasks(inspector) {
  if(!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(inspector.name))throw Error('Named internal wizard inspector required');
  return new Function('return function '+inspector.name+'(args){const classifyJavascriptWizardMasks='+classifyJavascriptWizardMasks.toString()+';return ('+inspector.toString()+')(args);}')();
}
