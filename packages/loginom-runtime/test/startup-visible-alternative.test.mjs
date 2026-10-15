// Real Playwright locator/loginPage; local HTML/native connection doubles.
// No Loginom, credentials, certificate bypass or real account is involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loginPage} from '../src/connection-check.mjs';
const require=createRequire(new URL('../client/package.json',import.meta.url));
const {chromium}=require('playwright-core');
const avatar='[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]';
const login='[data-tid="LoginForm;Login;edtUsername"]';

for(const mode of ['hidden-avatar-first','hidden-login-first','both-visible','both-hidden','foreign-avatar'])test('visible startup alternative: '+mode,async()=>{
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_FIXTURE_BROWSER,headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext(),page=await context.newPage();let requests=0;
  const a=`<div data-tid="MF;cntMain;tlbMainToolbar;btnAvatar" style="display:${['hidden-avatar-first','both-hidden'].includes(mode)?'none':'block'}">avatar double</div>`;
  const f=`<div data-tid="LoginForm;Login;edtUsername" style="display:${['hidden-login-first','both-hidden'].includes(mode)?'none':'block'}"><input></div>`;
  const html=`<html><body>${mode==='hidden-login-first'?f+a:a+f}<div data-tid="LoginForm;Login;edtPassword"><input></div><button data-tid="LoginForm;Login;btnLogin">login double</button><script>
   globalThis.bg=${JSON.stringify({app:{Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:mode==='foreign-avatar'?'Foreign':'User',Connected:true},FPackagesParentNode:{}}}}}}})};
   globalThis.loginClicks=0;document.querySelector('[data-tid="LoginForm;Login;btnLogin"]').onclick=()=>{loginClicks++;document.querySelector(${JSON.stringify(avatar)}).style.display='block';document.querySelector(${JSON.stringify(login)}).style.display='none';};
  </script></body></html>`;
  await page.route('http://fixture.invalid/**',r=>{requests++;return r.fulfill({status:200,contentType:'text/html',body:html});});
  await page.goto('http://fixture.invalid/app/');
  if(mode==='hidden-avatar-first'||mode==='hidden-login-first'){
   // Counterfactual demonstrates the previous union-before-first false timeout.
   await assert.rejects(page.locator(avatar).or(page.locator(login)).first().waitFor({state:'visible',timeout:80}),/Timeout/);
  }
  const locate=page.locator.bind(page);let readyCalls=0,timeout;
  page.locator=selector=>{
   const locator=locate(selector);
   if(selector.includes(':visible, ')){
    const first=locator.first.bind(locator);locator.first=()=>{
     const v=first(),wait=v.waitFor.bind(v);v.waitFor=options=>{readyCalls++;timeout=options.timeout;return wait(mode==='both-hidden'?{...options,timeout:80}:options);};return v;
    };
   }
   return locator;
  };
  const call=()=>loginPage(page,{url:'http://fixture.invalid/app/',username:'User',password:'fixture-only'});
  if(mode==='both-hidden')await assert.rejects(call(),/Timeout/);
  else if(mode==='foreign-avatar')await assert.rejects(call(),/LOGINOM_ACCOUNT_MISMATCH/);
  else assert.deepEqual(await call(),{authenticated:true});
  assert.equal(readyCalls,1);assert.equal(timeout,60000);
  assert.equal(await page.evaluate(()=>loginClicks),mode==='hidden-avatar-first'?1:0);
  assert.ok(requests>=2);await context.close();
 }finally{await browser.close();}
});
