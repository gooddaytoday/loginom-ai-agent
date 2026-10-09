import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loginBrowser} from '../src/connection-check.mjs';

for (const phase of ['before-launch', 'navigation', 'login-form']) {
  test('private browser cancellation closes its context: ' + phase, {
    skip: !process.env.LOGINOM_DOCK_TEST_BROWSER && 'Set LOGINOM_DOCK_TEST_BROWSER to pinned Chromium',
    timeout: 15000,
  }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'login-cancellation-'));
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    const http = createServer(async (request, response) => {
      if (request.url.startsWith('/app/')) {
        if (phase === 'navigation') { entered.resolve(); await release.promise; }
        response.setHeader('Content-Type', 'text/html');
        response.end(phase === 'login-form' ? `<script>fetch('/release').then(() => {
          document.body.innerHTML='<div data-tid="MF;cntMain;tlbMainToolbar;btnAvatar">user</div>';
          window.bg={app:{Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:'user'}}}}}}};
        });</script>` : '<div data-tid="MF;cntMain;tlbMainToolbar;btnAvatar">user</div><script>window.bg={app:{Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:"user"}}}}}}};</script>');
        return;
      }
      if (request.url === '/release') { entered.resolve(); await release.promise; }
      response.end('released');
    });
    await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
    const controller = new AbortController();
    if (phase === 'before-launch') controller.abort(Error('LOGINOM_HOST_CLOSED'));
    const login = loginBrowser({browserPath:process.env.LOGINOM_DOCK_TEST_BROWSER, profile:join(directory,'browser'),
      candidate:{url:`http://127.0.0.1:${http.address().port}/app/`, username:'user',password:''},
      headless:true, signal:controller.signal});
    void login.catch(() => {});
    let timer;
    try {
      if (phase !== 'before-launch') { await entered.promise; controller.abort(Error('LOGINOM_HOST_CLOSED')); }
      await assert.rejects(Promise.race([login, new Promise((_, reject) => {
        timer=setTimeout(() => reject(Error('BROWSER_DID_NOT_CANCEL')), 2000);
      })]), /LOGINOM_HOST_CLOSED/);
    } finally {
      clearTimeout(timer);
      release.resolve();
      await login.catch(() => {});
      http.closeAllConnections();
      await new Promise(resolve => http.close(resolve));
      await rm(directory,{recursive:true,force:true});
    }
  });
}
