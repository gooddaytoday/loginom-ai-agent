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
  let sample,acquisition,failure,checks=[],sealed=false,pendingSS;
  let initialScript,modifierScript,acquisitionDefinition,userDefinition;
  const modifierReads={};
  let initializers=Object.freeze({complete:false,reason:'INITIAL_SS_NOT_OBSERVED',sourceExecutionQualified:false,closureIdentityQualified:false});
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
  // Fixed original DOM readers are retained before application publication.
  // This captures a script node/URL, not its executed bytes or lexical environment.
  let scriptReaders;const domChecksStart=checks.length;
  try{
    const Document= data(root,'Document'),Script=data(root,'HTMLScriptElement'),Node=data(root,'Node');
    const DocumentPrototype=data(Document,'prototype'),ScriptPrototype=data(Script,'prototype'),NodePrototype=data(Node,'prototype');
    const reader=(owner,key)=>{
      const d=descriptor(owner,key),parent=prototype(owner);
      if(!d||typeof d.get!=='function'||'value'in d)unavailable();
      checks.push(()=>{const now=descriptor(owner,key);if(prototype(owner)!==parent||!now
        ||Reflect.ownKeys(d).some(k=>now[k]!==d[k]))unavailable()});
      return Object.freeze({get:d.get,owner,key});
    };
    scriptReaders=Object.freeze({ScriptPrototype,URL:hold(root,'URL'),current:reader(DocumentPrototype,'currentScript'),
      src:reader(ScriptPrototype,'src'),integrity:reader(ScriptPrototype,'integrity'),
      owner:reader(NodePrototype,'ownerDocument'),connected:reader(NodePrototype,'isConnected')});
    hold(root,'Document');hold(root,'HTMLScriptElement');hold(root,'Node');
    hold(Document,'prototype');hold(Script,'prototype');hold(Node,'prototype');
  }catch{checks.length=domChecksStart;scriptReaders=undefined} // Unsupported DOM remains an explicit partial witness.
  const readScriptSlot=(reader,object)=>{
    for(let p=object;p;p=prototype(p)){
      const d=descriptor(p,reader.key);if(d){if(p!==reader.owner||d.get!==reader.get||'value'in d)unavailable();return apply(reader.get,object,[])}
    }unavailable();
  };
  // Only the original private init script can supply this before publication.
  // Missing at birth remains missing; a late API is never adopted.
  let originalIntegrity,inspectIntegrity,inspectInitialLoad;
  const integrityDescriptor=descriptor(root,'__loginomOriginalScriptIntegrityV1');
  if(integrityDescriptor){
    if(!('value'in integrityDescriptor)||!Object.isFrozen(integrityDescriptor.value))unavailable();
    originalIntegrity=hold(root,'__loginomOriginalScriptIntegrityV1');
    inspectIntegrity=hold(originalIntegrity,'inspect');if(typeof inspectIntegrity!=='function')unavailable();
    const loadReader=descriptor(originalIntegrity,'inspectLoad');if(loadReader){if(!('value'in loadReader))unavailable();inspectInitialLoad=hold(originalIntegrity,'inspectLoad');if(typeof inspectInitialLoad!=='function')unavailable();}
  }
  const captureScript=path=>{
    if(!scriptReaders)return Object.freeze({complete:false,reason:'ORIGINAL_SCRIPT_READERS_UNAVAILABLE'});
    guard();const r=scriptReaders,script=readScriptSlot(r.current,originalDocument);
    let member=script;while(member&&member!==r.ScriptPrototype)member=prototype(member);
    if(!member)unavailable();
    const url=readScriptSlot(r.src,script),integrity=readScriptSlot(r.integrity,script);
    const owner=readScriptSlot(r.owner,script),connected=readScriptSlot(r.connected,script);
    if(typeof url!=='string'||typeof integrity!=='string')unavailable();
    const parsed=new r.URL(url),expected=origin+'/app/'+path;
    if(parsed.origin+parsed.pathname!==expected||parsed.hash||owner!==originalDocument||connected!==true
      ||(parsed.search&&!/^\?_dc=\d+$/.test(parsed.search)))unavailable();
    const integrityReceipt=originalIntegrity?apply(inspectIntegrity,originalIntegrity,[script]):undefined;
    if(integrityReceipt&&(data(integrityReceipt,'node')!==script||data(integrityReceipt,'document')!==originalDocument
      ||data(integrityReceipt,'url')!==url||data(integrityReceipt,'integrity')!==integrity||data(integrityReceipt,'armedBeforeSource')!==true))unavailable();
    const chain=[];for(let p=script;p;p=prototype(p))chain.push(p);
    checks.push(()=>{
      let p=script;for(const expected of chain){if(p!==expected)unavailable();p=prototype(p)}if(p!==null)unavailable();
      if(originalIntegrity&&apply(inspectIntegrity,originalIntegrity,[script])!==integrityReceipt)unavailable();
      if(readScriptSlot(r.src,script)!==url||readScriptSlot(r.integrity,script)!==integrity
        ||readScriptSlot(r.owner,script)!==owner||readScriptSlot(r.connected,script)!==true)unavailable();
    });guard();
    return Object.freeze({complete:true,script,document:originalDocument,url,integrity,integrityReceipt,
      sourceExecutionQualified:false,closureIdentityQualified:false});
  };
  // Snapshot fixed defining exports before the original application acquisition.
  // Missing exports remain explicit evidence; a later publication cannot repair
  // this attempt. Function identity is not proof of hidden lexical closures.
  const retainLoadedDefinitions=()=>{
    const bindings={};let complete=true;
    const optional=(object,name)=>{
      if(object==null){complete=false;return undefined}
      if(object===root&&name==='ss'&&pendingSS){
        const expected=pendingSS;complete=false;
        checks.push(()=>{const now=descriptor(root,'ss');if(!now||Reflect.ownKeys(expected).some(key=>now[key]!==expected[key]))unavailable()});
        return undefined;
      }
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
    const initialLoad=inspectInitialLoad?apply(inspectInitialLoad,originalIntegrity,[]):Object.freeze({complete:false,reason:'ORIGINAL_LOAD_SETTLEMENT_UNAVAILABLE'});
    if(!Object.isFrozen(initialLoad)||typeof data(initialLoad,'complete')!=='boolean')unavailable();
    if(data(initialLoad,'complete')===true){
      const originals=data(initialLoad,'bindings');
      for(const name of ['ss','bg','rpc','ObjectProxy','FileStorage','StreamPersistProxy','StreamPersist','GuidHelper','MessageDynamicData','HResult','query','connected','currentDirectory','ownDirectory','rootPath','persist','taskConstructor','mkdel','exceptionWrap','awaiter','selectAsync','objectEquals'])if(data(originals,name)!==bindings[name])unavailable();
      checks.push(()=>{if(apply(inspectInitialLoad,originalIntegrity,[])!==initialLoad)unavailable()});
    }
    let propertyOperands;
    const operandSlot=descriptor(initialLoad,'propertyOperands');
    if(operandSlot){
      if(!('value'in operandSlot)||!Object.isFrozen(operandSlot.value))unavailable();
      propertyOperands=operandSlot.value;
      if(data(propertyOperands,'complete')===true){
        const definitions=data(propertyOperands,'definitions'),session=hold(rpc,'TBGSession');
        for(const name of ['SelectPropertyDescs','GetPropertyValues']){
          if(data(data(definitions,'rpc.'+name),'value')!==hold(session,name))unavailable();
        }
        checks.push(()=>{if(data(initialLoad,'propertyOperands')!==propertyOperands)unavailable()});
      }
    }
    let applicationSourcesJoined=false;
    if(data(initialLoad,'complete')===true){
      const loaded=data(initialLoad,'records');
      for(const origin of [acquisitionDefinition,userDefinition]){
        if(!origin)unavailable();const execution=data(origin,'execution');
        if(!loaded.some(r=>data(r,'node')===data(execution,'script')&&data(r,'receipt')===data(execution,'integrityReceipt')))unavailable();
      }
      applicationSourcesJoined=true;
    }
    return Object.freeze({bindings:Object.freeze(bindings),complete,initializers,initialLoad,applicationSourcesJoined,
      acquisitionDefinition,userDefinition,propertyOperands,closureIdentityQualified:false});
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
    if(inspectInitialLoad)userDefinition=Object.freeze({execution:captureScript('bg/app/User.js'),originalSet,originalInit:hold(hold(hold(app,'User'),'prototype'),'Init')});
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
    if(inspectInitialLoad)acquisitionDefinition=Object.freeze({execution:captureScript('bg/app/ServerConnection.js'),Connection,originalGet:d?.value});
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
  const bindInitializers=(ss,initialBase)=>{
    const d=descriptor(ss,'initClass');
    if(!d||!('value'in d)||typeof d.value!=='function'||!d.writable)return;
    hold(root,'ss');
    const original=d.value,records=[],methods={ObjectProxy:['QueryInterface'],
      FileStorage:['get_Connected','get_CurrentDirectory','get_IsOwnCurrentDirectory','get_RootPath'],StreamPersist:['SaveToStream']};
    const lookup=(object,key)=>{
      for(let p=object;p;p=prototype(p)){const d=descriptor(p,key);if(d){if(!('value'in d))unavailable();return d.value}}
    };
    const snapshot=object=>{
      const parent=prototype(object),entries=Reflect.ownKeys(object).map(key=>{
        const d=descriptor(object,key);if(!d||!('value'in d))unavailable();return [key,d];
      });
      return ()=>{if(prototype(object)!==parent||Reflect.ownKeys(object).length!==entries.length)unavailable();
        for(const[key,d]of entries){const now=descriptor(object,key);
          if(!now||Reflect.ownKeys(d).some(key=>!Object.is(now[key],d[key])))unavailable();
        }};
    };
    let restored=false;
    function retainedInitClass(ctor,asm,members,baseType,interfaces){
      let kind,record;
      try{
        const rpc=lookup(root,'rpc'),bg=lookup(root,'bg'),bgRpc=bg&&lookup(bg,'rpc');
        if(ctor===lookup(rpc,'TBGObjectProxy'))kind='ObjectProxy';
        else if(ctor===lookup(bgRpc,'TIBGFileStorage_Proxy'))kind='FileStorage';
        else if(ctor===lookup(bgRpc,'TIBGStreamPersist_Proxy'))kind='StreamPersist';
        if(kind){
          if(this!==ss||records.some(r=>r.kind===kind)||restored)unavailable();
          const checkMembers=snapshot(members),heldMethods={};
          for(const key of methods[kind]){const method=lookup(members,key);if(typeof method!=='function')unavailable();heldMethods[key]=method}
          const execution=captureScript(kind==='ObjectProxy'?'bg/js/rpc.js':'bg/js/bg.rtl.rpc.js');
          const dependencies=Object.freeze({shallowCopy:hold(ss,'shallowCopy'),prepareProperties:hold(ss,'prepareProperties'),initialBase});
          if(interfaces)checks.push(snapshot(interfaces));
          hold(asm,'__types');hold(asm,'name');hold(ctor,'__typeName');
          const basePrototype=baseType?hold(baseType,'prototype'):undefined;
          record=Object.freeze({kind,ctor,assembly:asm,members,baseType,basePrototype,interfaces,dependencies,execution,receiver:this,
            methods:Object.freeze(heldMethods),initializer:original,ss});
          checks.push(checkMembers);guard();
        }
      }catch(error){remember(error)}
      let value;try{value=apply(original,this,arguments)}catch(error){remember(error);throw error}
      if(record)try{
        guard();const proto=hold(ctor,'prototype');
        if(hold(ctor,'__assembly')!==asm)unavailable();
        for(const key of methods[kind])if(hold(proto,key)!==record.methods[key])unavailable();
        if(kind==='ObjectProxy'){
          hold(hold(root,'rpc'),'TBGObjectProxy');
        }else hold(hold(hold(root,'bg'),'rpc'),kind==='FileStorage'?'TIBGFileStorage_Proxy':'TIBGStreamPersist_Proxy');
        records.push(record);
        if(records.length===3){
          const now=descriptor(ss,'initClass');if(!now||Reflect.ownKeys(d).some(key=>key==='value'?now.value!==retainedInitClass:now[key]!==d[key]))unavailable();
          define(ss,'initClass',d);restored=true;hold(root,'ss');hold(ss,'initClass');
          const scriptIdentityComplete=!!(initialScript?.complete&&modifierScript?.complete&&records.every(r=>r.execution.complete));
          if(scriptIdentityComplete&&records.find(r=>r.kind==='FileStorage').execution.script!==records.find(r=>r.kind==='StreamPersist').execution.script)unavailable();
          initializers=Object.freeze({complete:true,records:Object.freeze(records.slice()),initialScript,modifierScript,scriptIdentityComplete,
            modifierReads:Object.freeze({...modifierReads}),
            sourceExecutionQualified:false,closureIdentityQualified:false});
        }
      }catch(error){remember(error)}
      return value;
    }
    define(ss,'initClass',{...d,value:retainedInitClass});
    checks.push(()=>{const now=descriptor(ss,'initClass');if(!now||Reflect.ownKeys(d).some(key=>key==='value'
      ?now.value!==(restored?original:retainedInitClass):now[key]!==d[key]))unavailable()});
  };
  // Witness the actual read consumed by the fixed modifier, before assignment.
  // The original function is returned unwrapped: the IIFE captures that exact ref.
  // This is a bounded read/transition receipt, not access to an opaque closure.
  const modifierRead=(ss,name,initial)=>{
    if(!scriptReaders)return undefined;
    const script=readScriptSlot(scriptReaders.current,originalDocument);
    if(!script)return undefined;
    const url=readScriptSlot(scriptReaders.src,script);
    if(typeof url!=='string')unavailable();
    const parsed=new scriptReaders.URL(url);
    if(parsed.origin+parsed.pathname!==origin+'/app/bg/js/bg.mscorlib.js')return undefined;
    if(modifierReads[name])unavailable();
    const execution=captureScript('bg/js/bg.mscorlib.js');
    return Object.freeze({receiver:ss,name,original:initial.value,execution,
      descriptor:Object.freeze({...initial}),beforeAssignment:true});
  };
  const finishModifierRead=(ss,name,read,value)=>{
    if(!read)return undefined;
    const execution=captureScript('bg/js/bg.mscorlib.js');
    if(read.receiver!==ss||execution.script!==read.execution.script
      ||execution.integrityReceipt!==read.execution.integrityReceipt)unavailable();
    const receipt=Object.freeze({read,replacement:value,execution,
      sameScriptTransition:true,closureIdentityQualified:false});
    modifierReads[name]=receipt;return receipt;
  };
  const awaitShallowCopy=ss=>{
    if(!originalIntegrity)return; // Ordinary login keeps its existing data slot.
    const initial=descriptor(ss,'shallowCopy');
    if(!initial||!('value'in initial)||typeof initial.value!=='function'||!initial.configurable)return;
    const parent=prototype(ss),functionParent=prototype(initial.value);
    checks.push(()=>{if(prototype(ss)!==parent||prototype(initial.value)!==functionParent)unavailable()});
    let waiting=true,read;
    const get=()=>{try{const next=modifierRead(ss,'shallowCopy',initial);if(next){if(read)unavailable();read=next}}catch(error){remember(error)}return initial.value};
    const set=value=>{
      const current=descriptor(ss,'shallowCopy');
      if(!current||current.get!==get||current.set!==set||current.enumerable!==initial.enumerable||!current.configurable){remember(Error('TERMINAL_USER_PUBLISHER_UNAVAILABLE'));return}
      define(ss,'shallowCopy',{...initial,value});waiting=false;
      try{
        if(typeof value!=='function'||apply(toString,value,[]).replace(/\r\n/g,'\n')!=="function bg$shallowCopy(source, target) {\n    // \u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c, \u0447\u0442\u043e source != null && source != undefined\n    if (source) ss_shallowCopy(source, target);\n}")unavailable();
        finishModifierRead(ss,'shallowCopy',read,value);
        if(originalIntegrity&&!read)unavailable();
        hold(ss,'shallowCopy');
      }catch(error){remember(error)}
    };
    define(ss,'shallowCopy',{get,set,enumerable:initial.enumerable,configurable:true});
    checks.push(()=>{if(waiting){const d=descriptor(ss,'shallowCopy');if(!d||d.get!==get||d.set!==set||d.enumerable!==initial.enumerable||!d.configurable)unavailable()}});
  };
  const awaitFinalInitializer=ss=>{
    const initial=descriptor(ss,'initClass');
    if(!initial||!('value'in initial)||typeof initial.value!=='function'||!initial.configurable)return;
    const parent=prototype(ss),functionParent=prototype(initial.value);
    checks.push(()=>{if(prototype(ss)!==parent||prototype(initial.value)!==functionParent)unavailable()});
    let waiting=true,read;
    const get=()=>{try{const next=modifierRead(ss,'initClass',initial);if(next){if(read)unavailable();read=next}}catch(error){remember(error)}return initial.value};
    const set=value=>{
      const current=descriptor(ss,'initClass');
      if(!current||current.get!==get||current.set!==set||current.enumerable!==initial.enumerable||!current.configurable){remember(Error('TERMINAL_USER_PUBLISHER_UNAVAILABLE'));return}
      define(ss,'initClass',{...initial,value});waiting=false;
      try{
        // Shape only: this does not qualify the executing module/lexical environment.
        if(typeof value!=='function'||apply(toString,value,[]).replace(/\r\n/g,'\n')!=="function bg$initClass(ctor, asm, members, baseType, interfaces, __options) {\n    if (baseType === undefined && arguments.length >= 4)\n        console.warn(\"BaseType for \" + ctor.__typeName + \" class is undefined\");\n    ss_initClass(ctor, asm, members, baseType, interfaces);\n\n    var xForcePrepareProperties = false;\n    var xDisablePrepareProperties = false;\n    if (typeof __options !== \"undefined\") {\n        var xForcePrepareProperties = !!__options.forcePrepareProperties;\n        var xDisablePrepareProperties = !!__options.disablePrepareProperties;\n    }\n\n    // \u041f\u0440\u043e\u043f\u0443\u0441\u043a\u0430\u0435\u043c \u0434\u0436\u0435\u043d\u0435\u0440\u0438\u043a\u0438\n    if (typeof ctor.__genericTypeDefinition === \"undefined\" || xForcePrepareProperties) {\n        if (!xDisablePrepareProperties/* && xForcePrepareProperties*/) {\n            ss.prepareProperties(ctor);\n        }\n    }\n}")unavailable();
        modifierScript=captureScript('bg/js/bg.mscorlib.js');
        finishModifierRead(ss,'initClass',read,value);
        if(originalIntegrity&&!read)unavailable();
        bindInitializers(ss,initial.value);
      }catch(error){remember(error)}
    };
    define(ss,'initClass',{get,set,enumerable:initial.enumerable,configurable:true});
    checks.push(()=>{if(waiting){const d=descriptor(ss,'initClass');if(!d||d.get!==get||d.set!==set||d.enumerable!==initial.enumerable||!d.configurable)unavailable()}});
  };
  // Only a namespace born after this init script can witness initializers.
  // Existing ss is deliberately left alone; no late reflection can repair it.
  try{if(!descriptor(root,'ss')){arm(root,'ss',ss=>{pendingSS=undefined;initialScript=captureScript('bg/js/mscorlib.js');awaitShallowCopy(ss);awaitFinalInitializer(ss)});pendingSS=descriptor(root,'ss');}
    else initializers=Object.freeze({complete:false,reason:'INITIAL_SS_ALREADY_PRESENT',sourceExecutionQualified:false,closureIdentityQualified:false});
  }catch(error){remember(error)}
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
