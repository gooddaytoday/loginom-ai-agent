import test from 'node:test';
import assert from 'node:assert/strict';
import {Page} from './support/workspace-ui-fixture.mjs';
test('variables-to-table stage uses the visible native card and ignores a retained hidden mapping panel',async()=>{
 const page=new Page(),base='MF;TF-1;WizrdMCF',form=page.add('div',base);
 page.add('div',base+';VariablesToDataWizard','',undefined,form);
 const hidden=page.add('button',base+';DerivedDataSourceMappingEngineOutputPortWizard;btnAddMappingColumn','',undefined,form);hidden.style.display='none';
 assert.equal((await page.observe()).wizard.stage,'variables_to_table');
 hidden.style.display='';assert.equal((await page.observe()).wizard.stage_status,'ambiguous');
});
test('variables-to-table Next accepts only the two observed native destinations after one gesture',async()=>{
 for(const destination of ['done','output_mapping','input_mapping']){
  const page=new Page(),base='MF;TF-1;WizrdMCF',form=page.add('div',base);
  const marker=page.add('div',base+';VariablesToDataWizard','',{x:0,y:0,width:10,height:10},form);
  page.add('button',base+';btnNext','Далее',{x:100,y:100,width:50,height:25},form);
  const snapshot=await page.observe(),button=snapshot.ui.elements.find(e=>e.wizard_step);
  const click=page.mouse.click;page.waitForTimeout=async ms=>page.clock.advance(ms);
  page.mouse.click=async(...args)=>{await click(...args);marker.remove();page.add('div',base+({done:';DoneWizard;edtDisplayName',output_mapping:';DerivedDataSourceMappingEngineOutputPortWizard;btnAddMappingColumn',input_mapping:';TuneDataSourceInputPortWizard;btnAddMappingColumn'}[destination]),'',undefined,form);};
  const result=await page.act({verb:'wizard_step',ref:button.ref,expected_stage:['output_mapping','done']},snapshot);
  assert.equal(result.status,destination==='input_mapping'?'AMBIGUOUS':'SUCCEEDED',JSON.stringify(result.error));
  assert.equal(page.events.filter(e=>e==='click').length,1);
 }
});
