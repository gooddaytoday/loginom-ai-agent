import {withBrowserReceipt} from './executor.mjs';

// Explicit isolated-run teardown. Never save, stop nodes, or close a package
// in another Loginom session. The CLI never opts into diagnostic discard.
// Loginom's own close guard remains
// enabled: CloseAllPackages(true, false) from E2E would bypass that guard.
export function makePackageCleanupCode(options) {
  const {sessionId, documentId, account, packagePath, loginomUrl, loginomBuild, tabTid, timeoutMs = 8000, diagnosticDiscard = false, diagnosticReadOnly = false, diagnosticWaitForIdle = false, unsavedDraft = false} = options;
  if (![sessionId, documentId, account, tabTid].every(v => typeof v === 'string' && v.length > 0 && v.length <= 200)
      || (unsavedDraft ? packagePath !== null : typeof packagePath !== 'string' || !/^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+\.lgp$/.test(packagePath)
      || packagePath.split('/').some(p => p === '.' || p === '..')) || loginomBuild !== '7.4.2'
      || typeof unsavedDraft !== 'boolean' || unsavedDraft && (diagnosticDiscard || diagnosticReadOnly || diagnosticWaitForIdle)
      || typeof diagnosticReadOnly !== 'boolean' || typeof diagnosticDiscard !== 'boolean'
      || typeof diagnosticWaitForIdle !== 'boolean' || diagnosticWaitForIdle && !diagnosticDiscard
      || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 15000) throw Error('Exact isolated cleanup identity required');
  const url = new URL(loginomUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Invalid cleanup origin');
  // Match the existing bridge cleanup call's 30000 ms budget, including dispatch.
  return `async page=>(${closeOwnedPackage.toString()})(page,${JSON.stringify({sessionId, documentId, account, packagePath, origin:url.origin, loginomBuild, tabTid, timeoutMs, diagnosticDiscard, diagnosticReadOnly, diagnosticWaitForIdle, unsavedDraft})},${Date.now()+30000})`;
}

// Reconciliation of an unsuccessful Open. It never promotes prepare
// to READY: bind just the newly opened native package before the SAME close guard.
export function makeFailedOpenCleanupCode(options) {
  makePackageCleanupCode({...options,account:options.bindOnly===true?'unbound':options.account,
    documentId:'unbound',tabTid:'unbound',diagnosticDiscard:false,diagnosticWaitForIdle:false});
  if(typeof options.operationId!=='string'||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(options.operationId))throw Error('Exact Open operation required');
  const o={sessionId:options.sessionId,account:options.account,documentId:options.documentId,
    bindOnly:options.bindOnly===true,packagePath:options.packagePath,
    origin:new URL(options.loginomUrl).origin,loginomBuild:options.loginomBuild,operationId:options.operationId,
    timeoutMs:options.timeoutMs??8000,diagnosticDiscard:false,diagnosticWaitForIdle:false};
  const gesture=withBrowserReceipt('perform()',{
    receipt_namespace:'failed-open-cleanup:'+o.sessionId,operation_id:o.operationId+':cleanup-error-ok',
    receipt_signature:JSON.stringify(o)});
  return `async page=>{
    const o=${JSON.stringify(o)},deadline=${Date.now()+30000};
    const blocked=reason=>({version:1,session_id:o.sessionId,package_path:o.packagePath,status:'BLOCKED',reason,
      package_closed:false,logged_out:false,unsaved_changes_discarded:false,stage:'failed_open_binding'});
    if(Date.now()>=deadline)return blocked('CLEANUP_DEADLINE_EXCEEDED');
    const timeout=page.waitForTimeout(Math.max(0,deadline-Date.now())).then(()=>blocked('CLEANUP_DEADLINE_EXCEEDED'));
    return Promise.race([timeout,(async()=>{
      try {
        const bound=await page.evaluate(${bindFailedOpen.toString()},{...o,deadline});
        if(Date.now()>=deadline)return blocked('CLEANUP_DEADLINE_EXCEEDED');
        if(!bound)return blocked('FAILED_OPEN_OWNER_UNCONFIRMED');
        if(o.bindOnly)return {...bound,session_id:o.sessionId,operation_id:o.operationId,package_path:o.packagePath};
        return (${closeOwnedPackage.toString()})(page,{...o,documentId:bound.document_id,tabTid:bound.tab_tid,
          diagnosticReadOnly:bound.read_only,failedOpenOperation:o.operationId},Math.min(deadline,bound.cleanup_deadline),
          perform=>(${gesture})(page));
      } catch {return blocked('FAILED_OPEN_CLEANUP_UNCONFIRMED');}
    })()]);
  }`;
}

export function parseFailedOpenBinding(response, expected) {
  if (response?.isError) throw Error('Failed Open binding failed');
  for (const block of response?.content ?? []) {
    if (block.type !== 'text') continue;
    let value;
    try { value = JSON.parse(block.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1] ?? block.text); } catch { continue; }
    if (value?.session_id === expected.sessionId && value.operation_id === expected.operationId
        && value.package_path === expected.packagePath
        && [value.document_id,value.account].every(v => typeof v === 'string' && v.length > 0 && v.length <= 200)) return value;
  }
  throw Error('Original Open binding missing');
}

