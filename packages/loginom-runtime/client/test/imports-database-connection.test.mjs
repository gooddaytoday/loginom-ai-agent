import test from 'node:test';
import assert from 'node:assert/strict';
import {databaseConnectionCapability} from '../lib/imports-database-connection.mjs';

const origin='https://app.loginom.ai',build='7.4.2',prefix='MF;TF-1',document_id='doc';
const form=prefix+';ConnectionsViewWizard',wizard=prefix+';WizardModelConnectionForm';
const titlePrefix=form+';cntTile;ListView;headercontainer;title_';
const graphTid=prefix+';ModelForm;cmpDiagram',moduleTid='module',tabTid='tab';
const entryPrefix=prefix+';ListViewForm;cntTile;ListView;headercontainer;title_';
const crumbPrefix=prefix+';cnrNaviMode;b.s_';
const flow={workflow_id:'flow',tab_tid:tabTid,prefix,navigation_path:[{tid:moduleTid,label:'Модуль1'},{tid:'flow',label:'Сценарий'}]};
const connection={name:'/own/probe.db',database_path:'/own/probe.db'};
const graph={complete:true,interaction_ready:true,document_id,workflow_ref:flow,nodes:[],links:[],foreign_links:[]};
const testTitle='Тестирование соединения',passed='Тестирование соединения прошло успешно';
const missing=path=>'Файл "'+path+'" не найден';

