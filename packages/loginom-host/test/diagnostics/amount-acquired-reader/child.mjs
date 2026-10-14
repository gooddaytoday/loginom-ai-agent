// Labelled protocol fixture: real Node/FS/IPC, no native/Page/provider authority.
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
let startup,state,message,controller;
const encode=value=>value instanceof Error?{kind:'Error',name:value.name,message:value.message}:{kind:'value',value:value??null,is_undefined:value===undefined};
process.on('message',async m=>{
 if(m.operation==='start'){
  message=m;
  const {validateStartInput}=await import(pathToFileURL(join(m.input.resources,'runtime/src/start-input.mjs')));
  const {retainAmountManagedStartup}=await import(pathToFileURL(join(m.input.resources,'runtime/src/fp-managed-startup.mjs')));
  try{
   validateStartInput(m.input);controller=new AbortController();state={startupController:controller};
   startup=retainAmountManagedStartup(m,m.input,state,controller);
   state.startupOwner={directory:m.input.stateDir,generation:m.input.generation,chat:m.input.chat,signal:controller.signal,deadline:m.deadline};startup.bindOwner(state.startupOwner);
   process.send({fixture:'held',packet:m,providerAuthority:false,nativeAuthority:false});
  }catch(e){process.send({id:m.id,rejection:encode(e),rejectionOrigin:'guard'})}
 }
 if(m.operation==='readonly.preReady.cancel')process.send({fixture:'cancel',accepted:startup.cancel(m.input),pending:startup.pending});
 if(m.fixture==='resolve'){
  if(m.reject){const value=m.is_undefined?undefined:m.value;startup.reject(value)}
  let rejection;try{startup.accept()}catch(e){rejection={value:e}}
  if(rejection)process.send({id:message.id,rejection:encode(startup.propagate(rejection.value)),rejectionOrigin:startup.rejectionOrigin,...(startup.secondary?{secondaryRejection:encode(startup.secondary.value)}:{})});
  else process.send({id:message.id,result:{ready:true,protocol:1,generation:message.input.generation,chat:message.input.chat}});
  startup.settle();
 }
 if(m.operation==='close'){process.send({id:m.id,result:{closed:true}},()=>process.disconnect())}
});
