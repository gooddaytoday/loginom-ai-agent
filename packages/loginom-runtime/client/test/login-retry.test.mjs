import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loginBrowser } from '../../src/connection-check.mjs';

const browserPath=process.env.LOGINOM_DOCK_TEST_BROWSER;
const html=identity=>`<div data-tid="MF;cntMain;tlbMainToolbar;btnAvatar">User</div>
<script>window.bg={app:{Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:${JSON.stringify(identity)}}}}}}}};</script>`;

for(const keepOpen of [false,true])
for(const mode of ['normal','success','form','retry-deadline','twice','mismatch','rejected','cancel','deadline','cleanup','journal'])
test('production browser login retry: '+mode+', keepOpen='+keepOpen,{skip:!browserPath,timeout:30000},async()=>{
  const profile=await mkdtemp(join(tmpdir(),'login-retry-'));
  const contexts=[],events=[],requests=[];
  const controller=new AbortController();
  let authenticated;
  try {
    const started=Date.now();
    const promise=loginBrowser({browserPath,profile,headless:true,keepOpen,
      candidate:{url:'http://login-retry.invalid/app/',username:'worker',password:'wrong-password',apiKey:'private-key'},
      signal:controller.signal,deadline:Date.now()+10000,
      onRetry:mode==='journal'?undefined:async event=>{
        assert.ok(contexts[0].pages().length===0,'first browser must be closed before retry');
        events.push(event);
        if(mode==='cancel')controller.abort(Error('cancelled'));
      },
      onContextCreated:async context=>{
        assert.ok(contexts.every(previous=>previous.pages().length===0),'contexts must never overlap');
        contexts.push(context);
        if(mode==='cleanup'){
          const close=context.close.bind(context);
          context.close=async()=>{await close();throw Error('cleanup failed');};
        }
        await context.route('**/*',async route=>{
          requests.push(contexts.length);
          if(mode==='retry-deadline')await new Promise(resolve=>setTimeout(resolve,contexts.length===1?4000:11000));
          if(mode==='form'&&contexts.length===1){
            context.pages()[0].once('domcontentloaded',()=>setTimeout(()=>context.pages()[0]?.close().catch(()=>{}),50));
            return route.fulfill({contentType:'text/html',body:'<div>Loading</div>'});
          }
          if(mode==='deadline')await new Promise(resolve=>setTimeout(resolve,10500));
          if(['mismatch','rejected'].includes(mode)){
            await route.fulfill({contentType:'text/html',body:mode==='mismatch'?html('foreign'):
              '<div data-tid="LoginForm;Login;edtUsername"><input></div><div data-tid="LoginForm;Login;edtPassword"><input></div><button data-tid="LoginForm;Login;btnLogin">Login</button>'});
          }else if((contexts.length===1&&mode!=='normal')||mode==='twice')await route.abort('connectionrefused');
          else await route.fulfill({contentType:'text/html',body:html('worker')});
        });
      },
    });
    if(['normal','success','form','journal'].includes(mode)){
      authenticated=await promise;
      assert.equal(authenticated.authenticated,true);
    }else await assert.rejects(promise,{
      message:{'retry-deadline':'LOGINOM_LOGIN_UNAVAILABLE',twice:'LOGINOM_LOGIN_UNAVAILABLE',mismatch:'LOGINOM_ACCOUNT_MISMATCH',
        rejected:'LOGINOM_LOGIN_REJECTED',cancel:'cancelled',deadline:'LOGINOM_LOGIN_UNAVAILABLE',
        cleanup:'LOGINOM_RUNTIME_CLEANUP_FAILED'}[mode],
    });
    if(mode==='journal')events.push(JSON.parse((await readFile(join(profile,'execution-events.jsonl'),'utf8')).trim()));
    const retried=['success','form','retry-deadline','twice','cancel','journal'].includes(mode);
    assert.equal(contexts.length,['success','form','retry-deadline','twice','journal'].includes(mode)?2:1);
    assert.equal(events.length,retried?1:0);
    if(retried){
      assert.equal(events[0].phase,'login_retry');
      assert.equal(events[0].reason,'LOGINOM_LOGIN_UNAVAILABLE');
      assert.equal(events[0].login.phase,mode==='form'?'form':'goto');
      assert.ok(!JSON.stringify(events).includes('private-key'));
    }
    assert.equal(new Set(requests).size,contexts.length);
    if(['deadline','retry-deadline'].includes(mode))assert.ok(Date.now()-started<12000,'original deadline must bound both attempts');
  }finally{
    await authenticated?.context?.close();
    for(const context of contexts)await context.close().catch(()=>{});
    await rm(profile,{recursive:true,force:true});
  }
});
