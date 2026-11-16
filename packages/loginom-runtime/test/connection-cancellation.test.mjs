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
  }, async t => {
    const T0 = performance.now();
    const mark = text => process.stderr.write(`[diag ${phase} ${new Date().toISOString()} +${Math.round(performance.now()-T0)}ms] ${text}\n`);
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
      headless:true, signal:AbortSignal.any([controller.signal, t.signal]),
      onPhase: event => mark('phase ' + JSON.stringify(event)), onRetry: event => mark('retry ' + JSON.stringify(event))});
    login.then(() => mark('login resolved'), error => mark('login rejected ' + error?.message));
    void login.catch(() => {});
    t.after(async () => {
      mark('after start');
      controller.abort(Error('LOGINOM_HOST_CLOSED'));
      release.resolve();
      http.closeAllConnections();
      mark('after closeAllConnections');
      await new Promise(resolve => http.close(resolve));
      mark('after http closed');
      await login.catch(() => {});
      mark('after login settled');
      await rm(directory,{recursive:true,force:true});
    });
    let timer;
    try {
      if (phase !== 'before-launch') {
        // A failed launch cannot reach the fixture. Surface that failure instead
        // of leaving an open HTTP server behind the node:test timeout.
        await Promise.race([entered.promise, login.then(() => { throw Error('LOGIN_FINISHED_BEFORE_FIXTURE'); })]);
        mark('fixture entered; abort');
        controller.abort(Error('LOGINOM_HOST_CLOSED'));
      }
      await assert.rejects(Promise.race([login, new Promise((_, reject) => {
        timer=setTimeout(() => { mark('2s timer fired'); reject(Error('BROWSER_DID_NOT_CANCEL')); }, 2000);
      })]), /LOGINOM_HOST_CLOSED/);
    } finally {
      clearTimeout(timer);
    }
  });
}

test('private browser cancellation settles when CDP detach is never answered', {
  skip: !process.env.LOGINOM_DOCK_TEST_BROWSER && 'Set LOGINOM_DOCK_TEST_BROWSER to pinned Chromium',
  timeout: 15000,
}, async t => {
  // Deterministic form of the CI race: the browser closes while the login
  // network tracker's Target.detachFromTarget never gets an answer.
  const directory = await mkdtemp(join(tmpdir(), 'login-cancellation-detach-'));
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const http = createServer(async (request, response) => {
    if (request.url.startsWith('/app/')) { entered.resolve(); await release.promise; }
    response.end('released');
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  const controller = new AbortController();
  let detaches = 0;
  const login = loginBrowser({browserPath:process.env.LOGINOM_DOCK_TEST_BROWSER, profile:join(directory,'browser'),
    candidate:{url:`http://127.0.0.1:${http.address().port}/app/`, username:'user',password:''},
    headless:true, signal:AbortSignal.any([controller.signal, t.signal]),
    onContextCreated: context => {
      const newCDPSession = context.newCDPSession.bind(context);
      context.newCDPSession = async page => {
        const session = await newCDPSession(page);
        session.detach = () => { detaches++; return new Promise(() => {}); };
        return session;
      };
    }});
  void login.catch(() => {});
  t.after(async () => {
    controller.abort(Error('LOGINOM_HOST_CLOSED'));
    release.resolve();
    http.closeAllConnections();
    await new Promise(resolve => http.close(resolve));
    // Never let an unsettled login hold the runner past this test.
    await Promise.race([login.catch(() => {}), new Promise(resolve => setTimeout(resolve, 5000).unref())]);
    await rm(directory,{recursive:true,force:true});
  });
  let timer;
  try {
    await Promise.race([entered.promise, login.then(() => { throw Error('LOGIN_FINISHED_BEFORE_FIXTURE'); })]);
    controller.abort(Error('LOGINOM_HOST_CLOSED'));
    await assert.rejects(Promise.race([login, new Promise((_, reject) => {
      timer=setTimeout(() => reject(Error('BROWSER_DID_NOT_CANCEL')), 2000);
    })]), /LOGINOM_HOST_CLOSED/);
    assert.equal(detaches, 1);
  } finally {
    clearTimeout(timer);
  }
});
