import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { browserEnvironment, browserLoggingArguments } from '../../src/connection-check.mjs';
import { loginPage } from '../../src/connection-check.mjs';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';

test('Chromium diagnostics stay in the mutable browser profile', () => {
  const profile = join('C:\\state', 'browser-profile');
  const input = { SYSTEMROOT: 'C:\\Windows', CHROME_LOG_FILE: 'C:\\immutable\\debug.log' };
  const result = browserEnvironment(profile, input);
  assert.equal(result.CHROME_LOG_FILE, join(profile, 'chrome-debug.log'));
  assert.equal(result.SYSTEMROOT, input.SYSTEMROOT);
  assert.equal(input.CHROME_LOG_FILE, 'C:\\immutable\\debug.log');
  assert.deepEqual(browserLoggingArguments(profile), [
    '--disable-logging',
    `--log-file=${join(profile, 'chrome-debug.log')}`,
  ]);
});

for(const mode of ['password','passwordless','foreign'])test(`login commits username lookup before password entry: ${mode}`,{
  skip:!process.env.LOGINOM_DOCK_TEST_BROWSER&&'Set LOGINOM_DOCK_TEST_BROWSER to pinned Chromium',timeout:120000,
},async()=>{
  const html=`<!doctype html><div data-tid="LoginForm;Login;edtUsername"><input id="user"></div>
<div data-tid="LoginForm;Login;edtPassword"><input id="password" type="password" readonly></div>
<button id="login" data-tid="LoginForm;Login;btnLogin">Login</button>
<button id="avatar" data-tid="MF;cntMain;tlbMainToolbar;btnAvatar" hidden>User</button>
<script>
const user=document.querySelector('#user'),password=document.querySelector('#password');
user.onblur=()=>setTimeout(()=>{if(${JSON.stringify(mode)}!=='passwordless')password.readOnly=false;},50);
document.querySelector('#login').onclick=()=>{
 if(user.value!=='worker'||password.value!==${JSON.stringify(mode==='passwordless'?'':'fixture-password')})return;
 window.bg={app:{Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:${JSON.stringify(mode==='foreign'?'foreign':'worker')}}}}}}}};
 document.querySelector('#avatar').hidden=false;
};
</script>`;
  const server=createServer((request,response)=>{response.writeHead(200,{'Content-Type':'text/html'});response.end(html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true});
    const page=await browser.newPage();page.setDefaultTimeout(1000);
    const candidate={url:`http://127.0.0.1:${server.address().port}`,username:'worker',password:mode==='passwordless'?'':'fixture-password'};
    if(mode==='foreign')await assert.rejects(loginPage(page,candidate),/LOGINOM_ACCOUNT_MISMATCH/);
    else assert.deepEqual(await loginPage(page,candidate),{authenticated:true});
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
