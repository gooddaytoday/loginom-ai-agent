import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {javascriptStopProbe} from './javascript-stop-case.mjs';
import {javascriptDiscoveryProbe} from './javascript-discovery-probes.mjs';
import {inspectJavascriptModulePolicy} from '../../client/lib/javascript-module-policy.mjs';
import {runJavascriptStopProbe} from './javascript-stop-probe.mjs';
const {parse}=createRequire(new URL('../../client/lib/javascript-module-policy.mjs',import.meta.url))('acorn');

test('private stop source has an empty finite loop with clock and iteration bounds and keeps the independent business source',()=>{
  const p=javascriptStopProbe(),ast=parse(p.source,{ecmaVersion:'latest',sourceType:'module'});
  const loops=ast.body.filter(n=>n.type==='ForStatement');assert.equal(loops.length,2);
  const loop=loops[0];assert.equal(loop.body.type,'BlockStatement');assert.equal(loop.body.body.length,0);
  assert.equal(loop.test.operator,'&&');assert.equal(loop.test.left.operator,'<');assert.equal(loop.test.left.right.value,100000000);
  assert.equal(loop.test.right.operator,'<');assert.equal(loop.test.right.right.value,45000);
  assert.equal(loop.update.operator,'++');assert.equal(loop.update.argument.name,'stopIteration');
  assert.equal(p.source.slice(loop.end+1),p.short.source.slice(p.short.source.indexOf('for (var row=0;')));
  assert.equal(p.source_sha256,createHash('sha256').update(p.source).digest('hex'));
  assert.equal(inspectJavascriptModulePolicy(p.source).status,'ADMITTED');
  assert.equal(javascriptDiscoveryProbe(p.id).source_sha256,p.source_sha256);
  assert.equal(p.short.id,'p1-business-code-base');assert.equal(p.short.source.includes('stopIteration'),false);
});

test('altered source, digest, arbitrary probe and expired deadline refuse before any runtime access',async()=>{
  const p=javascriptStopProbe(),runtime=new Proxy({}, {get(){throw Error('Unexpected runtime access');}});
  for(const probe of [{...p,source:p.source+' '},{...p,source_sha256:'0'.repeat(64)},{...p,id:'arbitrary'}])
    await assert.rejects(runJavascriptStopProbe({probe,runtime,deadline:Date.now()+10000,onSourcePending:()=>{}}),/admission differs/);
  await assert.rejects(runJavascriptStopProbe({probe:p,runtime,deadline:Date.now()-1,onSourcePending:()=>{}}),/admission differs/);
});
