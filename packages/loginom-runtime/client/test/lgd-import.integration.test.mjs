import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {configureLgdImportBrowser} from '../lib/lgd-import-procedure.mjs';
test('native LGD import retains properties, checks corruption and refuses a foreign owner',async t=>{
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true,args:['--no-proxy-server']});t.after(()=>browser.close());
 for(const fault of [null,'corrupt','owner']){
  const page=await browser.newPage();t.after(()=>page.close());
  await page.route('http://lgd.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));await page.goto('http://lgd.test/');
  await page.evaluate(fault=>{
   const root=document.createElement('div');root.dataset.tid='MF;TF-1;WizrdMCF';document.body.append(root);
   const components=new Map();let stage='ImportNativePreviewWizard';
   const card=document.createElement('div');card.dataset.tid=root.dataset.tid+';ImportNativePreviewWizard';root.append(card);
   const make=(id,value)=>{const e=document.createElement('div');e.id='c'+components.size;e.dataset.tid=card.dataset.tid+';'+id;card.append(e);
    const input=document.createElement('input');input.type=typeof value==='boolean'?'checkbox':'text';input.value=String(value);input.checked=value===true;e.append(input);
    components.set(e.id,{el:{dom:e},inputEl:{dom:input},getValue:()=>typeof value==='boolean'?input.checked:input.value,getRawValue:()=>typeof value==='boolean'?input.checked:input.value,pressed:false});
    if(id.endsWith(';ValueControl')){const s=document.createElement('div');s.id='s'+components.size;s.dataset.tid=e.dataset.tid.replace(';ValueControl',';SwitchButton');card.append(s);components.set(s.id,{pressed:false});}
   };
   for(const [id,v]of Object.entries({'edtFileName;ValueControl':'','edtUseChecksum;ValueControl':true,edtConnection:'Локальное',edtCompression:'LZ4',edtDDFSystem:'64-битная система',edtWrittenChecksum:'Сжатых данных'}))make(id,v);
   const pages={ImportNativePreviewWizard:card};
   for(const id of ['ColumnsMappingEngineOutputPortWizard','DoneWizard']){const e=document.createElement('div');e.dataset.tid=root.dataset.tid+';'+id;e.textContent=id;e.style.display='none';root.append(e);pages[id]=e;}
   const error=document.createElement('button');error.dataset.tid=root.dataset.tid+';btnError';error.dataset.qtip='Контрольная сумма блока не совпадает';error.style.display='none';root.append(error);
   const next=document.createElement('button');next.dataset.tid=root.dataset.tid+';btnNext';next.textContent='Далее';root.append(next);
   next.onclick=()=>{if(fault==='corrupt'){error.style.display='block';return;}pages[stage].style.display='none';stage=stage==='ImportNativePreviewWizard'?'ColumnsMappingEngineOutputPortWizard':'DoneWizard';pages[stage].style.display='block';};
   globalThis.Ext={getCmp:id=>components.get(id)};
   const model={FCardLayout:{getActiveItem:()=>({el:{dom:pages[stage]}})}};
   const workspace={getActiveTab:()=>({Controller:{FController:model}})};
   globalThis.bg={app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{Items:{Workspace:workspace}}}}}};
  },fault);
  const task={document_id:'doc',workflow_ref:{prefix:'MF;TF-1'},node:{node_id:'node'},source_path:'/own/source.lgd',checksum:'verify',origin:'http://lgd.test',build:'7.4.2',deadline:Date.now()+5000};
  const result=await configureLgdImportBrowser(page,task,async()=>({verified:fault!=='owner',surface:'wizard',node_id:'node'}));
  assert.equal(result.verified,fault===null);
  if(!fault){assert.equal(result.configuration.source.source_path,'/own/source.lgd');assert.equal(result.configuration.source.checksum,true);assert.equal(result.configuration.source.compression,'LZ4');}
  if(fault==='corrupt'){assert.match(result.error,/Контрольная сумма/);assert.equal(result.configuration,undefined);}
  if(fault==='owner'){assert.equal(result.effect_possible,false);assert.equal(await page.locator('input[type=text]').first().inputValue(),'');}
 }
});
