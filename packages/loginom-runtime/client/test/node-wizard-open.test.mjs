import test from 'node:test';
import assert from 'node:assert/strict';
import {wizardOpenBinding,boundWizardDeactivationConfirmation,openPreparedWizard} from '../lib/node-wizard-open.mjs';
import {makeWorkspaceUiCode} from '../lib/workspace-ui.mjs';
import {workspaceUiCapability} from '../lib/workspace-ui.mjs';
import vm from 'node:vm';
import {scriptGraphFixture,clone,build,origin} from './support/workspace-ui-fixture.mjs';

for(const fault of [null,'node','document','workflow','native','component','label','hidden','question','button','duplicate','parent'])
test('variables calculator hidden native pending breadcrumb uses the existing deactivation confirmation: '+fault,async()=>{
 const f=scriptGraphFixture('Params','bg-vendor-icon-calcvariables'),{page,body}=f;f.node.FGuid='node';
 const base='MF;TF-1;',panel=page.add('div',base+'NavigationBar;NavigationPanel');const path=[];let chain='',mode='graph',dialog,mask,crumb;
 for(const label of ['Сервер','Пакеты','Package1','Модуль1','Сценарий']){
  chain+=(chain?'>':'')+label;const tid=base+'cnrNaviMode;b.s_'+chain;path.push({tid,label});const e=page.add('a',tid,label,undefined,panel);
  if(label==='Сценарий')page.add('span',null,'',undefined,e).attrs.class='maptree-icon-workflow';
 }
 const pending={tid:path.at(-1).tid+'>Params',label:'Params'};
 class ModelNodeTreeNode{};page.app.ModelNodeTreeNode=ModelNodeTreeNode;const native=new ModelNodeTreeNode();native.FGuid=fault==='native'?'foreign':'node';
 const workflow={};native.ParentNode=fault==='parent'?{}:workflow;
 page.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab=()=>({Controller:{FController:f.model,Node:{data:{node:mode==='wizard'?native:workflow}}}});
 const reader=async()=>({verified:true,document_id:fault==='document'&&mode!=='graph'?'other':'doc',workflow_id:fault==='workflow'&&mode!=='graph'?'other':'flow',node_id:fault==='node'&&mode!=='graph'?'other':'node',
  surface:mode==='wizard'?'wizard':'graph',tid:base+(mode==='wizard'?'WizrdMCF':'Graph;Params'),locked:false,...(mode==='question'?{pending_wizard_node:pending}:{})});
 page.execute=async options=>clone(await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,{expected_build:build,expected_origin:origin,kind:'workspace-ui',prepared_node_context:{document_id:'doc',node:{node_id:'node'},workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',navigation_path:path}},...options},reader));
 const initial=await page.observe(),settings=initial.ui.elements.find(e=>e.wizard_open),binding=wizardOpenBinding(initial),click=page.mouse.click;
 page.mouse.click=async(...args)=>{await click(...args);
  if(mode==='graph'){
   mode='question';crumb=page.add('a',pending.tid,fault==='label'?'Other':'Params',undefined,panel);crumb.style.display='none';crumb.id='pending-source';if(fault==='hidden')crumb.attrs.hidden='';page.add('span',null,'',undefined,crumb).attrs.class='bg-vendor-icon-calcvariables';
   page.context.Ext={getCmp:id=>id===crumb.id&&fault!=='component'?{el:{dom:crumb},_node:{data:{node:native}}}:null};
   mask=page.add('div','MF;TF-1','Загрузка');mask.attrs.class='bg-mask-message';
   dialog=page.add('div',null,'',{x:400,y:200,width:500,height:260});dialog.attrs.class='x-window x-message-box';page.add('h1',null,'Loginom '+build,undefined,dialog).attrs.role='heading';
   page.add('span',null,fault==='question'?'Удалить пакет?':'Настройка узла приведет к его деактивации. Вы действительно хотите начать настраивать узел?',undefined,dialog);
   let x=420;for(const [id,label] of Object.entries({yes:'Да',no:'Да, больше не спрашивать',cancel:'Нет'})){page.add('a','msgbox;tlb;'+id,fault==='button'&&id==='yes'?'Продолжить':label,{x,y:350,width:110,height:30},dialog);x+=125;}
   if(fault==='duplicate')page.add('a','msgbox;tlb;yes','Да',{x:420,y:390,width:80,height:30},dialog);
  }else{
   assert.equal(mode,'question');mode='wizard';dialog.remove();mask.remove();body.parentElement.remove();
   const wizard=page.add('div',base+'WizrdMCF');page.add('button',base+'WizrdMCF;CalcVariablesWizard;btnAddExpr','',undefined,wizard);
   const settings=page.add('a',pending.tid+'>Настройка','Настройка',undefined,panel);page.add('span',null,'',undefined,settings).attrs.class='maptree-icon-wizard';
  }
 };
 const opened=await page.execute({mode:'act',operation_id:'begin',action:{verb:'begin_wizard',ref:settings.ref},snapshot:initial});
 assert.equal(opened.status,fault?'AMBIGUOUS':'SUCCEEDED',String(fault)+JSON.stringify({error:opened.error,pending:opened.output.wizard_pending_owner,navigation:opened.output.workflow_navigation}));assert.equal(page.events.filter(e=>e==='click').length,1);
 if(!fault){
  const s=opened.output,yes=s.ui.elements.find(e=>e.tid==='msgbox;tlb;yes');assert.ok(yes.wizard_deactivation_confirmation);assert.ok(yes.allowed_actions.includes('confirm_wizard_deactivation'));s.node_wizard_confirmation=binding;
  const confirmed=await page.execute({mode:'act',operation_id:'confirm',action:{verb:'confirm_wizard_deactivation',ref:yes.ref},snapshot:s});
  assert.equal(confirmed.status,'SUCCEEDED',JSON.stringify(confirmed.error));assert.equal(confirmed.output.wizard.stage,'variables_calculator');assert.equal(page.events.filter(e=>e==='click').length,2);
 }
});
const fixture=()=>{
 const node={verified:true,surface:'graph',document_id:'doc',workflow_id:'flow',node_id:'node',tid:'MF;TF-1;Graph;Import'};
 const path=[{tid:'flow',label:'Scenario'}];
 const state={loginom_build:'7.4.2',prepared_node_context:node,wizard:{status:'absent'},navigation_context:{status:'observed',path},
  ui:{masks:[],dialogs:[],elements:[{tid:node.tid+';Setting',allowed_actions:['begin_wizard'],wizard_open:{node:{node_label:'Import',part:'settings'},workflow_path:path}}]}};
 const binding=wizardOpenBinding(state);
 state.wizard_pending_owner={status:'observed',node:{tid:'flow>Import'},path:[...path,{tid:'flow>Import',label:'Import'},{tid:'flow>Import>Settings',label:'Settings'}]};
 state.ui.dialogs=[{ref:'question',title:'Loginom 7.4.2',text:'Loginom 7.4.2 Настройка узла приведет к его деактивации. Вы действительно хотите начать настраивать узел? Да Да, больше не спрашивать Нет'}];
 state.ui.elements=Object.entries({yes:'Да',no:'Да, больше не спрашивать',cancel:'Нет'}).map(([id,label])=>({tid:'msgbox;tlb;'+id,label,signature:{dialog_ref:'question'},allowed_actions:['click']}));
 return {state,binding};
};
test('deactivation requires the exact prepared graph, workflow, question and three button meanings',()=>{
 const {state,binding}=fixture();assert.equal(boundWizardDeactivationConfirmation(state,binding),true);
 for(const change of [s=>s.prepared_node_context.node_id='foreign',s=>s.prepared_node_context.surface='wizard',
  s=>s.wizard_pending_owner.path=[],s=>s.ui.dialogs[0].text='Закрыть мастер?',s=>s.ui.dialogs[0].title='Восстановление сессии',
  s=>s.ui.elements[0].label='Да, больше не спрашивать',s=>s.ui.elements[0].signature.dialog_ref='foreign',
  s=>s.ui.elements.pop(),s=>s.ui.elements[0].allowed_actions=[],s=>s.ui.dialogs.push({...s.ui.dialogs[0]}),
  s=>s.ui.masks.push({kind:'busy',ref:'question'})]) {
  const bad=structuredClone(state);change(bad);assert.equal(boundWizardDeactivationConfirmation(bad,binding),false);
 }
});

test('receipted variables calculator cleanup tolerates only its exact pending overflow crumb becoming observable',()=>{
 const {state}=fixture();Object.assign(state,{origin:'https://app.loginom.ai/',active_tab_ref:'tab',workflow_ref:{prefix:'MF;TF-1'},dom_epoch:{document:'browser'}});
 const n=state.prepared_node_context;n.locked=false;n.pending_wizard_node={tid:'flow>Import',label:'Import'};
 const path=[{tid:'flow',label:'Scenario'}];state.workflow_navigation={status:'observed',path,current_path:path};
 const binding={kind:'deactivation',release_opening:{node:structuredClone(n),workflow_ref:state.workflow_ref,document:'browser',origin:state.origin,build:state.loginom_build,active_tab_ref:'tab',navigation:structuredClone(state.workflow_navigation),dialog:structuredClone(state.ui.dialogs[0]),native_pending_overflow:true}};
 state.workflow_navigation.current_path=[...path,n.pending_wizard_node];assert.equal(boundWizardDeactivationConfirmation(state,binding),true);
 for(const change of [s=>s.workflow_navigation.current_path.at(-1).label='Other',s=>s.workflow_navigation.current_path.push({tid:'other'}),s=>s.workflow_navigation.path=undefined,s=>s.dom_epoch.document='other',s=>s.prepared_node_context.node_id='other',s=>s.ui.elements[0].signature.dialog_ref='other']){
  const bad=structuredClone(state);change(bad);assert.equal(boundWizardDeactivationConfirmation(bad,binding),false);
 }
 const imports=structuredClone(binding);delete imports.release_opening.native_pending_overflow;assert.equal(boundWizardDeactivationConfirmation(state,imports),false);
});
test('question discovery cannot replace button verification',()=>{
 const {state,binding}=fixture();state.ui.elements=[];
 assert.equal(boundWizardDeactivationConfirmation(state,binding,false),true);
 assert.equal(boundWizardDeactivationConfirmation(state,binding),false);
});
test('settings opening requires one control of the prepared graph node',()=>{
 const {state}=fixture();assert.throws(()=>wizardOpenBinding(state));
});
test('deactivation gestures cannot run without a native prepared-node binding',()=>{
 for(const verb of ['begin_wizard','confirm_wizard_deactivation'])assert.throws(()=>
  makeWorkspaceUiCode({mode:'act',action:{verb,ref:'ui-question'}}),/prepared native node binding/);
});


test('wizard opening reconciles duplicate native keys through the exact prepared GUID and label',async()=>{
 for(const fault of [null,'node','document','workflow','label','path']){
  const {state}=fixture();state.ui={masks:[],dialogs:[],elements:[
   {ref:'settings',tid:state.prepared_node_context.tid+';Setting',allowed_actions:['begin_wizard'],wizard_open:{node:{node_label:'Import@1'},workflow_path:[{tid:'flow',label:'Scenario'}]}},
   {tid:state.prepared_node_context.tid+';Label;Label',label:'Import',graph_node:{part:'label'}}]};
  const after=structuredClone(state);after.prepared_node_context.surface='wizard';
  after.wizard={status:'observed',owner_context:{status:'observed',node:{tid:'flow>Import-3',label:'Import'},path:[{tid:'flow',label:'Scenario'},{tid:'flow>Import-3',label:'Import'},{tid:'flow>Import-3>Settings',label:'Settings'}]}};
  if(['node','document','workflow'].includes(fault))after.prepared_node_context[fault+'_id']='foreign';
  if(fault==='label')after.wizard.owner_context.node.label='Foreign';if(fault==='path')after.wizard.owner_context.path[0].tid='foreign';
  let opened=false,gestures=0;const channel={observe:async()=>opened?after:state,perform:async()=>{opened=true;gestures++;}};
  if(fault)await assert.rejects(openPreparedWizard(channel),/owner differs/);
  else assert.equal((await openPreparedWizard(channel)).verified,true);
  assert.equal(gestures,1);
 }
});

test('duplicate deactivation breadcrumb requires native pending owner binding, never label alone',()=>{
 const {state,binding}=fixture();binding.opening.node.node_label='Import@1';
 state.wizard_pending_owner.node={tid:'flow>Import-3',label:'Import'};
 assert.equal(boundWizardDeactivationConfirmation(state,binding),false);
 state.prepared_node_context.pending_wizard_node={tid:'flow>Import-3',label:'Import'};
 assert.equal(boundWizardDeactivationConfirmation(state,binding),true);
 for(const fault of ['tid','label','node','document','workflow']){
  const bad=structuredClone(state);
  if(['tid','label'].includes(fault))bad.prepared_node_context.pending_wizard_node[fault]='foreign';
  else bad.prepared_node_context[fault+'_id']='foreign';
  assert.equal(boundWizardDeactivationConfirmation(bad,binding),false,fault);
 }
});

for(const fault of [null,'unconfirmed','foreign','mask'])test('reopen after Import schema inspection restores the prepared selection: '+fault,async()=>{
 const {state}=fixture(),node=state.prepared_node_context;
 state.wizard_pending_owner={status:'unobserved'};
 state.ui={dialogs:[],masks:[],elements:[
  {ref:'body',tid:node.tid,graph_node:{part:'body'},allowed_actions:['click'],interaction:{state:'point_observed'}},
  {tid:node.tid+';Label;Label',label:'Import',graph_node:{part:'label'}}]};
 const selected=structuredClone(state);
 selected.ui.elements.push({ref:'settings',tid:node.tid+';Setting',allowed_actions:['begin_wizard'],
  wizard_open:{node:{node_label:'Import'},workflow_path:[{tid:'flow',label:'Scenario'}]}});
 const opened=structuredClone(selected);opened.prepared_node_context.surface='wizard';
 opened.wizard={status:'observed',owner_context:{status:'observed',node:{tid:'flow>Import',label:'Import'},
  path:[{tid:'flow',label:'Scenario'},{tid:'flow>Import',label:'Import'},{tid:'flow>Import>Settings',label:'Settings'}]}};
 if(fault==='mask')state.ui.masks=[{kind:'busy'}];
 const gestures=[];let current=state;
 const channel={observe:async options=>{
  assert.ok(options.ready(current),options.condition);return structuredClone(current);
 },perform:async options=>{
  const fresh=structuredClone(current);
  if(fault==='foreign')fresh.prepared_node_context.node_id='foreign';
  assert.ok(options.ready(fresh),options.condition);
  const action=options.resolve(fresh);gestures.push(action);
  if(fault==='unconfirmed')throw Error('unconfirmed selection');
  current=action.verb==='click'?selected:opened;
 }};
 if(fault)await assert.rejects(openPreparedWizard(channel));
 else {
  assert.equal((await openPreparedWizard(channel)).verified,true);
  assert.deepEqual(gestures,[{verb:'click',ref:'body'},{verb:'begin_wizard',ref:'settings'}]);
 }
 if(fault==='unconfirmed')assert.deepEqual(gestures,[{verb:'click',ref:'body'}]);
if(['foreign','mask'].includes(fault))assert.deepEqual(gestures,[]);
});

function lateBodyReplacement(fault) {
 const {state}=fixture(),node=state.prepared_node_context;
 node.locked=false;
 Object.assign(state,{origin:'https://app.loginom.ai/',workflow_ref:{workflow_id:'flow'},
  graph_identity:{status:'observed',container_ref:'graph'},dom_epoch:{document:'doc',revision:1},scan:{complete:true}});
 state.wizard_pending_owner={status:'unobserved'};
 state.ui={dialogs:[],masks:[],truncated:{dialogs:false,masks:false},elements:[
  {ref:'old-body',tid:node.tid,scope:'graph',identity:{anchor_tid:node.tid,path:[]},signature:{tag:'g',native_graph:{node_id:'node'}},
   graph_node:{part:'body'},allowed_actions:['click'],interaction:{state:'point_observed'}}]};
 const fresh=structuredClone(state);fresh.ui.elements[0].ref='fresh-body';fresh.dom_epoch.revision++;
 const selected=structuredClone(fresh);
 selected.ui.elements.push({ref:'settings',tid:node.tid+';Setting',allowed_actions:['begin_wizard'],
  wizard_open:{node:{node_label:'Import'},workflow_path:[{tid:'flow',label:'Scenario'}]}});
 const opened=structuredClone(selected);opened.prepared_node_context.surface='wizard';
 opened.wizard={status:'observed',owner_context:{status:'observed',node:{tid:'flow>Import',label:'Import'},
  path:[{tid:'flow',label:'Scenario'},{tid:'flow>Import',label:'Import'},{tid:'flow>Import>Settings',label:'Settings'}]}};
 if(fault==='same-body')fresh.ui.elements[0].ref='old-body';
 if(fault==='foreign-guid')fresh.prepared_node_context.node_id='other';
 if(fault==='foreign-document')fresh.dom_epoch.document='other';
 if(fault==='foreign-workflow')fresh.workflow_ref.workflow_id='other';
 if(fault==='signature')fresh.ui.elements[0].signature.native_graph.node_id='other';
 if(fault==='label')fresh.ui.elements[0].graph_node.part='label';
 if(fault==='mask')fresh.ui.masks.push({kind:'busy'});
 if(fault==='dialog')fresh.ui.dialogs.push({});
 if(fault==='incomplete')fresh.scan.complete=false;
 if(fault==='locked')fresh.prepared_node_context.locked=true;
 if(fault==='covered')fresh.ui.elements[0].interaction.state='point_not_observed';
 if(fault==='duplicate')fresh.ui.elements.push({...fresh.ui.elements[0]});
 let current=state,clock=0,reads=0;
 const gestures=[],settingsTimeouts=[];
 const channel={now:()=>clock,observe:async options=>{
  if(options.condition==='prepared node settings available')settingsTimeouts.push(options.timeoutMs??15000);
  const deadline=clock+(options.timeoutMs??15000);
  do {
   if(gestures.length===1&&++reads>=3)current=fresh;
   if(options.ready(current))return structuredClone(current);
   clock+=200;
  } while(clock<deadline);
  throw Error('readiness timeout');
 },perform:async options=>{
  assert.ok(options.ready(current));const action=options.resolve(structuredClone(current));gestures.push(action);
  if(action.verb==='begin_wizard')current=opened;
  else if(gestures.length===1&&fault==='lost-reply')throw Error('transport reply lost');
  else if(gestures.length>1) {
   current=fault==='second-replacement'?structuredClone(fresh):selected;
   if(fault==='second-replacement')current.ui.elements[0].ref='third-body';
  }
  return {status:fault==='unknown'?'UNKNOWN':'SUCCEEDED',cleanup_complete:fault!=='cleanup',effect_possible:true};
 }};
 return {channel,gestures,settingsTimeouts};
}

test('settled selection followed by a late body replacement selects the fresh body and opens settings once',async()=>{
 const f=lateBodyReplacement();assert.equal((await openPreparedWizard(f.channel)).verified,true);
 assert.deepEqual(f.gestures,[{verb:'click',ref:'old-body'},{verb:'click',ref:'fresh-body'},{verb:'begin_wizard',ref:'settings'}]);
 assert.ok(f.settingsTimeouts[1]<f.settingsTimeouts[0],'replacement must not reset the settings deadline');
});
for(const fault of ['same-body','foreign-guid','foreign-document','foreign-workflow','signature','label','mask','dialog',
 'incomplete','locked','covered','duplicate','lost-reply','unknown','cleanup','second-replacement'])
 test('late settings selection refuses unproved or repeated replacement: '+fault,async()=>{
  const f=lateBodyReplacement(fault);await assert.rejects(openPreparedWizard(f.channel));
  assert.deepEqual(f.gestures,fault==='second-replacement'?[{verb:'click',ref:'old-body'},{verb:'click',ref:'fresh-body'}]:[{verb:'click',ref:'old-body'}]);
 });
