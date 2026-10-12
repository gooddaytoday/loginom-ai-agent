import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
// Executed installed SDK function; Page and completion scheduler are doubles.
// No producer, defining-source qualification, native handle or admission is made.
const source=await readFile(process.env.PASSIVE_SDK_SOURCE,'utf8');
const a=source.indexOf('    runCode = defineTabTool('),b=source.indexOf('\n    });',a);
const h=source.indexOf('handle: async (tab2, params2, response2) => {',a);
assert.ok(a>0&&b>h);const code=source.slice(h+8,b).trim();
class Completion extends Promise{constructor(){let yes,no;super((r,j)=>{yes=r;no=j});this.resolve=v=>{this.done=true;yes(v)};this.reject=v=>{this.done=true;no(v)}}isDone(){return this.done}static get [Symbol.species](){return Promise}}
const handle=vm.runInNewContext('('+code+')',{import_vm:{default:vm},ManualPromise:Completion});
async function dispatch(page){const events=[],texts=[];
 const tab={page,context:{onUnhandledRejection(){events.push('install-rejection');return ()=>events.push('unsubscribe')}},async waitForCompletion(fn){events.push('request');await fn();events.push('completed')}};
 const response={addCode(){events.push('code')},addTextResult(value){texts.push(value)}};
 let rejected=false,value;try{await handle(tab,{code:'async page => page.read()'},response)}catch(error){rejected=true;value=error}
 return {events,texts,rejected,value};
}
test('installed SDK result cannot transport defining exports or identity aliasing',async()=>{
 const ref={},fn=function nativeClosure(){},record={bytes:Buffer.from('explicit fixture only'),definingModule:ref,exports:new Map([['SessionsManagerForm',fn]]),value:fn,token:ref,again:ref};
 let reads=0;const result=await dispatch({read(){reads++;return record}});assert.equal(reads,1);assert.equal(result.rejected,false);
 const dto=JSON.parse(result.texts[0]);assert.equal(dto.exports instanceof Map,false);assert.equal(dto.value,undefined);assert.equal(Buffer.isBuffer(dto.bytes),false);assert.notEqual(dto.token,dto.again);assert.notEqual(dto.definingModule,ref);
 assert.ok(result.events.indexOf('request')<result.events.indexOf('completed'));
});
for(const value of [Error('primary',{cause:0}),undefined,null,false,0,''])test('installed SDK preserves read rejection '+String(value),async()=>{
 let reads=0;const result=await dispatch({read(){reads++;throw value}});assert.equal(reads,1);assert.equal(result.rejected,true);assert.equal(result.value,value);assert.equal(result.texts.length,0);
});
test('function source text does not identify private captured dependency',()=>{
 const make=dependency=>()=>dependency;const a=make({}),b=make({});assert.equal(a.toString(),b.toString());assert.notEqual(a(),b());
});
test('same byte pin alone does not identify loaded module or original completion',()=>{
 const bytes=Buffer.from('explicit fixture module text');const hash=createHash('sha256').update(bytes).digest('hex');
 const first={bytes,definingModule:{},completion:Promise.resolve()},later={bytes,definingModule:{},completion:Promise.resolve()};
 assert.equal(createHash('sha256').update(later.bytes).digest('hex'),hash);assert.notEqual(first.definingModule,later.definingModule);assert.notEqual(first.completion,later.completion);
});
