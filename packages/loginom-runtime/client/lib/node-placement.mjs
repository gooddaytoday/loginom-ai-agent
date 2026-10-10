// Native canvas coordinates and bounded, UI-only viewport navigation.
export function samePlacementGraph(before,after) {
 const shape=g=>({...g,nodes:g.nodes.map(({dom_epoch,...node})=>node)});
 return JSON.stringify(shape(before))===JSON.stringify(shape(after));
}
export function nodePlacementViewport(element,nodeId) {
 const d=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab()?.Controller?.FController?.FDiagram;
 const g=d?.FmxGraph,b=element.getBoundingClientRect();
 if(g?.container!==element||!g.view||!Number.isFinite(g.view.scale)||g.view.scale<=0||!Number.isFinite(g.view.translate?.x)||!Number.isFinite(g.view.translate?.y))throw Error('Native canvas transform unavailable');
 let nodeBounds;
 if(nodeId!==undefined){
  const nodes=d.FNodes?.FCollection?.filter(n=>n.FGuid===nodeId);
  if(nodes?.length!==1)throw Error('Placement node identity unavailable');
  const body=g.view.getState(nodes[0].FCell)?.shape?.node,tid=body?.getAttribute('data-tid');
  if(!tid||!element.contains(body))throw Error('Placement node drawing unavailable');
  const drawings=[...element.querySelectorAll('[data-tid]')].filter(e=>{const id=e.getAttribute('data-tid');return id===tid||id.startsWith(tid+';');});
  if(drawings.length>128||!drawings.includes(body))throw Error('Placement node drawing bound exceeded');
  const boxes=drawings.map(e=>e.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0);
  if(!boxes.length)throw Error('Placement node has no rendered bounds');
  const x=Math.min(...boxes.map(r=>r.x)),y=Math.min(...boxes.map(r=>r.y));
  nodeBounds={x,y,width:Math.max(...boxes.map(r=>r.x+r.width))-x,height:Math.max(...boxes.map(r=>r.y+r.height))-y};
 }
 return {...(nodeBounds?{node_bounds:nodeBounds}:{}),x:b.x,y:b.y,width:b.width,height:b.height,viewportWidth:innerWidth,viewportHeight:innerHeight,
  scale:g.view.scale,translate:{x:g.view.translate.x,y:g.view.translate.y},scroll:{x:element.scrollLeft,y:element.scrollTop}};
}
export function nodePlacementPoint(view,position) {
 if(![view.x,view.y,view.scale,view.translate?.x,view.translate?.y,view.scroll?.x,view.scroll?.y,position?.x,position?.y].every(Number.isFinite)||view.scale<=0)throw Error('Invalid native canvas transform');
 // Snap in model space first. Rounding fractional screen pixels can otherwise
 // cross the half-grid boundary at non-unit scale.
 return {x:view.x+(Math.round(position.x/8)*8+view.translate.x)*view.scale-view.scroll.x,
  y:view.y+(Math.round(position.y/8)*8+view.translate.y)*view.scale-view.scroll.y};
}
export function nodePlacementPosition(view,point) {
 if(![view.x,view.y,view.scale,view.translate?.x,view.translate?.y,view.scroll?.x,view.scroll?.y,point?.x,point?.y].every(Number.isFinite)||view.scale<=0)throw Error('Invalid native canvas transform');
 return {x:Math.round(((point.x-view.x+view.scroll.x)/view.scale-view.translate.x)/8)*8,
  y:Math.round(((point.y-view.y+view.scroll.y)/view.scale-view.translate.y)/8)*8};
}
// A crowded viewport does not imply a crowded model. Choose a fresh row below
// every observed drawing; the existing guarded UI navigation reveals it before
// any creation gesture. This helper is serialized into the browser evaluator.
export function nodePlacementOverflow(view,occupied,min,max) {
 if(!occupied.length)return null;
 if(![view.x,view.y,view.scale,view.translate?.x,view.translate?.y,view.scroll?.x,view.scroll?.y,min,max].every(Number.isFinite)||view.scale<=0
  ||occupied.some(r=>![r.left,r.right,r.top,r.bottom].every(Number.isFinite)||r.left>r.right||r.top>r.bottom))throw Error('Invalid placement overflow bounds');
 const x=Math.round(Math.max(min,(80+view.scroll.x)/view.scale-view.translate.x)/8)*8;
 const bottom=Math.max(...occupied.map(r=>(r.bottom-view.y+view.scroll.y)/view.scale-view.translate.y));
 const y=Math.ceil(Math.max(min,bottom+128/view.scale)/8)*8;
 if(x<min||y<min||x>max||y>max)return null;
 return {x,y};
}
export async function revealNodePlacement({page,root,position,prefix,guard,remaining,readViewport,project,nodeId}) {
 const within=(v,p)=>{
  const bounds=nodeId===undefined?{x:p.x,y:p.y,width:0,height:0}:v.node_bounds;
  if(!bounds||!Object.values(bounds).every(Number.isFinite))throw Error('Placement footprint unavailable');
  return bounds.x>=Math.max(v.x,0)+8&&bounds.y>=Math.max(v.y,0)+8
   &&bounds.x+bounds.width<Math.min(v.x+v.width,v.viewportWidth)-8&&bounds.y+bounds.height<Math.min(v.y+v.height,v.viewportHeight)-8;
 };
 let view=await root.evaluate(readViewport,nodeId),point=project(view,position),opened=false,steps=0,error,zoom;
 const toggle=page.locator('[data-tid='+JSON.stringify(prefix+';ModelForm;btnShowOutline')+']');
 const toggleOutline=async()=>{
  await guard();remaining();
  if(await toggle.count()!==1)throw Error('Canvas outline control unavailable');
  if(await toggle.isVisible()){await toggle.click({timeout:remaining()});return;}
  // The exact button can be hidden by the native toolbar overflow layout.
  // Bind its menu to that toolbar; never search a global menu by caption.
  const toolbarTid=prefix+';ModelForm;tlbModel',triggerTid=toolbarTid+';b',menuTid=triggerTid+';mn';
  const toolbar=page.locator('[data-tid='+JSON.stringify(toolbarTid)+']');
  const trigger=toolbar.locator('[data-tid='+JSON.stringify(triggerTid)+']');
  const menu=page.locator('[data-tid='+JSON.stringify(menuTid)+']');
  if(await toolbar.count()!==1||await trigger.count()!==1||!await trigger.isVisible())throw Error('Owned outline overflow control unavailable');
  const bound=await toggle.evaluate((e,{toolbarTid,triggerTid})=>{
   const t=e.closest('.x-toolbar'),c=globalThis.Ext?.getCmp(e.id),bar=t&&Ext.getCmp(t.id),h=bar?.layout?.overflowHandler;
   const b=t?.querySelector('[data-tid='+JSON.stringify(triggerTid)+']'),button=b&&Ext.getCmp(b.id);
   return t?.getAttribute('data-tid')===toolbarTid&&c?.ownerCt===bar&&button?.ownerCt===bar
    &&h?.$className==='Ext.layout.container.boxOverflow.Menu'&&h.menuTrigger===button
    &&h.menuItems?.filter(x=>x===c).length===1&&e.getAttribute('data-qtip')==='Показать карту сценария';
  },{toolbarTid,triggerTid});
  if(!bound)throw Error('Owned outline overflow identity unavailable');
  if(await menu.count()>1||await menu.isVisible())throw Error('Owned outline overflow menu is ambiguous or already open');
  const pressed=await toggle.evaluate(e=>globalThis.Ext?.getCmp(e.id)?.pressed);
  if(typeof pressed!=='boolean')throw Error('Owned outline toggle state unavailable');
  let menuOpened=false;
  try{
   for(let attempt=0;attempt<2;attempt++){
    await guard();await trigger.press('ArrowDown',{timeout:remaining()});menuOpened=true;
    try{await menu.waitFor({state:'visible',timeout:Math.min(1000,remaining())});break;}
    catch(e){
     // Native keyboard focus can consume the first open after canvas zoom.
     // Retry only a proven closed menu with the exact toggle still unchanged.
     if(await toggle.evaluate(e=>globalThis.Ext?.getCmp(e.id)?.pressed)!==pressed){e.placement_navigation_unverified=true;throw e;}
     if(attempt||await menu.count()!==1||await menu.isVisible())throw e;
    }
   }
   const item=menu.locator('[data-tid^='+JSON.stringify(menuTid+';')+']').filter({hasText:'Показать карту сценария'});
   if(await item.count()!==1||!await item.isVisible())throw Error('Exact outline overflow item unavailable');
   const owned=await item.evaluate((e,{toolbarTid,toggleTid,menuTid})=>{
    const t=document.querySelector('[data-tid='+JSON.stringify(toolbarTid)+']'),b=document.querySelector('[data-tid='+JSON.stringify(toggleTid)+']');
    const bar=t&&globalThis.Ext?.getCmp(t.id),button=b&&Ext.getCmp(b.id),h=bar?.layout?.overflowHandler,c=Ext.getCmp(e.id);
    const originals=h?.menuItems?.filter(x=>x.getEl?.()?.dom?.getAttribute('data-qtip')==='Показать карту сценария');
    return h?.$className==='Ext.layout.container.boxOverflow.Menu'&&h.menu?.el?.dom?.getAttribute('data-tid')===menuTid
     &&c?.ownerCt===h.menu&&c.text==='Показать карту сценария'&&!c.disabled
     &&originals?.length===1&&originals[0]===button&&button?.ownerCt===bar
     &&typeof c.checked==='boolean'&&c.checked===button.pressed;
   },{toolbarTid,toggleTid:prefix+';ModelForm;btnShowOutline',menuTid});
   if(!owned)throw Error('Owned outline overflow item identity unavailable');
   await guard();await item.click({timeout:remaining()});
  }finally{
   if(menuOpened){
    try{
     await guard();
     if(await menu.isVisible()){await menu.press('Escape',{timeout:remaining()});await menu.waitFor({state:'hidden',timeout:Math.min(2000,remaining())});}
    }catch(e){e.placement_navigation_unverified=true;throw e;}
   }
  }
 };
 // Loginom allocates outline IDs per form (cnt, cnt-1, ...). A global
 // cnt lookup can select a hidden outline belonging to another workflow.
 try {
  if(!within(view,point)) {
   await guard();remaining();
   const owner=page.locator('[data-tid='+JSON.stringify(prefix+';ModelForm;cntDiagram')+']');
   if(await owner.count()!==1||!await owner.isVisible())throw Error('Owned canvas outline container unavailable');
   zoom=owner.locator('.bg-workflow-outline-toolbar [data-tid$=";tlb;b"]');
   if(await zoom.count()>1)throw Error('Owned canvas zoom-out control is ambiguous');
   if(await zoom.count()===0||!await zoom.isVisible()){
    await toggleOutline();opened=true;
    await zoom.waitFor({state:'visible',timeout:Math.min(2000,remaining())});
   }
   if(await zoom.count()!==1||!await zoom.isVisible()||await zoom.getAttribute('data-qtip')!=='Уменьшить масштаб')throw Error('Exact canvas zoom-out control unavailable');
   while(!within(view,point)&&steps<12){
    await guard();remaining();const old=view.scale;
    await zoom.click({timeout:remaining()});steps++;
    const end=Math.min(Date.now()+1500,Date.now()+remaining());
    do {view=await root.evaluate(readViewport,nodeId);if(view.scale!==old)break;await page.waitForTimeout(Math.min(50,Math.max(0,end-Date.now())));}while(Date.now()<end);
    await guard();
    if(!(view.scale<old))break;
    point=project(view,position);
   }
  }
 }catch(e){error=e;}
 finally {
  if(opened) {
   try {await toggleOutline();await zoom.waitFor({state:'hidden',timeout:Math.min(2000,remaining())});}
   catch(e){e.placement_navigation_unverified=true;error=e;}
  }
 }
 if(error)throw error;
 await guard();view=await root.evaluate(readViewport,nodeId);point=project(view,position);
 return {view,point,zoom_steps:steps,outline_closed:opened,fully_visible:within(view,point)};
}
