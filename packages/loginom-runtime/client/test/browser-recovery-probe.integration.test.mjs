import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {runInNewContext} from 'node:vm';
import {chromium} from 'playwright-core';
import {makeRecoveryPageProbeCode} from '../lib/browser-recovery.mjs';

test('page probe accepts the prepared page with an open dialog and refuses a second page or navigation', {
  skip: !process.env.LOGINOM_DOCK_TEST_BROWSER && 'Set LOGINOM_DOCK_TEST_BROWSER to pinned Chromium', timeout: 30000,
}, async () => {
  const http = createServer((request, response) => {
    response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    response.end(`<!doctype html><dialog>Own wizard</dialog><script>
      window.bg = {app: {Version: '7.4.2', Application: {FInstance: {FMainForm: {FMapTree: {
        FServerConnection: {Connected: true, UserName: 'tester'}
      }}}}}};
      window.__loginomDockPreparationV1 = {document, id: 'doc', receipts: new Map([
        ['prepare', {request: JSON.stringify({session: 'session'})}]
      ])};
    </script>`);
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${http.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({executablePath: process.env.LOGINOM_DOCK_TEST_BROWSER,
      headless: true, chromiumSandbox: true, args: ['--no-proxy-server']});
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(origin);
    const probe = async (overrides = {}) => structuredClone(await runInNewContext(makeRecoveryPageProbeCode({origin,
      documentId: 'doc', sessionId: 'session', account: 'tester', loginomBuild: '7.4.2', ...overrides}))(page));
    const good = {origin_ok: true, page_count: 1, document_present: true};
    assert.deepEqual(await probe(), good);
    for (const binding of [{documentId: 'other'}, {sessionId: 'other'}, {account: 'other'}, {loginomBuild: 'other'}]) {
      assert.deepEqual(await probe(binding), {...good, document_present: false});
    }
    await page.evaluate(() => { window.__loginomDockPreparationV1.document = document.implementation.createHTMLDocument(); });
    assert.deepEqual(await probe(), {...good, document_present: false});
    await page.reload();
    await page.evaluate(() => { window.__loginomDockPreparationV1.receipts.set('prepare', {request: 'broken JSON'}); });
    assert.deepEqual(await probe(), {...good, document_present: false});
    await page.reload();
    await page.evaluate(() => { window.bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection.Connected = false; });
    assert.deepEqual(await probe(), {...good, document_present: false});
    await page.reload();
    await page.locator('dialog').evaluate(dialog => dialog.showModal());
    assert.deepEqual(await probe(), good);
    const second = await page.context().newPage();
    assert.deepEqual(await probe(), {...good, page_count: 2});
    await second.close();
    await page.goto('about:blank');
    assert.deepEqual(await probe(), {origin_ok: false, page_count: 1, document_present: false});
  } finally {
    await browser?.close();
    await new Promise(resolve => http.close(resolve));
  }
});
