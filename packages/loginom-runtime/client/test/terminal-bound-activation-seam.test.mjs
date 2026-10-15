// Bounded diagnostic only. No native Loginom/SDK/Page, runtime qualification or H0 exposure.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {createHash} from 'node:crypto';
const directory=process.env.TERMINAL_INPUT_DIR;
if(!directory)throw Error('TERMINAL_INPUT_DIR_REQUIRED');
const sources=await Promise.all(['mscorlib.js','Task.js'].map(async name=>({name,text:await readFile(directory+'/'+name,'utf8')})));
async function realm(){const context=createContext({});runInContext('window=globalThis',context);for(const source of sources)runInContext(source.text,context,{filename:source.name});return context}

test('bound seam direct original call bypasses returned call/apply hooks and retains delegate receiver',async()=>{
 const context=await realm();const evidence=runInContext(`(()=>{
  const nativeApply=Reflect.apply,receiver={},events=[];
  let returnedCallHooks=0,returnedApplyHooks=0;
  const delegate=function(){events.push({receiver:this,dispatch:true});return 'original outcome'};
  const bound=ss.mkdel(receiver,delegate),originalBound=bound;
  Object.defineProperty(bound,'call',{configurable:true,value(){returnedCallHooks++;throw Error('unused')}});
  Object.defineProperty(bound,'apply',{configurable:true,value(){returnedApplyHooks++;throw Error('unused')}});
  const result=bound();
  return {same:bound===originalBound,result,receiverSame:events[0].receiver===receiver,dispatches:events.length,returnedCallHooks,returnedApplyHooks};
 })()`,context);
 assert.equal(evidence.same,true);assert.equal(evidence.result,'original outcome');assert.equal(evidence.receiverSame,true);assert.equal(evidence.dispatches,1);
 assert.equal(evidence.returnedCallHooks,0);assert.equal(evidence.returnedApplyHooks,0);
});

test('bound seam delegate apply observation cannot distinguish original bound from substituted callee',async()=>{
 const context=await realm();const evidence=runInContext(`(()=>{
  const nativeApply=Reflect.apply,receiver={},observations=[];
  let active;
  const delegate=function(){if(!active)throw Error('dispatch outside delegate');active.dispatches++;return 'original outcome'};
  const mkdel=ss.mkdel,returned=mkdel(receiver,delegate);
  const originalApply=Function.prototype.apply;
  Object.defineProperty(delegate,'apply',{configurable:true,value:function(target,args){
   if(this!==delegate||target!==receiver)throw Error('foreign receiver');
   const row={delegateSame:this===delegate,receiverSame:target===receiver,dispatches:0};observations.push(row);active=row;
   try{return nativeApply(originalApply,this,[target,args])}finally{active=undefined}
  }});
  const originalResult=returned();
  // Explicit negative substitution. The retained returned function is never invoked here.
  const replacement=function(){return delegate.apply(receiver,arguments)};
  const replacementResult=replacement();
  const proxy=new Proxy(returned,{apply(target,receiver,args){return nativeApply(target,receiver,args)}});
  const proxyResult=proxy();
  return {observations,originalResult,replacementResult,proxyResult,replacementSame:replacement===returned,proxySame:proxy===returned,
   returnedCalleeIdentityQualified:false,closureIdentityQualified:false,nativeReceiversQualified:false};
 })()`,context);
 assert.equal(evidence.replacementSame,false);assert.equal(evidence.proxySame,false);
 assert.deepEqual(JSON.parse(JSON.stringify(evidence.observations)),Array.from({length:3},()=>({delegateSame:true,receiverSame:true,dispatches:1})));
 assert.equal(evidence.originalResult,evidence.replacementResult);assert.equal(evidence.originalResult,evidence.proxyResult);
 assert.equal(evidence.returnedCalleeIdentityQualified,false);assert.equal(evidence.closureIdentityQualified,false);assert.equal(evidence.nativeReceiversQualified,false);
});

test('bound seam pinned strict returned function exposes no caller/arguments activation proof',async()=>{
 const context=await realm();const evidence=runInContext(`(()=>{
  const receiver={},checks=[];let returned;
  const delegate=function(){for(const key of ['caller','arguments']){try{returned[key];checks.push({key,refused:false})}catch(value){checks.push({key,refused:value instanceof TypeError})}}};
  returned=ss.mkdel(receiver,delegate);returned();return checks;
 })()`,context);
 assert.deepEqual(JSON.parse(JSON.stringify(evidence)),[{key:'caller',refused:true},{key:'arguments',refused:true}]);
});

test('bound seam wrapping delegate before mkdel changes the original delegate operand',async()=>{
 const context=await realm();const evidence=runInContext(`(()=>{
  const receiver={},originalDelegate=function(){return this===receiver},wrapper=function(){return Reflect.apply(originalDelegate,this,arguments)};
  const returned=ss.mkdel(receiver,wrapper);return {sameOperand:wrapper===originalDelegate,result:returned(),closureIdentityQualified:false};
 })()`,context);
 assert.equal(evidence.sameOperand,false);assert.equal(evidence.result,true);assert.equal(evidence.closureIdentityQualified,false);
});

console.log('bound seam input SHA256',JSON.stringify(sources.map(source=>({name:source.name,sha256:createHash('sha256').update(source.text).digest('hex')}))));