function bindFailedOpen(o) {
  const app=globalThis.bg?.app,f=app?.Application?.FInstance?.FMainForm,m=f?.FMapTree;
  const prep=globalThis.__loginomDockPreparationV1,r=prep?.receipts?.get(o.operationId);
  const account=o.bindOnly?r?.openAccount:o.account;
  if(typeof account!=='string'||!account||account.length>200
    ||location.origin!==o.origin||app?.Version!==o.loginomBuild||prep?.document!==document
    ||o.documentId&&prep.id!==o.documentId
    ||typeof prep.id!=='string'||!r||r.phase!=='effect_possible'||r.openSubmitted!==true
    ||r.packageInventoryBefore!==0||r.openAccount!==account||r.openConnection!==m?.FServerConnection
    ||!r.openServerSession||r.openServerSession!==m?.FServerConnection?.Session
    ||m?.FServerConnection?.Connected!==true||m.FServerConnection.UserName!==account
    ||m.PackageNodes?.Count!==1||!Array.isArray(r.before)||Date.now()>=o.deadline)return null;
  let request;try{request=JSON.parse(r.request);}catch{return null;}
  if(request.session!==o.sessionId||request.intent!=='open_package'||request.packagePath!==o.packagePath)return null;
  const node=m.PackageNodes.Items(0),normalize=p=>typeof p==='string'&&p?'/'+p.replaceAll('\\','/').replace(/^\/+/, ''):null;
  if(normalize(node.PackageFileName)!==o.packagePath||typeof node.ReadOnly!=='boolean')return null;
  const tabs=[...document.querySelectorAll('[data-tid^="MF;cntMain;cntWorkspace;Workspace;t.br;tb"]')]
    .filter(t=>/^MF;cntMain;cntWorkspace;Workspace;t\.br;tb(?:-\d+)?$/.test(t.getAttribute('data-tid')));
  const active=tabs.filter(t=>t.classList.contains('x-tab-active')),added=tabs.filter(t=>!r.before.includes(t));
  const tab=active.length===1&&active[0];
  if(!tab||added.length!==1||added[0]!==tab||!document.contains(tab)||(r.tab&&r.tab!==tab)||(r.packageNode&&r.packageNode!==node))return null;
  let n=f.Items?.Workspace?.getActiveTab()?.Controller?.Node?.data?.node;const seen=new Set();
  for(let i=0;n&&n!==node&&i<32&&!seen.has(n);i++){seen.add(n);n=n.ParentNode;}
  if(n!==node||Date.now()>=o.deadline)return null;
  r.failedOpenCleanupDeadline=Math.min(r.failedOpenCleanupDeadline??o.deadline,o.deadline);
  if(Date.now()>=r.failedOpenCleanupDeadline)return null;
  r.tab=tab;r.packageNode=node;r.failedOpenCleanup=true;
  return {document_id:prep.id,account,tab_tid:tab.getAttribute('data-tid'),read_only:node.ReadOnly,cleanup_deadline:r.failedOpenCleanupDeadline};
}

// Journal snapshot only: no preparation binding or native mutations.
export function makeColdOpenDiagnosticCode({loginomUrl,loginomBuild,account}) {
  const origin=new URL(loginomUrl).origin;
  if(loginomBuild!=='7.4.2'||typeof account!=='string'||!account)throw Error('Exact diagnostic context required');
  return `async page=>page.evaluate(${readColdOpenFailure.toString()},${JSON.stringify({origin,loginomBuild,account})})`;
}
function readColdOpenFailure(o) {
  const app=globalThis.bg?.app,m=app?.Application?.FInstance?.FMainForm?.FMapTree;
  if(location.origin!==o.origin||app?.Version!==o.loginomBuild||m?.FServerConnection?.UserName!==o.account)return {status:'context_changed'};
  const scalar=v=>typeof v==='string'?v.slice(0,1024):typeof v==='number'&&Number.isFinite(v)?v:null;
  // Read only explicit data properties; never enumerate credentials or invoke
  // an undocumented RPC/getter to guess the server's lock inventory.
  const data=(obj,keys)=>{try{return keys.map(k=>scalar(Object.getOwnPropertyDescriptor(obj??{},k)?.value)).find(v=>v!==null)??null;}catch{return null;}};
  const count=m.PackageNodes?.Count,packages=[];
  if(Number.isSafeInteger(count)&&count>=0&&count<=32)for(let i=0;i<count;i++){
    const node=m.PackageNodes.Items(i);
    packages.push({path:scalar(node.PackageFileName),read_only:typeof node.ReadOnly==='boolean'?node.ReadOnly:null,
      lock_owner:data(node,['LockOwner','LockOwnerName'])});
  }
  const error=globalThis.bg?.ext?.errormessage?.ErrorMsg?.FInstance,dialog=error?.FMessageBox?.el?.dom;
  return {status:'observed',package_count:Number.isSafeInteger(count)?count:null,inventory_complete:packages.length===count,packages,
    server_session:data(m.FServerConnection.Session,['SessionID','SessionId','ID','Id']),
    lock_owner_availability:'explicit_native_data_properties_only',
    error_window:dialog?{tid:scalar(dialog.getAttribute?.('data-tid')),native_bound:globalThis.Ext?.getCmp?.(dialog.id)===error.FMessageBox,
      messages_bound:dialog.contains?.(error.FMessages?.el?.dom)===true,
      visible:!!dialog.getBoundingClientRect().width&&!!dialog.getBoundingClientRect().height&&getComputedStyle(dialog).visibility!=='hidden'}:null,
    errors:[...document.querySelectorAll('.bg-error-messages')].slice(0,8).map(e=>({text:(e.textContent??'').slice(0,2048),
      visible:!!e.getBoundingClientRect().width&&!!e.getBoundingClientRect().height&&getComputedStyle(e).visibility!=='hidden'}))};
}

