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
  let sample,failure,checks=[],sealed=false;
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
    checks.push(()=>{
      let p=object;for(const expected of chain){if(p!==expected)unavailable();if(descriptor(p,name))break;p=prototype(p)}
      const now=descriptor(p,name);if(p!==owner||!now||!('value'in now)||now.value!==d.value
        ||now.writable!==d.writable||now.enumerable!==d.enumerable||now.configurable!==d.configurable)unavailable();
    });return d.value;
  };
  const guard=()=>{
    if(sample?.failed)throw sample.error; // Raw first rejection wins secondary drift.
    if(failure)throw failure.value;
    const currentDocument=descriptor(root,'document');
    if(!documentDescriptor||!currentDocument||Reflect.ownKeys(documentDescriptor).some(k=>currentDocument[k]!==documentDescriptor[k]))unavailable();
    const observedDocument='value'in documentDescriptor?currentDocument.value:apply(documentDescriptor.get,root,[]);
    if(observedDocument!==originalDocument)unavailable();
    for(const check of checks)check();
  };
  const inspect=()=>{
    guard();if(!sample||!sample.settled||!sample.sourceVerified)unavailable();
    return Object.freeze({document:originalDocument,receiver:sample.receiver,user:sample.user,
      task:sample.task,originalSet:sample.originalSet,originalInit:sample.originalInit,
      bindings:sample.bindings,nativeReceiversQualified:false});
  };
  define(root,key,{value:Object.freeze({inspect})});
  const qualify=async(set,init)=>{
    if(!digest||!Encoder)unavailable();
    const hash=async fn=>Array.from(new Uint8Array(await digest('SHA-256',new Encoder().encode(apply(toString,fn,[])))))
      .map(v=>v.toString(16).padStart(2,'0')).join('');
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
          if(this!==current)unavailable();guard();
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
    arm(app,'CurrentUser',current=>bind(bg,app,current));
  }))}catch(error){remember(error)}
}

// Expected text comes from this fixed internal implementation, never from a caller.
const implementation=installOriginalUserPublisher.toString();
const inspectorStart=implementation.indexOf('const inspect=')+'const inspect='.length;
const inspectorEnd=implementation.indexOf('\n  };',inspectorStart);
export const terminalUserPublisherInspectorSource=implementation.slice(inspectorStart,inspectorEnd)+'\n  }';
