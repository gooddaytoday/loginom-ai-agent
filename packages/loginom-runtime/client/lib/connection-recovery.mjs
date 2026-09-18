// Restore only the original native session, through its observed 7.4.2 UI.
// Native references stay in the prepared document; none enter logs or receipts.
// This guard never retries the caller's code or clears an operation checkpoint.
export async function guardLoginomConnection(page, binding) {
 const inspect=mode=>page.evaluate(({b,mode})=>{
  const prep=globalThis.__loginomDockPreparationV1,app=globalThis.bg?.app;
  const form=app?.Application?.FInstance?.FMainForm,map=form?.FMapTree,c=map?.FServerConnection;
  const same=location.origin===b.origin&&app?.Version===b.loginom_build
   &&prep?.id===b.document_id&&c?.UserName===b.loginom_account;
  if(!same)return {reason:'identity'};
  const connected=c.Connected===true;
  const packages=map.PackageNodes;
  const proof=!!c.FRemoteSession&&!!c.FSession&&Number.isInteger(packages?.Count)&&packages.Count<=32;
  const current=proof?Array.from({length:packages.Count},(_,i)=>{const node=packages.Items(i);return {node,path:node.PackageFileName};}):null;
  const store=prep.connectionGuard??(prep.connectionGuard=new Map());
  let a=store.get(b.session_id);
  const unchanged=()=>a&&a.document===document&&a.connection===c&&a.remote===c.FRemoteSession&&a.session===c.FSession
   &&current&&a.packages.length===current.length&&a.packages.every((p,i)=>p.node===current[i].node&&p.path===current[i].path);
  if(a?.pending||mode==='verify'||mode==='reserve'){
   if(!unchanged())return {reason:'owner'};
   if(mode==='reserve'){
    if(a.pending)return {reason:'attempted'};
    a.pending=true;return {reserved:true};
   }
   if(connected&&form.FReconnecting===false){a.pending=false;return {connected:true,restored:true};}
   return {reason:'attempted'};
  }
  if(connected){
   if(proof){
    if(!a&&store.size>=8)return {reason:'capacity'};
    store.set(b.session_id,{document,connection:c,remote:c.FRemoteSession,session:c.FSession,packages:current,pending:false});
   }
   return {connected:true};
  }
  if(!unchanged())return {reason:'owner'};
  return {connected:false};
 },{b:binding,mode});
 const fail=reason=>{if(reason==='identity')throw Error('Loginom account or document changed; prepare the workspace again');
  throw Error('Loginom connection is disconnected; original session recovery unverified ('+reason+'); inspect the pending operation before continuing');};
 const before=await inspect('observe');
 if(before.reason)fail(before.reason);
 if(before.connected)return;
 const title=page.locator('[data-tid="msgbox;p.h;p.t"]');
 const button=page.locator('[data-tid="msgbox;tlb;yes"]');
 try{
  await title.waitFor({state:'visible',timeout:3000});
  const content=page.locator('[data-tid="msgbox;cnt"]');
  if(await title.count()!==1||await button.count()!==1||!await button.isVisible()
   ||(await title.innerText()).trim()!=='Восстановление сессии'
   ||(await button.innerText()).trim()!=='Восстановить'
   ||!(await content.innerText()).replace(/\s/g,'').includes('Обнаруженразрывсвязи.Восстановитьсессию?'))fail('dialog');
 }catch{fail('dialog');}
 const reserved=await inspect('reserve');if(!reserved.reserved)fail(reserved.reason);
 // Reserve before the only gesture: timeout/lost reply never authorizes a repeat.
 await button.click({timeout:3000});
 try{await page.waitForFunction(()=>{
  const f=globalThis.bg?.app?.Application?.FInstance?.FMainForm;
  return f?.FMapTree?.FServerConnection?.Connected===true&&f.FReconnecting===false;
 },null,{timeout:10000});}catch{fail('awaiting_original_attempt');}
 const after=await inspect('verify');if(!after.connected)fail(after.reason);
}
