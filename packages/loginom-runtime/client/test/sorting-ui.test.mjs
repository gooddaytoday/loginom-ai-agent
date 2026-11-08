import test from 'node:test';
import assert from 'node:assert/strict';
import {Page} from './support/workspace-ui-fixture.mjs';
function fixture(){
 const page=new Page(),form=page.add('div','MF;TF-1;WizrdMCF'),base='MF;TF-1;WizrdMCF;SortingWizard;SortingColumnCollection';
 page.add('div',base+';grdSorting;tbl','',undefined,form);
 const root=page.add('div',base,'',undefined,form),fields={};
 for(const [key,value] of [['cbxMaxThreadCount','Автоопределение']]){
  const property=page.add('div',base+';'+key,'',undefined,root),owner=page.add('div',base+';'+key+';ValueControl','',undefined,property);
  const input=page.add('input',null,'',undefined,owner);input.value=value;fields[key]={input,owner};
  page.add('div',base+';'+key+';ValueControl;trg_picker','▼',undefined,owner);
 }
 const ownerTid=fields.cbxMaxThreadCount.owner.getAttribute('data-tid');
 const list=page.add('div',ownerTid+';boundlist','',{x:200,y:200,width:220,height:60});
 page.add('div',ownerTid+';boundlist;2','2',{x:205,y:205,width:210,height:20},list);
 return{page,fields,list};
}
test('sorting maximum selection confirms the changed native label in its original settings field',async()=>{
 const {page,fields,list}=fixture(),snapshot=await page.observe();
 assert.equal(snapshot.wizard.stage,'sorting');
 const option=snapshot.ui.elements.find(e=>e.wizard_combo?.kind==='option');assert.ok(option);
 const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);fields.cbxMaxThreadCount.input.value='2';list.remove();};
 const result=await page.act({verb:'select_wizard_option',ref:option.ref},snapshot);
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
 assert.equal(fields.cbxMaxThreadCount.input.value,'2');
 assert.deepEqual(page.events,['click']);
});
test('sorting maximum selection refuses unchanged labels and replacement native inputs',async()=>{
 for(const fault of ['unchanged','replacement']){
  const {page,fields,list}=fixture(),snapshot=await page.observe();
  const option=snapshot.ui.elements.find(e=>e.wizard_combo?.kind==='option'),click=page.mouse.click;
  page.mouse.click=async(...args)=>{await click(...args);list.remove();if(fault==='replacement'){fields.cbxMaxThreadCount.input.remove();page.add('input',null,'',undefined,fields.cbxMaxThreadCount.owner).value='2';}};
  const result=await page.act({verb:'select_wizard_option',ref:option.ref},snapshot);
  assert.equal(result.status,'AMBIGUOUS');assert.equal(result.error.code,'WIZARD_OPTION_NOT_CONFIRMED');assert.deepEqual(page.events,['click']);
 }
});
