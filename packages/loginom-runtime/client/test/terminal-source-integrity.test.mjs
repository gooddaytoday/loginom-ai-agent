// Native local Chromium SRI and DOM; offline routing/HTML loader are explicit doubles.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const runtime=process.env.TERMINAL_IIFE_RUNTIME_ROOT?new URL('file://'+process.env.TERMINAL_IIFE_RUNTIME_ROOT+'/'):new URL('../../',import.meta.url);
const {chromium}=await import(new URL('client/node_modules/playwright/index.mjs',runtime));
const {terminalSourceIntegrityScript}=await import(new URL('client/lib/terminal-source-integrity.mjs',runtime));
const pins=JSON.parse(await readFile(new URL('../../../../docs/testing/loginom-ai-agent/terminal-iife-inputs.json',import.meta.url),'utf8')).inputs;
const input=process.env.TERMINAL_IIFE_INPUT_DIR;assert(input);const contents=new Map();
for(const p of pins){const body=await readFile(input+'/'+p.url.split('/').at(-1));assert.equal(body.length,p.bytes);assert.equal(createHash('sha256').update(body).digest('hex'),p.sha256);contents.set(p.url,body)}
const loaderPin=JSON.parse(await readFile(new URL('../../../../docs/testing/loginom-ai-agent/terminal-publisher-inputs.json',import.meta.url),'utf8')).records.find(p=>p.path.endsWith('/Loader.js'));
const loaderBody=await readFile(input+'/Loader.js','utf8');assert.equal(createHash('sha256').update(loaderBody).digest('hex'),loaderPin.sha256);
const order=['__extends.js','__awaiter.js','__helpers.js','mscorlib.js','rtl.imp.js','bg.mscorlib.js','CustomProxyClassBuilder.js','Task.js','rtl.js','rpc.js','bg.rtl.js','bg.rtl.rpc.js','bg.model.js','bg.model.rpc.js','BG_Interfaces.js','__virtual.js','PropertySelector.js','BG_System.js','ServerConnection.js','User.js'];
const browser=await chromium.launch({headless:true});
try{
 for(const mode of ['genuine','loader','mismatch','getter','flags','prototype','root-getter','map-getter','weak-getter','late-src','wrong-query','wrong-hash','preexisting-integrity','duplicate','copy','parser','ordinary'])test('integrity '+mode,{concurrency:false},async t=>{
  const context=await browser.newContext({serviceWorkers:'block'});const requests=[],consoleErrors=[];
  try{
   const page=await context.newPage();page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
   await page.route('**/*',async route=>{
    const url=route.request().url(),canonical=url.split('?')[0];
    if(url==='https://app.loginom.ai/app/integrity-control')return route.fulfill({contentType:'text/html',body:'<!doctype html><script>'+loaderBody+'</script><script>globalThis.Debug=globalThis.debug={assert(){}}</script>'+(mode==='parser'?'<script src="'+pins[0].url+'"></script>':'')});
    const body=contents.get(canonical);assert(body,'unexpected route '+url);requests.push(url);
    return route.fulfill({contentType:'application/javascript',body:mode==='mismatch'&&url.endsWith('/rpc.js')?Buffer.concat([body,Buffer.from('\nwindow.wrongBytesExecuted=true;')]):body});
   });
   if(mode!=='ordinary')await page.addInitScript({content:terminalSourceIntegrityScript()});
   await page.goto('https://app.loginom.ai/app/integrity-control');
   const result=await page.evaluate(async({mode,urls})=>{
    const scripts=[],initialSrc=Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype,'src');let getterCalls=0;const mapDescriptor=Object.getOwnPropertyDescriptor(Map.prototype,'get'),weakDescriptor=Object.getOwnPropertyDescriptor(WeakMap.prototype,'get');
    const load=async(url)=>{
     if(mode==='parser'){scripts.push(document.querySelector('script[src]'));return 'parser-loaded'}
     if(mode==='loader'){await bg.AddScriptAsync(url,false);const node=document.scripts[document.scripts.length-1];scripts.push(node);return 'loaded'}
     const node=document.createElement('script');scripts.push(node);
     if(mode==='wrong-query')url+='?foreign=1';if(mode==='wrong-hash')url+='#foreign';
     if(mode==='preexisting-integrity')node.integrity='sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
     let outcome;try{
      if(mode==='parser'){document.head.insertAdjacentHTML('beforeend','<script src="'+url+'"></script>');return 'parser-inert'}
      if(mode==='late-src'){document.head.appendChild(node);node.src=url;return 'unexpected'}
      const task=new Promise(resolve=>{node.onload=()=>resolve('loaded');node.onerror=()=>resolve('blocked')});
      node.src=url;node.async=false;document.head.appendChild(node);outcome=await task;
     }catch(e){return {error:String(e)}}return outcome;
    };
    const outcomes=[];for(const url of urls){const out=await load(url);outcomes.push(out);if(out!=='loaded')break}
    if(mode==='ordinary')return {outcomes,api:!!globalThis.__loginomOriginalScriptIntegrityV1,integrities:scripts.map(s=>s.integrity)};
    const api=globalThis.__loginomOriginalScriptIntegrityV1,node=scripts[0];
    if(mode==='getter')Object.defineProperty(node,'integrity',{get(){getterCalls++;throw Error('foreign')},configurable:true});
    if(mode==='flags')Object.defineProperty(HTMLScriptElement.prototype,'src',{...initialSrc,enumerable:!initialSrc.enumerable});
    if(mode==='prototype')Object.setPrototypeOf(node,Object.create(Object.getPrototypeOf(node)));
    if(mode==='root-getter')Object.defineProperty(globalThis,'HTMLScriptElement',{get(){getterCalls++;throw Error('foreign')},configurable:true});
    if(mode==='map-getter')Object.defineProperty(Map.prototype,'get',{get(){getterCalls++;throw Error('foreign')},configurable:true});
    if(mode==='weak-getter')Object.defineProperty(WeakMap.prototype,'get',{get(){getterCalls++;throw Error('foreign')},configurable:true});
    if(mode==='duplicate'){try{node.src=urls[0]}catch(e){outcomes.push({error:String(e)})}}
    let receipts,refusal;try{receipts=scripts.map(s=>{const r=(mode==='copy'?{inspect:api.inspect}:api).inspect(s);return {same:r.node===s,document:r.document===document,url:r.url,integrity:r.integrity,armed:r.armedBeforeSource,source:r.sourceExecutionQualified,closure:r.closureIdentityQualified,native:r.nativeAuthority}})}catch(e){refusal=String(e)}
    // Restore fixture globals before Playwright serializes the evidence result.
    if(mode==='map-getter')Object.defineProperty(Map.prototype,'get',mapDescriptor);
    if(mode==='weak-getter')Object.defineProperty(WeakMap.prototype,'get',weakDescriptor);
    return {outcomes,receipts,refusal,getterCalls,wrongBytesExecuted:globalThis.wrongBytesExecuted===true};
   },{mode,urls:order.map(n=>pins.find(p=>p.url.endsWith('/'+n)).url+(mode==='genuine'?'?_dc=123':''))});
   t.diagnostic(JSON.stringify({browser:browser.version(),mode,requests:requests.length,result,consoleErrors}));
   if(mode==='ordinary'){assert.equal(result.api,false);assert(result.integrities.every(v=>v===''));assert(result.outcomes.every(v=>v==='loaded'));return}
   assert.equal(result.getterCalls,0);
   if(['genuine','loader','mismatch'].includes(mode)){
    if(mode==='genuine'||mode==='loader'){assert.equal(result.outcomes.length,20);assert(result.outcomes.every(v=>v==='loaded'));assert.equal(result.receipts.length,20)}
    else{assert.equal(result.outcomes.at(-1),'blocked');assert.equal(result.wrongBytesExecuted,false);assert(consoleErrors.some(m=>/integrity|digest/i.test(m)))}
    assert(result.receipts.every(r=>r.same&&r.document&&r.armed&&!r.source&&!r.closure&&!r.native));
    for(const r of result.receipts){const pin=pins.find(p=>r.url.split('?')[0]===p.url);assert.equal(r.integrity,'sha256-'+Buffer.from(pin.sha256,'hex').toString('base64'))}
   }else{assert.match(result.refusal??'',/TERMINAL_SOURCE_INTEGRITY_UNAVAILABLE/)}
   if(['late-src','wrong-query','wrong-hash','preexisting-integrity'].includes(mode))assert.equal(requests.length,0);
   if(mode==='parser')assert.equal(requests.length,1);
  }finally{await context.close()}
 });
}finally{test.after(()=>browser.close())}
