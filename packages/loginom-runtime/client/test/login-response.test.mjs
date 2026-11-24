import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { loginPage } from '../../src/connection-check.mjs';

for (const mode of ['timeout', 'edtUsername', 'edtPassword', 'pnlLoginFormFields', 'hidden', 'empty', 'unreadable'])
test('login response classification: ' + mode, {
  skip: !process.env.LOGINOM_DOCK_TEST_BROWSER && 'Set pinned Chromium', timeout: 15000,
}, async () => {
  const browser = await chromium.launch({ executablePath: process.env.LOGINOM_DOCK_TEST_BROWSER,
    headless: true, chromiumSandbox: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: `
      <div id="form" data-tid="LoginForm;Login;pnlLoginFormFields">
        <div id="username" data-tid="LoginForm;Login;edtUsername"><input></div>
        <div id="password" data-tid="LoginForm;Login;edtPassword"><input></div>
      </div>
      <button data-tid="LoginForm;Login;btnLogin" onclick="submitted=true">Login</button>
      <script>
        let submitted = false;
        const mode = ${JSON.stringify(mode)};
        window.Ext = { getCmp: id => ({
          isVisible: deep => deep && mode !== 'hidden',
          getActiveErrors: () => {
            if (mode === 'unreadable') throw Error('PRIVATE_FORM_MESSAGE');
            const name = document.getElementById(id).dataset.tid.split(';').at(-1);
            if (!submitted || mode === 'timeout') return [];
            return name === mode || ['hidden', 'empty'].includes(mode)
              ? [mode === 'empty' ? '   ' : 'PRIVATE_FORM_MESSAGE'] : [];
          },
        }) };
      </script>` }));
    await assert.rejects(loginPage(page, { url: 'http://login-response.invalid/app/',
      username: 'worker', password: 'PRIVATE_PASSWORD' }, { deadline: Date.now() + 2500 }), error => {
      assert.equal(error.message, ['edtUsername', 'edtPassword', 'pnlLoginFormFields'].includes(mode)
        ? 'LOGINOM_LOGIN_REJECTED' : 'LOGINOM_LOGIN_UNAVAILABLE');
      assert.equal(error.cause.login.phase, 'submit');
      assert.equal(error.cause.login.original_name, error.message === 'LOGINOM_LOGIN_REJECTED' ? 'Error' : 'TimeoutError');
      assert.doesNotMatch(JSON.stringify(error.cause), /PRIVATE_FORM_MESSAGE|PRIVATE_PASSWORD/);
      return true;
    });
  } finally {
    await browser.close();
  }
});
