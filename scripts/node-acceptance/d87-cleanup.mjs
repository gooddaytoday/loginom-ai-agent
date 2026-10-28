// Run-check's owned fixture cleanup: native file gestures and stock draft teardown.
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';

process.umask(0o077);
const [root, configPath, output] = process.argv.slice(2);
const load = name => import(pathToFileURL(join(resolve(root), 'runtime', name)).href);
const {verifyResources} = await load('src/resources.mjs');
const {loginBrowser} = await load('src/connection-check.mjs');
const {makeWorkspaceUiCode} = await load('client/lib/workspace-ui.mjs');
const {findNativeStorageRow} = await load('client/lib/text-export-output.mjs');
const {makeWorkspacePrepareCode} = await load('client/lib/workspace.mjs');
const {makePackageCleanupCode} = await load('client/lib/package-cleanup.mjs');
const resources = await verifyResources(root);
const config = JSON.parse(await readFile(configPath, 'utf8'));
const {login} = config;
const names = config.names ?? [config.name];
if (!Array.isArray(names) || !names.length || names.some(name => typeof name !== 'string'
    || !/^(?:[a-f0-9]{64}-(?:[0-9]+-)?)?d87-[A-Za-z0-9_-]+-(?:E[123]\.csv|X1\.xlsx)$/.test(name))) throw Error('D87_NAME_INVALID');
