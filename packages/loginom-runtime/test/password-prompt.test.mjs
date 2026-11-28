import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loginBrowser } from '../src/connection-check.mjs';

const browserPath = process.env.LOGINOM_DOCK_TEST_BROWSER;

test('runtime signs in without asking Chromium to save the password', {
  skip: !browserPath && 'Set LOGINOM_DOCK_TEST_BROWSER to pinned Chromium',
  timeout: 60_000,
}, async () => {
  const profile = await mkdtemp(join(tmpdir(), 'login-password-prompt-'));
  const submissions = [];
  const server = createServer(async (request, response) => {
    if (request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      submissions.push(Object.fromEntries(new URLSearchParams(body)));
      response.writeHead(303, { Location: '/done' }).end();
      return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end(request.url === '/done'
      ? `<h1 data-tid="MF;cntMain;tlbMainToolbar;btnAvatar">Signed in</h1>
         <script>window.bg={app:{Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:'fixture'}}}}}}};</script>`
      : `<form method="post" action="/login">
           <div data-tid="LoginForm;Login;edtUsername"><input name="username" autocomplete="username"></div>
           <div data-tid="LoginForm;Login;edtPassword"><input name="password" type="password" autocomplete="current-password"></div>
           <button data-tid="LoginForm;Login;btnLogin">Sign in</button>
         </form>`);
  });
  const username = 'fixture', password = 'fixture-password';
  let authenticated, diagnostics;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    authenticated = await loginBrowser({
      browserPath, profile, headless: process.env.LOGINOM_DOCK_TEST_HEADED !== '1', keepOpen: true,
      candidate: { url: `http://127.0.0.1:${server.address().port}/app/`, username, password },
      onContextCreated: async context => {
        const login = context.pages()[0];
        diagnostics = await context.newPage();
        await diagnostics.goto('chrome://password-manager-internals/');
        await login.bringToFront();
      },
    });
    assert.equal(authenticated.authenticated, true);
    assert.deepEqual(submissions, [{ username, password }]);
    // Chromium's native save bubble is outside the page DOM and has no Playwright dialog event.
    await diagnostics.waitForFunction(() => /Saving disabled|Show password prompt/.test(document.body.innerText),
      null, { timeout: 5_000 });
    const decision = await diagnostics.locator('body').innerText();
    assert.match(decision, /Saving disabled/);
    assert.doesNotMatch(decision, /Show password prompt/);
    await authenticated.context.close();

    const preferences = JSON.parse(await readFile(join(profile, 'Default', 'Preferences'), 'utf8'));
    assert.equal(preferences.credentials_enable_service, false);
    assert.equal(preferences.credentials_enable_autosignin, false);
    assert.equal(preferences.autofill.profile_enabled, false);
    assert.equal(preferences.autofill.credit_card_enabled, false);
  } finally {
    await authenticated?.context.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(profile, { recursive: true, force: true });
  }
});
