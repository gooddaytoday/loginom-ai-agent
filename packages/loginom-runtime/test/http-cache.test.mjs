import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loginBrowser} from '../src/connection-check.mjs';

test('validation reuses HTTP bytes with fresh cookies and authenticates every new profile', {
  skip:!process.env.LOGINOM_DOCK_TEST_BROWSER&&'Set pinned Chromium',timeout:60000,
},async t=>{
  const root=await mkdtemp(join(tmpdir(),'login-http-cache-'));
  let assets=0,submits=0,logouts=0;
  const cookies=[];
  const sessionEvents=[];
  const submitted=Promise.withResolvers();
  const completeLogin=Promise.withResolvers();
  const http=createServer(async(request,response)=>{
    if(request.url.startsWith('/static.js')){
      assets++;response.setHeader('Cache-Control','public, max-age=3600');response.setHeader('Content-Type','application/javascript');response.end('window.fixtureAsset=true;');return;
    }
    response.setHeader('Cache-Control','no-store');
    if(request.url==='/logout'){
      logouts++;sessionEvents.push('logout');response.setHeader('Set-Cookie','fixture-auth=; Path=/; Max-Age=0');response.end('{}');return;
    }
    if(request.url==='/folders'){sessionEvents.push('read');response.end('[]');return;}
    if(request.url==='/login'){
      submits++;let body='';for await(const chunk of request)body+=chunk;
      if(JSON.parse(body).password!=='fixture-password'){response.statusCode=403;response.end('{}');return;}
      if(submits===5){submitted.resolve();await completeLogin.promise;}
      response.setHeader('Set-Cookie','fixture-auth=1; Path=/; SameSite=Lax');response.end('{}');return;
    }
    if(!request.url.startsWith('/app/')){response.statusCode=404;response.end();return;}
    cookies.push(request.headers.cookie??'');
    response.setHeader('Content-Type','text/html');
    response.end(`<script src="/static.js"></script><div data-tid="LoginForm;Login;edtUsername"><input id="user"></div><div id="password-field" data-tid="LoginForm;Login;edtPassword"><input id="password" type="password"></div><button data-tid="LoginForm;Login;btnLogin" onclick="login()">Login</button><script>
      async function login(){const r=await fetch('/login',{method:'POST',body:JSON.stringify({password:document.getElementById('password').value})});if(!r.ok){window.Ext={getCmp:id=>id==='password-field'?{isVisible:()=>true,getActiveErrors:()=>['Invalid credentials']}:undefined};return;}
      window.bg={app:{Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:document.getElementById('user').value}}}}}}};
      const a=document.createElement('button');a.dataset.tid='MF;cntMain;tlbMainToolbar;btnAvatar';a.textContent='user';document.body.append(a);
      const user=document.querySelector('[data-tid="LoginForm;Login;edtUsername"]');user.hidden=true;
      a.onclick=()=>{const out=document.createElement('button');out.dataset.tid='MF;AppMenuForm;btnLogOut';out.textContent='Sign out';
      out.onclick=async()=>{await fetch('/logout',{method:'POST'});out.remove();a.remove();user.hidden=false;};document.body.append(out);};}
      </script>`);
  });
  await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{completeLogin.resolve();http.closeAllConnections();await new Promise(resolve=>http.close(resolve));await rm(root,{recursive:true,force:true});});
  const initialCookies=[],events=[];
  const run=async(number,password='fixture-password',validationLogout=false,options={})=>loginBrowser({browserPath:process.env.LOGINOM_DOCK_TEST_BROWSER,
    profile:join(root,'profile-'+number),httpCachePath:join(root,'http-cache'),headless:true,
    candidate:{url:`http://127.0.0.1:${http.address().port}/app/`,username:'user',password},
    // This verifies cache/auth isolation, not Windows runner startup latency.
    // Every profile, including the rejected one, must have time to launch under
    // parallel CI load: a rejection is only reported once the form was submitted,
    // so a deadline that expires during startup turns it into UNAVAILABLE.
    deadline:Date.now()+20000,validationLogout,
    onContextCreated:async context=>{initialCookies.push((await context.cookies()).length);},onPhase:event=>events.push(event),...options});
  assert.deepEqual(await run(1),{authenticated:true});
  assert.deepEqual(await run(2),{authenticated:true});
  assert.equal(assets,1);
  assert.deepEqual(initialCookies,[0,0]);assert.deepEqual(cookies,['','']);assert.equal(submits,2);
  const networks=events.filter(e=>e.phase==='login.form.network');
  assert.equal(networks.length,2);assert.equal(networks[1].dropped,0);
  assert.ok(networks[1].completed.some(r=>r.mime==='javascript'&&(r.disk||r.served_cache)));
  await assert.rejects(run(3,'incorrect-password',true),/LOGINOM_LOGIN_REJECTED/);
  assert.equal(submits,3);assert.deepEqual(initialCookies,[0,0,0]);assert.deepEqual(cookies,['','','']);
  assert.equal(logouts,0);
  assert.deepEqual(await run(4,'fixture-password',true),{authenticated:true});
  assert.equal(logouts,1);

  const controller=new AbortController();
  const cancelled=run(5,undefined,true,{
    signal:AbortSignal.any([controller.signal,t.signal]),
    readAuthenticated:()=>{throw Error('A cancelled read must not start');},
  });
  void cancelled.catch(()=>{});
  await Promise.race([submitted.promise,cancelled.then(()=>{throw Error('Expected the login request');})]);
  controller.abort(Error('picker closed'));
  completeLogin.resolve();
  await assert.rejects(cancelled,/picker closed/);
  assert.deepEqual(sessionEvents,['logout','logout']);

  const result=await run(6,undefined,true,{
    readAuthenticated:page=>page.evaluate(async()=>(await fetch('/folders')).json()),
  });
  assert.deepEqual(result,[]);
  assert.deepEqual(sessionEvents,['logout','logout','read','logout']);
});
