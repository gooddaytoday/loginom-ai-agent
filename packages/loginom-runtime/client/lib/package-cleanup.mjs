// Explicit isolated-run teardown. Never save, stop nodes, or close a package
// in another Loginom session. The CLI never opts into diagnostic discard.
// Loginom's own close guard remains
// enabled: CloseAllPackages(true, false) from E2E would bypass that guard.
export function makePackageCleanupCode(options) {
  const {sessionId, documentId, account, packagePath, loginomUrl, loginomBuild, tabTid, timeoutMs = 8000, diagnosticDiscard = false, diagnosticReadOnly = false, diagnosticWaitForIdle = false} = options;
  if (![sessionId, documentId, account, tabTid].every(v => typeof v === 'string' && v.length > 0 && v.length <= 200)
      || typeof packagePath !== 'string' || !/^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+\.lgp$/.test(packagePath)
      || packagePath.split('/').some(p => p === '.' || p === '..') || loginomBuild !== '7.4.2'
      || typeof diagnosticReadOnly !== 'boolean' || typeof diagnosticDiscard !== 'boolean'
      || typeof diagnosticWaitForIdle !== 'boolean' || diagnosticWaitForIdle && !diagnosticDiscard
      || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 15000) throw Error('Exact isolated cleanup identity required');
  const url = new URL(loginomUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Invalid cleanup origin');
  // Match the existing bridge cleanup call's 30000 ms budget, including dispatch.
  return `async page=>(${closeOwnedPackage.toString()})(page,${JSON.stringify({sessionId, documentId, account, packagePath, origin:url.origin, loginomBuild, tabTid, timeoutMs, diagnosticDiscard, diagnosticReadOnly, diagnosticWaitForIdle})},${Date.now()+30000})`;
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

async function closeOwnedPackage(page, options, deadline) {
  const {sessionId, documentId, account, packagePath, tabTid, timeoutMs} = options;
  const receipt = {version:1, session_id:sessionId, document_id:documentId, account, package_path:packagePath,
    package_closed:false, logged_out:false, unsaved_changes_discarded:false, stage:'close_request', started_at:new Date().toISOString()};
  let closeStarted=false;
  const finish = async (status, reason, extra = {}) => {
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
  const remaining = () => {
    const ms = Math.min(timeoutMs, deadline-Date.now());
    if (ms <= 0) throw Error('Cleanup deadline exceeded');
    return ms;
  };
  try {
    const beginClose = () => page.evaluate(async ({options:o, deadline}) => {
      const app = globalThis.bg?.app, f = app?.Application?.FInstance?.FMainForm, m = f?.FMapTree;
      const prep = globalThis.__loginomDockPreparationV1;
      const identity = JSON.stringify(o);
      const previous = globalThis.__loginomDockCleanupV1;
      if (previous) return {reason:previous.identity === identity ? 'CLEANUP_ALREADY_ATTEMPTED' : 'CLEANUP_IDENTITY_CHANGED'};
      const ownReceipt = prep?.receipts instanceof Map && [...prep.receipts.values()].some(r => {
        try { return JSON.parse(r.request).session === o.sessionId; } catch { return false; }
      });
      if (location.origin !== o.origin || app?.Version !== o.loginomBuild || prep?.document !== document
          || prep.id !== o.documentId || !ownReceipt) return {reason:'DOCUMENT_IDENTITY_CHANGED'};
      if (m?.FServerConnection?.UserName !== o.account) return {reason:'ACCOUNT_CHANGED'};
      if (!m.FServerConnection.Connected) return {reason:'CONNECTION_DISCONNECTED'};
      const visible = e => !!e.getBoundingClientRect().width && !!e.getBoundingClientRect().height && getComputedStyle(e).visibility !== 'hidden';
      if ([...document.querySelectorAll('[role="dialog"],.x-message-box,.bg-mask-message,.x-mask-msg')].some(visible)) return {reason:'DIALOG_OR_OPERATION_OPEN'};
      if (m.PackageNodes?.Count !== 1) return {reason:'PACKAGE_INVENTORY_CHANGED'};
      const node = m.PackageNodes.Items(0), normalized = value => typeof value === 'string' && value ? '/'+value.replaceAll('\\','/').replace(/^\/+/, '') : null;
      if (normalized(node.PackageFileName) !== o.packagePath || node.ReadOnly !== o.diagnosticReadOnly) return {reason:'PACKAGE_IDENTITY_CHANGED'};
      const prepared = [...prep.receipts.values()].find(r => {
        try { return JSON.parse(r.request).session === o.sessionId && r.packageNode === node && r.tab?.getAttribute('data-tid') === o.tabTid; }
        catch { return false; }
      });
      const tabBound = () => prepared?.packageNode === node && prepared.tab?.getAttribute('data-tid') === o.tabTid && document.contains(prepared.tab);
      if (!tabBound()) return {reason:'TAB_IDENTITY_CHANGED'};
      if (node.HasRunningNodes() !== false || m.HasRunningNodes() !== false) return {reason:'RUNNING_NODES'};
      const modified = await m.FServerConnection.Session.IsPackageModified(node.Package);
      if (modified !== false && !(modified === true && o.diagnosticDiscard === true)) return {reason:'UNSAVED_CHANGES'};
      // Recheck identity after the server read. The native BeforeClose handler
      // repeats lock/dirty checks and may show a prompt. Normal shutdown never
      // answers it; independent QA can explicitly discard its temporary views.
      if (m.PackageNodes.Count !== 1 || m.PackageNodes.Items(0) !== node || normalized(node.PackageFileName) !== o.packagePath
          || node.ReadOnly !== o.diagnosticReadOnly || m.FServerConnection.UserName !== o.account || node.HasRunningNodes() !== false) return {reason:'PACKAGE_CHANGED_DURING_CHECK'};
      if (!tabBound()) return {reason:'TAB_IDENTITY_CHANGED'};
      if (o.diagnosticWaitForIdle) {
        if (Date.now() >= deadline) return {reason:'CLEANUP_DEADLINE_EXCEEDED'};
        if ([...document.querySelectorAll('[role="dialog"],.x-message-box,.bg-mask-message,.x-mask-msg')].some(visible)) return {reason:'DIALOG_OR_OPERATION_OPEN'};
      }
      const state = globalThis.__loginomDockCleanupV1 = {identity, document, tab:prepared.tab, done:false, closed:false};
      Promise.resolve().then(() => m.ClosePackage(node, false, true)).then(value => {
        state.closed = value === true && m.PackageNodes.Count === 0;
        state.result=value===true?'true':value===false?'false':'other';
        state.done = true;
      }, () => { state.done = true; state.failed = true; });
      return {started:true, packages_before:1, modified, display_name:node.DisplayName};
    }, {options, deadline});
    let before = await beginClose();
    const idleDeadline = Math.min(deadline, Date.now()+timeoutMs);
    // Cold owns an isolated diagnostic session. Wait only for a blocked gate;
    // every read repeats the original guards and never dismisses a dialog.
    while (options.diagnosticWaitForIdle && before.reason === 'DIALOG_OR_OPERATION_OPEN') {
      receipt.stage = 'idle_wait';
      const left = idleDeadline-Date.now();
      if (left <= 0) return finish('BLOCKED', before.reason);
      await page.waitForTimeout(Math.min(100, left));
      if (Date.now() >= idleDeadline) return finish('BLOCKED', before.reason);
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
      await at('MF;cntMain;tlbMainToolbar;btnAvatar').click({timeout:remaining()});
    } catch (error) {
      if (error?.name !== 'TimeoutError') throw error;
      // A timed-out click may already have opened the menu. Observe before
      // retrying once; never toggle it closed or extend the cleanup call.
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
      }, options, {timeout:remaining()});
      const state = await observed.jsonValue();
      await observed.dispose();
      if (!state?.safe) return finish('BLOCKED', 'CLEANUP_UNCONFIRMED');
      if (!state.menu) await at('MF;cntMain;tlbMainToolbar;btnAvatar').click({timeout:remaining()});
    }
    receipt.stage = 'logout_account_readback';
    if ((await at('MF;AppMenuForm;p.h;p.t').innerText({timeout:remaining()})).trim() !== account) return finish('BLOCKED', 'LOGOUT_ACCOUNT_CHANGED');
    // Native close already removed every package; logout cannot discard work.
    receipt.stage = 'logout_inventory_readback';
    if (!await page.evaluate(expected => {
      const m = globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree;
      return m?.PackageNodes?.Count === 0 && m.FServerConnection.UserName === expected;
    }, account)) return finish('BLOCKED', 'LOGOUT_INVENTORY_CHANGED');
    receipt.stage = 'logout_click';
    await at('MF;AppMenuForm;btnLogOut').click({timeout:remaining()});
    receipt.stage = 'login_form_wait';
    await at('LoginForm;Login;edtUsername').locator('input').waitFor({state:'visible', timeout:remaining()});
    receipt.stage = 'logout_readback';
    if (await at('MF;cntMain;tlbMainToolbar;btnAvatar').isVisible()) return finish('BLOCKED', 'LOGOUT_UNCONFIRMED');
    receipt.logged_out = true;
    receipt.stage = 'complete';
    return finish('SUCCEEDED', null, {packages_before:1, packages_after:0});
  } catch {
    // Fixed private stage only: retain refusal and never persist raw errors,
    // credentials, DOM contents or an inferred logout from browser closure.
    return finish('BLOCKED', 'CLEANUP_UNCONFIRMED');
  }
}
