import {managedRootCall} from './terminal-root-association.mjs'
// Fixed managed IPC listener only. Parsed SDK request/extra.signal are evidence,
// never original message/task/controller membership or parent-origin authority.
const bridges=new WeakMap(), tokens=new WeakMap();
const throwIfAborted=AbortSignal.prototype.throwIfAborted;
const descriptor=(owner,key)=>Object.getOwnPropertyDescriptor(owner,key);
const equal=(a,b)=>!!a&&!!b&&a.value===b.value&&a.get===b.get&&a.set===b.set
  &&a.writable===b.writable&&a.enumerable===b.enumerable&&a.configurable===b.configurable;
function data(owner,key){const d=descriptor(owner,key);if(!d||!('value'in d))throw Error('LOGINOM_ORIGINAL_CALL_CHANGED');return d}
function method(receiver,key){const chain=[];for(let owner=receiver;owner;owner=Object.getPrototypeOf(owner)){
 const d=descriptor(owner,key);chain.push({owner,prototype:Object.getPrototypeOf(owner),d});
 if(d){if(!('value'in d)||typeof d.value!=='function')throw Error('LOGINOM_ORIGINAL_CALL_CHANGED');return {chain,value:d.value}}
}throw Error('LOGINOM_ORIGINAL_CALL_CHANGED')}
export function beginTerminalManagedCall(message,state){
 const headers=['id','operation','input'].map(key=>({key,d:data(message,key)})),input=headers[2].d.value;
 if(headers[1].d.value!=='call'||typeof headers[0].d.value!=='string'||!input||typeof input!=='object')throw Error('LOGINOM_ORIGINAL_CALL_CHANGED');
 const operands=['name','arguments'].map(key=>({key,d:data(input,key)}));
 if(operands[0].d.value!=='dock_prepare')throw Error('LOGINOM_ORIGINAL_CALL_CHANGED');
 const owners=['bridge','client','session'].map(key=>({key,d:data(state,key)}));
 const bridge=owners[0].d.value,client=owners[1].d.value,session=owners[2].d.value;
 if(!bridge||!client||!session||bridges.has(bridge))throw Error('LOGINOM_ORIGINAL_CALL_UNAVAILABLE');
 const rootAssociation=managedRootCall(message);
 const initialController=data(state,'controller');if(initialController.value!==undefined)throw Error('LOGINOM_ORIGINAL_CALL_UNAVAILABLE');
 const caller=method(client,'callTool'),messagePrototype=Object.getPrototypeOf(message),inputPrototype=Object.getPrototypeOf(input);
 let handleTask,controller,signal,sdkTask,primary,phase='initial',controllerDescriptor;
 function custody(installing=false){
    rootAssociation?.guard();
    if(bridges.get(bridge)!==token||Object.getPrototypeOf(message)!==messagePrototype||Object.getPrototypeOf(input)!==inputPrototype
      ||headers.some(x=>!equal(descriptor(message,x.key),x.d))||operands.some(x=>!equal(descriptor(input,x.key),x.d))
      ||owners.some(x=>!equal(descriptor(state,x.key),x.d))
      ||caller.chain.some(x=>Object.getPrototypeOf(x.owner)!==x.prototype||!equalOrMissing(descriptor(x.owner,'callTool'),x.d))
      ||(controller&&!equal(descriptor(state,'controller'),controllerDescriptor))
      ||(!controller&&!installing&&!equal(descriptor(state,'controller'),initialController)))throw Error('LOGINOM_ORIGINAL_CALL_CHANGED');
 }
 const token=Object.freeze({
  facts:Object.freeze({message,input,bridge,client,session,requestId:headers[0].d.value,operation:headers[1].d.value,method:caller.value,
    parentOriginQualified:false,rootAssociation:rootAssociation??null,nativeAuthority:false}),
  bindTask(task){if(handleTask||phase!=='initial'||!(task instanceof Promise))throw Error('LOGINOM_ORIGINAL_CALL_CHANGED');handleTask=task;phase='ready'},
  async beforeDispatch(){// Yield once so the listener can bind handle's actual Promise.
    await Promise.resolve();token.guard();
    if(phase!=='ready'||!handleTask)throw Error('LOGINOM_ORIGINAL_CALL_UNAVAILABLE');
  },
  bindController(value){custody(true);if(controller||phase!=='ready'||!(value instanceof AbortController))throw Error('LOGINOM_ORIGINAL_CALL_CHANGED');controller=value;signal=value.signal;controllerDescriptor=data(state,'controller');if(controllerDescriptor.value!==controller||controllerDescriptor.writable!==initialController.writable||controllerDescriptor.configurable!==initialController.configurable||controllerDescriptor.enumerable!==initialController.enumerable)throw Error('LOGINOM_ORIGINAL_CALL_CHANGED');phase='controlled'},
  invoke(options){token.guard();if(phase!=='controlled'||options.signal!==signal)throw Error('LOGINOM_ORIGINAL_CALL_CHANGED');phase='dispatched';
    try {sdkTask=Reflect.apply(caller.value,client,[input,undefined,options]);return sdkTask}
    catch(value){primary??={value};throw primary.value}
  },
  guard(){if(primary)throw primary.value;if(signal)throwIfAborted.call(signal);
    custody();
  },
  reject(value){primary??={value};return primary.value},
  // Evidence only; neither SDK task nor handle task is replaced or settled here.
  inspect(){return Object.freeze({handleTask,controller,signal,sdkTask,phase,primary,
    parentOriginQualified:false,nativeAuthority:false})},
  finish(){// Never overwrite a foreign slot. UNKNOWN after dispatched drift stays held.
    if(controller&&!equal(descriptor(state,'controller'),controllerDescriptor))return false;
    try{custody()}catch{return false}
    if(controller)state.controller=undefined;
    if(bridges.get(bridge)===token)bridges.delete(bridge);phase='settled';return true;
  },
 });
 tokens.set(token,{message,state});bridges.set(bridge,token);return token;
}
function equalOrMissing(a,b){return !a&&!b||equal(a,b)}
export function terminalManagedCallForBridge(bridge){const token=bridges.get(bridge);if(token)token.guard();return token}
export function isTerminalManagedCall(token,message,state){const original=tokens.get(token);return !!original&&original.message===message&&original.state===state}

export function terminalManagedPrepareMessage(message){
 if(!message||typeof message!=='object')return false;
 const operation=descriptor(message,'operation');
 if(!operation)return false;if(!('value'in operation))throw Error('LOGINOM_ORIGINAL_CALL_CHANGED');
 if(operation.value!=='call')return false;
 const input=data(message,'input').value;if(!input||typeof input!=='object')return false;
 const name=data(input,'name').value;return name==='dock_prepare';
}
