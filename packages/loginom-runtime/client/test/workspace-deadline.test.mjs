import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {makeWorkspacePrepareCode} from '../lib/workspace.mjs';

const code=()=>makeWorkspacePrepareCode({loginomUrl:'https://loginom.test/app',
  compatibility:{loginom_build:'7.4.2',platform:'linux',browser:'chromium'},platform:'linux',timeoutMs:2});

test('reviewer clock boundary remains DEADLINE with the original 2 ms budget',async()=>{
  const times=[0,0,0,1,2];let index=0,evaluations=0,url='about:blank';
  const page={url:()=>url,goto:async u=>{url=u;},evaluate:async()=>{evaluations++;return null;},waitForTimeout:async()=>{}};
  const result=await runInNewContext(code(),{URL,Date:{now:()=>times[index++]??2}})(page);
  assert.equal(result.reason,'DEADLINE');assert.equal(result.phase,'ui_build');
  assert.equal(result.effect_possible,false);assert.equal(result.created_draft,false);
  // The fixed single clock read may admit a read-only probe; no package gesture is available.
  assert.ok(evaluations<=1);assert.equal(index,5);
});

for(const build of [null,'foreign-build','7.4.2']) {
  test('build probe reaching absolute deadline refuses '+String(build),async()=>{
    let time=0,url='about:blank',probes=0;const delays=[];
    const page={url:()=>url,goto:async u=>{url=u;},evaluate:async()=>{probes++;time=2;return build;},
      waitForTimeout:async ms=>{delays.push(ms);},locator:()=>{throw Error('No downstream gesture permitted');}};
    const result=await runInNewContext(code(),{URL,Date:{now:()=>time}})(page);
    assert.equal(result.status,'NOT_READY');assert.equal(result.reason,'DEADLINE');assert.equal(result.phase,'ui_build');
    assert.equal(probes,1);assert.deepEqual(delays,[]);assert.equal(result.effect_possible,false);assert.equal(result.created_draft,false);
  });
}

test('observed wrong build inside budget remains UI_BUILD_MISMATCH',async()=>{
  let time=0,url='about:blank',probes=0;
  const page={url:()=>url,goto:async u=>{url=u;},evaluate:async()=>{probes++;time=1;return 'foreign-build';},
    locator:()=>{throw Error('Mismatch must refuse before workspace gestures');}};
  const result=await runInNewContext(code(),{URL,Date:{now:()=>time}})(page);
  assert.equal(result.status,'INCOMPATIBLE');assert.equal(result.reason,'UI_BUILD_MISMATCH');
  assert.equal(result.target.loginom_build,'foreign-build');assert.equal(result.effect_possible,false);assert.equal(probes,1);
});

test('waiting for build consumes the same absolute budget, without extending it',async()=>{
  let time=0,url='about:blank',probes=0;const delays=[];
  const page={url:()=>url,goto:async u=>{url=u;},evaluate:async()=>{probes++;return null;},
    waitForTimeout:async ms=>{delays.push(ms);time+=ms;}};
  const result=await runInNewContext(code(),{URL,Date:{now:()=>time}})(page);
  assert.equal(result.reason,'DEADLINE');assert.equal(result.phase,'ui_build');
  assert.equal(time,2);assert.equal(probes,1);assert.deepEqual(delays,[2]);assert.equal(result.effect_possible,false);
});
