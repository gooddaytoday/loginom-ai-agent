import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {chromium} from 'playwright-core';
import {makeWorkspaceUiCode} from '../lib/workspace-ui.mjs';

const root='MF;TF-1;WizrdMCF',base=root+';ExportTextFileParamsWizard;',owner=base+'edtTimeFormat;ValueControl';

async function fixture(t,{openOnInput=false,corrupt=false,plain=false,sticky=false,staleList=false}={}) {
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true,args:['--no-proxy-server']});
 t.after(()=>browser.close());
 const page=await browser.newPage();
 await page.route('http://combo.test/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html>
  <button data-tid="MF;cntMain;tlbMainToolbar;btnAvatar">user</button>
  <div class="x-tab-active" data-tid="MF;cntMain;cntWorkspace;Workspace;t.br;tb-1">Scenario</div>
  <div data-tid="${root}"><div data-tid="${base}edtFileName">File</div>
  <div id="switch" data-tid="${base}${plain?'edtFileName':'edtTimeFormat'};SwitchButton">literal</div>
  <div data-tid="${plain?base+'edtFileName;ValueControl':owner}"><input value="Не задано (hh:nn:ss)">
  ${plain?'':`<button data-tid="${owner};trg_picker">▼</button>`}</div></div>
  ${staleList?`<div data-tid="${owner};boundlist" style="display:none">stale</div>`:''}
  <div id="list" data-tid="${owner};boundlist" style="display:none"></div>`}));
 await page.goto('http://combo.test/');
 await page.evaluate(({owner,openOnInput,corrupt,plain,sticky})=>{
  globalThis.bg={app:{Version:'7.4.2'}};
  globalThis.Ext={getCmp:id=>id==='switch'?{pressed:false}:null};
  const input=document.querySelector('input'),list=document.getElementById('list');
  const presets=['Не задано (hh:nn:ss)','h:mm','h:mm:ss','hh:mm','hh:mm:ss'];
  let highlighted=null;
  globalThis.comboEvents=[];
  const open=value=>{highlighted=value;list.textContent=value;list.style.display='block';};
  input.addEventListener('keyup',e=>{
   comboEvents.push('keyup:'+e.key);
   if(plain||e.key.length!==1)return;
   const match=presets.find(value=>value.startsWith(input.value));
   // A pending search for the full mask leaves the previous prefix match.
   if(match)open(match);
  });
  input.addEventListener('input',()=>{comboEvents.push('input:'+input.value);if(openOnInput)open('hh:mm');});
  input.addEventListener('keydown',e=>{
   if(e.key==='Escape'){comboEvents.push('Escape');if(!sticky)list.style.display='none';}
   if(e.key==='Tab'){
    comboEvents.push('Tab');
    if(list.style.display!=='none')input.value=highlighted;
    list.style.display='none';
    if(corrupt)input.value='hh:mm';
   }
  });
 },{owner,openOnInput,corrupt,plain,sticky});
 const execute=options=>runInNewContext(makeWorkspaceUiCode({expected_origin:'http://combo.test',expected_build:'7.4.2',...options}))(page);
 const observed=await execute({mode:'observe'});
 assert.equal(observed.status,'SUCCEEDED',JSON.stringify(observed.error));
 const field=observed.output.ui.elements.find(e=>e.wizard_field?.name===(plain?'destination':'time_format'));
 assert.ok(field?.allowed_actions.includes('set_wizard_field'),JSON.stringify(observed.output.wizard));
 return {page,run:text=>execute({mode:'act',snapshot:observed.output,action:{verb:'set_wizard_field',ref:field.ref,text}})};
}

test('editable export combo preserves a custom time mask instead of the highlighted prefix preset',async t=>{
 const f=await fixture(t),result=await f.run('hh:nn:ss.zzz');
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
 assert.equal(await f.page.locator('input').inputValue(),'hh:nn:ss.zzz');
 assert.equal(result.output.wizard.settings.fields.time_format.value,'hh:nn:ss.zzz');
 assert.equal(result.output.wizard.settings.applied_verified,false);
 const events=await f.page.evaluate(()=>comboEvents);
 assert.deepEqual(events.filter(e=>e.startsWith('input:')),['input:hh:nn:ss.zzz']);
 assert.equal(events.includes('keyup:h'),false);
});

test('editable export combo closes its own input-triggered list with Escape before Tab',async t=>{
 const f=await fixture(t,{openOnInput:true}),result=await f.run('hh:nn:ss.zzz');
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
 assert.equal(await f.page.locator('input').inputValue(),'hh:nn:ss.zzz');
 const events=await f.page.evaluate(()=>comboEvents);
 assert.ok(events.indexOf('Escape')<events.indexOf('Tab')&&events.includes('Escape'),JSON.stringify(events));
});

test('export combo still refuses a corrupted committed readback',async t=>{
 const f=await fixture(t,{corrupt:true}),result=await f.run('hh:nn:ss.zzz');
 assert.equal(result.status,'AMBIGUOUS');
 assert.equal(result.error.code,'WIZARD_FIELD_NOT_CONFIRMED');
});

test('export combo refuses Tab if Escape leaves its own list open',async t=>{
 const f=await fixture(t,{openOnInput:true,sticky:true}),result=await f.run('hh:nn:ss.zzz');
 assert.equal(result.status,'AMBIGUOUS');
 assert.equal(result.error.code,'WIZARD_FIELD_CHANGED');
 assert.match(result.error.message,/list stayed open/);
 assert.equal((await f.page.evaluate(()=>comboEvents)).includes('Tab'),false);
});

test('ordinary export text fields retain keyboard typing and empty replacement',async t=>{
 const f=await fixture(t,{plain:true}),result=await f.run('abc');
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
 assert.equal(await f.page.locator('input').inputValue(),'abc');
 assert.ok((await f.page.evaluate(()=>comboEvents)).includes('keyup:a'));
 const empty=await fixture(t),cleared=await empty.run('');
 assert.equal(cleared.status,'SUCCEEDED',JSON.stringify(cleared.error));
 assert.equal(await empty.page.locator('input').inputValue(),'');
});

test('export combo decides by the visible list when a hidden list shares its test ID',async t=>{
 const f=await fixture(t,{openOnInput:true,staleList:true}),result=await f.run('hh:nn:ss.zzz');
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
 assert.equal(await f.page.locator('input').inputValue(),'hh:nn:ss.zzz');
 const events=await f.page.evaluate(()=>comboEvents);
 assert.ok(events.includes('Escape')&&events.indexOf('Escape')<events.indexOf('Tab'),JSON.stringify(events));
 const sticky=await fixture(t,{openOnInput:true,sticky:true,staleList:true}),refused=await sticky.run('hh:nn:ss.zzz');
 assert.equal(refused.status,'AMBIGUOUS');
 assert.equal(refused.error.code,'WIZARD_FIELD_CHANGED');
 assert.match(refused.error.message,/list stayed open/);
});
