import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {runInNewContext} from 'node:vm';
import {createStartupStaticLoader} from '../src/startup-static-loader.mjs';
const url='https://own.invalid/app/bg/ts/PropertySelector.js';
async function fixture(options={}) {
 const frame={},other={},calls=[],routes=[],doc={};let reads=0,disposed=false;
 const page=new EventEmitter(),owner={id:'original',account:'account',origin:'https://own.invalid',generation:1,chat:'original',directory:'original'};
 const realm={document:doc,location:{origin:owner.origin,pathname:'/app/'},AbortController,setTimeout,clearTimeout,Date,btoa};
 const request=(u=url,type='script',method='GET',f=frame,witness=null)=>({url:()=>u,resourceType:()=>type,method:()=>method,frame:()=>f,failure:()=>({errorText:witness})});
 realm.fetch=async(u,input)=>{
  const pointer=request(u,'fetch');page.emit('request',pointer);calls.push({url:u,input,pointer});const i=reads++;
  const result=options.results?.[i];
  if(result?.witness)page.emit('requestfailed',request(result.witness_url??u,'fetch','GET',result.foreign_frame?other:frame,result.witness));
  options.afterFetch?.(i,{owner,realm,page});
  if(result&&Object.hasOwn(result,'reject'))throw result.reject;
  return new Response(result?.body??'globalThis.loadedOnce=true;',{status:result?.status??200,headers:{'Content-Type':result?.mime??'application/javascript'}});
 };
 const invoke=(fn,arg)=>runInNewContext('('+fn.toString()+')',realm)(arg);
 const context={pages:()=>[page],addInitScript:async(fn,arg)=>invoke(fn,arg)};
 page.context=()=>context;page.mainFrame=()=>frame;
 page.evaluateHandle=async(fn,arg)=>({value:invoke(fn,arg),dispose:async()=>{disposed=true}});
 page.evaluate=async(fn,arg)=>{
  if(fn.toString().includes('async')&&options.transport_reject_present){options.transportHook?.({page,request});throw options.transport_reject;}
  const value=await invoke(fn,arg?.h?{...arg,h:arg.h.value}:arg);
  // Native Response.url is populated by HTTP; this fixture does not claim TLS.
  return value;
 };
 // Model the same fixed verified URL. All browser functions run serialized.
 const nativeFetch=realm.fetch;realm.fetch=async(u,input)=>{
  const r=await nativeFetch(u,input);Object.defineProperty(r,'url',{value:options.response_url??u});return r;
 };
 page.route=async(pattern,fn)=>{routes.push({pattern,fn})};page.unroute=async()=>{};
 owner.page=page;owner.context=context;
 const loader=await createStartupStaticLoader(page,context,owner,options.deadline??Date.now()+60000);
 const route=(r=request())=>({request:()=>r,continue:async()=>{calls.push({continue:true})},abort:async()=>{calls.push({abort:true})},fulfill:async input=>{calls.push({fulfill:input});options.afterFulfill?.({owner,realm})}});
 const invokeRoute=async(r=route())=>{await routes[0].fn(r);return r};
 return {page,owner,realm,request,route,loader,calls,invokeRoute,disposed:()=>disposed};
}
test('serialized original document read holds script, omits credentials and redirects, and fulfills exact bytes once',async()=>{
 const f=await fixture();await f.invokeRoute();await f.loader.stop();
 const read=f.calls.find(x=>x.input);assert.equal(read.input.credentials,'omit');assert.equal(read.input.redirect,'error');assert.equal(read.input.method,'GET');
 const filled=f.calls.filter(x=>x.fulfill);assert.equal(filled.length,1);assert.equal(filled[0].fulfill.body.toString(),'globalThis.loadedOnce=true;');assert.equal(f.disposed(),true);assert.equal(f.loader.evidence.stopped,true);
});
test('only exact original certificate-change witness permits one static retry',async()=>{
 const first=new TypeError('first');const f=await fixture({results:[{reject:first,witness:'net::ERR_CERT_VERIFIER_CHANGED'},{}]});await f.invokeRoute();await f.loader.stop();
 assert.equal(f.calls.filter(x=>x.input).length,2);assert.equal(f.calls.filter(x=>x.fulfill).length,1);assert.equal(f.loader.evidence.reads[0].attempts,2);
});
for(const value of [Error('first'),undefined,null,false,0,''])test('original rejection and cached stop preserve '+String(value),async()=>{
 const f=await fixture({transport_reject_present:true,transport_reject:value});await f.invokeRoute();let caught=false,result;try{await f.loader.stop()}catch(e){caught=true;result=e};assert.equal(caught,true);assert.equal(result,value);assert.equal(f.calls.filter(x=>x.input).length,0);assert.equal(f.calls.some(x=>x.fulfill),false);
});
for(const options of [
 {witness:'net::ERR_FAILED'},{witness:'net::ERR_CERT_AUTHORITY_INVALID'},
 {witness:'net::ERR_CERT_VERIFIER_CHANGED',witness_url:'https://foreign.invalid/a.js'},
 {witness:'net::ERR_CERT_VERIFIER_CHANGED',foreign_frame:true},
])test('wrong transport witness never retries '+JSON.stringify(options),async()=>{
 const first=new TypeError('first');const f=await fixture({results:[{reject:first,...options}]});await f.invokeRoute();await assert.rejects(f.loader.stop(),e=>e.name==='TypeError'&&e.message==='first');assert.equal(f.calls.filter(x=>x.input).length,1);
});
test('secondary refusal retains first certificate TypeError without third read or script fulfillment',async()=>{
 const first=new TypeError('first');const f=await fixture({results:[{reject:first,witness:'net::ERR_CERT_VERIFIER_CHANGED'},{reject:Error('secondary')}]});await f.invokeRoute();await assert.rejects(f.loader.stop(),e=>e.name==='TypeError'&&e.message==='first');assert.equal(f.calls.filter(x=>x.input).length,2);assert.equal(f.calls.some(x=>x.fulfill),false);
});
for(const key of ['id','account','origin','generation','chat','directory','page','context'])test('owner '+key+' drift after awaited fetch refuses before body dispatch',async()=>{
 const f=await fixture({afterFetch:(_,s)=>{s.owner[key]='foreign'}});await f.invokeRoute();await assert.rejects(f.loader.stop(),/OWNER_CHANGED/);assert.equal(f.calls.some(x=>x.fulfill),false);
});
test('same-url document replacement is refused by the original opaque handle',async()=>{
 const f=await fixture({afterFetch:(_,s)=>{s.realm.document={}}});await f.invokeRoute();await assert.rejects(f.loader.stop(),/DOCUMENT_CHANGED/);assert.equal(f.calls.some(x=>x.fulfill),false);
});
for(const change of [{status:403},{mime:'text/html'},{response_url:'https://foreign.invalid/a.js'}])test('non-script/foreign/refused response '+JSON.stringify(change),async()=>{
 const f=await fixture({response_url:change.response_url,results:[change]});await f.invokeRoute();await assert.rejects(f.loader.stop());assert.equal(f.calls.some(x=>x.fulfill),false);
});
test('expired original budget performs no browser fetch',async()=>{
 await assert.rejects(fixture({deadline:Date.now()-1}),/EXPIRED/);
});
for(const [u,type,method] of [[url+'?token=private','script','GET'],['https://foreign.invalid/app/bg/a.js','script','GET'],['https://own.invalid/app/GetCredential','fetch','GET'],[url,'script','POST'],['https://own.invalid/app/bg/a.css','stylesheet','GET']])test('unqualified route stays ordinary '+type+' '+method+' '+u,async()=>{
 const f=await fixture();await f.invokeRoute(f.route(f.request(u,type,method)));await f.loader.stop();assert.equal(f.calls.some(x=>x.input||x.fulfill),false);assert.equal(f.calls.filter(x=>x.continue).length,1);
});
test('duplicate ordinary request is not replayed by the loader',async()=>{
 const f=await fixture();await f.invokeRoute();await f.invokeRoute();await f.loader.stop();assert.equal(f.calls.filter(x=>x.input).length,1);assert.equal(f.calls.filter(x=>x.continue).length,1);
});

