import {constants} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,mkdir,writeFile,mkdtemp,rm,rename,open,unlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
const path=process.env.STARTUP_SOURCE??new URL('../src/connection-check.mjs',import.meta.url);
const source=await readFile(path,'utf8');
const code=source.slice(source.indexOf('export function browserEnvironment')).replaceAll('export ','');
function fixture(directory,phase,rejected){
 const events=[],document={querySelectorAll:()=>[]},connection={Connected:false,UserName:'user'};
 const pageState=vm.createContext({document,location:{href:'about:blank',origin:'null'},getComputedStyle:()=>({visibility:'visible'}),Error});
 const native=()=>{pageState.bg={app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:connection,PackageNodes:{Count:phase==='packages'?1:0},HasRunningNodes:()=>false}}}}}}};
 const owner={directory};let logout=0,contextClose=0;
 const page={
  async goto(){events.push('goto');if(phase==='goto')throw rejected;pageState.location={href:'https://loginom.invalid/app',origin:'https://loginom.invalid'};native()},
  async evaluate(fn,arg){
   if(fn.toString().includes('?? null') && ['identity','identity-write'].includes(phase)){
    if(phase==='identity-write')await mkdir(join(directory,'startup-cleanup.json'));
    throw rejected;
   }
   return vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',pageState);
  },
  locator(selector){
   const avatar=selector.includes('btnAvatar'),logoutButton=selector.includes('btnLogOut'),loginButton=selector.includes('btnLogin');
   return {locator(){return this},or(){return this},first(){return this},fill:async()=>{},inputValue:async()=>'',innerText:async()=>connection.UserName,
    async isVisible(){return avatar?connection.Connected:true},
    async waitFor(){if(phase==='login-reply'&&avatar)throw rejected},
    async click(){if(loginButton){events.push('login');connection.Connected=true;if(phase==='mismatch')connection.UserName='foreign'}
     if(logoutButton){events.push('native-logout');logout++;if(phase==='logout')throw rejected;connection.Connected=false;if(phase==='lost-reply')throw rejected}}
   };
  }
 };
 const context={pages:()=>phase==='page'?[]:[page],newPage:async()=>{if(phase==='page')throw rejected;return page},
  async addInitScript(){events.push('init');this.inspect?.();if(phase==='init')throw rejected},
  async close(){events.push('context-close');contextClose++;const proof=JSON.parse(await readFile(join(directory,'startup-cleanup.json'),'utf8'));
   assert.ok(proof.native.logged_out||proof.native.unauthenticated);if(phase==='context')throw rejected;
   if(phase==='context-write'){await rename(join(directory,'startup-cleanup.json'),join(directory,'startup-cleanup.prior'));await mkdir(join(directory,'startup-cleanup.json'))}}
 };
 class Client {async connect(){events.push('knowledge');if(phase==='knowledge')throw rejected}async close(){events.push('knowledge-close');if(phase==='knowledge-close')throw rejected}}
 const require=name=>{if(phase==='require'||phase==='knowledge-require')throw rejected;return name==='playwright-core'?{chromium:{async launchPersistentContext(){events.push('launch');if(phase==='launch')throw rejected;return context}}}:
  name.includes('streamableHttp')?{StreamableHTTPClientTransport:class{}}:{Client}};
 const functions=vm.runInNewContext(code+';({loginBrowser,checkConnection})',{require,mkdir,open,rename,unlink,constants,writeFile,readFile,createHash,runtimeModulePath:path instanceof URL?path.pathname:path,join,dirname,randomUUID,URL,process,Error,setTimeout,clearTimeout,
  browserLaunch:()=>({args:[],viewport:{}}),browserDownloadScript:()=>''});
 const options={profile:directory,browserPath:'/fixture',candidate:{url:'https://loginom.invalid/app',username:'user',password:'',apiKey:'fixture'},endpoint:'https://knowledge.invalid',owner};
 return {owner,options,functions,events,context,page,logout:()=>logout,contextClose:()=>contextClose};
}
// Production close/login/identity and durable cleanup execute; native Page and
// account menu transitions are doubles, not native logout acceptance.
for(const mode of ['visible','closed-after-identity','still-hidden','avatar-error','logout-lost-reply','page-changed'])test('validation logout bounded menu recovery '+mode,async()=>{
 const root=await mkdtemp(join(tmpdir(),'startup-menu-')),f=fixture(root);
 const locator=f.page.locator.bind(f.page),evaluate=f.page.evaluate.bind(f.page);
 let menu=false,avatars=0,logouts=0,visibleChecks=0;const original=Error(mode,{cause:0});
 f.page.evaluate=async(fn,arg)=>{const result=await evaluate(fn,arg);if(fn.toString().includes('return own?.document')&&mode!=='visible')menu=false;return result;};
 f.page.locator=selector=>{const h=locator(selector);
  if(selector.includes('btnAvatar')){const click=h.click;h.click=async opts=>{assert.equal(opts.timeout,8000);avatars++;if(avatars===2&&mode==='avatar-error')throw original;menu=!(avatars===2&&mode==='still-hidden');return click(opts)};}
  if(selector.includes('btnLogOut')){const click=h.click;h.isVisible=async()=>{visibleChecks++;return menu};h.click=async opts=>{assert.equal(opts.timeout,8000);logouts++;if(!menu)throw original;if(mode==='logout-lost-reply'){await click(opts);throw original;}return click(opts)};}
  return h;
 };
 if(mode==='page-changed')f.context.pages=()=>[];
 try{
  if(['visible','closed-after-identity'].includes(mode)){const r=await f.functions.checkConnection(f.options);assert.equal(r.authenticated,true);assert.equal(f.owner.receipt.logged_out,true);assert.equal(f.owner.receipt.context_closed,true);assert.equal(logouts,1);assert.equal(avatars,mode==='visible'?1:2);assert.equal(visibleChecks,1);}
  else {await assert.rejects(f.functions.checkConnection(f.options));const before={avatars,logouts};await assert.rejects(f.owner.close());assert.deepEqual({avatars,logouts},before);if(mode==='page-changed'){assert.equal(avatars,0);assert.equal(logouts,0)}else {assert.equal(avatars,2);assert.equal(logouts,mode==='avatar-error'?0:1);assert.equal(f.owner.nativeFailure.value,original);}}
 }finally{await rm(root,{recursive:true,force:true})}
});