async function runConnection(t,fault) {
 const calls=[],elements=[],components=new Map();
 const existing=['direct close','deactivation','silent deactivation'].includes(fault);
 const activation=fault==='silent deactivation';
 const differentSelection=fault==='selection instance differs'||fault==='selection module differs';
 let surface='graph',visibleDialog=null,selection=[],readsSincePick=0,picked,activeWizard;
 let clock=Date.now();
 t.mock.method(Date,'now',()=>clock);
 function element(tid,text='',screen='all',action) {
  const x=elements.length*16+12;
  const e={tid,id:'el-'+elements.length,textContent:text,innerText:text,screen,action,isConnected:true,
   getAttribute:key=>key==='data-tid'?tid:null,checkVisibility:()=>screen==='all'||screen===surface,
   getBoundingClientRect:()=>({left:x-5,right:x+5,top:15,bottom:25,width:10,height:10}),
   closest:()=>null,contains:()=>false};
  elements.push(e);
  return e;
 }
 const doc={documentElement:{},elementFromPoint:x=>elements.find(e=>x===e.getBoundingClientRect().left+5),
  querySelectorAll:selector=>{
   if(selector==='.x-window'||selector==='.x-window:visible'||selector.includes('x-mask:visible'))return visibleDialog?[visibleDialog.el.dom]:[];
   const terms=[...selector.matchAll(/\[data-tid([\^$]?)=("(?:[^"\\]|\\.)*")\]/g)];
   if(!terms.length)return [];
   return elements.filter(e=>e.checkVisibility()&&terms.every(([,mode,value])=>{
    const key=JSON.parse(value);
    return mode==='^'?e.tid.startsWith(key):mode==='$'?e.tid.endsWith(key):e.tid===key;
   }));
  }};
 const packageNode={},module={ParentNode:packageNode},workflow={ParentNode:module};
 const listNode=module.FConnectionsNode={ParentNode:module};
 const active={Controller:{Node:{data:{node:workflow}},FController:{}}};
 const tab=element(tabTid);tab.classList={contains:s=>s==='x-tab-active'};
 const prepare={document:doc,id:document_id,receipts:new Map([['prepare',{phase:'verified',workflowId:'flow',nodeTargetWorkflowNode:workflow,packageNode,tab}]])};
 const change=(screen,node,controller={})=>{surface=screen;Object.assign(active.Controller,{Node:{data:{node}},FController:controller});};
 const ext={getCmp:id=>components.get(id)};
 function dialog(id,buttons) {
  const root=element(id);const message=element(id+';message','',id);
  const controls=Object.fromEntries(Object.entries(buttons).map(([key,label])=>{
   const e=element(id+';tlb;'+key,label,id),control={el:{dom:e},disabled:false};
   components.set(e.id,control);
   return [key,control];
  }));
  root.contains=e=>e===message||Object.values(controls).some(c=>c.el.dom===e);
  const native={el:{dom:root},msg:{el:{dom:message}},msgButtons:controls,cfg:{}};
  components.set(root.id,native);
  return native;
 }
 const prompt=dialog('msgbox',{yes:'Да',no:'Да, больше не спрашивать',cancel:'Нет',ok:'OK'});
 const errorBox=dialog('msgbox-1',{ok:'OK'});
 ext.Msg=prompt;
 function show(native,title,message,body=message,button='ok',after=()=>{},fresh=true) {
  if(fresh)native.cfg={title};
  const root=native.el.dom,msg=native.msg.el.dom,control=native.msgButtons[button].el.dom;
  msg.textContent=message;
  root.innerText=body;
  control.action=()=>{visibleDialog=null;after();};
  visibleDialog=native;
 }
 for(const native of [prompt,errorBox]){
  for(const el of [native.el.dom,native.msg.el.dom,...Object.values(native.msgButtons).map(c=>c.el.dom)]){
   el.checkVisibility=()=>visibleDialog===native&&(el.tid!=='msgbox;tlb;ok'||prompt.cfg.title===testTitle);
  }
 }
 const listRoot=element(form,'','list');
 listRoot.querySelectorAll=selector=>doc.querySelectorAll(selector).filter(e=>e.tid.startsWith(form+';'));
 const makeRecord=(mod,id,label,path,active=false)=>({data:{Data:{__ObjectId:{Module:mod,Instance:id}},
  Title:label,ConnectionPath:path,ConnectionStatus:active?1:0,IconCls:'bg-vendor-icon-sqliteunidacdbconnection',Deletable:true}});
 const prior=makeRecord(fault==='selection module differs'?'other':'module',fault==='selection module differs'?2:1,
  existing?connection.name:'SQLite',existing?connection.database_path:'',activation);
 const added=makeRecord('module',2,'SQLite','');
 let records=[prior];
 const listView={getRecords:predicate=>records.map(r=>r.data).filter(predicate)};
 class ConnectionsViewWizard {
  FView={el:{dom:listRoot}};
  ListView=listView;
  Store={getRange:()=>records,isLoading:()=>false};
  FCustomItems={};
 }
 const list=new ConnectionsViewWizard();
 class ListViewForm {FView={el:{dom:moduleRoot}};}
 const moduleRoot=element(prefix+';ListViewForm','','module');
 const goList=()=>change('list',listNode,list);
 const goModule=()=>{calls.push('module');change('module',module,new ListViewForm());};
 const connectionsEntry=element(entryPrefix+'1','Подключения','module',goList);
 const workflowEntry=element(entryPrefix+'2','Сценарий','module',()=>{calls.push('return to graph');change('graph',workflow);});
 moduleRoot.contains=e=>[connectionsEntry,workflowEntry].includes(e);
 element(moduleTid,'Модуль1','all',goModule);
 element(graphTid,'','graph');
 element(form+';cntTile;ListView;tbl','','list');
 const pick=record=>{
  calls.push('pick '+record.data.Data.__ObjectId.Module+':'+record.data.Data.__ObjectId.Instance);
  picked=record;selection=[record];readsSincePick=0;
  if(fault==='inventory changes before delete'&&calls.includes('close wizard'))prior.data.ConnectionPath='/own/changed.db';
 };
 element(titlePrefix+'1','Метка:'+prior.data.Title,'list',()=>pick(prior));
 const item=element(titlePrefix+'2','Метка:SQLite','absent',()=>pick(added));
 item.checkVisibility=()=>surface==='list'&&records.includes(added);
 const foreign=element(titlePrefix+'3','Метка:Другой','absent');
 foreign.checkVisibility=()=>surface==='list'&&fault==='rendered tile list changes'&&calls.includes('close wizard');
 element(form+';pnlConnectionsTree;headercontainer;text_Источники_данных>Базы_данных>SQLite;TreeText','SQLite','list',()=>{
  calls.push('add');records.push(added);
 });
 const inputs=new Map();
 for(const name of ['fldLabel','pedDatabasePath;ValueControl']){
  const e=element(wizard+';fields;'+name,'','wizard');
  const native={el:{dom:e},value:'',lastValue:''};
  inputs.set(e.id,native);components.set(e.id,native);
 }
 for(const flag of ['pedInMemoryDB','pedCreateDBIfNotExists','pedUseEncryption','pedLoginPrompt']){
  const e=element(wizard+';fields;'+flag+';ValueControl','','wizard');
  e.classList={contains:()=>false};
 }
 const nodeCrumb=element(crumbPrefix+'SQLite',existing?connection.name:'SQLite','list');
 const wizardCrumb=element(crumbPrefix+'Настройка','Настройка','list');
 const prepareWizard=record=>{
  const node={ParentNode:listNode,FConnectionNode:record.data.Data};
  const wizardNode={ParentNode:node};
  components.set(nodeCrumb.id,{el:{dom:nodeCrumb},_node:{data:{node}}});
  components.set(wizardCrumb.id,{el:{dom:wizardCrumb},_node:{data:{node:wizardNode}}});
  activeWizard=()=>{
   for(const [id,input] of inputs)input.value=input.lastValue=elements.find(e=>e.id===id).tid.endsWith(';fldLabel')?record.data.Title:record.data.ConnectionPath;
   change('wizard',wizardNode,{FModelNode:record.data.Data});
  };
 };
 element(form+';tbrActions;btnConfigConnection','','list',()=>{
  const record=fault==='wizard owns another record'||differentSelection?prior:picked;
  prepareWizard(record);
  if(fault==='deactivation'){
   show(prompt,'Loginom '+build,'Настройка узла приведет к его деактивации',
    'Loginom '+build+' Настройка узла приведет к его деактивации. Вы действительно хотите начать настраивать узел? Да Да, больше не спрашивать Нет','yes',
    ()=>{calls.push('consent to deactivation');record.data.ConnectionStatus=0;activeWizard();});
  }else{
   if(fault==='silent deactivation')record.data.ConnectionStatus=0;
   activeWizard();
  }
 });
 element(wizard+';fields;btnTestConnection','','wizard',()=>{
  calls.push('test connection');
  const dismiss=()=>calls.push('dismiss test result');
  if(fault==='foreign test dialog'){
   show(prompt,'Восстановление сессии','Обнаружен разрыв связи.',undefined,'ok',dismiss);
  }else if(fault==='exact success'||fault==='decorated success'){
   const text=fault==='exact success'?passed:'Ошибка: '+passed+' не подтверждено';
   show(prompt,testTitle,text,text,'ok',dismiss);
  }else{
   const reason=fault==='generic error'?'База данных повреждена':missing(fault==='wrong missing path'?'/own/other.db':connection.database_path);
   show(errorBox,'Loginom '+build,testTitle,'Loginom '+build+'\n'+testTitle+'\n'+reason+'\nТехнические подробности\nOK','ok',dismiss);
  }
 });
 element(wizard+';btnClose','','wizard',()=>{
  calls.push('close wizard');
  const closed=()=>{
   if(fault==='restored settings differ')picked.data.ConnectionPath='/own/changed.db';
   goList();
   if(fault==='stale deletion dialog')prompt.cfg={title:'Удаление подключения'};
  };
  if(fault==='direct close'||fault==='silent deactivation')closed();
  else {
   prompt.msgButtons.yes.el.dom.textContent='Да';
   show(prompt,'Подтвердить','Вы действительно хотите закрыть мастер настройки?',undefined,'yes',
    ()=>{calls.push('confirm wizard close');closed();});
  }
 });
 element(wizard+';btnDone','','wizard',()=>{calls.push('commit settings');throw Error('fixture ends at verified connection test');});
 const deleteButton=element(form+';tbrActions;btnDeleteConnection','','list',()=>{
  calls.push('open deletion');
  prompt.msgButtons.yes.el.dom.textContent='Удалить';
  show(prompt,fault==='wrong deletion title'?'Чужая операция':'Удаление подключения',
   'Действительно удалить подключение SQLite?',undefined,'yes',
   ()=>{calls.push('confirm deletion');records=records.filter(r=>!selection.includes(r));selection=[];},fault!=='stale deletion dialog');
 });
 const nativeDelete={el:{dom:deleteButton},disabled:false};
 components.set(deleteButton.id,nativeDelete);list.FCustomItems.btnDeleteConnection=nativeDelete;
 const bg={app:{Version:build,Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>active}}}}}},
  wizards:{connection:{ConnectionStatus:{Untested:0,Connected:1,Tested:2,Error:3}}},
  ext:{errormessage:{ErrorMsg:{FInstance:{FMessageBox:errorBox}}},GetStoreSource:store=>store,
   GetSelectedGridRecords:()=>differentSelection&&picked===added&&!calls.includes('close wizard')&&++readsSincePick===1?[prior]:selection}};
 const globals={document:doc,location:{origin},innerWidth:4096,innerHeight:480,__loginomDockPreparationV1:prepare,bg,Ext:ext};
 for(const [key,value] of Object.entries(globals)){
  const saved=Object.getOwnPropertyDescriptor(globalThis,key);
  Object.defineProperty(globalThis,key,{configurable:true,value});
  t.after(()=>{if(saved)Object.defineProperty(globalThis,key,saved);else delete globalThis[key];});
 }
 const handle=value=>({
  value,dispose:async()=>{},evaluate:async fn=>fn(value),getProperty:async key=>handle(value[key]),
  asElement:()=>value?{click:async()=>value.action(),dispose:async()=>{}}:null,
 });
 const unwrap=value=>{
  if(value?.evaluate&&value?.dispose)return value.value;
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,v?.evaluate&&v?.dispose?v.value:v]));
 };
 const locator=(selector,input=false)=>{
  const find=()=>doc.querySelectorAll(selector);
  const control=()=>inputs.get(find()[0]?.id);
  return {
   count:async()=>find().length,isVisible:async()=>find().length===1,
   evaluate:async(fn,arg)=>fn(find()[0],arg),evaluateAll:async(fn,arg)=>fn(find(),arg),
   locator:()=>locator(selector,true),inputValue:async()=>control().value,
   fill:async value=>{assert.ok(input);calls.push('fill');control().value=value;},press:async()=>{control().lastValue=control().value;},
  };
 };
 const click=async x=>doc.elementFromPoint(x).action();
 const page={evaluate:async(fn,args)=>fn(unwrap(args)),evaluateHandle:async(fn,args)=>handle(fn(unwrap(args))),locator,
  mouse:{click,dblclick:click},waitForTimeout:async ms=>{clock+=ms;}};
 const result=await databaseConnectionCapability(page,{deadline:Date.now()+1000,document_id,workflow_ref:flow,origin,build,connection},
  async()=>{assert.equal(surface,'graph');assert.equal(visibleDialog,null);return graph;});
 return {result,calls,dialog:visibleDialog,records};
}

