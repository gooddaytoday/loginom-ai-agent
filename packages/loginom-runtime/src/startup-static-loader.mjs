// Private pre-credential transport. The original script request remains held:
// no body reaches the parser until this same-browser, same-document read settles.
export async function createStartupStaticLoader(page, context, owner, deadline) {
  const identity={id:owner.id,account:owner.account,origin:owner.origin,generation:owner.generation,chat:owner.chat,directory:owner.directory};
  const evidence={version:1,reads:[],stopped:false};
  const pending=new Set(),seen=new Set(),nativeFetchFailures=new WeakSet();
  const key='__loginomStartupStatic_'+owner.id;
  let sealing=false,stopped=false,failed=false,primary,rejectFailure,documentHandle,totalBytes=0,stopping;
  const failure=new Promise((_,reject)=>{rejectFailure=reject});failure.catch(()=>{});
  const fail=error=>{if(!failed){failed=true;primary=error;rejectFailure(error)}};
  const bound=()=>{
    if(!['id','account','origin','directory'].every(k=>typeof identity[k]==='string'&&identity[k].length>0)||stopped||owner.page!==page||owner.context!==context||page.context()!==context||context.pages().length!==1||context.pages()[0]!==page||owner.loginSubmitted===true||Object.keys(identity).some(k=>owner[k]!==identity[k]))
      throw Error('LOGINOM_STARTUP_STATIC_OWNER_CHANGED');
    if(!Number.isSafeInteger(deadline)||Date.now()>=deadline)throw Error('LOGINOM_STARTUP_STATIC_EXPIRED');
  };
  bound();
  await context.addInitScript(({key,origin})=>{if(location.origin===origin)Object.defineProperty(globalThis,key,{value:Object.freeze({document,fetch:globalThis.fetch})})},{key,origin:identity.origin});
  bound();
  const retained=async()=>{
    bound();documentHandle??=page.evaluateHandle(key=>globalThis[key],key);
    const h=await documentHandle;bound();
    if(!await page.evaluate(({h,origin})=>h.document===document&&location.origin===origin&&location.pathname==='/app/',{h,origin:identity.origin}))
      throw Error('LOGINOM_STARTUP_STATIC_DOCUMENT_CHANGED');
    bound();return h;
  };
  const read=async(url,h)=>{
    bound();
    const value=await page.evaluate(async({url,h,origin,deadline})=>{
      if(h.document!==document||location.origin!==origin)throw Error('LOGINOM_STARTUP_STATIC_DOCUMENT_CHANGED');
      const controller=new AbortController(),remaining=deadline-Date.now();
      if(remaining<=0)throw Error('LOGINOM_STARTUP_STATIC_EXPIRED');
      const timer=setTimeout(()=>controller.abort(),remaining);
      try {
        let r;
        try{r=await h.fetch.call(globalThis,url,{method:'GET',credentials:'omit',redirect:'error',signal:controller.signal})}
        catch(error){
          const rejection=(v,depth=0)=>{
            if(v&&typeof v.name==='string'&&typeof v.message==='string')return {kind:'Error',name:v.name,message:v.message,...(depth<8&&Object.hasOwn(v,'cause')?{cause:rejection(v.cause,depth+1)}:{})};
            return {kind:'value',value:v,is_undefined:v===undefined};
          };
          return {fetch_failed:true,rejection:rejection(error)};
        }
        if(h.document!==document||location.origin!==origin||Date.now()>=deadline)throw Error('LOGINOM_STARTUP_STATIC_DOCUMENT_CHANGED');
        if(r.status!==200||r.redirected||r.url!==url)throw Error('LOGINOM_STARTUP_STATIC_RESPONSE_REFUSED');
        const mime=r.headers.get('content-type');
        if(!mime||!/^\s*(?:application|text)\/(?:x-)?(?:javascript|ecmascript)(?:;|\s|$)/i.test(mime))throw Error('LOGINOM_STARTUP_STATIC_TYPE_REFUSED');
        if(Number(r.headers.get('content-length'))>8*1024*1024)throw Error('LOGINOM_STARTUP_STATIC_SIZE_REFUSED');
        const chunks=[],reader=r.body.getReader();let bytes=0;
        try {
          for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>8*1024*1024)throw Error('LOGINOM_STARTUP_STATIC_SIZE_REFUSED');chunks.push(value)}
        }finally{reader.releaseLock()}
        if(h.document!==document||location.origin!==origin||Date.now()>=deadline)throw Error('LOGINOM_STARTUP_STATIC_DOCUMENT_CHANGED');
        let binary='';for(const chunk of chunks)for(let i=0;i<chunk.length;i+=32768)binary+=String.fromCharCode(...chunk.subarray(i,i+32768));
        return {body:btoa(binary),mime,bytes};
      } finally {clearTimeout(timer)}
    },{url,h,origin:identity.origin,deadline});
    bound();await retained();
    if(value?.fetch_failed===true){
      const restore=r=>{
        if(r.kind==='value')return r.is_undefined?undefined:r.value;
        const error=new Error(r.message,Object.hasOwn(r,'cause')?{cause:restore(r.cause)}:undefined);error.name=r.name;return error;
      };
      const error=restore(value.rejection);
      if(value.rejection.kind==='Error'&&value.rejection.name==='TypeError')nativeFetchFailures.add(error);
      throw error;
    }
    if(!value||typeof value.body!=='string'||typeof value.mime!=='string'||!Number.isSafeInteger(value.bytes)||value.bytes<0||value.bytes>8*1024*1024||
      value.body.length>Math.ceil(8*1024*1024/3)*4||value.body.length%4!==0||
      Buffer.from(value.body,'base64').length!==value.bytes||Buffer.from(value.body,'base64').toString('base64')!==value.body||
      !/^\s*(?:application|text)\/(?:x-)?(?:javascript|ecmascript)(?:;|\s|$)/i.test(value.mime))throw Error('LOGINOM_STARTUP_STATIC_RESULT_REFUSED');
    return value;
  };
  const handler=async route=>{
    const request=route.request();const url=new URL(request.url());
    const eligible=request.resourceType()==='script'&&request.method()==='GET'&&url.origin===identity.origin&&!url.username&&!url.password&&!url.search&&!url.hash&&
      /^\/app\/(bg|ext|thirdparty)\/[A-Za-z0-9_./-]+\.js$/.test(url.pathname)&&!url.pathname.split('/').includes('..')&&request.frame()===page.mainFrame();
    if(sealing||stopped||!eligible){await route.continue();return}
    bound();if(seen.has(url.href)){await route.continue();return}if(seen.size>=1024)throw Error('LOGINOM_STARTUP_STATIC_LIMIT');seen.add(url.href);
    const item={pathname:url.pathname,attempts:0,completed:false};evidence.reads.push(item);
    const h=await retained();
    let witness=false,firstFailed=false,first;
    const failedRequest=r=>{
      try{if(r.url()===url.href&&r.resourceType()==='fetch'&&r.method()==='GET'&&r.frame()===page.mainFrame()&&r.failure()?.errorText==='net::ERR_CERT_VERIFIER_CHANGED')witness=true}catch(error){fail(error)}
    };
    page.on('requestfailed',failedRequest);
    let value;
    try {
      item.attempts++;try{value=await read(url.href,h)}catch(error){firstFailed=true;first=error}
      if(firstFailed){
        if(!witness||!nativeFetchFailures.has(first))throw first;
        item.certificate_change=true;bound();await retained();item.attempts++;
        try{value=await read(url.href,h)}catch(error){item.secondary_refused=true;throw first}
      }
      bound();await retained();totalBytes+=value.bytes;
      if(totalBytes>128*1024*1024)throw Error('LOGINOM_STARTUP_STATIC_TOTAL_SIZE_REFUSED');
      await route.fulfill({status:200,contentType:value.mime,body:Buffer.from(value.body,'base64')});
      bound();item.completed=true;item.bytes=value.bytes;
    }finally{page.off('requestfailed',failedRequest)}
  };
  const routed=route=>{
    const job=handler(route).catch(async error=>{fail(error);try{await route.abort('failed')}catch{}});
    pending.add(job);job.finally(()=>pending.delete(job));return job;
  };
  await page.route(identity.origin+'/app/**',routed);bound();
  return {evidence,failure,stop(){return stopping??=(async()=>{
    if(stopped){if(failed)throw primary;return}
    sealing=true;while(pending.size)await Promise.all([...pending]);
    try{await page.unroute(identity.origin+'/app/**',routed)}catch(error){if(!failed)throw error;evidence.unroute_refused=true}
    if(!failed){bound();if(documentHandle)await retained();bound()}
    if(documentHandle){try{const h=await documentHandle;await h.dispose()}catch(error){if(!failed)throw error}}
    if(!failed)bound();stopped=true;evidence.stopped=true;if(failed)throw primary;
  })()}};
}
