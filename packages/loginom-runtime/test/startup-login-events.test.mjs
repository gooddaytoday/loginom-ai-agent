import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const helper=process.env.STARTUP_SOURCE??new URL('../src/connection-check.mjs',import.meta.url).pathname;
const {loginPage}=await import(pathToFileURL(helper));
function fixture(primary,{success=false,drift=false,registration=false,badGetter=false,flood=false}={}){
 const events=[],page=new EventEmitter();const owner={id:'own',page,evidence:{},deadline:Date.now()+60000};owner.context={pages:()=>[page]};
 const candidate={url:'https://own.invalid/app/?key=secret-query',username:'own',password:'secret-password',apiKey:'secret-key'};
 page.goto=async()=>{events.push('goto');
  const request={resourceType:()=> 'document',url:()=>candidate.url,failure:()=>({errorText:'net::ERR_ABORTED secret-key'})};
  page.emit('response',{request:()=>request,url:()=>candidate.url,status:()=>200});page.emit('domcontentloaded');
  const bad={...request,resourceType:()=> 'script'};
  page.emit('response',{request:()=>bad,url:()=> 'https://foreign.invalid/a?secret=secret-key',status:()=>503});
  page.emit('requestfailed',bad);page.emit('pageerror',Error('secret-password',{cause:0}));page.emit('load');
  if(badGetter)page.emit('pageerror',{get name(){throw false}});
  if(drift){owner.page={};page.emit('load');}
  if(flood)for(let i=0;i<100;i++)page.emit('load');
 };
 page.evaluate=async fn=>{events.push('evaluate');return fn.toString().includes('__loginomStartupV1')?undefined:'own'};
 page.locator=()=>({or(){return this},first(){return this},waitFor:async()=>{events.push('wait');if(!success)throw primary;},isVisible:async()=>true});
 if(registration)page.on=()=>{throw Error('event registration unavailable')};
 return {page,owner,candidate,events};
}
for(const primary of [Error('timeout',{cause:0}),undefined,null,false,0,''])test('original wait refusal exact with bounded passive diagnostics: '+String(primary),async()=>{
 const f=fixture(primary);let caught=false;try{await loginPage(f.page,f.candidate,f.owner)}catch(e){caught=true;assert.equal(e,primary)}
 assert.equal(caught,true);assert.deepEqual(f.events,['goto','evaluate','wait']);
 const trace=f.owner.evidence.login_ui;assert.equal(trace.phase,'waiting_entry');assert.equal(trace.authority,false);assert.equal(trace.observation_closed,true);
 assert.equal(trace.events.length,6);assert.equal(trace.events[0].status,200);assert.equal(trace.events[2].same_origin,false);
 const raw=JSON.stringify(trace);for(const secret of ['secret-query','secret-password','secret-key','foreign.invalid'])assert.equal(raw.includes(secret),false);
 assert.equal(trace.events[4].message_sha256,createHash('sha256').update('secret-password').digest('hex'));
 for(const name of ['response','load','pageerror','requestfailed','domcontentloaded'])assert.equal(f.page.listenerCount(name),0);
});
for(const mode of ['drift','registration','badGetter','flood'])test('diagnostic '+mode+' cannot replace primary or create authority',async()=>{
 const primary=Error('first',{cause:0}),f=fixture(primary,{[mode]:true});
 await assert.rejects(loginPage(f.page,f.candidate,f.owner),e=>e===primary);const t=f.owner.evidence.login_ui;
 assert.equal(t.authority,false);assert.ok(t.events.length<=32);
 if(mode==='drift')assert.equal(t.owner_changed,true);
 if(mode==='registration')assert.equal(t.registration_failed,true);
 if(mode==='badGetter')assert.equal(t.event_read_failed,true);
 if(mode==='flood'){assert.equal(t.events.length,32);assert.equal(t.dropped,74);}
});
test('success keeps normal identity read and stops diagnostic collection',async()=>{
 const f=fixture(null,{success:true});assert.deepEqual(await loginPage(f.page,f.candidate,f.owner),{authenticated:true});
 assert.equal(f.owner.evidence.login_ui.phase,'verified');assert.deepEqual(f.events,['goto','evaluate','wait','evaluate']);
 f.page.emit('load');assert.equal(f.owner.evidence.login_ui.events.length,6);
});

