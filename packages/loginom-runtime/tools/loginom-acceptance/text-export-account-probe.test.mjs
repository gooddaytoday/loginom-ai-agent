import test from 'node:test';import assert from 'node:assert/strict';
import {nativeAccountProbe,validateAccountEvidence} from './text-export-account-probe.mjs';
const binding=()=>({origin:'http://logi-test-plan.bg.local',session_id:'s',document_id:'d',workflow_id:'w',tab_tid:'t',operation_id:'prepare',deadline_epoch_ms:Date.now()+30000});
const observation=(b,menu_count,account=null)=>({...b,url:b.origin+'/app/?testable=true',build:'7.4.2',prepared_verified:true,active_tab:true,avatar_count:1,menu_count,account,line_visible:account!==null});
async function fixture(change=()=>{}){const b=binding(),queue=[observation(b,0),observation(b,1,'test-2'),observation(b,1),observation(b,0)];change(queue,b);let clicks=0,escapes=0;const page={evaluate:async()=>queue.shift(),locator:()=>({click:async()=>clicks++}),keyboard:{press:async()=>escapes++},waitForTimeout:async()=>{}};return {b,value:await nativeAccountProbe(page,b),clicks,escapes};}
test('one native open, account-only result, one close before baseline',async()=>{const f=await fixture();assert.equal(f.clicks,2);assert.equal(f.escapes,0);assert.equal(validateAccountEvidence(f.value,f.b),true);assert.equal(f.value.account,'test-2');});
test('hidden/unknown account, changed origin/document/session/workflow and duplicate owner fail',async()=>{
 for(const change of [q=>q[1].line_visible=false,q=>q[1].account='foreign',q=>q[1].origin='https://foreign.invalid',q=>q[1].document_id='other',q=>q[1].session_id='other',q=>q[1].workflow_id='other',q=>q[1].avatar_count=2,q=>q[1].menu_count=2,q=>q[0].menu_count=1]){const f=await fixture(change);assert.equal(f.value.status,'FAILED');assert.throws(()=>validateAccountEvidence(f.value,f.b));assert.ok(f.clicks<=2);}
});
test('expired shared budget makes no browser gesture',async()=>{const f=await fixture((q,b)=>b.deadline_epoch_ms=0);assert.equal(f.clicks,0);assert.equal(f.value.status,'FAILED');});
test('native code reads only a bounded visible text node, never the whole menu',()=>{const s=nativeAccountProbe.toString();assert.ok(s.includes('SHOW_TEXT'));assert.ok(s.includes('getClientRects'));assert.ok(!/menus\[0\]\.(innerText|textContent)/.test(s));});
