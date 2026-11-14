import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import vm from 'node:vm';
import {configureLoopBrowser,selectLoopBodyRecord,loopSettingsSupported} from '../lib/loop-procedure.mjs';

const root='MF;TF-1;WizrdMCF',first=root+';LoopNodeWizard',params=root+';LoopParamsWizard';
async function fixture(t,{loading=false,unrendered=false,mask=false,dialog=false}={}){
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true,args:['--no-proxy-server']});
 t.after(()=>browser.close());const page=await browser.newPage();
 await page.route('http://loop.test/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8">
 <div data-tid="${root}"><div data-tid="${first}"><div id="tree" data-tid="${first};pnlNodesTree">
 <div id="foreign"><button data-tid="foreign;TreeCheckbox">Same</button></div>
 <div id="body"><button data-tid="body;TreeCheckbox">Same</button></div></div>
 <div data-tid="${first};chkSaveOwnConfguration">save</div></div>
 <div id="params" data-tid="${params}" style="display:none">
 <div id="group" data-tid="${params};pedLoopKind;ValueControl;radiofield-2"><button data-tid="${params};pedLoopKind;ValueControl;radiofield-2;DisplayEl">group</button></div>
 <div data-tid="${params};pedGroupProcessingKind;ValueControl"><input value="Фиксированный размер групп"></div>
 <div data-tid="${params};pedGroupSize;ValueControl"><input id="size" value="10"></div>
 ${['pedParallelProcessing','pedAppendIterationIdentifiers','pedIgnoreErrors'].map(k=>`<div data-tid="${params};${k};ValueControl">off</div>`).join('')}
 <div data-tid="${params};cbxLoopVariable"><input value=""></div></div>
 <div id="done" data-tid="${root};DoneWizard" style="display:none">Done</div>
 <button id="next" data-tid="${root};btnNext">Next</button></div>
 <div id="mask" class="x-mask" style="display:none">loading</div>
 ${dialog?'<div role="dialog">foreign dialog</div>':''}` }));
 await page.goto('http://loop.test/');
 await page.evaluate(({loading,unrendered,mask})=>{
  const proxy={__ObjectId:{Module:'module',Instance:1}},workflow={FSubNodes:{FItems:[]}};
  workflow.FSubNodes.FItems.push({FGuid:'body',FModelNode:proxy});
  const row={data:{target:proxy,nodeType:4,iconCls:'bg-vendor-icon-modelgeneric',checked:false,text:'Same'},internalId:'body-id'};
  const foreign={data:{target:{},text:'Same'}};
  const store={isLoading:()=>loading,getRoot:()=>({childNodes:[{data:{nodeType:3,loaded:true,expanded:true},childNodes:[foreign,row]},{}]})};
  const grid={el:{dom:document.getElementById('tree')},getStore:()=>store,getView:()=>({getNode:()=>unrendered?null:document.getElementById('body'),getRecord:()=>row})};
  globalThis.Ext={getCmp:()=>grid};
  class LoopNodeWizard{FReferencedVendor={__ObjectId:{Module:'derived',Instance:2}};}
  class LoopParamsWizard{
   FSocketStore={getRange:()=>[{data:{Value:{Module:'port',Instance:3},DisplayText:'Page'}}]};
   FInputVariablesStore={getCount:()=>0};FOutputVariablesStore={getCount:()=>0};
   FItems={cbxSourceSocket:{value:{Module:'port',Instance:3}},txtReferenceNode:{inputEl:{dom:{value:'Same'}}}};
  }
  const wizard={FWizardItems:{FItems:[new LoopNodeWizard(),new LoopParamsWizard()].map(FWizard=>({FWizard}))}};
  const Workspace={getActiveTab:()=>({Controller:{Node:{data:{node:workflow}},FController:wizard}})};
  globalThis.bg={app:{Version:'7.4.2',WorkFlowTreeNode:Object,Application:{FInstance:{FMainForm:{Items:{Workspace}}}}}};
  globalThis.gestures=[];globalThis.bufferCommittedAt=null;
  document.getElementById('foreign').onclick=()=>gestures.push('foreign');
  document.getElementById('body').onclick=()=>{
   gestures.push('body');setTimeout(()=>row.data.checked=true,100);
   if(mask){document.getElementById('mask').style.display='block';setTimeout(()=>document.getElementById('mask').style.display='none',350);}
  };
  document.getElementById('group').onclick=()=>{
   gestures.push('group');document.getElementById('group').classList.add('x-form-cb-checked');
   setTimeout(()=>{document.getElementById('size').value='1';bufferCommittedAt=Date.now();},350);
  };
  document.getElementById('next').onclick=()=>{
   gestures.push(bufferCommittedAt===null?'first-next':{next_after_commit:Date.now()-bufferCommittedAt});
   if(document.getElementById('params').style.display==='none'){
    document.getElementById('tree').parentElement.style.display='none';document.getElementById('params').style.display='block';
   }else{document.getElementById('params').style.display='none';document.getElementById('done').style.display='block';}
  };
 },{loading,unrendered,mask});
 const owner={verified:true,document_id:'doc',workflow_id:'wf',node_id:'loop',surface:'wizard',tid:root};
 // The actual MCP sandbox has no Node timers. Keep that production boundary.
 const run=()=>vm.runInNewContext('('+configureLoopBrowser.toString()+')')(page,{origin:'http://loop.test',build:'7.4.2',deadline:Date.now()+10000,
  binding:{document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1'},node:{node_id:'loop'}},
  parameters:{body:{document_id:'doc',workflow_id:'wf',node_id:'body'}},source:{proxy:{Module:'module',Instance:1},ports:[{direction:'input',index:0,guid:'input',label:'Page',kind:'table'}]}},async()=>owner,selectLoopBodyRecord,loopSettingsSupported);
 return {page,run};
}
test('production Loop selects native identity among duplicate labels and awaits buffered group size',async t=>{
 const f=await fixture(t,{mask:true}),out=await f.run();assert.equal(out.status,'SUCCEEDED',JSON.stringify(out));
 const events=await f.page.evaluate(()=>gestures);assert.deepEqual(events.slice(0,3),['body','first-next','group']);
 assert.ok(events[3].next_after_commit>=200,JSON.stringify(events));assert.equal(out.configuration.settings.group_size,'1');
});
for(const fault of ['loading','unrendered','dialog'])test('production Loop refuses '+fault+' before a gesture',async t=>{
 const f=await fixture(t,{[fault]:true}),out=await f.run();assert.equal(out.status,'NOT_APPLIED');
 assert.deepEqual(await f.page.evaluate(()=>gestures),[]);assert.equal(out.effect_possible,false);
});
