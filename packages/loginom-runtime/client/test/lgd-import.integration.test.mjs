import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {configureLgdImportBrowser} from '../lib/lgd-import-procedure.mjs';
test('native LGD import retains properties, checks corruption and refuses a foreign owner',async t=>{
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true,args:['--no-proxy-server']});t.after(()=>browser.close());
 for(const fault of [null,'header_pending','corrupt','corrupt_early','corrupt_preview','owner','checksum_disabled','checksum_retained_disabled','checksum_absent','checksum_both']){
  const page=await browser.newPage();t.after(()=>page.close());
  await page.route('http://lgd.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));await page.goto('http://lgd.test/');
  await page.evaluate(fault=>{
   const root=document.createElement('div');root.dataset.tid='MF;TF-1;WizrdMCF';document.body.append(root);
   const components=new Map();let stage='ImportNativePreviewWizard';
   const card=document.createElement('div');card.dataset.tid=root.dataset.tid+';ImportNativePreviewWizard';root.append(card);
   const make=(id,value)=>{const e=document.createElement('div');e.id='c'+components.size;e.dataset.tid=card.dataset.tid+';'+id;card.append(e);
    const input=document.createElement('input');input.type=typeof value==='boolean'?'checkbox':'text';input.value=String(value);input.checked=value===true;e.append(input);if(typeof value==='boolean')e.onclick=event=>{if(event.target===e)input.checked=!input.checked;};
    components.set(e.id,{el:{dom:e},inputEl:{dom:input},getValue:()=>typeof value==='boolean'?input.checked:input.value,getRawValue:()=>typeof value==='boolean'?input.checked:input.value,pressed:false});
    if(id.endsWith(';ValueControl')){const s=document.createElement('div');s.id='s'+components.size;s.dataset.tid=e.dataset.tid.replace(';ValueControl',';SwitchButton');card.append(s);components.set(s.id,{pressed:false});}
   };
   for(const [id,v]of Object.entries({'edtFileName;ValueControl':fault==='checksum_retained_disabled'?'/own/source.lgd':'','edtUseChecksum;ValueControl':fault==='checksum_retained_disabled'?false:true,edtConnection:'Локальное',edtCompression:fault==='header_pending'||fault==='corrupt_early'?'':'LZ4',edtDDFSystem:'64-битная система',edtWrittenChecksum:fault==='checksum_absent'?'Нет':fault==='checksum_both'?'Сжатых и несжатых данных':'Сжатых данных'}))make(id,v);
   const pages={ImportNativePreviewWizard:card};
   for(const id of ['ColumnsMappingEngineOutputPortWizard','DoneWizard']){const e=document.createElement('div');e.dataset.tid=root.dataset.tid+';'+id;e.textContent=id;e.style.display='none';root.append(e);pages[id]=e;}
   const error=document.createElement('button');error.dataset.tid=root.dataset.tid+';btnError';error.dataset.qtip='Контрольная сумма блока не совпадает';error.style.display='none';root.append(error);
   if(fault==='corrupt_early')error.style.display='block';
   if(fault==='header_pending')card.querySelector('[data-tid$=";edtFileName;ValueControl"] input').onchange=()=>setTimeout(()=>{card.querySelector('[data-tid$=";edtCompression"] input').value='LZ4';},100);
   if(fault==='corrupt_preview'){
    const preview=document.createElement('div');preview.className='bg-preview-panel-error';card.append(preview);
    const status=document.createElement('div');status.dataset.tid=card.dataset.tid+';PreviewPanel;cntErrorInfo';preview.append(status);
    const mask=document.createElement('div');mask.className='bg-mask-message';mask.textContent='Подготовка предпросмотра';mask.style.display='none';card.append(mask);
    card.querySelector('[data-tid$=";edtFileName;ValueControl"] input').onchange=()=>{mask.style.display='block';setTimeout(()=>{status.textContent='Контрольная сумма блока не совпадает';mask.style.display='none';},100);};
   }
   const next=document.createElement('button');next.dataset.tid=root.dataset.tid+';btnNext';next.textContent='Далее';root.append(next);globalThis.nexts=0;
   next.onclick=()=>{globalThis.nexts++;if(fault==='corrupt'){error.style.display='block';return;}card.querySelector('[data-tid$=";edtCompression"] input').value='LZ4';pages[stage].style.display='none';stage=stage==='ImportNativePreviewWizard'?'ColumnsMappingEngineOutputPortWizard':'DoneWizard';pages[stage].style.display='block';};
   globalThis.Ext={getCmp:id=>components.get(id)};
   const model={FCardLayout:{getActiveItem:()=>({el:{dom:pages[stage]}})}};
   const workspace={getActiveTab:()=>({Controller:{FController:model}})};
   globalThis.bg={app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{Items:{Workspace:workspace}}}}}};
  },fault);
  const task={document_id:'doc',workflow_ref:{prefix:'MF;TF-1'},node:{node_id:'node'},source_path:fault==='checksum_retained_disabled'?undefined:'/own/source.lgd',checksum:fault==='checksum_disabled'?'ignore':fault==='checksum_retained_disabled'?undefined:'verify',origin:'http://lgd.test',build:'7.4.2',deadline:Date.now()+5000};
  const result=await configureLgdImportBrowser(page,task,async()=>({verified:fault!=='owner',surface:'wizard',node_id:'node'}));
  assert.equal(result.verified,[null,'header_pending','checksum_disabled','checksum_retained_disabled','checksum_absent','checksum_both'].includes(fault),JSON.stringify({fault,result}));
  if(fault?.startsWith('checksum_'))assert.equal(result.configuration.source.checksum,!['checksum_disabled','checksum_retained_disabled'].includes(fault));
  if(!fault||fault==='header_pending'){assert.equal(result.configuration.source.source_path,'/own/source.lgd');assert.equal(result.configuration.source.checksum,true);assert.equal(result.configuration.source.compression,'LZ4');}
  if(fault?.startsWith('corrupt')){assert.match(result.error,/Контрольная сумма/);assert.equal(result.configuration,undefined);}
  if(fault==='corrupt_early')assert.equal(await page.evaluate(()=>globalThis.nexts),0);
  if(fault==='corrupt_preview')assert.equal(await page.evaluate(()=>globalThis.nexts),0);
  if(fault==='owner'){assert.equal(result.effect_possible,false);assert.equal(await page.locator('input[type=text]').first().inputValue(),'');}
 }
});
