import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {pathToFileURL} from 'node:url';

const moduleUrl = process.env.WORKSPACE_HELPER
  ? pathToFileURL(process.env.WORKSPACE_HELPER) : new URL('../lib/workspace.mjs', import.meta.url);
const {makeWorkspaceBootstrapCode} = await import(moduleUrl);
const expected = {origin:'https://loginom.test',build:'7.4.2'};

// Production helper serialization; unsafe server VM exposes only page/__end__.
// Page/DOM are doubles. URL is available only in the distinct browser realm.
async function observe(options={}) {
  const events=[];
  const page = options.page === undefined ? {
    isClosed:()=>options.closed===true,
    url() { if (options.urlFailure) throw options.reason; return options.url ?? expected.origin+'/app'; },
    async evaluate(fn,args) {
      events.push(typeof args==='string'?'origin':'dom');
      if (options.evaluateFailure) throw options.reason;
      const element={parentElement:null,getAttribute:()=> 'MF;cntMain;tlbMainToolbar;btnAvatar',
        getBoundingClientRect:()=>({width:10,height:10}),hasAttribute:()=>false,matches:()=>false};
      let index=0;
      return runInNewContext(`(${fn.toString()})(args)`,{
        args,URL,location:{origin:options.browserOrigin??expected.origin},bg:{app:{Version:expected.build}},
        document:{documentElement:{},createTreeWalker:()=>({nextNode:()=>index++===0?element:null})},
        getComputedStyle:()=>({}),Date:{now:()=>0},
      });
    },
  } : options.page;
  const sandbox={page,__end__:()=>{}};
  assert.equal('URL' in sandbox,false);
  const fn=runInNewContext(makeWorkspaceBootstrapCode(expected),sandbox);
  return {result:JSON.parse(JSON.stringify(await fn(page))),events};
}

test('unsafe VM observes own app with browser URL authority',async()=>{
  const {result,events}=await observe();
  assert.equal(result.output.origin,expected.origin);
  assert.equal(result.output.target_state,'ready_for_prepare');
  assert.equal(result.effect_possible,false);
  assert.deepEqual(events,['origin','dom']);
});
for (const [name,url,origin] of [
  ['foreign','https://foreign.test/app','https://foreign.test'],
  ['host lookalike','https://loginom.test.foreign.test/app','https://loginom.test.foreign.test'],
  ['userinfo lookalike','https://loginom.test@foreign.test/app','https://foreign.test'],
  ['different port','https://loginom.test:8443/app','https://loginom.test:8443'],
  ['malformed','https://[broken',null],
  ['unsupported file','file:///app',null],
  ['unsupported data','data:text/html,app',null],
  ['unsupported javascript','javascript:void(0)',null],
]) test(name+' is incomplete, never not_open/ready',async()=>{
  const {result,events}=await observe({url});
  assert.equal(result.output.origin,origin);
  assert.equal(result.output.target_state,'indeterminate');
  assert.equal(result.output.authenticated,null);
  assert.equal(result.effect_possible,false);
  assert.deepEqual(events,['origin']);
});
test('known blank is distinct from unavailable observation',async()=>{
  const {result,events}=await observe({url:'about:blank'});
  assert.equal(result.output.target_state,'not_open');assert.equal(result.output.origin,null);
  assert.deepEqual(events,[]);
});
test('navigation between origin and DOM observations refuses readiness',async()=>{
  const {result}=await observe({browserOrigin:'https://foreign.test'});
  assert.equal(result.output.origin,'https://foreign.test');
  assert.equal(result.output.target_state,'indeterminate');
  assert.equal(result.output.authenticated,null);
});
for (const [name,options] of [
  ['missing page',{page:null}],['missing url',{page:{}}],
  ['missing evaluate',{page:{url:()=>expected.origin}}],
  ['closed',{closed:true}],['empty url',{url:''}],
  ['non-string url',{url:42}],
]) test(name+' cannot become a successful not_open observation',async()=>{
  await assert.rejects(observe(options));
});
for (const [label,reason] of [['Error',new Error('original',{cause:0})],['null',null],
  ['undefined',undefined],['false',false],['zero',0],['empty string','']]) {
  for(const stage of ['url','evaluate']) test(stage+' preserves exact '+label+' rejection',async()=>{
    let rejected=false;
    try { await observe({[stage+'Failure']:true,reason}); }
    catch(error) {rejected=true;assert.equal(error,reason);}
    assert.equal(rejected,true);
  });
}
