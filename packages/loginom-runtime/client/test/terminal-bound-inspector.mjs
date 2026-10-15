// Node-only CODE/OFFLINE observer. It is not a browser/stock runtime provider.
import {Session} from 'node:inspector';
import {createHash,randomUUID} from 'node:crypto';
import {parse} from '../../../loginom-host/node_modules/acorn/dist/acorn.mjs';
const methods=['get_Connected','get_CurrentDirectory','get_IsOwnCurrentDirectory','get_RootPath'];
const ids=[907,909,910,911];
export function observeStorageBound({provider,context,guard,onPause,alterLocal,fullScriptSha256,skipBreakpoint=false}){
 if(typeof guard!=='function')throw Error('BOUND_INSPECTOR_CONTROL_UNAVAILABLE');guard();
 const session=new Session();session.connect();let first,closed=false,active;
 const records=[],breakpoints=new Map(),pending=new WeakMap(),ready=new WeakSet(),restorations=new Set(),locations=new Map(),tracked=new Set(),observedRequests=new WeakSet(),scripts=new Map();
 const post=(method,params={})=>{let called=false,result,error;session.post(method,params,(e,r)=>{called=true;error=e;result=r});if(!called)throw Error('BOUND_INSPECTOR_ASYNC_POST');if(error)throw error;return result};
 const checkControl=()=>{try{return guard()}catch(value){first??={value};throw value}};
 const own=(object,key)=>{const d=Object.getOwnPropertyDescriptor(object,key);if(!d||!('value'in d))throw Error('BOUND_INSPECTOR_ACCESSOR');return d.value};
 const before=provider.inspect(),storage=before.storage,witnessGate=typeof Object.getOwnPropertyDescriptor(provider,'retainBoundPause')?.value==='function';
 const root={methods:Object.fromEntries(methods.map(name=>[name,own(Object.getPrototypeOf(storage),name)])),
  pause(callee,receiver,lower,name){
   if(first)throw first.value;checkControl();
   const call=lower.mkdelCall,completion=lower.mkdelCompletion;
   if(receiver!==storage||callee!==completion?.returned||call?.receiver!==storage||completion.call!==call
     ||call.storageCall!==lower.storageCall||call.storageCall.method!==root.methods[name]
     ||pending.has(lower)||active)throw Error('BOUND_INSPECTOR_CALL_CHANGED');
   if(witnessGate){
    const token=Reflect.apply(own(provider,'retainBoundPause'),provider,[lower,callee,receiver,name,locations.get(name)]);
    pending.set(lower,token);tracked.add(lower);onPause?.({callee,receiver,lower,name,delegate:call.delegate,token});return true;
   }
   const delegate=call.delegate,prototype=Object.getPrototypeOf(delegate),original=Object.getOwnPropertyDescriptor(delegate,'apply');
   if(original)throw Error('BOUND_INSPECTOR_APPLY_SHADOW');
   const base=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(delegate),'apply');
   if(!base||typeof base.value!=='function')throw Error('BOUND_INSPECTOR_APPLY_UNAVAILABLE');
   const token=Object.freeze({callee,delegate,receiver,lower,call,completion,name,operator:locations.get(name)});
   pending.set(lower,token);let entered=false;
   const cleanup=()=>{const current=Object.getOwnPropertyDescriptor(delegate,'apply');if(current?.value===overlay&&current.writable===true&&current.configurable===true&&current.enumerable===false){delete delegate.apply;restorations.delete(cleanup)}else first??={value:Error('BOUND_INSPECTOR_APPLY_CHANGED')}};
   const overlay=function(target,args){
    if(first)throw first.value;
    if(entered||this!==delegate||target!==storage||Object.getPrototypeOf(delegate)!==prototype)throw Error('BOUND_INSPECTOR_DELEGATE_CHANGED');
    if(!ready.has(token))throw Error('BOUND_INSPECTOR_TOKEN_UNAVAILABLE');
    ready.delete(token);entered=true;active={token,dispatches:0};
    try{return Reflect.apply(base.value,this,[target,args])}
    catch(value){first??={value};throw value}
    finally{
     const state=active;active=undefined;
     cleanup();
     if(!state||state.dispatches!==1)first??={value:Error('BOUND_INSPECTOR_DISPATCH_MISSING')};
    }
   };
   Object.defineProperty(delegate,'apply',{value:overlay,writable:true,configurable:true,enumerable:false});restorations.add(cleanup);
   onPause?.({callee,receiver,lower,name,delegate,token});
   return true;
  },
  arm(lower){const token=pending.get(lower);
   if(witnessGate){try{checkControl();return Reflect.apply(own(provider,'armBoundPause'),provider,[token])}catch(value){if(token)Reflect.apply(own(provider,'refuseBoundPause'),provider,[token,value]);throw value}}
   checkControl();if(!token||first||own(lower,'mkdelCompletion')!==token.completion||own(token.completion,'returned')!==token.callee)throw Error('BOUND_INSPECTOR_CALL_CHANGED');ready.add(token);return true}
 };
 const scriptContexts=new Map();session.on('Debugger.scriptParsed',({params})=>scriptContexts.set(params.scriptId,params.executionContextId));
 post('Runtime.enable');post('Debugger.enable');
 const key='__terminalBoundInspector_'+randomUUID().replaceAll('-','');
 Object.defineProperty(globalThis,key,{value:root,configurable:true});let remote;
 try{remote=post('Runtime.evaluate',{expression:'globalThis['+JSON.stringify(key)+']',objectGroup:key}).result.objectId}finally{delete globalThis[key]}
 if(!remote)throw Error('BOUND_INSPECTOR_ROOT_UNAVAILABLE');
 session.on('Debugger.paused',({params})=>{
  try{
   const hit=params.hitBreakpoints.map(id=>breakpoints.get(id)).filter(Boolean);
   if(hit.length!==1)throw Error('BOUND_INSPECTOR_BREAKPOINT');
   const {name,scriptId,lineNumber,columnNumber,realmRoot}=hit[0],frame=params.callFrames[0];
   if(frame.location.scriptId!==scriptId||frame.location.lineNumber!==lineNumber||frame.location.columnNumber!==columnNumber)throw Error('BOUND_INSPECTOR_LOCATION_CHANGED');
   const evaluate=(frame,expression)=>{const r=post('Debugger.evaluateOnCallFrame',{callFrameId:frame.callFrameId,expression,silent:true});if(r.exceptionDetails||!r.result.objectId)throw Error('BOUND_INSPECTOR_REFERENCE_UNAVAILABLE');return {objectId:r.result.objectId}};
   const caller=params.callFrames.find(f=>f.functionName==='invoke');if(!caller)throw Error('BOUND_INSPECTOR_ORIGINAL_INVOKE_UNAVAILABLE');
   if(alterLocal){const expression=alterLocal==='proxy'?'$sm=new Proxy($sm,{apply(target,receiver,args){return Reflect.apply(target,receiver,args)}})':'$sm=(function(original){return function(){return Reflect.apply(original,this,arguments)}})($sm)';post('Debugger.evaluateOnCallFrame',{callFrameId:frame.callFrameId,expression,silent:true})}
   const lower=evaluate(caller,'r');
   const response=post('Runtime.callFunctionOn',{objectId:realmRoot,functionDeclaration:'function(callee, receiver, lower, name){ return this.pause(callee, receiver, lower, name); }',arguments:[evaluate(frame,'$sm'),evaluate(frame,'this'),lower,{value:name}],silent:true});
   if(response.exceptionDetails)throw Error('BOUND_INSPECTOR_PAUSE_REFUSED '+JSON.stringify(response.exceptionDetails));
   const armed=post('Runtime.callFunctionOn',{objectId:realmRoot,functionDeclaration:'function(lower){return this.arm(lower)}',arguments:[lower],silent:true});if(armed.exceptionDetails)throw Error('BOUND_INSPECTOR_ARM_REFUSED');
  }catch(value){first??={value}}
  finally{post('Debugger.resume')}
 });
 try{
  for(const name of methods){
   const fn=post('Runtime.callFunctionOn',{objectId:remote,functionDeclaration:'function(name){return this.methods[name]}',arguments:[{value:name}]}).result;
   const props=post('Runtime.getProperties',{objectId:fn.objectId,ownProperties:true});
   const location=props.internalProperties?.find(p=>p.name==='[[FunctionLocation]]')?.value.value;if(!location)throw Error('BOUND_INSPECTOR_FUNCTION_LOCATION');
   let compiled=scripts.get(location.scriptId);
   if(!compiled){
    const script=post('Debugger.getScriptSource',{scriptId:location.scriptId}).scriptSource,hash=createHash('sha256').update(script).digest('hex');
    if(witnessGate&&(!fullScriptSha256||hash!==fullScriptSha256))throw Error('BOUND_INSPECTOR_FULL_SCRIPT_REQUIRED');
    const ast=parse(script,{ecmaVersion:'latest',locations:true}),functions=new Map(),lines=[0];
    for(let i=0;i<script.length;i++)if(script.charCodeAt(i)===10)lines.push(i+1);
    function visit(node){if(!node||typeof node!=='object')return;
     if(node.type==='FunctionExpression'){const offset=script.indexOf('(',node.start);if(offset<node.body.start)functions.set(offset,node)}
     for(const [key,value]of Object.entries(node)){if(key==='loc')continue;if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value)}
    }visit(ast);compiled={script,hash,lines,functions};scripts.set(location.scriptId,compiled);
   }
   const {hash,lines,functions}=compiled,expression=functions.get(lines[location.lineNumber]+location.columnNumber);
   if(!expression)throw Error('BOUND_INSPECTOR_FUNCTION_CHANGED');
   const statements=expression.body.body.filter(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&n.expression.callee.name==='$sm'&&n.expression.arguments.length===0);
   if(statements.length!==1)throw Error('BOUND_INSPECTOR_OPERATOR_UNAVAILABLE');
   const statement=statements[0],requested={scriptId:location.scriptId,lineNumber:statement.loc.start.line-1,columnNumber:statement.loc.start.column};
   locations.set(name,Object.freeze({...requested,method:root.methods[name],scriptSha256:hash,fullScript:!!fullScriptSha256&&hash===fullScriptSha256}));
   if(skipBreakpoint)continue;
   const result=post('Debugger.setBreakpoint',{location:requested});
   if(JSON.stringify(result.actualLocation)!==JSON.stringify(requested))throw Error('BOUND_INSPECTOR_BREAKPOINT_MOVED');
   let realmRoot;
   Object.defineProperty(context,key,{value:root,configurable:true});
   try{realmRoot=post('Runtime.evaluate',{expression:'globalThis['+JSON.stringify(key)+']',contextId:scriptContexts.get(location.scriptId),objectGroup:key}).result.objectId}finally{delete context[key]}
   if(!realmRoot)throw Error('BOUND_INSPECTOR_REALM_ROOT_UNAVAILABLE');
   breakpoints.set(result.breakpointId,{name,...requested,realmRoot});
  }
 }catch(value){session.disconnect();throw value}
 return Object.freeze({
  beforeDispatch(request){
   checkControl();const index=ids.indexOf(own(request,'method'));if(index<0)return;
   if(first)throw first.value;
   if(witnessGate){const row=[...tracked].map(lower=>({lower,receipt:Object.getOwnPropertyDescriptor(lower,'boundReceipt')?.value})).find(x=>x.receipt?.request===request&&x.lower.boundActivation);if(!row||observedRequests.has(request))throw Error('BOUND_INSPECTOR_TOKEN_UNAVAILABLE');observedRequests.add(request);return}
   const state=active,token=state?.token;
   if(!token||token.name!==methods[index]||pending.get(token.lower)!==token||state.dispatches)throw Error('BOUND_INSPECTOR_TOKEN_UNAVAILABLE');
   if(token.callee!==token.completion.returned||token.delegate!==token.call.delegate||token.receiver!==storage)throw Error('BOUND_INSPECTOR_CALL_CHANGED');
   state.dispatches++;pending.delete(token.lower);
   records.push(Object.freeze({scope:'FileStorage.'+token.name+':bound',callee:token.callee,delegate:token.delegate,receiver:token.receiver,
    mkdelCall:token.call,mkdelCompletion:token.completion,initial:token.call.initial,packet:token.call.packet,request,
    activationToken:token,operator:token.operator,boundCallQualified:true,closureIdentityQualified:false,nativeReceiversQualified:false}));
  },
  inspect(){if(first)throw first.value;return Object.freeze(witnessGate?[...tracked].map(lower=>Object.getOwnPropertyDescriptor(lower,'boundReceipt')?.value).filter(Boolean):records.slice())},
  close(){if(closed)return;closed=true;for(const cleanup of restorations)cleanup();for(const id of breakpoints.keys())post('Debugger.removeBreakpoint',{breakpointId:id});post('Runtime.releaseObjectGroup',{objectGroup:key});session.disconnect()}
 });
}
