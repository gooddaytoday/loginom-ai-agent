// Explicit isolated-run teardown. Never save, stop nodes, or close a package
// in another Loginom session. The CLI never opts into diagnostic discard.
// Loginom's own close guard remains
// enabled: CloseAllPackages(true, false) from E2E would bypass that guard.
export function makePackageCleanupCode(options) {
  const {sessionId, documentId, account, packagePath, loginomUrl, loginomBuild, tabTid, timeoutMs = 8000, diagnosticDiscard = false} = options;
  if (![sessionId, documentId, account, tabTid].every(v => typeof v === 'string' && v.length > 0 && v.length <= 200)
      || typeof packagePath !== 'string' || !/^\/(?:[^/\\\x00-\x1f]+\/)*[^/\\\x00-\x1f]+\.lgp$/.test(packagePath)
      || packagePath.split('/').some(p => p === '.' || p === '..') || loginomBuild !== '7.4.2'
      || typeof diagnosticDiscard !== 'boolean' || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 15000) throw Error('Exact isolated cleanup identity required');
  const url = new URL(loginomUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Invalid cleanup origin');
  return `async page=>(${closeOwnedPackage.toString()})(page,${JSON.stringify({sessionId, documentId, account, packagePath, origin:url.origin, loginomBuild, tabTid, timeoutMs, diagnosticDiscard})})`;
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

async function closeOwnedPackage(page, options) {
  const {sessionId, documentId, account, packagePath, tabTid, timeoutMs} = options;
  const receipt = {version:1, session_id:sessionId, document_id:documentId, account, package_path:packagePath,
    package_closed:false, logged_out:false, unsaved_changes_discarded:false, started_at:new Date().toISOString()};
  const finish = (status, reason, extra = {}) => ({...receipt, ...extra, status, reason, completed_at:new Date().toISOString()});
  const at = tid => page.locator('[data-tid='+JSON.stringify(tid)+']');
  try {
    const before = await page.evaluate(async o => {
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
      if (m?.FServerConnection?.UserName !== o.account || !m.FServerConnection.Connected) return {reason:'ACCOUNT_CHANGED'};
      const visible = e => !!e.getBoundingClientRect().width && !!e.getBoundingClientRect().height && getComputedStyle(e).visibility !== 'hidden';
      if ([...document.querySelectorAll('[role="dialog"],.x-message-box,.bg-mask-message,.x-mask-msg')].some(visible)) return {reason:'DIALOG_OR_OPERATION_OPEN'};
      if (m.PackageNodes?.Count !== 1) return {reason:'PACKAGE_INVENTORY_CHANGED'};
      const node = m.PackageNodes.Items(0), normalized = value => typeof value === 'string' && value ? '/'+value.replaceAll('\\','/').replace(/^\/+/, '') : null;
      if (normalized(node.PackageFileName) !== o.packagePath || node.ReadOnly !== false) return {reason:'PACKAGE_IDENTITY_CHANGED'};
      if (node.HasRunningNodes() !== false || m.HasRunningNodes() !== false) return {reason:'RUNNING_NODES'};
      const modified = await m.FServerConnection.Session.IsPackageModified(node.Package);
      if (modified !== false && !(modified === true && o.diagnosticDiscard === true)) return {reason:'UNSAVED_CHANGES'};
      // Recheck identity after the server read. The native BeforeClose handler
      // repeats lock/dirty checks and may show a prompt. Normal shutdown never
      // answers it; independent QA can explicitly discard its temporary views.
      if (m.PackageNodes.Count !== 1 || m.PackageNodes.Items(0) !== node || normalized(node.PackageFileName) !== o.packagePath
          || m.FServerConnection.UserName !== o.account || node.HasRunningNodes() !== false) return {reason:'PACKAGE_CHANGED_DURING_CHECK'};
      const state = globalThis.__loginomDockCleanupV1 = {identity, document, done:false, closed:false};
      Promise.resolve().then(() => m.ClosePackage(node, false, true)).then(value => {
        state.closed = value === true && m.PackageNodes.Count === 0;
        state.done = true;
      }, () => { state.done = true; state.failed = true; });
      return {started:true, packages_before:1, modified, display_name:node.DisplayName};
    }, options);
    if (!before.started) return finish('BLOCKED', before.reason);
    await page.waitForFunction(() => {
      const state = globalThis.__loginomDockCleanupV1;
      const visible = e => !!e.getBoundingClientRect().width && !!e.getBoundingClientRect().height && getComputedStyle(e).visibility !== 'hidden';
      return state?.done || [...document.querySelectorAll('[role="dialog"],.x-message-box')].some(visible);
    }, undefined, {timeout:timeoutMs});
    if (options.diagnosticDiscard === true && before.modified === true) {
      const message = page.locator('[data-tid^="msgbox"][data-tid$="cnt;cnt;cmp"]:visible');
      const no = page.locator('[data-tid^="msgbox"][data-tid$="tlb;no"]:visible');
      if (await message.count() !== 1 || await no.count() !== 1) return finish('BLOCKED','DIAGNOSTIC_SAVE_PROMPT_MISSING');
      const text = (await message.innerText()).trim();
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
      await no.click({timeout:timeoutMs});
      receipt.unsaved_changes_discarded = true;
      await page.waitForFunction(() => globalThis.__loginomDockCleanupV1?.done === true, undefined, {timeout:timeoutMs});
    }
    const closed = await page.evaluate(() => {
      const state = globalThis.__loginomDockCleanupV1;
      return {done:state?.done === true, closed:state?.closed === true,
        remaining:globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree?.PackageNodes?.Count};
    });
    if (!closed.done || !closed.closed || closed.remaining !== 0) return finish('BLOCKED', 'NATIVE_CLOSE_UNCONFIRMED');
    await at(tabTid).waitFor({state:'detached', timeout:timeoutMs});
    receipt.package_closed = true;
    await at('MF;cntMain;tlbMainToolbar;btnAvatar').click({timeout:timeoutMs});
    if ((await at('MF;AppMenuForm;p.h;p.t').innerText()).trim() !== account) return finish('BLOCKED', 'LOGOUT_ACCOUNT_CHANGED');
    // Native close already removed every package; logout cannot discard work.
    if (!await page.evaluate(expected => {
      const m = globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree;
      return m?.PackageNodes?.Count === 0 && m.FServerConnection.UserName === expected;
    }, account)) return finish('BLOCKED', 'LOGOUT_INVENTORY_CHANGED');
    await at('MF;AppMenuForm;btnLogOut').click({timeout:timeoutMs});
    await at('LoginForm;Login;edtUsername').locator('input').waitFor({state:'visible', timeout:timeoutMs});
    if (await at('MF;cntMain;tlbMainToolbar;btnAvatar').isVisible()) return finish('BLOCKED', 'LOGOUT_UNCONFIRMED');
    receipt.logged_out = true;
    return finish('SUCCEEDED', null, {packages_before:1, packages_after:0});
  } catch {
    return finish('BLOCKED', 'CLEANUP_UNCONFIRMED');
  }
}