test('script failures have an independent bounded path/error list without query or foreign origin',async()=>{
 const primary=Error('entry timeout',{cause:0}),f=fixture(primary);
 const go=f.page.goto;
 f.page.goto=async()=>{await go();for(let i=0;i<40;i++)f.page.emit('load');
  for(let i=0;i<35;i++)f.page.emit('requestfailed',{resourceType:()=> 'script',url:()=> 'https://own.invalid/app/js/'+i+'.js?token=secret-query#secret-password',failure:()=>({errorText:'net::ERR_UNKNOWN_URL_SCHEME'})});
  f.page.emit('requestfailed',{resourceType:()=> 'script',url:()=> 'https://foreign.invalid/private.js',failure:()=>({errorText:'foreign-error'})});
  f.page.emit('requestfailed',{resourceType:()=> 'image',url:()=> 'https://own.invalid/image.png',failure:()=>({errorText:'image-error'})});
 };
 await assert.rejects(loginPage(f.page,f.candidate,f.owner),e=>e===primary);
 const t=f.owner.evidence.login_ui;assert.equal(t.events.length,32);assert.equal(t.script_failures.length,30);assert.equal(t.script_failures_dropped,6);
 assert.deepEqual(t.script_failures[0].pathname,'/app/');assert.equal(t.script_failures[0].errorText,'net::ERR_ABORTED [REDACTED]');
 assert.equal(t.script_failures[29].pathname,'/app/js/28.js');assert.equal(t.script_failures[29].errorText,'net::ERR_UNKNOWN_URL_SCHEME');
 const raw=JSON.stringify(t.script_failures);for(const secret of ['secret-query','secret-password','secret-key','foreign.invalid','foreign-error','image-error'])assert.equal(raw.includes(secret),false);
 f.page.emit('requestfailed',{resourceType:()=> 'script',url:()=>f.candidate.url,failure:()=>({errorText:'late'})});assert.equal(t.script_failures.length,30);assert.equal(t.script_failures_dropped,6);
});

test('fixed script histogram counts every failure beyond both buffers without adding details',async()=>{
 const primary=Error('entry timeout',{cause:0}),f=fixture(primary),go=f.page.goto;
 const codes=['net::ERR_CERT_VERIFIER_CHANGED','net::ERR_FAILED','net::ERR_CERT_AUTHORITY_INVALID',
  'net::ERR_CERT_COMMON_NAME_INVALID','net::ERR_CERT_DATE_INVALID','net::ERR_CERT_INVALID',
  'net::ERR_SSL_PROTOCOL_ERROR','net::ERR_CONNECTION_RESET'];
 const emit=(errorText,{url='https://own.invalid/private-script.js?key=secret-query',type='script',missing=false}={})=>f.page.emit('requestfailed',{
  resourceType:()=>type,url:()=>url,failure:()=>missing?undefined:{errorText}});
 f.page.goto=async()=>{
  await go();for(let i=0;i<40;i++)f.page.emit('load');
  for(let i=0;i<40;i++)emit('unknown secret-key');
  for(let i=0;i<codes.length;i++)for(let n=0;n<=i;n++)emit(codes[i]);
  emit('net::ERR_FAILED secret-password');emit('',{missing:true});
  emit(codes[0],{url:'https://foreign.invalid/script.js'});emit(codes[1],{type:'image'});
 };
 await assert.rejects(loginPage(f.page,f.candidate,f.owner),e=>e===primary);
 const t=f.owner.evidence.login_ui,h=t.script_failure_histogram;
 assert.deepEqual(Object.keys(h),[...codes,'other']);codes.forEach((code,i)=>assert.equal(h[code],i+1));assert.equal(h.other,43);
 assert.equal(t.events.length,32);assert.equal(t.script_failures.length,30);assert.equal(t.script_failures_dropped,49);
 assert.equal(Object.values(h).reduce((a,b)=>a+b,0),t.script_failures.length+t.script_failures_dropped);
 assert.ok(Object.values(h).every(n=>Number.isInteger(n)&&n>=0));assert.equal(t.authority,false);
 const raw=JSON.stringify(h);for(const value of ['secret-key','secret-password','secret-query','private-script','foreign.invalid','unknown'])assert.equal(raw.includes(value),false);
 const before=JSON.stringify(h);emit(codes[0]);assert.equal(JSON.stringify(h),before);
 assert.deepEqual(f.events,['goto','evaluate','wait']);
});
for(const drift of ['page','context','id'])test('script histogram ignores owner drift: '+drift,async()=>{
 const primary=Error('entry timeout',{cause:0}),f=fixture(primary),go=f.page.goto;
 f.page.goto=async()=>{await go();f.owner[drift]=drift==='id'?'foreign':{};
  f.page.emit('requestfailed',{resourceType:()=> 'script',url:()=>f.candidate.url,failure:()=>({errorText:'net::ERR_CERT_VERIFIER_CHANGED'})});};
 await assert.rejects(loginPage(f.page,f.candidate,f.owner),e=>e===primary);
 const t=f.owner.evidence.login_ui;assert.equal(t.script_failure_histogram['net::ERR_CERT_VERIFIER_CHANGED'],0);
 assert.equal(t.script_failure_histogram.other,1);assert.equal(t.owner_changed,true);assert.equal(t.authority,false);
});