for(const observationFails of [false,true])test('logout visible gate then unstable/hidden timeout preserves original rejection; observation failure '+observationFails,async()=>{
 const root=await mkdtemp(join(tmpdir(),'startup-menu-observe-')),f=fixture(root);
 const locator=f.page.locator.bind(f.page);let avatars=0,logouts=0,visibleReads=0,boxReads=0,menuReads=0;
 const original=Object.assign(Error('locator.click: Timeout 8000ms exceeded. element is not stable; element is not visible',{cause:0}),{name:'TimeoutError'});
 const observationError=Error('box observation failed',{cause:0});
 f.page.locator=selector=>{const h=locator(selector);
  if(selector.includes('btnAvatar')){const click=h.click;h.click=async opts=>{avatars++;return click(opts)};}
  if(selector.includes('btnLogOut')){
   h.isVisible=async()=>{visibleReads++;return visibleReads===1};
   h.boundingBox=async()=>{boxReads++;if(observationFails)throw observationError;return null};
   h.click=async opts=>{assert.equal(opts.timeout,8000);logouts++;assert.equal(f.owner.evidence.logout_gate_visible,true);throw original};
  }else if(selector==='[data-tid="MF;AppMenuForm"]')h.isVisible=async()=>{menuReads++;return false};
  return h;
 };
 try{
  await assert.rejects(f.functions.checkConnection(f.options));assert.equal(f.owner.nativeFailure.value,original);
  const before={avatars,logouts,visibleReads,boxReads,menuReads};await assert.rejects(f.owner.close());assert.deepEqual({avatars,logouts,visibleReads,boxReads,menuReads},before);
  assert.equal(avatars,1);assert.equal(logouts,1);assert.equal(visibleReads,2);assert.equal(boxReads,1);assert.equal(menuReads,1);
  const evidence=JSON.parse(await readFile(join(root,'startup-cleanup.json'),'utf8'));
  assert.equal(evidence.logout_gate_visible,true);assert.equal(evidence.cleanup_complete,false);assert.equal(evidence.native_failure.rejection.message,original.message);assert.equal(evidence.native_failure.rejection.cause.value,0);
  const stages=evidence.stages.filter(x=>x.stage==='native_logout');assert.equal(stages.length,1);
  const post=stages[0].post_timeout_observation;assert.equal(post.logout_visible,false);assert.equal(post.logout_bounding_box,null);assert.equal(post.menu_visible,false);
  if(observationFails){assert.equal(post.observation_rejections.length,1);assert.equal(post.observation_rejections[0].field,'logout_bounding_box');assert.equal(post.observation_rejections[0].rejection.message,observationError.message);assert.equal(post.observation_rejections[0].rejection.cause.value,0)}else assert.equal(post.observation_rejections,undefined);
 }finally{await rm(root,{recursive:true,force:true})}
});