test('large real bootstrap script is validated without a recursive base64 regex',async()=>{
 const body=' '.repeat(4652531);const f=await fixture({results:[{body}]});await f.invokeRoute();await f.loader.stop();assert.equal(f.calls.find(x=>x.fulfill).fulfill.body.length,body.length);
});

test('a transport TypeError remains unknown even beside a matching certificate event',async()=>{
 const first=new TypeError('transport');const f=await fixture({transport_reject_present:true,transport_reject:first,transportHook:({page,request})=>page.emit('requestfailed',request(url,'fetch','GET',undefined,'net::ERR_CERT_VERIFIER_CHANGED'))});
 await f.invokeRoute();await assert.rejects(f.loader.stop(),e=>e===first);assert.equal(f.calls.some(x=>x.input||x.fulfill),false);
});
test('captured native fetch is retained if the page later changes global fetch',async()=>{
 const f=await fixture();f.realm.fetch=()=>{throw Error('foreign global fetch must not be called')};await f.invokeRoute();await f.loader.stop();assert.equal(f.calls.filter(x=>x.fulfill).length,1);
});
test('additional page refuses before reading',async()=>{
 const f=await fixture();f.owner.context.pages=()=>[f.page,{}];await f.invokeRoute();await assert.rejects(f.loader.stop(),/OWNER_CHANGED/);assert.equal(f.calls.some(x=>x.input||x.fulfill),false);
});

