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
  let assets=0,submits=0;
  const cookies=[];
  const http=createServer(async(request,response)=>{
    if(request.url.startsWith('/static.js')){
      assets++;response.setHeader('Cache-Control','public, max-age=3600');response.setHeader('Content-Type','application/javascript');response.end('window.fixtureAsset=true;');return;
    }
    response.setHeader('Cache-Control','no-store');
    if(request.url==='/login'){
      submits++;let body='';for await(const chunk of request)body+=chunk;
      if(JSON.parse(body).password!=='fixture-password'){response.statusCode=403;response.end('{}');return;}
      response.setHeader('Set-Cookie','fixture-auth=1; Path=/; SameSite=Lax');response.end('{}');return;
    }
    if(!request.url.startsWith('/app/')){response.statusCode=404;response.end();return;}
    cookies.push(request.headers.cookie??'');
    response.setHeader('Content-Type','text/html');
    response.end(`<script src="/static.js"></script><div data-tid="LoginForm;Login;edtUsername"><input id="user"></div><div data-tid="LoginForm;Login;edtPassword"><input id="password" type="password"></div><button data-tid="LoginForm;Login;btnLogin" onclick="login()">Login</button><script>
      async function login(){const r=await fetch('/login',{method:'POST',body:JSON.stringify({password:document.getElementById('password').value})});if(!r.ok)return;
      window.bg={app:{Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:document.getElementById('user').value}}}}}}};
      const a=document.createElement('div');a.dataset.tid='MF;cntMain;tlbMainToolbar;btnAvatar';a.textContent='user';document.body.append(a);}
      </script>`);
  });
  await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{http.closeAllConnections();await new Promise(resolve=>http.close(resolve));await rm(root,{recursive:true,force:true});});
  const initialCookies=[],events=[];
  const run=async(number,password='fixture-password')=>loginBrowser({browserPath:process.env.LOGINOM_DOCK_TEST_BROWSER,
    profile:join(root,'profile-'+number),httpCachePath:join(root,'http-cache'),headless:true,
    candidate:{url:`http://127.0.0.1:${http.address().port}/app/`,username:'user',password},
    // This verifies cache/auth isolation, not Windows runner startup latency.
    // Both successful profiles must have time to launch under parallel CI load.
    deadline:Date.now()+(password==='fixture-password'?20000:3000),
    onContextCreated:async context=>{initialCookies.push((await context.cookies()).length);},onPhase:event=>events.push(event)});
  assert.deepEqual(await run(1),{authenticated:true});
  assert.deepEqual(await run(2),{authenticated:true});
  assert.equal(assets,1);
  assert.deepEqual(initialCookies,[0,0]);assert.deepEqual(cookies,['','']);assert.equal(submits,2);
  const networks=events.filter(e=>e.phase==='login.form.network');
  assert.equal(networks.length,2);assert.equal(networks[1].dropped,0);
  assert.ok(networks[1].completed.some(r=>r.mime==='javascript'&&(r.disk||r.served_cache)));
  await assert.rejects(run(3,'incorrect-password'),/LOGINOM_LOGIN_REJECTED/);
  assert.equal(submits,3);assert.deepEqual(initialCookies,[0,0,0]);assert.deepEqual(cookies,['','','']);
});