test('the missing-file path removes only the new tile, then checks the original graph',async t=>{
 const {result,calls,records}=await runConnection(t);
 assert.equal(result.cleanup_complete,true,result.error);
 assert.equal(result.pre_target_checkpoint.connection_test_refused.tile_removed,true);
 assert.deepEqual(records.map(r=>r.data.Data.__ObjectId.Instance),[1]);
 assert.deepEqual(calls.slice(-7),['close wizard','confirm wizard close','pick module:2','open deletion','confirm deletion','module','return to graph']);
});

test('an unchanged existing SQLite connection closes directly without pressing a confirmation',async t=>{
 const {result,calls}=await runConnection(t,'direct close');
 assert.equal(result.cleanup_complete,true,result.error);
 assert.equal(result.pre_target_checkpoint.connection_test_refused.tile_created,false);
 assert.ok(calls.includes('close wizard'));
 for(const gesture of ['fill','confirm wizard close','open deletion'])assert.ok(!calls.includes(gesture));
});

for(const fault of ['deactivation','silent deactivation'])test('a possibly deactivated existing connection keeps cleanup unconfirmed for '+fault,async t=>{
 const {result,calls}=await runConnection(t,fault);
 assert.equal(result.cleanup_complete,false);
 assert.equal(result.pre_target_checkpoint,undefined);
 assert.match(result.error,/may have been deactivated.*activity.*unconfirmed/i);
 assert.ok(calls.includes('return to graph'));
 assert.equal(calls.includes('consent to deactivation'),fault==='deactivation');
});