test('unknown cleanup reply is cached; stop does not replay unroute',async()=>{
 const f=await fixture();let attempts=0;const first=Error('unknown unroute');f.owner.context.pages=()=>[f.page];f.page.unroute=async()=>{attempts++;throw first};await f.invokeRoute();await assert.rejects(f.loader.stop(),e=>e===first);await assert.rejects(f.loader.stop(),e=>e===first);assert.equal(attempts,1);
});

test('native fetch refusal retains its original error and cause across serialization',async()=>{
 const first=new TypeError('native first',{cause:Error('native cause')});const f=await fixture({results:[{reject:first,witness:'net::ERR_CERT_VERIFIER_CHANGED'},{reject:Error('later')}]});await f.invokeRoute();await assert.rejects(f.loader.stop(),e=>e.name==='TypeError'&&e.message==='native first'&&e.cause.message==='native cause');
});

test('diagnostic classification uses the original owned request object',async()=>{
 const f=await fixture();await f.invokeRoute();assert.equal(f.loader.owns(f.calls.find(x=>x.input).pointer),true);assert.equal(f.loader.owns(f.request(url,'fetch')),false);await f.loader.stop();
});

test('first route evidence is absent before a route is observed',async()=>{
 const f=await fixture();assert.equal(Object.hasOwn(f.loader.evidence,'first_route'),false);await f.loader.stop();
});

test('first route evidence distinguishes entry from awaited continue without copying request data',async()=>{
 const f=await fixture(),r=f.route(f.request('https://own.invalid/app/?private=must-not-copy','document'));
 let release;r.continue=()=>new Promise(resolve=>{release=resolve});
 const job=f.invokeRoute(r),first=f.loader.evidence.first_route;
 assert.deepEqual(Object.keys(first).sort(),['continued_at','eligible','entered_at','resource_type']);
 assert.equal(Number.isFinite(Date.parse(first.entered_at)),true);assert.equal(first.resource_type,'document');assert.equal(first.eligible,false);assert.equal(first.continued_at,null);
 assert.equal(JSON.stringify(first).includes('private'),false);assert.equal(JSON.stringify(first).includes('own.invalid'),false);
 // Completion of a later ordinary route must not timestamp the first one.
 await f.invokeRoute(f.route(f.request('https://own.invalid/app/GetCredential','xhr')));
 assert.equal(f.loader.evidence.first_route,first);assert.equal(first.continued_at,null);
 release();await job;assert.equal(Number.isFinite(Date.parse(first.continued_at)),true);assert.ok(Date.parse(first.continued_at)>=Date.parse(first.entered_at));
 await f.loader.stop();
});

test('first route evidence for a held eligible script never claims an ordinary continue',async()=>{
 const f=await fixture();await f.invokeRoute();const first=f.loader.evidence.first_route,snapshot=structuredClone(first);
 assert.equal(first.resource_type,'script');assert.equal(first.eligible,true);assert.equal(first.continued_at,null);assert.equal(f.calls.filter(x=>x.fulfill).length,1);
 await f.invokeRoute(f.route(f.request('https://own.invalid/app/','document')));
 assert.equal(f.loader.evidence.first_route,first);assert.deepEqual(first,snapshot);await f.loader.stop();
});

for(const rejection of [Error('continue refused'),undefined])test('first route evidence keeps continue null on original rejection '+String(rejection),async()=>{
 const f=await fixture(),r=f.route(f.request('https://own.invalid/app/','document'));r.continue=async()=>{throw rejection};await f.invokeRoute(r);
 assert.equal(f.loader.evidence.first_route.continued_at,null);assert.equal(f.loader.evidence.first_route.eligible,false);
 let caught=false,value;try{await f.loader.stop()}catch(error){caught=true;value=error};assert.equal(caught,true);assert.equal(value,rejection);assert.equal(f.calls.filter(x=>x.abort).length,1);
});

test('first route evidence reports the existing foreign-frame classification without a fetch',async()=>{
 const f=await fixture();await f.invokeRoute(f.route(f.request(url,'script','GET',{})));
 assert.equal(f.loader.evidence.first_route.resource_type,'script');assert.equal(f.loader.evidence.first_route.eligible,false);assert.equal(Number.isFinite(Date.parse(f.loader.evidence.first_route.continued_at)),true);
 assert.equal(f.calls.some(x=>x.input||x.fulfill),false);assert.equal(f.calls.filter(x=>x.continue).length,1);await f.loader.stop();
});
