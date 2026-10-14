// Fixed initial publisher capture. No public tool, callback or module input.
export function terminalUserPublisherScript(loginomUrl) {
  const origin=new URL(loginomUrl).origin;
  return `(${installOriginalUserPublisher.toString()})(${JSON.stringify(origin)})`;
}
function installOriginalUserPublisher(origin) {
  if(location.origin!==origin||(globalThis.top&&globalThis.top!==globalThis))return;
  const root=globalThis,originalDocument=document;
  const descriptor=Object.getOwnPropertyDescriptor,define=Object.defineProperty,prototype=Object.getPrototypeOf;
  const documentDescriptor=descriptor(root,'document');
  const apply=Reflect.apply,toString=Function.prototype.toString,then=Promise.prototype.then;
  const digest=root.crypto?.subtle?.digest?.bind(root.crypto.subtle),Encoder=root.TextEncoder;
  const key='__loginomOriginalUserPublisherV1';
  if(descriptor(root,key))return; // Never replace a previous/foreign publisher.
  let sample,acquisition,failure,checks=[],sealed=false;
  const unavailable=()=>{throw Error('TERMINAL_USER_PUBLISHER_UNAVAILABLE')};
  const remember=error=>{failure??={value:error}};
  const data=(object,name)=>{
    for(let p=object;p;p=prototype(p)){
      const d=descriptor(p,name);if(d){if(!('value'in d))unavailable();return d.value}
    }unavailable();
  };
  const hold=(object,name)=>{
    const chain=[];let owner,d;
    for(let p=object;p;p=prototype(p)){chain.push(p);d=descriptor(p,name);if(d){owner=p;break}}
    if(!d||!('value'in d))unavailable();
    const ownerPrototype=prototype(owner);
    checks.push(()=>{
      let p=object;for(const expected of chain){if(p!==expected)unavailable();if(descriptor(p,name))break;p=prototype(p)}
      const now=descriptor(p,name);if(p!==owner||prototype(owner)!==ownerPrototype||!now||!('value'in now)||now.value!==d.value
        ||now.writable!==d.writable||now.enumerable!==d.enumerable||now.configurable!==d.configurable)unavailable();
    });return d.value;
  };
  // Snapshot fixed defining exports before the original application acquisition.
  // Missing exports remain explicit evidence; a later publication cannot repair
  // this attempt. Function identity is not proof of hidden lexical closures.
  const retainLoadedDefinitions=()=>{
    const bindings={};let complete=true;
    const optional=(object,name)=>{
      if(object==null){complete=false;return undefined}
      const chain=[];
      for(let p=object;p;p=prototype(p)){
        chain.push(p);
        if(descriptor(p,name))return hold(object,name);
      }
      complete=false;
      checks.push(()=>{let p=object;for(const expected of chain){
        if(p!==expected||descriptor(p,name))unavailable();p=prototype(p);
      }if(p!==null)unavailable()});
      return undefined;
    };
    const capture=(name,object,key)=>bindings[name]=optional(object,key);
    const bg=capture('bg',root,'bg'),rpc=capture('rpc',root,'rpc');
    const bgRpc=capture('bgRpc',bg,'rpc'),ss=capture('ss',root,'ss');
    capture('ObjectProxy',rpc,'TBGObjectProxy');capture('FileStorage',bgRpc,'TIBGFileStorage_Proxy');
    capture('StreamPersistProxy',bgRpc,'TIBGStreamPersist_Proxy');capture('StreamPersist',bg,'IBGStreamPersist');
    capture('GuidHelper',rpc,'GuidHelper');capture('MessageDynamicData',rpc,'TBGMessageDynamicData');capture('HResult',rpc,'HResult');
    capture('ObjectProxyPrototype',bindings.ObjectProxy,'prototype');capture('FileStoragePrototype',bindings.FileStorage,'prototype');
    capture('StreamPersistPrototype',bindings.StreamPersistProxy,'prototype');
    capture('query',bindings.ObjectProxyPrototype,'QueryInterface');capture('connected',bindings.FileStoragePrototype,'get_Connected');
    capture('currentDirectory',bindings.FileStoragePrototype,'get_CurrentDirectory');capture('ownDirectory',bindings.FileStoragePrototype,'get_IsOwnCurrentDirectory');
    capture('rootPath',bindings.FileStoragePrototype,'get_RootPath');capture('persist',bindings.StreamPersistPrototype,'SaveToStream');
    capture('taskConstructor',ss,'TaskCompletionSource');capture('mkdel',ss,'mkdel');
    capture('exceptionWrap',optional(ss,'Exception'),'wrap');capture('awaiter',root,'__awaiter');
    capture('selectAsync',bg,'selectAsync');capture('objectEquals',bg,'ObjectEquals');
    if(Object.values(bindings).some(value=>value==null))complete=false;
    return Object.freeze({bindings:Object.freeze(bindings),complete,closureIdentityQualified:false});
  };
  const guard=()=>{
    if(acquisition?.failed)throw acquisition.error;
    if(acquisition?.lower?.failed)throw acquisition.lower.error;
    if(sample?.failed)throw sample.error; // Raw first rejection wins secondary drift.
    if(failure)throw failure.value;
    const currentDocument=descriptor(root,'document');
    if(!documentDescriptor||!currentDocument||Reflect.ownKeys(documentDescriptor).some(k=>currentDocument[k]!==documentDescriptor[k]))unavailable();
    const observedDocument='value'in documentDescriptor?currentDocument.value:apply(documentDescriptor.get,root,[]);
    if(observedDocument!==originalDocument)unavailable();
    for(const check of checks)check();
  };
  const inspect=()=>{
    guard();if(!sample||!sample.settled||!sample.sourceVerified
      ||(acquisition&&(!acquisition.settled||!acquisition.sourceVerified||acquisition.user!==sample.user
        ||(acquisition.lower&&(!acquisition.lower.completed||!acquisition.lower.sourceVerified
          ||acquisition.lower.user!==sample.user||!acquisition.lower.restored)))))unavailable();
    if(acquisition?.lower){const lower=acquisition.lower;
      if(data(sample.user,'$S')!==lower.transport||data(sample.bindings.identity,'$OW')!==lower.w
        ||data(sample.bindings.identity,'$O')!==lower.o)unavailable();
    }
    return Object.freeze({document:originalDocument,receiver:sample.receiver,user:sample.user,
      task:sample.task,originalSet:sample.originalSet,originalInit:sample.originalInit,
      bindings:sample.bindings,acquisition:acquisition?Object.freeze({receiver:acquisition.receiver,
        task:acquisition.task,user:acquisition.user,session:acquisition.session,originalGet:acquisition.originalGet,
        loadedDefinitions:acquisition.loadedDefinitions,
        rpcCompletionVerified:!!(acquisition.lower?.completed&&acquisition.lower.sourceVerified),
        lower:acquisition.lower?.completed?Object.freeze({session:acquisition.lower.session,transport:acquisition.lower.transport,
          method:acquisition.lower.originalMethod,task:acquisition.lower.task,dispatchTask:acquisition.lower.dispatchTask,
          response:acquisition.lower.response,user:acquisition.lower.user,w:acquisition.lower.w,o:acquisition.lower.o,type:703,
          originalResultReader:acquisition.lower.originalResultReader,continuation:acquisition.lower.continuation,
          taskReader:acquisition.lower.taskReader,taskContinuation:acquisition.lower.taskContinuation,
          originalContinuation:acquisition.lower.originalContinuation,request:acquisition.lower.request,
          ss:acquisition.lower.ss,taskConstructor:acquisition.lower.taskConstructor,mkdel:acquisition.lower.mkdel,
          exceptionWrap:acquisition.lower.exceptionWrap,baseConstructor:acquisition.lower.baseConstructor,baseMethod:acquisition.lower.baseMethod}):undefined}):undefined,nativeReceiversQualified:false});
  };
  define(root,key,{value:Object.freeze({inspect})});
  const hash=async fn=>{if(!digest||!Encoder)unavailable();return Array.from(new Uint8Array(await digest('SHA-256',new Encoder().encode(apply(toString,fn,[])))))
      .map(v=>v.toString(16).padStart(2,'0')).join('');};
  const qualify=async(set,init)=>{
    guard();const setHash=await hash(set);guard();const initHash=await hash(init);guard();
    if(setHash!=='8c5017296d0882c1c2ea8f988bad53b1b5986617c52f44554268c1db95fb6960'
      ||initHash!=='71c16608ccef7aab74903231c36cf3e0a28f90a5bf5a8005fe9fba52fcde88e1')unavailable();
    sample.sourceVerified=true;
  };
  const bind=(bg,app,current)=>{
    if(sealed)unavailable();sealed=true;
    const d=descriptor(current,'Set');if(!d||!('value'in d)||typeof d.value!=='function'||!d.writable)unavailable();
    const originalSet=d.value;
    function retainedSet(user) {
      if(sample)remember(Error('TERMINAL_USER_PUBLISHER_REENTERED'));
      else {
        try {
          const User=hold(app,'User'),originalInit=hold(hold(User,'prototype'),'Init');
          const rpc=hold(root,'rpc'),ObjectProxy=hold(rpc,'TBGObjectProxy'),proxyPrototype=hold(ObjectProxy,'prototype');
          let p=user;while(p&&p!==proxyPrototype)p=prototype(p);if(!p)unavailable();
          const transport=hold(user,'$S'),identity=hold(user,'$');if(!transport||!identity)unavailable();
          sample={receiver:this,user,originalSet,originalInit,settled:false,failed:false,sourceVerified:false,
            bindings:Object.freeze({bg,app,current,User,ObjectProxy,proxyPrototype,transport,identity,
              awaiter:hold(root,'__awaiter'),selectAsync:hold(bg,'selectAsync'),objectEquals:hold(bg,'ObjectEquals')})};
          if(this!==current||(acquisition&&(!acquisition.settled||acquisition.user!==user)))unavailable();guard();
        }catch(error){remember(error)}
      }
      let task;
      try{task=apply(originalSet,this,arguments)}catch(error){
        if(sample&&!sample.task){sample.failed=true;sample.error=error;sample.settled=true}throw error;
      }
      if(sample&&!sample.task){
        sample.task=task;
        try {
          apply(then,task,[()=>{sample.settled=true;try{guard()}catch(error){remember(error)}},
            error=>{sample.failed=true;sample.error=error;sample.settled=true}]);
          qualify(originalSet,sample.originalInit).catch(remember);
        }catch(error){remember(error)}
      }
      return task; // Same original Promise/receiver; no await, selector or RPC replay.
    }
    define(current,'Set',{...d,value:retainedSet});
    hold(current,'Set');hold(root,'bg');hold(bg,'app');hold(app,'CurrentUser');
  };
  const captureLower=(session)=>{
    let methodDescriptor;for(let p=session;p;p=prototype(p)){methodDescriptor=descriptor(p,'get_CurrentUser');if(methodDescriptor)break}
    if(!methodDescriptor)return;
    if(!('value'in methodDescriptor)||typeof methodDescriptor.value!=='function')unavailable();
    const transport=hold(session,'$S'),originalMethod=methodDescriptor.value;
    const ss=hold(root,'ss'),taskConstructor=hold(ss,'TaskCompletionSource'),mkdel=hold(ss,'mkdel'),exceptionWrap=hold(hold(ss,'Exception'),'wrap');
    const record={session,transport,originalMethod,ss,taskConstructor,mkdel,exceptionWrap,patches:[],restored:false,used:false,sourceVerified:false,completed:false};
    const patch=(object,name,make)=>{
      const own=descriptor(object,name),original=data(object,name);
      if(typeof original!=='function'||(own&&(!own.configurable&&!own.writable)))unavailable();
      const wrapped=make(original),temporary={value:wrapped,writable:true,enumerable:own?.enumerable??false,configurable:true};
      if(own&&!own.configurable)temporary.configurable=false;
      define(object,name,temporary);
      const chain=[];let owner=object,originalDescriptor;for(;owner;owner=prototype(owner)){chain.push(owner);originalDescriptor=descriptor(owner,name);if(originalDescriptor)break}
      // The effective original descriptor was replaced above for own fields.
      if(own){originalDescriptor=own;owner=object;chain.length=1}
      else {chain.length=0;owner=prototype(object);for(;owner;owner=prototype(owner)){chain.push(owner);originalDescriptor=descriptor(owner,name);if(originalDescriptor)break}}
      const entry={object,name,own,original,temporary,chain,owner,originalDescriptor};record.patches.push(entry);
      return entry;
    };
    const check=()=>{for(const entry of record.patches){const now=descriptor(entry.object,entry.name);
      const expected=record.restored?entry.own:entry.temporary;
      if(!expected){if(now)unavailable();let owner=prototype(entry.object);for(const expectedOwner of entry.chain){if(owner!==expectedOwner)unavailable();if(descriptor(owner,entry.name))break;owner=prototype(owner)}
        const original=descriptor(owner,entry.name);if(owner!==entry.owner||!original||Reflect.ownKeys(entry.originalDescriptor).some(k=>original[k]!==entry.originalDescriptor[k]))unavailable();
        if(data(entry.object,entry.name)!==entry.original)unavailable()}
      else if(!now||Reflect.ownKeys(expected).some(k=>now[k]!==expected[k]))unavailable();
    }};
    checks.push(check);
    record.restore=()=>{
      check();for(const entry of record.patches.slice().reverse()){
        if(entry.own)define(entry.object,entry.name,entry.own);else delete entry.object[entry.name];
      }record.restored=true;check();
    };
    let invoking=false,completing=false;
    try{
      patch(transport,'$R',original=>function(w,o,type){
        if(!completing)return apply(original,this,arguments);
        guard();if(this!==transport||type!==703||w!==record.w||o!==record.o)unavailable();
        const user=apply(original,this,arguments);guard();record.user=user;record.completed=true;completing=false;return user;
      });
      patch(transport,'DispatchMessageAsync',original=>function(request){
        if(!invoking)return apply(original,this,arguments);
        guard();if(this!==transport||record.dispatchTask)unavailable();record.request=request;
        const task=apply(original,this,arguments);record.dispatchTask=task;
        record.continuation=data(task,'continueWith');record.originalResultReader=data(task,'getAwaitedResult');
        patch(task,'getAwaitedResult',reader=>function(){
          if(this!==task||record.response)unavailable();
          if(record.failed)throw record.error;
          if(!record.observed)unavailable();
          const response=record.outcome;guard();record.response=response;completing=true;
          patch(response,'ReadParameterInt32',read=>function(offset){
            guard();if(this!==response||(offset!==0&&offset!==4))unavailable();
            const value=apply(read,this,arguments);guard();if(offset===0)record.w=value;else record.o=value;return value;
          });return response;
        });
        patch(task,'continueWith',continueWith=>function(callback){
          if(this!==task||record.originalContinuation)unavailable();record.originalContinuation=callback;
          return apply(continueWith,this,[function(){
            if(record.observed){remember(Error('TERMINAL_USER_RPC_CONTINUATION_REPLAY'));return}
            record.observed=true;
            try{record.outcome=apply(record.originalResultReader,task,[])}catch(error){record.failed=true;record.error=error}
            if(!record.failed){try{guard()}catch(error){remember(error);record.callbackStopped=true;return}}
            else {const reader=record.patches.find(p=>p.object===task&&p.name==='getAwaitedResult');
              const now=descriptor(task,'getAwaitedResult');if(!now||Reflect.ownKeys(reader.temporary).some(k=>now[k]!==reader.temporary[k])){
                record.callbackStopped=true;return}
            }
            return apply(callback,this,arguments);
          }]);
        });return task;
      });
      patch(session,'get_CurrentUser',original=>function(){
        guard();if(this!==session||record.used)unavailable();record.used=true;invoking=true;
        try{const task=apply(original,this,arguments);record.task=task;
          record.taskContinuation=hold(task,'continueWith');record.taskReader=hold(task,'getAwaitedResult');return task;
        }finally{invoking=false}
      });
      (async()=>{guard();const value=await hash(originalMethod);guard();
        if(value!=='e7d959448a2b1a8030f3511caf44768b4ee4e1c918aa9b3791a897022026738a'){
          if(value!=='07380ada53b9b8eba218bf876f7b30b40a9076a954b07755c68fc745f1f72a5c')unavailable();
          record.baseConstructor=hold(hold(hold(root,'bg'),'rpc'),'TIBGBaseDeductorServerSession_Proxy');
          record.baseMethod=hold(hold(record.baseConstructor,'prototype'),'get_CurrentUser');
          const baseHash=await hash(record.baseMethod);guard();if(baseHash!=='e7d959448a2b1a8030f3511caf44768b4ee4e1c918aa9b3791a897022026738a')unavailable();
        }record.sourceVerified=true;
      })().catch(remember);
      return record;
    }catch(error){remember(error);throw error}
  };
  const bindAcquisition=(app,Connection)=>{
    const proto=data(Connection,'prototype'),d=descriptor(proto,'GetCurrentUser');
    if(!d||!('value'in d)||typeof d.value!=='function'||!d.writable)unavailable();
    const originalGet=d.value;
    function retainedGetCurrentUser(){
      if(acquisition)remember(Error('TERMINAL_USER_ACQUISITION_REENTERED'));
      else try{
        const receiverChain=[];let member=this;while(member&&member!==proto){receiverChain.push(member);member=prototype(member)}
        if(member!==proto)unavailable();receiverChain.push(proto);
        checks.push(()=>{let value=this;for(const original of receiverChain){if(value!==original)unavailable();value=prototype(value)}});
        hold(this,'GetCurrentUser');
        const session=hold(this,'FSession');hold(session,'$S');
        const readerChain=[];let readerOwner,reader;for(let p=session;p;p=prototype(p)){
          readerChain.push(p);reader=descriptor(p,'CurrentUser');if(reader){readerOwner=p;break}
        }
        if(!reader)unavailable();
        checks.push(()=>{let p=session;for(const expected of readerChain){
          if(p!==expected)unavailable();if(descriptor(p,'CurrentUser'))break;p=prototype(p)}
          const now=descriptor(p,'CurrentUser');if(p!==readerOwner||!now
            ||Reflect.ownKeys(reader).some(k=>now[k]!==reader[k]))unavailable();
        });
        acquisition={receiver:this,session,originalGet,settled:false,failed:false,sourceVerified:false};
        acquisition.loadedDefinitions=retainLoadedDefinitions();
        if(!('value'in reader))acquisition.lower=captureLower(session);
        hold(app,'ServerConnection');hold(Connection,'prototype');hold(proto,'GetCurrentUser');
        hold(root,'__awaiter');guard();
      }catch(error){remember(error)}
      let task;try{task=apply(originalGet,this,arguments)}catch(error){
        if(acquisition&&!acquisition.started){acquisition.failed=true;acquisition.error=error;acquisition.settled=true}throw error;
      }
      if(acquisition&&!acquisition.started){
        acquisition.started=true;acquisition.task=task;
        try{apply(then,task,[user=>{acquisition.user=user;acquisition.settled=true;try{guard();if(acquisition.lower)acquisition.lower.restore()}catch(error){remember(error)}},
          error=>{acquisition.failed=true;acquisition.error=error;acquisition.settled=true;
            try{acquisition.lower?.restore()}catch(error){remember(error)}}]);
          (async()=>{guard();const value=await hash(originalGet);guard();
            if(value!=='b2145693ef7b07b2542bb413a8ec4453334a159055a9b85456915f8d2268ebb0')unavailable();
            acquisition.sourceVerified=true;})().catch(remember);
        }catch(error){remember(error)}
      }
      return task;
    }
    define(proto,'GetCurrentUser',{...d,value:retainedGetCurrentUser});
  };
  const arm=(object,name,next)=>{
    const existing=descriptor(object,name);
    if(existing){if(!('value'in existing))unavailable();next(existing.value);return}
    // One publication assignment only; restore ordinary data property immediately.
    define(object,name,{configurable:true,enumerable:true,get(){return undefined},set(value){
      define(object,name,{value,writable:true,enumerable:true,configurable:true});
      if(!failure)try{next(value)}catch(error){remember(error)}
    }});
  };
  try{arm(root,'bg',bg=>arm(bg,'app',app=>{
    if(descriptor(app,'CurrentUser'))unavailable(); // Late installation cannot recover Set's argument.
    if(descriptor(app,'ServerConnection'))unavailable();
    arm(app,'ServerConnection',Connection=>bindAcquisition(app,Connection));
    arm(app,'CurrentUser',current=>bind(bg,app,current));
  }))}catch(error){remember(error)}
}

// Expected text comes from this fixed internal implementation, never from a caller.
const implementation=installOriginalUserPublisher.toString();
const inspectorStart=implementation.indexOf('const inspect=')+'const inspect='.length;
const inspectorEnd=implementation.indexOf('\n  };',inspectorStart);
export const terminalUserPublisherInspectorSource=implementation.slice(inspectorStart,inspectorEnd)+'\n  }';
