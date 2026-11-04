import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {scriptGraphFixture,clone,build,origin} from './support/workspace-ui-fixture.mjs';
import {workspaceUiCapability} from '../lib/workspace-ui.mjs';

test('union opens its observed mapping wizard through only its exact native information toast',async()=>{
 for(const fault of [null,'text','type','node','stage']){
  const {page,body}=scriptGraphFixture('Union',fault==='type'?'bg-vendor-icon-calcvariables':'bg-vendor-icon-unionvariables');
  const base='MF;TF-1;',panel=page.add('div',base+'NavigationBar;NavigationPanel');let path='',toast,waits=0;
  for(const label of ['Сервер','Пакеты','Package1','Модуль1','Сценарий']){
   path+=(path?'>':'')+label;const crumb=page.add('a',base+'cnrNaviMode;b.s_'+path,label,undefined,panel);
   if(label==='Сценарий')page.add('span',null,'',undefined,crumb).attrs.class='maptree-icon-workflow';
  }
  const binding=async()=>({verified:true,document_id:'doc',workflow_id:'workflow',node_id:fault==='node'&&page.events.includes('click')?'foreign':'node',surface:page.events.includes('click')?'wizard':'graph',tid:base+(page.events.includes('click')?'WizrdMCF':'Graph;Union')});
  page.execute=async options=>clone(await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
   {expected_build:build,expected_origin:origin,kind:'workspace-ui',prepared_node_context:{node:{node_id:'node'},workflow_ref:{prefix:'MF;TF-1',navigation_path:[]}},...options},binding));
  const snapshot=await page.observe(),button=snapshot.ui.elements.find(e=>e.wizard_open),click=page.mouse.click;
  page.mouse.click=async(...args)=>{await click(...args);body.parentElement.remove();const wizard=page.add('div',base+'WizrdMCF');
   page.add('button',base+'WizrdMCF;'+(fault==='stage'?'CalcVariablesWizard;grdExpressions':'DerivedVariablesMappingEngineOutputPortWizard;btnAutoSyncThroughColumns'),'',undefined,wizard);
   const node=page.add('a',base+'cnrNaviMode;b.s_'+path+'>Union','Union',undefined,panel);page.add('span',null,'',undefined,node).attrs.class='bg-vendor-icon-unionvariables';
   const settings=page.add('a',base+'cnrNaviMode;b.s_'+path+'>Union>Настройка','Настройка',undefined,panel);page.add('span',null,'',undefined,settings).attrs.class='maptree-icon-wizard';
   toast=page.add('div','toast','',{x:600,y:600,width:300,height:100});toast.attrs.role='dialog';page.add('h1',null,'Информация',undefined,toast).attrs.role='heading';
   page.add('div',null,fault==='text'?'Other information':'Мастера настройки для "Union" не существует. Будут отображены страницы настройки полей и/ или описания узла.',undefined,toast);
  };
  page.waitForTimeout=async ms=>{page.clock.advance(ms);if(++waits===3)toast.remove();};
  const result=await page.act({verb:'begin_wizard',ref:button.ref},snapshot);
  assert.equal(result.status,fault?'AMBIGUOUS':'SUCCEEDED',String(fault)+JSON.stringify(result.error));
  assert.equal(page.events.filter(e=>e==='click').length,1);
  if(!fault)assert.equal(result.trace.filter(e=>e.event==='wizard_toast_wait').length,3);
 }
});
