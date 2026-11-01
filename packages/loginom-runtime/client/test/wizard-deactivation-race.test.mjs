import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {workspaceUiCapability} from '../lib/workspace-ui.mjs';
import {openPreparedWizard} from '../lib/node-wizard-open.mjs';
import {Page,clone,origin} from './support/workspace-ui-fixture.mjs';

function fixture(fault,fullBreadcrumb=false) {
 const page=new Page(),base='MF;TF-1;',build='7.4.2';page.app.Version=build;
 const panel=page.add('div',base+'NavigationBar;NavigationPanel');
 const path=[];let name='',phase='graph',question,nodeCrumb,confirmDrift=false;
 for(const label of ['Сервер','Пакеты','Package1','Модуль1','Сценарий']){
  name+=(name?'>':'')+label;
  const tid=base+'cnrNaviMode;b.s_'+name,crumb=page.add('a',tid,label,undefined,panel);
  path.push({tid,label});if(label==='Сценарий')page.add('span',null,'',undefined,crumb).attrs.class='maptree-icon-workflow';
 }
 const background=page.add('div','MF;TF-1','',{x:0,y:50,width:1000,height:700});
 const graph=page.add('div',base+'ModelForm;cmpDiagram','',undefined,background);
 const body=page.add('g',base+'Graph;Import','',undefined,graph);
 page.add('span',base+'Graph;Import;Label;Label','Import',undefined,body);
 page.add('g',base+'Graph;Import;Setting','',{x:500,y:300,width:30,height:30},graph);
 const node={document_id:'doc',workflow_id:'workflow',node_id:'node'};
 const workflow={prefix:'MF;TF-1',workflow_id:'workflow',navigation_path:path};
 const native=async()=>({...node,verified:true,surface:phase==='wizard'?'wizard':'graph',
  tid:base+(phase==='wizard'?'WizrdMCF':'Graph;Import'),...(phase==='wizard'?{}:{locked:false}),
  ...(phase==='question'&&fault!=='missing-native'?{pending_wizard_node:{tid:path.at(-1).tid+'>'+ (fault==='other-pending-node'||confirmDrift&&fault==='confirm-native'?'Other':'Import'),label:fault==='other-label'?'Other':'Import'}}:{}),
  ...(phase==='question'&&['node','document','workflow'].includes(fault)?{[fault+'_id']:'foreign'}:{})});
 page.execute=async options=>clone(await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
  {expected_build:build,expected_origin:origin,kind:'workspace-ui',prepared_node_context:{document_id:'doc',node,workflow_ref:workflow},...options},native));
 const settings=()=>{
  const crumb=page.add('a',nodeCrumb.attrs['data-tid']+'>Настройка','Настройка',undefined,panel);
  page.add('span',null,'',undefined,crumb).attrs.class='maptree-icon-wizard';
 };
 const click=page.mouse.click;page.mouse.click=async(...args)=>{
  await click(...args);
  if(phase==='graph'){
   phase='question';background.attrs.class='bg-mask-message';background.attrs['bg-mask-text']='Загрузка';
   nodeCrumb=page.add('a',path.at(-1).tid+'>Import','Import',undefined,panel);
   page.add('span',null,'',undefined,nodeCrumb).attrs.class='bg-vendor-icon-importtextfile';
   if(fullBreadcrumb)settings();
   question=page.add('div',null,'',{x:400,y:200,width:500,height:150});question.attrs.class='x-window';
   page.add('h1',null,'Loginom '+build,undefined,question).attrs.role='heading';
   page.add('span',null,fault==='question'?'Удалить пакет?':'Настройка узла приведет к его деактивации. Вы действительно хотите начать настраивать узел?',undefined,question);
   Object.entries({yes:'Да',no:'Да, больше не спрашивать',cancel:'Нет'}).forEach(([id,label],i)=>
    page.add('button','msgbox;tlb;'+id,label,{x:450+i*140,y:300,width:130,height:30},question));
   if(fault==='path')nodeCrumb.attrs['data-tid']=path.at(-1).tid+'>Other';
   if(fault==='package')page.document.querySelector('[data-tid="'+path[2].tid+'"]').ownText='Other';
   if(fault==='tab'){page.tab.remove();page.add('div','MF;cntMain;cntWorkspace;Workspace;t.br;tb-1','Scenario').attrs.class='x-tab-active';}
   if(fault==='dom')vm.runInContext('delete globalThis[Symbol.for("loginom-dock.workspace-ui.identity.v1")]',page.context);
   if(fault==='busy')page.add('div','foreign-mask','Loading',undefined,question).attrs.class='bg-mask-message';
   if(fault==='extra-dialog')page.add('div','foreign-dialog','Other').attrs.class='x-window';
   if(fault==='expired')page.clock.advance(120000);
  }else{
   assert.equal(phase,'question');assert.equal(page.document.activeElement.attrs['data-tid'],'msgbox;tlb;yes');
   phase='wizard';question.remove();background.attrs.class='';graph.remove();if(!fullBreadcrumb)settings();
   const wizard=page.add('div',base+'WizrdMCF');page.add('input',base+'WizrdMCF;ImportTextFilePreviewWizard;edtFileName','',undefined,wizard);
  }
 };
 const channel={observe:async options=>{
  const s=await page.observe();
  if(options.wizardConfirmation)s.node_wizard_confirmation=structuredClone(options.wizardConfirmation);
  assert.ok(options.ready(s),options.condition);return s;
 },perform:async options=>{
  const s=options.initialObservation??await channel.observe(options);
  assert.ok(options.ready(s),options.condition);
  if(options.resolve(s).verb==='confirm_wizard_deactivation'){
   confirmDrift=true;
   if(fault==='confirm-question')question.children[1].ownText='Удалить пакет?';
   if(fault==='confirm-dialog')page.add('div','foreign-dialog','Other').attrs.class='x-window';
  }
  const r=await page.act(options.resolve(s),s);assert.equal(r.status,'SUCCEEDED',JSON.stringify({error:r.error,output:r.output,trace:r.trace}));return r;
 }};
 return {page,open:()=>openPreparedWizard(channel)};
}

test('ordinary opening confirms deactivation when Settings breadcrumb is already visible',async()=>{
 const f=fixture(null,true);assert.equal((await f.open()).deactivation_required,true);assert.equal(f.page.clickedPoints.length,2);
});
test('LAB-666 :562-563 accepts its exact deactivation question before Settings is rendered',async()=>{
 const f=fixture();assert.equal((await f.open()).deactivation_required,true);assert.equal(f.page.clickedPoints.length,2);
});
for(const fault of ['node','document','workflow','dom','tab','package','path','question','busy','extra-dialog','missing-native','other-pending-node','other-label','expired','confirm-native','confirm-question','confirm-dialog'])
test('early deactivation question refuses foreign or incomplete context: '+fault,async()=>{
 const f=fixture(fault);await assert.rejects(f.open());assert.equal(f.page.clickedPoints.length,1);
});
