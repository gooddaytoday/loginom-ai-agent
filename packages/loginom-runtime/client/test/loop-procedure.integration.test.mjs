import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import vm from 'node:vm';
import {configureLoopBrowser,selectLoopBodyRecord,loopSettingsSupported,readSavedLoopForBrowser} from '../lib/loop-procedure.mjs';
import {configureSupernodeVariablesBrowser} from '../lib/supernode-procedure.mjs';

const root='MF;TF-1;WizrdMCF',first=root+';LoopNodeWizard',params=root+';LoopParamsWizard';
async function fixture(t,{loading=false,unrendered=false,mask=false,dialog=false,disabledGrid=false,foreignMask=false,forMode=false,identifiers=true}={}){
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true,args:['--no-proxy-server']});
 t.after(()=>browser.close());const page=await browser.newPage();
 await page.route('http://loop.test/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8">
 <div data-tid="${root}"><div data-tid="${first}"><div id="tree" data-tid="${first};pnlNodesTree">
 <div id="foreign"><button data-tid="foreign;TreeCheckbox">Same</button></div>
 <div id="body"><button data-tid="body;TreeCheckbox">Same</button></div></div>
 <div data-tid="${first};chkSaveOwnConfguration">save</div></div>
 <div id="params" data-tid="${params}" style="display:none">
 <div class="${forMode?'x-form-cb-checked':''}" data-tid="${params};pedLoopKind;ValueControl;radiofield">FOR</div>
 <div data-tid="${params};pedIterationCount;ValueControl"><input id="count" value="10"></div>
 <div id="group" data-tid="${params};pedLoopKind;ValueControl;radiofield-2"><button data-tid="${params};pedLoopKind;ValueControl;radiofield-2;DisplayEl">group</button></div>
 <div data-tid="${params};pedGroupProcessingKind;ValueControl"><input value="Фиксированный размер групп"></div>
 <div data-tid="${params};pedGroupSize;ValueControl"><input id="size" value="10"></div>
 ${['pedParallelProcessing','pedAppendIterationIdentifiers','pedIgnoreErrors'].map(k=>`<div data-tid="${params};${k};ValueControl"><button data-tid="${params};${k};ValueControl;DisplayEl">off</button></div>`).join('')}
 <div id="variable" data-tid="${params};cbxLoopVariable"><input value=""><button id="picker" data-tid="${params};cbxLoopVariable;trg_picker">pick</button></div>
 <div id="list" style="display:none"><button id="page" data-tid="${params};cbxLoopVariable;boundlist;Params.Page">Params.Page</button><button id="limit">Params.Limit</button></div><div id="keys" data-tid="${params};grdDataSet"></div></div>
 <div id="done" data-tid="${root};DoneWizard" style="display:none">Done</div>
 <button id="next" data-tid="${root};btnNext">Next</button></div>
 <div id="mask" class="x-mask" style="display:none">loading</div>
 ${dialog?'<div role="dialog">foreign dialog</div>':''}` }));
 await page.goto('http://loop.test/');
 await page.evaluate(({loading,unrendered,mask,disabledGrid,foreignMask,forMode})=>{
  const proxy={__ObjectId:{Module:'module',Instance:1}},workflow={FSubNodes:{FItems:[]}};
  workflow.FSubNodes.FItems.push({FGuid:'body',FModelNode:proxy});
  const row={data:{target:proxy,nodeType:4,iconCls:'bg-vendor-icon-modelgeneric',checked:false,text:'Same'},internalId:'body-id'};
  const foreign={data:{target:{},text:'Same'}};
  const store={isLoading:()=>loading,getRoot:()=>({childNodes:[{data:{nodeType:3,loaded:true,expanded:true},childNodes:[foreign,row]},{}]})};
  const grid={el:{dom:document.getElementById('tree')},getStore:()=>store,getView:()=>({getNode:()=>unrendered?null:document.getElementById('body'),getRecord:()=>row})};
  const keys=document.getElementById('keys'),keyGrid={el:{dom:keys},$className:'Ext.grid.Panel',disabled:true};
  const native={Module:'variables',Instance:7},rowVariable={isModel:true,internalId:'page',data:{Name:'Page',DataType:4,Value:native,Variable:{__ObjectId:native},DisplayText:'Params.Page'}};
  const records=forMode?[rowVariable]:[],variables={getCount:()=>records.length,getData:()=>({items:records}),isLoading:()=>false};
  const combo={el:{dom:document.getElementById('variable')},inputEl:{dom:document.querySelector('#variable input')},getStore:()=>variables,getSelection:()=>combo.selected,
   getPicker:()=>({el:{dom:document.getElementById('list')},getNode:()=>document.getElementById('page'),getRecord:()=>rowVariable})};
  globalThis.Ext={getCmp:id=>id==='keys'?keyGrid:id==='variable'?combo:grid};
  document.getElementById('picker').onclick=()=>{combo.isExpanded=true;document.getElementById('list').style.display='block';};
  document.getElementById('page').onclick=()=>{gestures.push('Page-by-identity');combo.selected=rowVariable;combo.inputEl.dom.value='Params.Page';combo.isExpanded=false;document.getElementById('list').style.display='none';};
  const identifiers=document.querySelector('[data-tid$="pedAppendIterationIdentifiers;ValueControl"]');
  identifiers.onclick=()=>identifiers.classList.toggle('x-form-cb-checked');
  class LoopNodeWizard{FReferencedVendor=null;} // Created only by native Done, absent on a new draft.
  class LoopParamsWizard{
   FSocketStore={getCount:()=>forMode?0:1,getRange:()=>forMode?[]:[{data:{Value:{Module:'port',Instance:3},DisplayText:'Page'}}]};
   FInputVariablesStore=variables;FOutputVariablesStore={getCount:()=>0};
   FItems={cbxLoopVariable:combo,pedIterationCount:{Controller:{GetActiveMode:()=>0}},cbxSourceSocket:{value:{Module:'port',Instance:3}},txtReferenceNode:{inputEl:{dom:{value:'Same'}}}};
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
   gestures.push('group');
   if(disabledGrid){const m=document.createElement('div');m.className='x-mask';m.textContent='disabled keys';keys.append(m);}
   if(foreignMask){const m=document.createElement('div');m.className='x-mask';m.textContent='foreign';document.body.append(m);}
   document.getElementById('group').classList.add('x-form-cb-checked');
   setTimeout(()=>{document.getElementById('size').value='1';bufferCommittedAt=Date.now();},350);
  };
  document.getElementById('next').onclick=()=>{
   gestures.push(bufferCommittedAt===null?'first-next':{next_after_commit:Date.now()-bufferCommittedAt});
   if(document.getElementById('params').style.display==='none'){
    document.getElementById('tree').parentElement.style.display='none';document.getElementById('params').style.display='block';
   }else{document.getElementById('params').style.display='none';document.getElementById('done').style.display='block';}
  };
 },{loading,unrendered,mask,disabledGrid,foreignMask,forMode});
 const owner={verified:true,document_id:'doc',workflow_id:'wf',node_id:'loop',surface:'wizard',tid:root};
 // The actual MCP sandbox has no Node timers. Keep that production boundary.
 const run=(timeout=10000,now=Date.now)=>vm.runInNewContext('('+configureLoopBrowser.toString()+')',{Date:{now}})(page,{origin:'http://loop.test',build:'7.4.2',deadline:now()+timeout,
  binding:{document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1'},node:{node_id:'loop'}},
  parameters:{body:{document_id:'doc',workflow_id:'wf',node_id:'body'},...(forMode?{count:3,variable:{port_guid:'input',definition_id:7},iteration_identifiers:identifiers}:{})},source:{...(forMode?{mode:'for',variables:{port_guid:'input',definitions:[{id:7,index:0,name:'Page',type:'integer',value:99,is_null:false}]}}:{}),proxy:{Module:'module',Instance:1},ports:[{direction:'input',index:0,guid:'input',label:'Page',kind:'table'}]}},async()=>owner,selectLoopBodyRecord,loopSettingsSupported);
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

test('production Loop ignores only native disabled key-grid masks in group_rows',async t=>{
 const f=await fixture(t,{disabledGrid:true}),out=await f.run(2000);
 assert.equal(out.status,'SUCCEEDED',JSON.stringify(out));
});
test('Loop deadline preserves the partial wizard and identifies the waiting condition',async t=>{
 const f=await fixture(t,{foreignMask:true}),wait=f.page.waitForTimeout.bind(f.page);
 let now=0;
 // Expire only after the real wizard reaches its foreign mask, regardless of CPU load.
 t.mock.method(f.page,'waitForTimeout',async ms=>{
  if(await f.page.locator('.x-mask:visible').count())now=10000;
  else await wait(ms);
 });
 const out=await f.run(10000,()=>now);
 assert.equal(out.status,'AMBIGUOUS');assert.equal(out.error_code,'LOOP_CONFIGURATION_DEADLINE');
 assert.equal(out.waiting_for,'wizard_blocker');assert.equal(out.cleanup_complete,false);
 assert.equal(now,10000);
 assert.equal(await f.page.locator('#done').isVisible(),false);
 assert.deepEqual(await f.page.evaluate(()=>gestures),['body','first-next','group']);
});

for(const identifiers of [false,true])test('production FOR selects native identity and reads identifiers='+identifiers,async t=>{
 const f=await fixture(t,{forMode:true,identifiers}),out=await f.run();
 assert.equal(out.status,'SUCCEEDED',JSON.stringify(out));
 assert.equal(out.configuration.mode,'for');assert.equal(out.configuration.settings.count,'3');
 assert.equal(out.configuration.settings.identifiers,identifiers);
 assert.equal(out.configuration.settings.variable_identity.definition_id,7);
 assert.ok((await f.page.evaluate(()=>gestures)).includes('Page-by-identity'));
});

test('saved FOR inspection reads persisted count, native variable and identifiers without filling controls',async t=>{
 const f=await fixture(t,{forMode:true}),out=await f.run();assert.equal(out.status,'SUCCEEDED',JSON.stringify(out));
 const before=await f.page.evaluate(()=>gestures.length);
 const saved=await readSavedLoopForBrowser(f.page,{binding:{workflow_ref:{prefix:'MF;TF-1'}},deadline:Date.now()+10000,
  source:{variables:{port_guid:'input',definitions:[{id:7,name:'Page',type:'integer',value:99}]}},
  parameters:{count:3,iteration_identifiers:true,variable:{port_guid:'input',definition_id:7}}});
 assert.equal(saved.count,3);assert.equal(saved.variable.definition_id,7);assert.equal(saved.variable.name,'Page');assert.equal(saved.iteration_identifiers,true);
 assert.equal((await f.page.evaluate(()=>gestures.length))-before,1,'only Next, without reconfiguration');
});

test('saved FOR inspection awaits the complete native variable store on PageEnter',async t=>{
 const f=await fixture(t,{forMode:true}),out=await f.run();assert.equal(out.status,'SUCCEEDED',JSON.stringify(out));
 await f.page.evaluate(()=>{
  const c=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab().Controller.FController;
  const p=c.FWizardItems.FItems.find(i=>i.FWizard.constructor.name==='LoopParamsWizard').FWizard;
  const store=p.FInputVariablesStore,combo=p.FItems.cbxLoopVariable,records=store.getData().items,selected=combo.getSelection(),readyAt=Date.now()+600;
  store.getData=()=>({items:Date.now()>=readyAt?records:[]});store.getCount=()=>Date.now()>=readyAt?records.length:0;
  combo.getSelection=()=>Date.now()>=readyAt?selected:null;
 });
 const saved=await readSavedLoopForBrowser(f.page,{binding:{workflow_ref:{prefix:'MF;TF-1'}},deadline:Date.now()+10000,
  source:{variables:{port_guid:'input',definitions:[{id:7,name:'Page',type:'integer',value:99}]}},
  parameters:{count:3,iteration_identifiers:true,variable:{port_guid:'input',definition_id:7}}});
 assert.equal(saved.variable.name,'Page');assert.equal(saved.count,3);
});

for(const transient of [true,false])test('variable boundary waits for a retiring editor mask, preserving foreign blockers: '+transient,async t=>{
 // live1-repeat execution-events.jsonl:78: Page=99 was applied before its mask retired.
 const f=await fixture(t),page=f.page;
 await page.setContent(`<div data-tid="${root}" style="display:none"><button data-tid="${root};btnClose">Close</button></div><div class="x-mask" style="display:none">pending</div>`);
 await page.evaluate(root=>{
  window.graph=true;window.closes=0;
  document.querySelector('[data-tid='+JSON.stringify(root+';btnClose')+']').onclick=()=>{window.closes++;window.graph=true;document.querySelector('[data-tid='+JSON.stringify(root)+']').style.display='none';};
 },root);
 const readNode=()=>page.evaluate(()=>({verified:true,surface:window.graph?'graph':'wizard',node_id:'node',...(!window.graph?{input_port:{port:0}}:{})}));
 const openPort=async()=>{
  await page.evaluate(({root,transient})=>{window.graph=false;document.querySelector('[data-tid='+JSON.stringify(root)+']').style.display='block';document.querySelector('.x-mask').style.display='block';if(transient)setTimeout(()=>document.querySelector('.x-mask').style.display='none',350);},{root,transient});
  return {status:'SUCCEEDED',effect_possible:true};
 };
 const readVariables=()=>({port_guid:'input',kind:'variables',native_index:0,definitions:[{id:7,index:0,name:'Page',label:'Page',type:'integer',value:99,is_null:false}]});
 const out=await configureSupernodeVariablesBrowser(page,{binding:{node:{node_id:'node'},workflow_ref:{prefix:'MF;TF-1'}},operation_id:'read',deadline:Date.now()+(transient?10000:1200),parameters:{read_only:true,definitions:[{value:99,type:'integer',name:'Page'}]}},readNode,openPort,readVariables);
 assert.equal(out.status,transient?'SUCCEEDED':'AMBIGUOUS',JSON.stringify(out));
 assert.equal(await page.evaluate(()=>window.closes),transient?1:0);
 if(transient)assert.equal(out.variable_boundary.definitions[0].id,7);
});
