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

test('sorting picker keeps its exact field owner in bounded-list observations',async()=>{
 const {page}=fixture();const roots=await page.execute({mode:'observe',discover_roots:true});
 const root=roots.output.ui.elements.find(e=>e.tid?.endsWith(';boundlist'));assert.ok(root);
 const narrow=await page.execute({mode:'observe',root_ref:root.ref});assert.equal(narrow.status,'SUCCEEDED');
 const option=narrow.output.ui.elements.find(e=>e.tid?.endsWith(';boundlist;2'));assert.ok(option,JSON.stringify({wizard:narrow.output.wizard,ui:narrow.output.ui.elements}));
 assert.equal(option.wizard_combo?.field.scope,'sorting');assert.equal(option.wizard_combo?.field.name,'max_threads');
 assert.ok(option.allowed_actions.includes('select_wizard_option'));
});
test('sorting auto display suffix maps to the exact native Auto option and reads back its primary label',async()=>{
 const {page,fields,list}=fixture();fields.cbxMaxThreadCount.input.value='2';
 list.children[0].attrs['data-tid']=fields.cbxMaxThreadCount.owner.getAttribute('data-tid')+';boundlist;Автоопределение';
 list.children[0].ownText='Автоопределение (0)';
 const snapshot=await page.observe(),option=snapshot.ui.elements.find(e=>e.wizard_combo?.kind==='option');assert.ok(option);
 assert.equal(option.wizard_combo.label,'Автоопределение');
 const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);fields.cbxMaxThreadCount.input.value='Автоопределение';list.remove();};
 const result=await page.act({verb:'select_wizard_option',ref:option.ref},snapshot);assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
});

test('sorting Auto confirms the observed native numeric editor value zero',async()=>{
 const {page,fields,list}=fixture();fields.cbxMaxThreadCount.input.value='2';
 list.children[0].attrs['data-tid']=fields.cbxMaxThreadCount.owner.getAttribute('data-tid')+';boundlist;Автоопределение';
 list.children[0].ownText='Автоопределение (0)';
 const snapshot=await page.observe(),option=snapshot.ui.elements.find(e=>e.wizard_combo?.kind==='option');assert.ok(option);
 const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);fields.cbxMaxThreadCount.input.value='0';list.remove();};
 const result=await page.act({verb:'select_wizard_option',ref:option.ref},snapshot);
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));assert.equal(fields.cbxMaxThreadCount.input.value,'0');
});