for(const [fault,message] of [
 ['generic error',/База данных повреждена/],['wrong missing path',/other\.db/],['decorated success',/не подтверждено/],
])test('the owned connection test dialog is dismissed and reports '+fault,async t=>{
 const {result,calls,dialog}=await runConnection(t,fault);
 assert.equal(dialog,null);
 assert.equal(result.cleanup_complete,false);
 assert.match(result.error,message);
 assert.equal(calls.includes('dismiss test result'),true);
 for(const gesture of ['close wizard','open deletion','commit settings'])assert.ok(!calls.includes(gesture));
});

test('the exact native SQLite success text admits the settings commit',async t=>{
 const {result,calls,dialog}=await runConnection(t,'exact success');
 assert.equal(dialog,null);
 assert.match(result.error,/fixture ends at verified connection test/);
 assert.deepEqual(calls.slice(-3),['test connection','dismiss test result','commit settings']);
});

test('an unrelated native window remains open',async t=>{
 const {result,calls,dialog}=await runConnection(t,'foreign test dialog');
 assert.equal(result.cleanup_complete,false);
 assert.match(result.error,/test result owner or message differs/);
 assert.equal(dialog.cfg.title,'Восстановление сессии');
 assert.ok(!calls.includes('dismiss test result'));
});

for(const fault of ['selection instance differs','selection module differs','inventory changes before delete'])test('unproved addition is retained for '+fault,async t=>{
 const {result,calls,records}=await runConnection(t,fault);
 assert.equal(result.cleanup_complete,true,result.error);
 assert.equal(result.pre_target_checkpoint.connection_test_refused.tile_removed,false);
 assert.ok(!calls.includes('open deletion'));
 assert.equal(records.length,2);
});

for(const [fault,message,opens] of [
 ['wizard owns another record',/exact selected connection owner/,false],
 ['restored settings differ',/discarded connection settings/,false],
 ['rendered tile list changes',/connection inventory changed during refusal/,false],
 ['wrong deletion title',/deletion confirmation or connection owner/,true],
 ['stale deletion dialog',/deletion confirmation or connection owner/,true],
])test('missing-file cleanup remains unconfirmed for '+fault,async t=>{
 const {result,calls}=await runConnection(t,fault);
 assert.equal(result.cleanup_complete,false);
 assert.match(result.error,message);
 assert.equal(result.pre_target_checkpoint,undefined);
 assert.equal(calls.includes('open deletion'),opens);
 assert.ok(!calls.includes('confirm deletion'));
});
