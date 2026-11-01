import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readAutoCorrelationBrowser,readAutoCorrelationContext} from '../lib/auto-correlation-context.mjs';
function fixture(kind='parameters'){
 const elements=[],components={},base='MF;TF;WizrdMCF;'+(kind==='parameters'?'AutoCorrelationWizard':'TuneDataSourceInputPortWizard');
 const element=tid=>{const e={id:'e'+elements.length,tid,checkVisibility:()=>true,contains:()=>true};elements.push(e);return e;};
 const root=element(base);components[root.id]={el:{dom:root}};
 const values={pedLagCount:12,pedDomainCalc:2,pedCalcPacf:false};
 for(const key of Object.keys(values)){
  const e=element(base+';'+key+';ValueControl');components[e.id]={el:{dom:e},getValue:()=>values[key]};
  const sw=element(base+';'+key+';SwitchButton');components[sw.id]={el:{dom:sw},pressed:false};
 }
 const records=['RowID','X'].map((Name,index)=>({isModel:true,internalId:'r'+index,data:{ID:index,Index:index,Name,DisplayName:Name,DataType:index===0?4:3,DataKind:1,UsageType:index===1?3:0,GroupField:'',Broken:false,ReverseBroken:false}}));
 const proxy={$className:'bg.ext.CollectionProxy',pendingOperations:{}},data={items:records};
 const store={$className:'Ext.data.Store',currentPage:1,getProxy:()=>proxy,getData:()=>data,getCount:()=>records.length,getTotalCount:()=>records.length,getRemoteFilter:()=>false,getRemoteSort:()=>false,isLoading:()=>false};
 const ge=element(base+';grdTargetColumns'),grid={el:{dom:ge},getStore:()=>store};components[ge.id]=grid;
 const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>q.startsWith('[data-tid=')?elements.filter(e=>e.tid===JSON.parse(q.slice(10,-1))):[]}};
 return {values,records,proxy,data,store,grid,element,components,read:()=>JSON.parse(JSON.stringify(vm.runInNewContext('('+readAutoCorrelationBrowser.toString()+')("MF;TF")',context)))};
}
test('ACF card is unready until all asynchronous native values load',()=>{
 const f=fixture();assert.equal(f.read().verified,true);assert.equal(f.read().domain,'auto');
 for(const key of Object.keys(f.values)){const old=f.values[key];f.values[key]=null;assert.equal(f.read().reason,'autocorrelation_initializing');f.values[key]=old;}
 for(const bad of [-1,1.5,9007199254740992]){f.values.pedLagCount=bad;assert.equal(f.read().verified,false);}
 f.values.pedLagCount=4;f.values.pedDomainCalc=0;assert.equal(f.read().domain,'time');
});
test('ACF roles require the complete local bound collection and unique field identities',()=>{
 const good=fixture('roles').read();assert.equal(good.verified,true);assert.deepEqual(good.fields.map(f=>f.usage_type),[0,3]);
 for(const change of [f=>f.store.getCount=()=>99,f=>f.store.getTotalCount=()=>99,f=>f.store.isLoading=()=>true,
  f=>f.store.isBufferedStore=true,f=>f.store.getRemoteFilter=()=>true,f=>f.store.currentPage=2,
  f=>f.proxy.$className='Ajax',f=>f.proxy.pendingOperations={load:1},f=>f.data.getSource=()=>({items:[]}),
  f=>f.grid.el.dom={},f=>f.records[1].data.Name='rowid',f=>f.records[1].data.ID=0,
  f=>f.records[1].data.UsageType=4,f=>f.records[1].data.Broken=true,f=>f.element('EditTuneColumnDefForm')]){
  const f=fixture('roles');change(f);assert.equal(f.read().verified,false);
 }
});
test('ACF native reads require a stable wizard owner without a separate port wizard',async()=>{
 let reads=0;
 const binding={workflow_ref:{prefix:'MF;TF'}};
 const changed=await readAutoCorrelationContext({evaluate:async()=>({verified:true})},binding,async()=>({verified:true,surface:'wizard',node_id:++reads}));
 assert.equal(changed.reason,'autocorrelation_node_changed');
 for(const extra of [{surface:'graph'},{input_port:{}},{output_port:{}}])
  assert.equal((await readAutoCorrelationContext({},binding,async()=>({verified:true,surface:'wizard',...extra}))).reason,'autocorrelation_node_surface');
});
test('serialized observer registers ACF stage and its native domain picker',async()=>{
 const {Page}=await import('./support/workspace-ui-fixture.mjs');
 const page=new Page(),base='MF;TF-1;WizrdMCF',form=page.add('div',base);
 page.add('div',base+';AutoCorrelationWizard;pedLagCount','',undefined,form);
 const picker=page.add('div',base+';AutoCorrelationWizard;pedDomainCalc;ValueControl;trg_picker','',{x:100,y:100,width:20,height:20},form);
 const s=await page.observe();assert.equal(s.wizard.stage,'auto_correlation');
 const e=s.ui.elements.find(e=>e.tid===picker.getAttribute('data-tid'));assert.ok(e?.allowed_actions.includes('click'));
 assert.equal((await page.act({verb:'click',ref:e.ref},s)).status,'SUCCEEDED');
});
