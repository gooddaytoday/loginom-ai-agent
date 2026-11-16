import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loginBrowser } from '../../src/connection-check.mjs';

const browserPath=process.env.LOGINOM_DOCK_TEST_BROWSER;
for(const mode of ['normal','once','twice','empty','unrelated','user','authenticated','deadline','cancel','journal-user'])
test('production login theme stylesheet: '+mode,{skip:!browserPath,timeout:20000},async()=>{
  const profile=await mkdtemp(join(tmpdir(),'theme-reload-'));
  const contexts=[],gestures=[],failures=[];
  const controller=new AbortController(),callbackEvents=[];
  let documents=0,authenticated,releaseTheme;
  // In deadline mode the reloaded document's theme never arrives, so only the
  // original deadline can end the reload. Launch and the first document vary
  // with host load and must not consume the time the reload is tested in.
  const reloadedTheme=new Promise(resolve=>releaseTheme=resolve);
  try {
    const deadline=Date.now()+10000;
    const result=loginBrowser({browserPath,profile,headless:true,keepOpen:true,
      candidate:{url:'http://theme.invalid/app/',username:'worker',password:'fixture-password'},
      deadline,signal:controller.signal,
      onRetry:['cancel','journal-user'].includes(mode)?async event=>{
        callbackEvents.push(event);
        if(mode==='cancel')controller.abort(Error('cancelled'));
        else await contexts[0].pages()[0].locator('[data-tid="LoginForm;Login;edtUsername"] input').fill('human-draft');
      }:undefined,
      onContextCreated:async context=>{
        contexts.push(context);
        if(mode==='user'){
          const page=context.pages()[0],evaluate=page.evaluate.bind(page);
          page.evaluate=async(fn,...args)=>{
            if(fn.name==='themeStylesheetMissing')await page.locator('[data-tid="LoginForm;Login;edtUsername"] input').fill('human-draft');
            return evaluate(fn,...args);
          };
        }
        await context.exposeFunction('gesture',kind=>gestures.push({document:documents,kind}));
        context.on('requestfailed',request=>failures.push(request.url()));
        await context.route('**/*',async route=>{
          const path=new URL(route.request().url()).pathname;
          if(path.endsWith('.css')){
            const theme=path.includes('deductor-theme');
            if(theme&&mode==='deadline'&&documents===2)return reloadedTheme.then(()=>route.abort('failed')).catch(()=>{});
            if(theme&&(mode==='twice'||['once','user','authenticated','deadline','cancel','journal-user'].includes(mode)&&documents===1)||!theme&&mode==='unrelated')
              return route.abort('failed');
            return route.fulfill({contentType:'text/css',body:theme&&mode==='empty'&&documents===1?'':'.theme-probe { color: red; }'});
          }
          documents++;
          assert.equal(new URL(route.request().url()).searchParams.get('testable'),'true');
          return route.fulfill({contentType:'text/html',body:`<!doctype html>
<link rel="stylesheet" href="/app/packages/deductor-theme/build/resources/deductor-theme-all-debug.css">
<link rel="stylesheet" href="/unrelated.css">
<div data-tid="LoginForm;Login;edtUsername"><input oninput="gesture('username')"></div>
<div data-tid="LoginForm;Login;edtPassword"><input type="password" oninput="gesture('password')"></div>
<button data-tid="LoginForm;Login;btnLogin" onclick="gesture('login');document.querySelector('#avatar').hidden=false">Login</button>
<button id="avatar" data-tid="MF;cntMain;tlbMainToolbar;btnAvatar" ${mode==='authenticated'?'':'hidden'}>User</button>
<script>window.bg={app:{Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:'worker'}}}}}}};</script>`});
        });
      },
    });
    if(['twice','user','authenticated','deadline','cancel','journal-user'].includes(mode))await assert.rejects(result,{message:mode==='cancel'?'cancelled':'LOGINOM_LOGIN_UNAVAILABLE'});
    else {authenticated=await result;assert.equal(authenticated.authenticated,true);}
    const settled=Date.now();
    const reload=['once','twice','empty','deadline','cancel','journal-user'].includes(mode);
    assert.equal(documents,reload&&!['cancel','journal-user'].includes(mode)?2:1);
    assert.equal(contexts.length,1,'theme failure must not trigger the separate browser login retry');
    const events=await readFile(join(profile,'execution-events.jsonl'),'utf8').catch(()=> '');
    const records=callbackEvents.length?callbackEvents:events.trim()?events.trim().split('\n').map(line=>JSON.parse(line)):[];
    assert.equal(records.length,reload?1:0);
    if(reload){
      assert.equal(records[0].phase,'theme_reload');
      assert.equal(records[0].reason,'theme_stylesheet_rules_missing');
    }
    assert.equal(gestures.filter(g=>g.kind==='login').length,['twice','user','authenticated','deadline','cancel','journal-user'].includes(mode)?0:1);
    assert.ok(gestures.every(g=>g.document===documents),'reload must happen before any credential gesture');
    if(['once','twice'].includes(mode))assert.equal(failures.filter(url=>url.includes('deductor-theme')).length,mode==='twice'?2:1);
    // The reload gets no time allowance of its own (connection-check.mjs:213):
    // it ends at the original deadline; the margin covers context.close() under load.
    if(mode==='deadline')assert.ok(settled>=deadline&&settled<deadline+3000,'the reload ends at the original deadline');
  }finally{
    releaseTheme();
    await authenticated?.context?.close();
    for(const context of contexts)await context.close().catch(()=>{});
    await rm(profile,{recursive:true,force:true});
  }
});
