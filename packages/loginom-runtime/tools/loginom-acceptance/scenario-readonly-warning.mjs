// Operator-only acknowledgement; never a general toast dismiss action.
export function makeReadOnlyWarningAcknowledgement({sessionId,documentId,packagePath}) {
 if(![sessionId,documentId].every(v=>typeof v==='string'&&v.length>0)||typeof packagePath!=='string'||!packagePath.startsWith('/mimo/MiMo-')||!packagePath.endsWith('/scenario.lgp'))throw Error('Exact diagnostic package required');
 return `async page=>(${acknowledge.toString()})(page,${JSON.stringify({sessionId,documentId,packagePath})})`;
}
async function acknowledge(page,expected){
 const result=await page.evaluate(e=>{
  const app=globalThis.bg?.app,m=app?.Application?.FInstance?.FMainForm?.FMapTree,p=globalThis.__loginomDockPreparationV1;
  const owned=p?.receipts instanceof Map&&[...p.receipts.values()].some(r=>{try{return JSON.parse(r.request).session===e.sessionId;}catch{return false;}});
  if(location.origin!=='http://10.200.11.224'||app?.Version!=='7.4.2'||p?.document!==document||p.id!==e.documentId||!owned||m?.FServerConnection?.UserName!=='mimo'||!m.FServerConnection.Connected||m.PackageNodes.Count!==1)return {status:'BLOCKED',reason:'owner'};
  const n=m.PackageNodes.Items(0);if(n.PackageFileName!==e.packagePath||n.ReadOnly!==true||n.HasRunningNodes()!==false)return {status:'BLOCKED',reason:'package'};
  const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
  const toasts=exact('toast'),titles=exact('toast;p.h;p.t'),bodies=exact('toast;cnt;cnt;cmp'),closes=exact('toast;p.h;close');
  if(toasts.length===0)return {status:'ABSENT',acknowledged:false};
  const text='Пакет "'+e.packagePath+'" открыт только на чтение, потому что он уже открыт другим пользователем, либо к файлу есть доступ только на чтение. Сохранение возможно только под другим именем.';
  if(toasts.length!==1||titles.length!==1||bodies.length!==1||closes.length!==1||![titles[0],bodies[0],closes[0]].every(x=>toasts[0].contains(x))||titles[0].innerText.trim()!=='Предупреждение'||bodies[0].innerText.trim()!==text)return {status:'BLOCKED',reason:'warning_differs'};
  return {status:'MATCHED',text};
 },expected);
 if(result.status!=='MATCHED')return result;
 await page.locator('[data-tid="toast;p.h;close"]').click();
 await page.locator('[data-tid="toast"]').waitFor({state:'detached'});
 return {status:'ACKNOWLEDGED',package_path:expected.packagePath,warning:result.text,package_changed:false};
}
