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
