export function createdDatabaseTile(before,after,selected) {
 if(!before||!after||!selected||selected.path!==''||selected.icon!=='bg-vendor-icon-sqliteunidacdbconnection'
  ||before.some(r=>r.Module===selected.Module&&r.Instance===selected.Instance))return null;
 const expected=[...before,selected].sort((a,b)=>a.Module.localeCompare(b.Module)||a.Instance-b.Instance);
 return JSON.stringify(expected)===JSON.stringify(after)?selected:null;
}

// Serialized into Playwright. Read the unfiltered native store and bind the
// selection, toolbar and confirmation to the same module connection list.
export function inspectDatabaseTiles({owner,form,expected,tile,opening,confirm=false}) {
 const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller;
 const view=c.FController,roots=document.querySelectorAll('[data-tid='+JSON.stringify(form)+']');
 const root=roots[0];
 if(c.Node.data.node!==owner.module.FConnectionsNode||view?.constructor?.name!=='ConnectionsViewWizard'
  ||roots.length!==1||view.FView?.el?.dom!==root||!root.isConnected)return null;
 const source=bg.ext.GetStoreSource?.(view.Store),records=source?.getRange?.();
 if(!Array.isArray(records)||records.length>200||view.Store.isLoading?.()||source.isLoading?.())return null;
 const row=record=>{
  const d=record?.data,id=d?.Data?.__ObjectId;
  if(typeof id?.Module!=='string'||!Number.isSafeInteger(id.Instance)||typeof d.Title!=='string'
   ||typeof d.ConnectionPath!=='string'||typeof d.IconCls!=='string')return null;
  return {Module:id.Module,Instance:id.Instance,label:d.Title,path:d.ConnectionPath,icon:d.IconCls};
 };
 const rows=records.map(row);
 if(rows.includes(null)||new Set(rows.map(r=>JSON.stringify([r.Module,r.Instance]))).size!==rows.length)return null;
 rows.sort((a,b)=>a.Module.localeCompare(b.Module)||a.Instance-b.Instance);
 const selection=bg.ext.GetSelectedGridRecords(view.ListView),selected=selection?.length===1&&records.includes(selection[0])?selection[0]:null;
 if(!tile)return {rows,selected:row(selected)};
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 if(!same(rows,expected)||!same(row(selected),tile)||selected.data.Deletable!==true)return null;

 const visible=e=>{
  if(!e?.checkVisibility({checkVisibilityCSS:true}))return false;
  const {width,height}=e.getBoundingClientRect();
  return width>0&&height>0;
 };
 const windows=[...document.querySelectorAll('.x-window')].filter(visible);
 if(!confirm){
  if(windows.length||[...document.querySelectorAll('.x-mask,.x-mask-msg,.bg-mask-message')].some(visible))return null;
  const button=view.FCustomItems?.btnDeleteConnection,control=button?.el?.dom;
  const tid=control?.getAttribute('data-tid');
  if(!tid?.startsWith(form+';')||!tid.endsWith(';btnDeleteConnection'))return null;
  const controls=root.querySelectorAll('[data-tid='+JSON.stringify(tid)+']');
  if(controls.length!==1||controls[0]!==control||!visible(control)||Ext.getCmp(control.id)!==button||button.disabled!==false)return null;
  return {control,view,root,record:selected,prior:Ext.Msg?.cfg};
 }
 if(opening.view!==view||opening.root!==root||opening.record!==selected)return null;
 if(!windows.length)return {waiting:true};
 const dialog=windows[0],native=Ext.Msg;
 const message=native?.msg?.el?.dom,button=native?.msgButtons?.yes,control=button?.el?.dom;
 if(windows.length!==1||native?.el?.dom!==dialog||Ext.getCmp(dialog.id)!==native||!native.cfg||native.cfg===opening.prior
  ||native.cfg.title!=='Удаление подключения'||!message||!dialog.contains(message)
  ||message.textContent.trim()!=='Действительно удалить подключение '+tile.label+'?'
  ||!control||!dialog.contains(control)||Ext.getCmp(control.id)!==button||!visible(control)||button.disabled!==false
  ||!/^msgbox(?:-\d+)?;tlb;yes$/.test(control.getAttribute('data-tid'))||control.textContent.trim()!=='Удалить')return null;
 return {control};
}

export async function removeCreatedDatabaseTile(page,{owner,form,before,expected,tile,guard,wait,remaining},inspect=inspectDatabaseTiles) {
 if(!tile)return false;
 const args={owner,form,expected,tile};
 await guard();
 const opening=await page.evaluateHandle(inspect,args);
 const click=async handle=>{
  const control=(await handle.getProperty('control')).asElement();
  try{await control.click({timeout:remaining()});}finally{await control.dispose();}
 };
 try {
  if(!await opening.evaluate(value=>!!value?.control))return false;
  await click(opening);
  const confirmation=await wait('owned SQLite deletion confirmation',async()=>{
   const handle=await page.evaluateHandle(inspect,{...args,opening,confirm:true});
   const state=await handle.evaluate(value=>value?.waiting?'waiting':value?.control?'ready':'refused');
   if(state==='ready')return handle;
   await handle.dispose();
   if(state==='refused')throw Error('SQLite deletion confirmation or connection owner differs');
   return null;
  });
  try{await click(confirmation);}finally{await confirmation.dispose();}
  await wait('original connection inventory after SQLite deletion',async()=>{
   if(await page.locator('.x-mask:visible,.x-mask-msg:visible,.bg-mask-message:visible,.x-window:visible').count())return false;
   const current=await page.evaluate(inspect,{owner,form});
   const same=JSON.stringify(current?.rows);
   if(same===JSON.stringify(before))return true;
   if(same!==JSON.stringify(expected))throw Error('SQLite connection inventory changed during deletion');
   return false;
  });
  return true;
 }finally{await opening.dispose();}
}
