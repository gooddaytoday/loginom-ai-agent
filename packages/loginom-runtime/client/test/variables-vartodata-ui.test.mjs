import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {workspaceUiCapability} from '../lib/workspace-ui.mjs';
import {Page,build,origin,clone} from './support/workspace-ui-fixture.mjs';
test('variables-to-table stage uses the visible native card and ignores a retained hidden mapping panel',async()=>{
 const page=new Page(),base='MF;TF-1;WizrdMCF',form=page.add('div',base);
 page.add('div',base+';VariablesToDataWizard','',undefined,form);
 const hidden=page.add('button',base+';DerivedDataSourceMappingEngineOutputPortWizard;btnAddMappingColumn','',undefined,form);hidden.style.display='none';
 assert.equal((await page.observe()).wizard.stage,'variables_to_table');
 hidden.style.display='';assert.equal((await page.observe()).wizard.stage_status,'ambiguous');
});
test('VarToData output 0 binds a hidden native output folder only to its owned opening receipt',async()=>{
 for(const fault of [null,'port','icon','opening']){
  const page=new Page(),prefix='MF;TF-1;',form=page.add('div',prefix+'WizrdMCF');
  page.add('button',prefix+'WizrdMCF;DerivedDataSourceOutputSocketWizard;btnAddMappingColumn','',undefined,form);
  page.add('button',prefix+'WizrdMCF;btnDone','Готово',{x:750,y:500,width:100,height:25},form);
  const panel=page.add('div',prefix+'NavigationBar;NavigationPanel');let path='';
  for(const [label,key,icon,hidden] of [['Package','Package','maptree-icon-package'],['Workflow','Workflow','maptree-icon-workflow'],
   ['Converter','Converter','bg-vendor-icon-variablestodata'],['Выходные порты','Выходные_порты','maptree-icon-modeloutputports',true],
   ['Result','Result','bg-vendor-icon-deriveddatasourceoutputsocketdef',true],['Настройка','Настройка','maptree-icon-wizard',true]]){
   path+=(path?'>':'')+key;const crumb=page.add('a',prefix+'cnrNaviMode;b.s_'+path,label,undefined,panel);
   page.add('span',null,'',undefined,crumb).attrs.class=icon;if(hidden)crumb.style.display='none';
  }
  const port={direction:'output',port:fault==='port'?1:0,native_index:fault==='port'?1:0,port_guid:'output-guid',
   opening_operation_id:fault==='opening'?'':'own-open',node_icon_class:fault==='icon'?'bg-vendor-icon-unknown':'bg-vendor-icon-variablestodata'};
  const result=clone(await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
   {mode:'observe',expected_build:build,expected_origin:origin,prepared_node_context:{node:{node_id:'node'},workflow_ref:{prefix:'MF;TF-1',navigation_path:[]}}},
   async()=>({verified:true,surface:'wizard',node_id:'node',output_port:port})));
  assert.equal(result.status,'SUCCEEDED');assert.equal(result.output.wizard.port_context.status==='observed',fault===null,String(fault));
  assert.deepEqual(page.events,[]);
 }
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