export function parsePackageCleanupResult(response, expected) {
  if (response?.isError) throw Error('Package cleanup response failed');
  for (const block of response?.content ?? []) {
    if (block.type !== 'text') continue;
    let value;
    try { value = JSON.parse(block.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1] ?? block.text); } catch { continue; }
    if (value?.version !== 1 || !['SUCCEEDED','BLOCKED'].includes(value.status)
        || value.session_id !== expected.sessionId || value.document_id !== expected.documentId
        || value.account !== expected.account || value.package_path !== expected.packagePath
        || typeof value.unsaved_changes_discarded !== 'boolean'
        || (value.unsaved_changes_discarded && expected.diagnosticDiscard !== true)) continue;
    if (value.status === 'SUCCEEDED' && (value.package_closed !== true || value.logged_out !== true
        || value.packages_before !== 1 || value.packages_after !== 0 || value.reason !== null)) continue;
    return value;
  }
  throw Error('Bound package cleanup receipt missing');
}

async function closeOwnedPackage(page, options, deadline, guardedDismiss) {
  const {sessionId, documentId, account, packagePath, tabTid, timeoutMs} = options;
  const receipt = {version:1, session_id:sessionId, document_id:documentId, account, package_path:packagePath,
    package_closed:false, logged_out:false, unsaved_changes_discarded:false, stage:'close_request', started_at:new Date().toISOString(),
    deadline_at:new Date(deadline).toISOString()};
  let closeStarted=false;
  const finish = async (status, reason, extra = {}) => {
    if(status==='BLOCKED'&&receipt.stage==='logout_menu_open')receipt.logout_menu_failed_at=new Date().toISOString();
    // Diagnostics must leave time for the existing 30 s MCP reply to arrive.
    const diagnosticBudget=Math.min(500,deadline-Date.now()-1000);
    if(status==='BLOCKED'&&receipt.stage==='logout_menu_open'&&diagnosticBudget>0) {
      receipt.logout_menu_readback={status:'unavailable'};
      try {
        receipt.logout_menu_readback=await Promise.race([
          page.waitForTimeout(diagnosticBudget).then(()=>({status:'unavailable'})),
          page.evaluate(o=>{
            const prep=globalThis.__loginomDockPreparationV1,m=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree;
            if(location.origin!==o.origin||prep?.document!==document||prep.id!==o.documentId
              ||m?.FServerConnection?.UserName!==o.account)return {status:'identity_changed'};
            const groups={avatar:'[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]',menu:'[data-tid="MF;AppMenuForm"]',
              dialogs:'[role="dialog"],.x-message-box',masks:'.x-mask,.bg-mask-message,.x-mask-msg'};
            // Other data-tid values can contain user file names or captions.
            const safeTid=e=>{
              const tid=e?.getAttribute('data-tid');
              return ['MF;cntMain;tlbMainToolbar;btnAvatar','MF;AppMenuForm','MF;AppMenuForm;btnLogOut'].includes(tid)?tid:null;
            };
            const result={status:'observed'};
            for(const [key,selector] of Object.entries(groups))result[key]=[...document.querySelectorAll(selector)]
              .filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).visibility!=='hidden';})
              .slice(0,8).map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
                return {tid:safeTid(e),rect:{x:r.x,y:r.y,width:r.width,height:r.height},
                  hit_tid:safeTid(hit?.closest('[data-tid]'))};});
            return result;
          },options),
        ]);
      } catch(error) {receipt.logout_menu_readback={status:'unavailable',error_class:error?.name==='TimeoutError'?'timeout':'read_failed'};}
    }
    // Private journal evidence, after the decision. Never retry Close, answer
    // a prompt, or promote its outcome from this diagnostic readback.
    if(closeStarted&&!receipt.native_close_readback) {
      receipt.native_close_readback={status:'unavailable'};
      const budget=deadline-Date.now();
      if(budget>0) {
        try {
          // The decision is final; a slow read must not extend its original deadline.
          receipt.native_close_readback=await Promise.race([
            page.waitForTimeout(budget).then(()=>({status:'unavailable',reason:'deadline_exceeded'})),
            page.evaluate(o=>{
            const s=globalThis.__loginomDockCleanupV1,m=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree;
            if(s?.document!==document||s.identity!==JSON.stringify(o))return {status:'identity_changed'};
            return {status:'observed',done:s.done===true,closed:s.closed===true,failed:s.failed===true,result:s.result??'pending',
              packages_after:m?.PackageNodes?.Count??null,original_tab_attached:document.contains(s.tab)};
          },options)]);
        } catch {}
      } else receipt.native_close_readback.reason='deadline_exceeded';
    }
    return {...receipt,...extra,status,reason,completed_at:new Date().toISOString()};
  };
  const at = tid => page.locator('[data-tid='+JSON.stringify(tid)+']');
  const remaining = (limit = timeoutMs) => {
    const ms = Math.min(limit, deadline-Date.now());
    if (ms <= 0) throw Error('Cleanup deadline exceeded');
    return ms;
  };
  try {
    const beginClose = (dismissOpenError=false) => page.evaluate(async ({options:o, deadline,dismissOpenError}) => {
      const app = globalThis.bg?.app, f = app?.Application?.FInstance?.FMainForm, m = f?.FMapTree;
      const prep = globalThis.__loginomDockPreparationV1;
      const identity = JSON.stringify(o);
      const previous = globalThis.__loginomDockCleanupV1;
      if (previous && (previous.identity !== identity || previous.document !== document)) return {reason:'CLEANUP_IDENTITY_CHANGED'};
      if (previous && previous.close_started !== false) return {reason:'CLEANUP_ALREADY_ATTEMPTED'};
      const ownReceipt = prep?.receipts instanceof Map && [...prep.receipts.values()].some(r => {
        try { return JSON.parse(r.request).session === o.sessionId; } catch { return false; }
      });
      if (location.origin !== o.origin || app?.Version !== o.loginomBuild || prep?.document !== document
          || prep.id !== o.documentId || !ownReceipt) return {reason:'DOCUMENT_IDENTITY_CHANGED'};
      if (m?.FServerConnection?.UserName !== o.account) return {reason:'ACCOUNT_CHANGED'};
      if (!m.FServerConnection.Connected) return {reason:'CONNECTION_DISCONNECTED'};
      // Retain the original native handles before any idle-wait. A replacement
      // session with the same account/package is not this cleanup's owner.
      const state=previous??(globalThis.__loginomDockCleanupV1={identity,document,
        connection:m.FServerConnection,serverSession:m.FServerConnection.Session,close_started:false,done:false,closed:false});
      const ownerBound=()=>state.connection===m.FServerConnection&&state.serverSession
        &&state.serverSession===m.FServerConnection.Session;
      if(!ownerBound())return {reason:'CLEANUP_SESSION_CHANGED'};
      const visible = e => !!e.getBoundingClientRect().width && !!e.getBoundingClientRect().height && getComputedStyle(e).visibility !== 'hidden';
      if (!o.failedOpenOperation&&[...document.querySelectorAll('[role="dialog"],.x-message-box,.bg-mask-message,.x-mask-msg')].some(visible)) return {reason:'DIALOG_OR_OPERATION_OPEN'};
      if (m.PackageNodes?.Count !== 1) return {reason:'PACKAGE_INVENTORY_CHANGED'};
      const node = m.PackageNodes.Items(0), normalized = value => typeof value === 'string' && value ? '/'+value.replaceAll('\\','/').replace(/^\/+/, '') : null;
      if (normalized(node.PackageFileName) !== o.packagePath || node.ReadOnly !== o.diagnosticReadOnly) return {reason:'PACKAGE_IDENTITY_CHANGED'};
      const prepared = [...prep.receipts.values()].find(r => {
        try { return JSON.parse(r.request).session === o.sessionId && r.packageNode === node && r.tab?.getAttribute('data-tid') === o.tabTid; }
        catch { return false; }
      });
      const tabBound = () => prepared?.packageNode === node && prepared.tab?.getAttribute('data-tid') === o.tabTid && document.contains(prepared.tab);
      if (!tabBound()) return {reason:'TAB_IDENTITY_CHANGED'};
      if(o.unsavedDraft && (JSON.parse(prepared.request).intent!=='new_draft'
        || prepared.phase!=='verified' || prepared.packageInventoryBefore!==0))return {reason:'DRAFT_OWNER_UNCONFIRMED'};
      if(o.failedOpenOperation&&(dismissOpenError||[...document.querySelectorAll('[role="dialog"],.x-message-box,.bg-mask-message,.x-mask-msg')].some(visible)
        ||state.open_error_dismiss_started)) {
        if(prep.receipts.get(o.failedOpenOperation)!==prepared||prepared.failedOpenCleanup!==true
          ||prepared.phase!=='effect_possible'||prepared.openSubmitted!==true||prepared.packageInventoryBefore!==0
          ||prepared.openAccount!==o.account||prepared.openConnection!==m.FServerConnection
          ||prepared.openServerSession!==m.FServerConnection.Session)return {reason:'FAILED_OPEN_OWNER_CHANGED'};
        const prefix=o.tabTid.match(/;tb(-\d+)?$/);
        if(!prefix)return {reason:'FAILED_OPEN_OWNER_CHANGED'};
        const roots=[...document.querySelectorAll('[data-tid='+JSON.stringify('MF;TF'+(prefix[1]??''))+']')];
        const root=roots.length===1&&roots[0],native=root&&globalThis.Ext?.getCmp?.(root.id);
        if(!root||native?.$className!=='bg.app.view.TabForm'||native.el?.dom!==root
          ||f.Items?.Workspace?.getActiveTab()!==native||native.hidden!==false)return {reason:'FAILED_OPEN_OWNER_CHANGED'};
        const inactive=e=>{
          const picker=e.closest?.('[data-tid="OpenDialogForm"]')??e,c=globalThis.Ext?.getCmp?.(picker.id);
          return picker===prepared.openDialogElement&&c===prepared.openDialog&&c?.hidden===true&&c.el?.dom===picker;
        };
        const blockers=[...document.querySelectorAll('[role="dialog"],.x-window,.bg-dialog,.x-message-box,.bg-mask-message,.x-mask-msg')]
          .filter(e=>visible(e)&&!inactive(e));
        const loading=e=>(e===root||root.contains(e))&&e.matches('.bg-mask-message,.x-mask-msg');
        const error=prepared.openError;
        const instance=globalThis.bg?.ext?.errormessage?.ErrorMsg?.FInstance;
        const errorBound=error&&instance===error.instance&&instance.FMessageBox===error.message
          &&instance.FMessages===error.messages&&instance.FErrorMessageInfo===error.info
          &&error.message.el?.dom===error.root&&error.messages.el?.dom===error.element
          &&globalThis.Ext?.getCmp?.(error.root.id)===error.message&&error.root.contains(error.element)
          &&(error.element.textContent??'').trim()==="Cannot read properties of undefined (reading 'TestableCellRenderer')";
        const errors=[...document.querySelectorAll('.bg-error-messages')].filter(visible);
        if(errors.length&&(!errorBound||errors.length!==1||errors[0]!==error.element))return {reason:'DIALOG_OR_OPERATION_OPEN'};
        if(blockers.some(e=>!loading(e)&&!(errorBound&&(e===error.root||error.root.contains(e)))))return {reason:'DIALOG_OR_OPERATION_OPEN'};
        // After our one OK, the native window may hide its contents or release
        // its controls before the next layout settles. Read only its retained
        // window until it disappears; visible replacements still fail above.
        if(state.open_error_dismiss_started) {
          if(!error)return {reason:'FAILED_OPEN_ERROR_UNCONFIRMED'};
          if(visible(error.root))return {reason:errorBound?'OWNED_OPEN_ERROR_CLOSING':'FAILED_OPEN_ERROR_UNCONFIRMED'};
          if(visible(error.element))return {reason:'FAILED_OPEN_ERROR_UNCONFIRMED'};
        }
        if(errorBound&&visible(error.root)) {
          const tid=error.root.getAttribute('data-tid');
          if(!/^msgbox(?:-\d+)?$/.test(tid??'')||!visible(error.element))return {reason:'FAILED_OPEN_ERROR_UNCONFIRMED'};
          const buttons=[...document.querySelectorAll('[data-tid='+JSON.stringify(tid+';tlb;ok')+']')];
          const button=buttons.length===1&&buttons[0],control=button&&globalThis.Ext?.getCmp?.(button.id);
          const choices=[...document.querySelectorAll('[data-tid^='+JSON.stringify(tid+';tlb;')+']')]
            .filter(e=>visible(e)&&/;(ok|yes|no|cancel)$/.test(e.getAttribute('data-tid')??''));
          if(!button||button.isConnected!==true||button.getAttribute('data-tid')!==tid+';tlb;ok'
            ||!error.root.contains(button)||!visible(button)||button.innerText?.trim()!=='OK'
            ||choices.length!==1||choices[0]!==button||control?.el?.dom!==button||control.disabled!==false)return {reason:'FAILED_OPEN_ERROR_UNCONFIRMED'};
          let parent=control;const seen=new Set();
          for(let i=0;parent&&parent!==error.message&&i<16&&!seen.has(parent);i++){seen.add(parent);parent=parent.ownerCt;}
          if(parent!==error.message)return {reason:'FAILED_OPEN_ERROR_UNCONFIRMED'};
          const b=button.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2,hit=document.elementFromPoint(x,y);
          if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=innerWidth||y>=innerHeight
            ||!(hit===button||button.contains(hit))||Date.now()>=deadline)return {reason:'FAILED_OPEN_ERROR_UNCONFIRMED'};
          const signature=JSON.stringify([tid,button.tagName,button.getAttribute('type'),button.innerText,
            control.disabled,b.x,b.y,b.width,b.height]);
          const target=state.open_error_target;
          if(!dismissOpenError) {
            if(!target)state.open_error_target={button,control,signature};
            else if(target.button!==button||target.control!==control||target.signature!==signature)
              return {reason:'FAILED_OPEN_ERROR_UNCONFIRMED'};
            return {reason:'OWNED_OPEN_ERROR',dismiss:{tid:tid+';tlb;ok'}};
          }
          if(!target||target.button!==button||target.control!==control||target.signature!==signature)
            return {reason:'FAILED_OPEN_ERROR_UNCONFIRMED'};
          // No await/RPC between the complete native owner/ref/hit-test proof
          // and this sole DOM gesture. Never dispatch to retained coordinates.
          if(Date.now()>=deadline)return {reason:'CLEANUP_DEADLINE_EXCEEDED'};
          state.open_error_dismiss_started=true;
          button.click();
          return {dismiss:{tid:tid+';tlb;ok'},gesture_returned:true};
        }
        if(blockers.some(loading))return {reason:'OWNED_OPEN_LOADING'};
        // This callback is only for OK. If its owned error vanished in transit,
        // leave Close to the ordinary path and its fresh native guards.
        if(dismissOpenError)return {reason:'OWNED_OPEN_ERROR_ABSENT'};
      }
      const openOwnerBound=()=>{
        if(prepared?.failedOpenCleanup!==true)return true;
        if(prepared.openConnection!==m.FServerConnection||prepared.openServerSession!==m.FServerConnection.Session)return false;
        return ![...document.querySelectorAll('[role="dialog"],.x-window,.bg-dialog,.x-message-box,.bg-mask-message,.x-mask-msg')].some(e=>{
          const picker=e.closest?.('[data-tid="OpenDialogForm"]')??e,component=globalThis.Ext?.getCmp?.(picker.id);
          const inactive=picker===prepared.openDialogElement&&component===prepared.openDialog
            &&component?.$className==='bg.filedialog.view.OpenDialogForm'&&component.el?.dom===picker&&component.hidden===true;
          return !inactive&&visible(e);
        });
      };
      if(!openOwnerBound())return {reason:'FAILED_OPEN_OWNER_CHANGED'};
      const packageRunning=node.HasRunningNodes(),sessionRunning=m.HasRunningNodes();
      if (packageRunning !== false || sessionRunning !== false)
        return {reason:'RUNNING_NODES',own_running:packageRunning===true&&sessionRunning===true};
      if(!ownerBound())return {reason:'CLEANUP_SESSION_CHANGED'};
      const modified = await m.FServerConnection.Session.IsPackageModified(node.Package);
      if(!ownerBound())return {reason:'CLEANUP_SESSION_CHANGED'};
      if (modified !== false && !(modified === true && o.diagnosticDiscard === true)) return {reason:'UNSAVED_CHANGES'};
      // Recheck identity after the server read. The native BeforeClose handler
      // repeats lock/dirty checks and may show a prompt. Normal shutdown never
      // answers it; independent QA can explicitly discard its temporary views.
      if (m.PackageNodes.Count !== 1 || m.PackageNodes.Items(0) !== node || normalized(node.PackageFileName) !== o.packagePath
          || node.ReadOnly !== o.diagnosticReadOnly || m.FServerConnection.UserName !== o.account || node.HasRunningNodes() !== false) return {reason:'PACKAGE_CHANGED_DURING_CHECK'};
      if (!tabBound()) return {reason:'TAB_IDENTITY_CHANGED'};
      if(!openOwnerBound())return {reason:'FAILED_OPEN_OWNER_CHANGED'};
      if (o.diagnosticWaitForIdle) {
        if (Date.now() >= deadline) return {reason:'CLEANUP_DEADLINE_EXCEEDED'};
        if ([...document.querySelectorAll('[role="dialog"],.x-message-box,.bg-mask-message,.x-mask-msg')].some(visible)) return {reason:'DIALOG_OR_OPERATION_OPEN'};
      }
      if(Date.now()>=deadline)return {reason:'CLEANUP_DEADLINE_EXCEEDED'};
      if(!ownerBound())return {reason:'CLEANUP_SESSION_CHANGED'};
      state.tab=prepared.tab;state.close_started=true;
      Promise.resolve().then(() => {
        if(!ownerBound())throw Error('Cleanup session changed before Close');
        return m.ClosePackage(node, false, true);
      }).then(value => {
        state.closed = value === true && m.PackageNodes.Count === 0;
        state.result=value===true?'true':value===false?'false':'other';
        state.done = true;
      }, () => { state.done = true; state.failed = true; });
      return {started:true, packages_before:1, modified, display_name:node.DisplayName};
    }, {options, deadline,dismissOpenError});
    let before = await beginClose();
    if(before.reason==='OWNED_OPEN_ERROR') {
      if(!guardedDismiss)return finish('BLOCKED','FAILED_OPEN_ERROR_UNCONFIRMED');
      const ready=await guardedDismiss(()=>beginClose(true));
      if(Date.now()>=deadline)return finish('BLOCKED','CLEANUP_DEADLINE_EXCEEDED');
      if(ready.dismiss) {
        receipt.stage='failed_open_error_dismiss';
        if(ready.gesture_returned!==true)return finish('BLOCKED','FAILED_OPEN_ERROR_UNCONFIRMED');
        receipt.open_error_cleanup={tid:ready.dismiss.tid,gesture_attempted:true,gesture_returned:true};
      } else if(!['OWNED_OPEN_LOADING','OWNED_OPEN_ERROR_ABSENT'].includes(ready.reason)) {
        return finish('BLOCKED',ready.reason??'FAILED_OPEN_ERROR_UNCONFIRMED');
      }
      // A lost/late acknowledgement is never permission to click OK again.
      if(Date.now()>=deadline)return finish('BLOCKED','CLEANUP_DEADLINE_EXCEEDED');
      before=ready.gesture_returned===true?{reason:'OWNED_OPEN_ERROR_CLOSING'}:
        ready.reason==='OWNED_OPEN_LOADING'?ready:await beginClose();
    }
    const idleDeadline = Math.min(deadline, Date.now()+timeoutMs);
    // Cold owns an isolated diagnostic session. Wait only for a blocked gate;
    // every read repeats the original guards and never dismisses a dialog.
    // A known running state of the exact owned package may also settle within
    // this cleanup call's original deadline. Unknown/foreign states cannot.
    while (options.diagnosticWaitForIdle && before.reason === 'DIALOG_OR_OPERATION_OPEN'
      ||before.reason==='RUNNING_NODES'&&before.own_running===true
      ||options.failedOpenOperation&&['OWNED_OPEN_LOADING','OWNED_OPEN_ERROR_CLOSING'].includes(before.reason)) {
      receipt.stage = 'idle_wait';
      const waitDeadline=before.reason==='RUNNING_NODES'||before.reason.startsWith('OWNED_OPEN_')?deadline:idleDeadline;
      const left = waitDeadline-Date.now();
      if (left <= 0) return finish('BLOCKED', before.reason);
      await page.waitForTimeout(Math.min(100, left));
      if (Date.now() >= waitDeadline) return finish('BLOCKED', before.reason);
      receipt.stage = 'close_request';
      before = await beginClose();
    }
    if (!before.started) return finish('BLOCKED', before.reason);
    closeStarted=true;receipt.modified_before_close=before.modified;
    receipt.stage = 'close_wait';
    await page.waitForFunction(() => {
      const state = globalThis.__loginomDockCleanupV1;
      const visible = e => !!e.getBoundingClientRect().width && !!e.getBoundingClientRect().height && getComputedStyle(e).visibility !== 'hidden';
      return state?.done || [...document.querySelectorAll('[role="dialog"],.x-message-box')].some(visible);
    }, undefined, {timeout:remaining()});
    if (options.diagnosticDiscard === true && before.modified === true) {
      receipt.stage = 'discard_prompt';
      const message = page.locator('[data-tid^="msgbox"][data-tid$="cnt;cnt;cmp"]:visible');
      const no = page.locator('[data-tid^="msgbox"][data-tid$="tlb;no"]:visible');
      if (await message.count() !== 1 || await no.count() !== 1) return finish('BLOCKED','DIAGNOSTIC_SAVE_PROMPT_MISSING');
      const text = (await message.innerText({timeout:remaining()})).trim();
      if (!/сохранить изменения в пакете/i.test(text) || typeof before.display_name !== 'string'
          || !text.includes(before.display_name) || /заблокирован|отменить активные процессы/i.test(text))
        return finish('BLOCKED','DIAGNOSTIC_SAVE_PROMPT_CHANGED');
      // QA explicitly owns the temporary changes. Keep the exact account,
      // package and native node binding through the confirmation click.
      if (!await page.evaluate(o => {
        const m = globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree;
        const n = m?.PackageNodes?.Count === 1 && m.PackageNodes.Items(0);
        return n && '/'+n.PackageFileName.replaceAll('\\','/').replace(/^\/+/, '') === o.packagePath
          && m.FServerConnection.UserName === o.account && n.HasRunningNodes() === false;
      }, options)) return finish('BLOCKED','DIAGNOSTIC_PACKAGE_CHANGED');
      receipt.stage = 'discard_click';
      await no.click({timeout:remaining()});
      receipt.unsaved_changes_discarded = true;
      receipt.stage = 'discard_close_wait';
      await page.waitForFunction(() => globalThis.__loginomDockCleanupV1?.done === true, undefined, {timeout:remaining()});
    }
    receipt.stage = 'close_readback';
    const closed = await page.evaluate(o => {
      const state = globalThis.__loginomDockCleanupV1;
      return {done:state?.done === true, closed:state?.closed === true,
        remaining:globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree?.PackageNodes?.Count,
        diagnostic:state?.document===document&&state.identity===JSON.stringify(o)?{status:'observed',
          done:state?.done===true,closed:state?.closed===true,failed:state?.failed===true,result:state?.result??'pending',
          original_tab_attached:document.contains(state?.tab)}:{status:'identity_changed'}};
    },options);
    receipt.native_close_readback={...closed.diagnostic,packages_after:closed.remaining??null};
    if (!closed.done || !closed.closed || closed.remaining !== 0) return finish('BLOCKED', 'NATIVE_CLOSE_UNCONFIRMED');
    receipt.stage = 'tab_detach';
    await at(tabTid).waitFor({state:'detached', timeout:remaining()});
    receipt.package_closed = true;
    receipt.stage = 'logout_menu_open';
    try {
      receipt.logout_menu_step='first_click';
      await at('MF;cntMain;tlbMainToolbar;btnAvatar').click({timeout:remaining()});
    } catch (error) {
      if (error?.name !== 'TimeoutError') throw error;
      // A timed-out click may already have opened the menu. Observe before
      // retrying once; never toggle it closed or extend the cleanup call.
      receipt.logout_menu_step='observe_after_timeout';
      // Lazy first menu loading may outlast the click's step cap. Observe
      // read-only using the original cleanup remainder, never a new deadline.
      const observed = await page.waitForFunction(o => {
        const prep = globalThis.__loginomDockPreparationV1, app = globalThis.bg?.app;
        const m = app?.Application?.FInstance?.FMainForm?.FMapTree;
        if (location.origin !== o.origin || app?.Version !== o.loginomBuild || prep?.document !== document
            || prep.id !== o.documentId || m?.FServerConnection?.UserName !== o.account
            || m.FServerConnection.Connected !== true || m.PackageNodes?.Count !== 0) return {safe:false};
        const visible = e => !!e.getBoundingClientRect().width && !!e.getBoundingClientRect().height && getComputedStyle(e).visibility !== 'hidden';
        if ([...document.querySelectorAll('[role="dialog"],.x-message-box,.bg-mask-message,.x-mask-msg')].some(visible)) return false;
        const menu = [...document.querySelectorAll('[data-tid="MF;AppMenuForm"]')].filter(visible);
        if (menu.length > 1) return {safe:false};
        if (menu.length === 1) return {safe:true, menu:true};
        // The opened menu has its own backdrop; only wait for masks if closed.
        if ([...document.querySelectorAll('.x-mask')].some(visible)) return false;
        const avatar = [...document.querySelectorAll('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]')].filter(visible);
        return avatar.length === 1 ? {safe:true, menu:false} : false;
      }, options, {timeout:remaining(30000)});
      const state = await observed.jsonValue();
      await observed.dispose();
      if (!state?.safe) return finish('BLOCKED', 'CLEANUP_UNCONFIRMED');
      if (!state.menu) {
        receipt.logout_menu_step='retry_click';
        await at('MF;cntMain;tlbMainToolbar;btnAvatar').click({timeout:remaining()});
      }
    }
    receipt.stage = 'logout_account_readback';
    if ((await at('MF;AppMenuForm;p.h;p.t').innerText({timeout:remaining()})).trim() !== account) return finish('BLOCKED', 'LOGOUT_ACCOUNT_CHANGED');
    // Native close already removed every package; logout cannot discard work.
    receipt.stage = 'logout_inventory_readback';
    const logoutGuard = await page.evaluate(o => {
      const m = globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree;
      const state = globalThis.__loginomDockCleanupV1;
      // Close may await native callbacks. Its original session must still own
      // this tail even when the replacement has the same account and no package.
      if(state?.document!==document||state.identity!==JSON.stringify(o)
        ||state.connection!==m?.FServerConnection||!state.serverSession
        ||state.serverSession!==m?.FServerConnection?.Session)return 'LOGOUT_SESSION_CHANGED';
      return m?.PackageNodes?.Count === 0 && m.FServerConnection.UserName === o.account ? null : 'LOGOUT_INVENTORY_CHANGED';
    }, options);
    if(logoutGuard)return finish('BLOCKED',logoutGuard);
    receipt.stage = 'logout_click';
    await at('MF;AppMenuForm;btnLogOut').click({timeout:remaining()});
    receipt.stage = 'login_form_wait';
    await at('LoginForm;Login;edtUsername').locator('input').waitFor({state:'visible', timeout:remaining()});
    receipt.stage = 'logout_readback';
    if (await at('MF;cntMain;tlbMainToolbar;btnAvatar').isVisible()) return finish('BLOCKED', 'LOGOUT_UNCONFIRMED');
    receipt.logged_out = true;
    receipt.stage = 'complete';
    return finish('SUCCEEDED', null, {packages_before:1, packages_after:0});
  } catch(error) {
    // Fixed private stage only: retain refusal and never persist raw errors,
    // credentials, DOM contents or an inferred logout from browser closure.
    receipt.failure_class=error?.name==='TimeoutError'?'ui_timeout':'step_failed';
    return finish('BLOCKED', 'CLEANUP_UNCONFIRMED');
  }
}
