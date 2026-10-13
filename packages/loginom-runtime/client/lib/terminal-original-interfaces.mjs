// Fixed private same-Page/typed-handle component; never a tool or Save grant.
export function retainTerminalOriginalInterfaces({original, current, definitions, sourceInputs,
  signal, deadline, record, now = Date.now}) {
  const refuse = (message, cause) => {throw new Error('TERMINAL_INTERFACE_'+message, {cause});};
  const data = (object, key) => {
    for (let p=object; p; p=Object.getPrototypeOf(p)) {
      const d=Object.getOwnPropertyDescriptor(p,key);
      if (d) {if (!('value' in d)) refuse('ACCESSOR'); return d.value;}
    }
    refuse('MISSING_'+key);
  };
  const keys=['owner','run','lease','generation','chat','document','account','session','page','context',
    'packageNode','tab','packageProxy','currentUser','fileStorage','nativeSession','operation','gate'];
  if (!original || typeof current!=='function' || typeof record!=='function'
    || keys.some(k=>data(original,k)===undefined||data(original,k)===null)
    || !Number.isSafeInteger(data(original,'generation')) || data(original,'generation')<0
    || signal!==data(original,'signal') || deadline!==data(original,'deadline')
    || !Number.isFinite(deadline) || typeof signal?.throwIfAborted!=='function') refuse('ORIGINAL_INPUT');
  const retained=Object.fromEntries(keys.map(k=>[k,data(original,k)]));
  const originalRefusal=data(original,'refusal');
  const expected={
    'rpc.js':'afeb91811a02da1f7841fb8c03e3003686c98a051f09186af082a3c44a12b4cc',
    'bg.rtl.js':'052ec6039e68de03f2e34fea56c3e3ed8b7b0dddadb03281ff8d9a816e6e5dc9',
    'bg.rtl.rpc.js':'11ac2c63d2e8162b974f57d14e0f4f57b19cc80d3d39797be377e22eced6a973',
  };
  const sources=Object.fromEntries(Object.keys(expected).map(k=>[k,data(sourceInputs,k)]));
  if(Object.values(sources).some(s=>typeof s!=='string'))refuse('SOURCE_INPUT');
  const type=data(definitions,'StreamPersist');
  const query=data(data(definitions,'ObjectProxyPrototype'),'QueryInterface');
  const proto=data(definitions,'FileStoragePrototype');
  const methods=['get_Connected','get_CurrentDirectory','get_IsOwnCurrentDirectory','get_RootPath'];
  const readers=Object.fromEntries(methods.map(k=>[k,data(proto,k)]));
  const supportPrototype=data(definitions,'StreamPersistPrototype');
  const supportMethod=data(supportPrototype,'SaveToStream');
  if (typeof query!=='function'||methods.some(k=>typeof readers[k]!=='function')||!type) refuse('DEFINING_EXPORT');
  const proxyBindings=[retained.packageProxy,retained.fileStorage,retained.currentUser].map(proxy=>{
    const native=data(proxy,'$'), session=data(proxy,'$S');
    const owner=data(native,'$OW'), id=data(native,'$O');
    if (!Number.isInteger(owner)||owner<0||!Number.isInteger(id)||id<0||!session) refuse('DISCONNECTED');
    return {proxy,native,session,owner,id};
  });
  if (typeof supportMethod!=='function'||proxyBindings.some(p=>p.session!==retained.nativeSession)) refuse('FOREIGN_PROXY_SESSION');
  const nativeDependencies=Object.fromEntries(['$M','$R','DispatchMessageAsync'].map(k=>[k,data(retained.nativeSession,k)]));
  const packageDependencies=Object.fromEntries(['$II','$GetProxyMetaClass'].map(k=>[k,data(retained.packageProxy,k)]));
  let readPromise, writePromise, facts, token, ended=false, readState='not_started', writeState='not_started';
  let failed=false, primary; const secondary=[];
  const check=()=>{
    if (ended) refuse('ENDED'); signal.throwIfAborted();
    if (now()>=deadline) refuse('DEADLINE');
    const c=current();
    if (!c || keys.some(k=>data(c,k)!==retained[k])||data(c,'signal')!==signal||data(c,'deadline')!==deadline
      || !Object.is(data(c,'refusal'),originalRefusal)
      || ['pending','running','unknown','writerPending','dirty','targetSelected'].some(k=>data(c,k)!==false)) refuse('CUSTODY');
    if (data(definitions,'StreamPersist')!==type||data(definitions,'FileStoragePrototype')!==proto
      || data(definitions,'StreamPersistPrototype')!==supportPrototype
      || data(data(definitions,'ObjectProxyPrototype'),'QueryInterface')!==query
      || data(retained.packageProxy,'QueryInterface')!==query
      || data(supportPrototype,'SaveToStream')!==supportMethod
      || methods.some(k=>data(proto,k)!==readers[k]||data(retained.fileStorage,k)!==readers[k])
      || Object.keys(expected).some(k=>data(sourceInputs,k)!==sources[k])) refuse('DEFINING_REPLACED');
    if(Object.keys(nativeDependencies).some(k=>data(retained.nativeSession,k)!==nativeDependencies[k])
      ||Object.keys(packageDependencies).some(k=>data(retained.packageProxy,k)!==packageDependencies[k]))refuse('ORIGINAL_DEPENDENCY');
    for (const b of proxyBindings) if (data(b.proxy,'$')!==b.native||data(b.proxy,'$S')!==b.session
      ||data(b.native,'$OW')!==b.owner||data(b.native,'$O')!==b.id) refuse('NATIVE_REPLACED');
    return true;
  };
  check();
  const read=()=>{
    if (readPromise) {
      try {check();} catch(error) {if(failed){secondary.push(error);return readPromise;}throw error;}
      return readPromise;
    }
    check(); readState='pending';
    // Store work before any original method/continuation can re-enter.
    readPromise=Promise.resolve().then(async()=>{
      for(const [name,hash] of Object.entries(expected)) {
        const bytes=new TextEncoder().encode(sources[name]);
        const actual=[...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
        check(); if(actual!==hash)refuse('SOURCE_PIN',name);
      }
      check();const connected=await readers.get_Connected.call(retained.fileStorage);check();
      if(connected!==true)refuse('DISCONNECTED',connected);
      const support=await query.call(retained.packageProxy,type); check();
      // A returned raw proxy is retained, never reconstructed from IDs or sent
      // across public IPC. Its interface reply is not a serializer/content proof.
      if (!support || typeof support!=='object') refuse('SUPPORT_UNKNOWN',support);
      const native=data(support,'$');
      if(data(support,'$S')!==proxyBindings[0].session||data(native,'$OW')!==proxyBindings[0].owner
        ||data(native,'$O')!==proxyBindings[0].id||data(support,'SaveToStream')!==supportMethod)refuse('FOREIGN_INTERFACE');
      proxyBindings.push({proxy:support,native,session:retained.nativeSession,owner:proxyBindings[0].owner,id:proxyBindings[0].id});
      const observed={get_Connected:connected};
      for(const method of methods.slice(1)) {
        check();observed[method]=await readers[method].call(retained.fileStorage);check();
        if(method==='get_IsOwnCurrentDirectory'&&observed[method]!==true)refuse('NON_PERSONAL',observed[method]);
      }
      if(typeof observed.get_CurrentDirectory!=='string'||!observed.get_CurrentDirectory
        ||typeof observed.get_RootPath!=='string'||!observed.get_RootPath)refuse('ROOT_UNKNOWN');
      facts=Object.freeze({status:'PARTIAL',interface_reply:'original_proxy_observed',
        connected:true,isOwnCurrentDirectory:true,currentDirectory:observed.get_CurrentDirectory,rootPath:observed.get_RootPath,
        nativeAuthority:false,contentAuthority:false,saveAuthority:false,closeAuthority:false});
      token=Object.freeze({}); readState='confirmed'; return token;
    }).catch(error=>{failed=true;primary=error;readState='unknown';throw error;});
    return readPromise;
  };
  const api={read,
    inspect(value){check();if(value!==token||!facts)refuse('TOKEN');return facts;},
    persist(){
      check();if(!facts||readState!=='confirmed')refuse('READ_REQUIRED');
      if(writeState==='confirmed')return Promise.resolve(token);
      if(writePromise)return writePromise;
      writeState='pending';
      writePromise=Promise.resolve().then(async()=>{
        check();const saved=await record({...facts});check();
        if(!saved||Object.getPrototypeOf(saved)!==Object.prototype||Reflect.ownKeys(saved).length!==Object.keys(facts).length
          ||Object.keys(facts).some(k=>data(saved,k)!==facts[k]))refuse('DURABLE_RECORD');
        writeState='confirmed';return token;
      }).catch(error=>{secondary.push(error);writeState='refused';throw error;}).finally(()=>{writePromise=undefined;});
      return writePromise;
    },
    get primary(){return primary;},get originalRefusal(){return originalRefusal;},get secondary(){return [...secondary];},
    get state(){return {read:readState,write:writeState,ended};},
    end(){check();if(readState!=='confirmed'||writeState!=='confirmed')refuse('RETAIN_ORIGINAL');ended=true;},
  };
  return Object.freeze(api);
}
