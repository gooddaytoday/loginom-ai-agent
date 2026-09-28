import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {captureJavascriptWizardError,readJavascriptWizardErrorDialog} from './javascript-wizard-error.mjs';

function fixture({auto=false,close=true}={}) {
  const state={dialog:auto,buttonClicks:0,okClicks:0},tid='msgbox-1';
  const element=(id,text='')=>({id,isConnected:true,innerText:text,getBoundingClientRect:()=>({width:100,height:30}),
    getAttribute:key=>key==='data-tid'?id:null});
  const body=element(tid+';cnt;cnt;cmp','SyntaxError: Syntax error at code (:4:33)');
  const ok=element(tid+';tlb;ok','OK');
  const dialog={...element(tid),querySelectorAll:()=>[]};
  const context=vm.createContext({document:{querySelectorAll:selector=>!state.dialog?[]:
    selector.includes('.x-message-box')?[dialog]:selector.includes(';cnt;cnt;cmp')?[body]:selector.includes(';tlb;ok')?[ok]:[]},
    getComputedStyle:()=>({visibility:'visible'})});
  const page={
    evaluate:async fn=>vm.runInContext('('+fn.toString()+')()',context),
    waitForFunction:async fn=>{if(!vm.runInContext('('+fn.toString()+')()',context))throw Error('Dialog state unconfirmed');},
    locator:selector=>({filter:()=>({click:async()=>{
      if(selector.includes('btnError')){state.buttonClicks++;state.dialog=true;return;}
      if(selector.includes(';tlb;ok')){state.okClicks++;if(close)state.dialog=false;return;}
      throw Error('Unexpected control');
    }})})
  };
  const read=async()=>({native_owner_verified:true,wizard_visible:true,page_tid:'MF;TF-1;WizrdMCF;JavaScriptCodeWizard',
    pending:false,owner_verified:!state.dialog,boundary_refusal:state.dialog?'foreign_dialog':null,
    dialog_diagnostic:{visible_count:state.dialog?1:0,foreign_count:state.dialog?1:0,roots:state.dialog?[{tid}]:[]},
    wizard_error:{exact_count:1,visible:true,tooltip:'SyntaxError: Syntax error at code (:4:33)',
      tooltip_truncated:false,tid:'MF;TF-1;WizrdMCF;btnError'}});
  const identity={effect_id:'owned-once',node_id:'js-node',source_sha256:'source'};
  return {state,page,read,identity};
}

test('private operator opens quiet error once, reads exact native text, closes OK and verifies owner',async()=>{
  const f=fixture(),before=await f.read(),events=[];
  const result=await captureJavascriptWizardError({page:f.page,read:f.read,identity:f.identity,stage:'next',before,
    after:{...before,wizard_error_refusal:true},record:async event=>events.push(event),deadline:Date.now()+5000});
  assert.deepEqual([f.state.buttonClicks,f.state.okClicks,f.state.dialog],[1,1,false]);
  assert.equal(result.dialog_text,'SyntaxError: Syntax error at code (:4:33)');
  assert.equal(result.dialog_closed,true);assert.equal(events[0].phase,'wizard_error_button_dispatch');
  assert.equal(events[1].phase,'wizard_error_observed');
});

test('private operator handles self-opened dialog without replaying error button',async()=>{
  const f=fixture({auto:true}),before={...await f.read(),boundary_refusal:null},events=[];
  const after={...await f.read(),wizard_error_refusal:true};
  const result=await captureJavascriptWizardError({page:f.page,read:f.read,identity:f.identity,stage:'next',before,after,
    record:async event=>events.push(event),deadline:Date.now()+5000});
  assert.deepEqual([f.state.buttonClicks,f.state.okClicks,f.state.dialog],[0,1,false]);
  assert.equal(result.dialog_closed,true);assert.deepEqual(events.map(event=>event.phase),['wizard_error_observed']);
});

test('unclosed dialog cannot yield an owned diagnostic or claim cleanup',async()=>{
  const f=fixture({close:false}),before=await f.read(),events=[];
  await assert.rejects(captureJavascriptWizardError({page:f.page,read:f.read,identity:f.identity,stage:'next',before,
    after:{...before,wizard_error_refusal:true},record:async event=>events.push(event),deadline:Date.now()+5000}),/Dialog state unconfirmed/);
  assert.equal(f.state.dialog,true);assert.equal(events.some(event=>event.phase==='wizard_error_observed'),false);
});

test('serialized browser reader returns bounded text and exact OK identity',()=>{
  const f=fixture({auto:true});
  assert.equal(typeof readJavascriptWizardErrorDialog,'function');
  return f.page.evaluate(readJavascriptWizardErrorDialog).then(result=>{
    assert.equal(result.text,'SyntaxError: Syntax error at code (:4:33)');assert.equal(result.text_truncated,false);
  });
});