const directory = login.package_directory.replace(/\/$/, '');
if (!directory.startsWith('/') || directory.split('/').slice(1).some(p => !p || p === '.' || p === '..')) throw Error('D87_DIRECTORY_INVALID');
await mkdir(output, {recursive: true, mode: 0o700});
let context, page, prepared;
const session = randomUUID();
const report = {names, directory, removed: false, absent: false, logged_out: false, files: []};
try {
  const authenticated = await loginBrowser({browserPath: resources.browserPath, profile: join(output, 'browser'),
    candidate: login, headless: true, keepOpen: true, onContextCreated: value => {context = value;}});
  context = authenticated.context;
  page = context.pages()[0];
  page.setDefaultTimeout(15000);
  const at = tid => page.locator('[data-tid=' + JSON.stringify(tid) + ']');
  const execute = code => new Function('page', `return (${code})(page)`)(page);
  // Loginom's Files toolbar needs a prepared package context (Home has no
  // selected native NodeIndex). Own a pristine draft, then use stock teardown.
  prepared = await execute(makeWorkspacePrepareCode({loginomUrl: login.url, sessionId: session,
    operationId: 'd87-cleanup', intent: 'new_draft',
    compatibility: {loginom_build: '7.4.2', platform: 'linux', browser: 'chromium'}}));
  if (prepared.status !== 'READY') throw Error('D87_DRAFT_PREPARATION_FAILED');
  const base = {expected_origin: new URL(login.url).origin, expected_build: '7.4.2'};
  const read = async options => {
    const result = await execute(makeWorkspaceUiCode({mode: 'observe', ...base, ...options}));
    if (result.status !== 'SUCCEEDED') throw Error('D87_ROW_OBSERVATION_FAILED');
    return result.output;
  };
  const ready = async (read, predicate) => {
    const deadline = Date.now() + 15000;
    for (;;) {
      const value = await read();
      if (predicate(value)) return value;
      if (Date.now() >= deadline) throw Error('D87_ROW_READINESS_TIMEOUT');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };
  const reveal = name => findNativeStorageRow({name, read, roots: () => read({discover_roots: true}), ready,
    guard: () => {}, act: async (snapshot, element, verb, extra) => {
      const result = await execute(makeWorkspaceUiCode({mode: 'act', ...base, snapshot, action: {verb, ref: element.ref, ...extra}}));
      if (result.status !== 'SUCCEEDED' || !result.cleanup_complete) throw Error('D87_ROW_SCROLL_FAILED');
    }});
  await at('MF;cntMain;tlbMainToolbar;btnFilestorage').click();
  // The native grid is the observed storage root; the form itself has no tid.
  const grid = page.locator('[data-tid$=";FileStorageForm;pnlFileStorage;tbl"]:visible');
  await grid.waitFor({state: 'visible'});
  if (await grid.count() !== 1) throw Error('D87_STORAGE_AMBIGUOUS');
  const prefix = (await grid.getAttribute('data-tid')).slice(0, -';FileStorageForm;pnlFileStorage;tbl'.length);
  const suffix = value => value.replace(/\s/g, '_').replace(/,/g, '');
  const row = value => at(prefix + ';FileStorageForm;colName_' + suffix(value));
  const breadcrumb = value => at(prefix + ';cnrNaviMode;b.s_Сервер>Файлы' + value);
  await breadcrumb('').click();
  let trail = '';
  // The pair's exact authorized directory, never another account's folder.
  for (const part of directory.slice(1).split('/')) {
    await reveal(part);
    await row(part).dblclick();
    trail += '>' + part;
    await breadcrumb(trail).waitFor({state: 'visible'});
  }
  const inventory = async () => {
    // Read-only native metadata also sees virtualized/offscreen rows. No JS
    // mutation or native method invocation is used to perform deletion.
    return page.evaluate(({prefix, directory, username}) => {
      const main = globalThis.bg?.app?.Application?.FInstance?.FMainForm;
      const controller = main?.Items?.Workspace?.getActiveTab?.()?.Controller?.FController;
      const grid = document.querySelector('[data-tid=' + JSON.stringify(prefix + ';FileStorageForm;pnlFileStorage;tbl') + ']');
      const store = grid && globalThis.Ext?.getCmp?.(grid.id)?.getStore?.();
      if (main?.FMapTree?.FServerConnection?.UserName !== username || controller?.FFileSenderManager?.CurrentDirectory !== directory + '/'
          || store?.$className !== 'bg.filedialog.FileStore' || store.isBufferedStore || store.isLoading()) return null;
      const records = store.getRange();
      if (records.length !== store.getCount() || records.length !== store.getTotalCount()) return null;
      return records.map(r => ({name: r.data.FileName, path: r.data.FilePath, type: r.data.Type}));
    }, {prefix, directory, username: login.username});
  };
  await page.waitForFunction(() => ![...document.querySelectorAll('.x-mask')].some(e => e.getBoundingClientRect().width > 0));
  for (const name of names) {
    const before = await ready(inventory, value => Array.isArray(value));
    if (!before) throw Error('D87_STORAGE_UNCONFIRMED');
    const own = before.filter(r => r.name === name || r.path === directory + '/' + name);
    if (own.length > 1 || own.some(r => r.path !== directory + '/' + name || r.type !== 0)) throw Error('D87_SOURCE_AMBIGUOUS');
    if (own.length) {
      await reveal(name);
      await row(name).click();
      const selected = page.locator('[data-tid=' + JSON.stringify(prefix + ';FileStorageForm;pnlFileStorage;tbl') + '] .x-grid-item-selected [data-tid*=";colName_"]');
      if (await selected.count() !== 1 || await selected.getAttribute('data-tid') !== prefix + ';FileStorageForm;colName_' + suffix(name)) throw Error('D87_SELECTION_CHANGED');
      await at(prefix + ';FileStorageForm;btnDelete').click();
      if ((await at('msgbox;cnt;cnt;cmp').innerText()).trim() !== 'Вы действительно хотите удалить выделенное?'
          || (await at('msgbox;tlb;yes').innerText()).trim() !== 'Удалить') throw Error('D87_DELETE_DIALOG_CHANGED');
      await at('msgbox;tlb;yes').click();
      await row(name).waitFor({state: 'detached'});
      report.removed = true;
    }
    await at(prefix + ';FileStorageForm;btnRefresh').click();
    await page.waitForFunction(() => ![...document.querySelectorAll('.x-mask')].some(e => e.getBoundingClientRect().width > 0));
    const after = await ready(inventory, value => Array.isArray(value));
    const others = rows => rows.filter(r => r.name !== name).map(r => JSON.stringify(r)).sort();
    if (!after || after.some(r => r.name === name) || JSON.stringify(others(before)) !== JSON.stringify(others(after))) throw Error('D87_DELETE_UNCONFIRMED');
    report.files.push({name, absent: true});
  }
  report.absent = true;
} catch (error) {
  if (page) {
    const dom = await page.evaluate(() => [...document.querySelectorAll('[data-tid]')]
      .filter(e => e.getBoundingClientRect().width && e.getBoundingClientRect().height && getComputedStyle(e).visibility !== 'hidden')
      .map(e => ({tid: e.getAttribute('data-tid'), text: (e.textContent ?? '').trim().slice(0, 200)})));
    await writeFile(join(output, 'failure-dom.json'), JSON.stringify(dom, null, 2) + '\n');
  }
  throw error;
} finally {
  if (prepared?.status === 'READY') {
    try {
      await page.waitForFunction(() => ![...document.querySelectorAll('[role="dialog"],.x-message-box,.bg-mask-message,.x-mask-msg')]
        .some(e => e.getBoundingClientRect().width && e.getBoundingClientRect().height && getComputedStyle(e).visibility !== 'hidden'));
      const cleanup = await new Function('page', `return (${makePackageCleanupCode({sessionId: session,
        documentId: prepared.document_id, account: login.username, packagePath: null,
        loginomUrl: login.url, loginomBuild: '7.4.2', tabTid: prepared.workflow_ref.tab_tid,
        unsavedDraft: true})})(page)`)(page);
      report.draft_cleanup = cleanup;
      report.logged_out = cleanup.logged_out === true;
      if (!cleanup.package_closed || !cleanup.logged_out || cleanup.unsaved_changes_discarded) process.exitCode = 1;
    } catch {
      report.draft_cleanup = {status: 'FAILED', reason: 'D87_DRAFT_CLEANUP_FAILED'};
      process.exitCode = 1;
    }
  }
  try { await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n'); }
  finally { await context?.close(); }
}
