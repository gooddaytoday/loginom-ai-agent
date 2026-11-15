import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {createDatabaseImportNodeSupport} from '../lib/imports-database-node.mjs';

test('database SQL configuration waits for its editor on the first mode switch',async t=>{
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true,args:['--no-proxy-server']});
 t.after(()=>browser.close());
 for(const fault of ['delayed','absent','native_error','owner'])await t.test(fault,async t=>{
  const page=await browser.newPage();t.after(()=>page.close());
  await page.route('http://database.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));
  await page.goto('http://database.test/');
  await page.evaluate(fault=>{
   const root='MF;TF-1;WizrdMCF',wiz=root+';DBImportWizard;';
   const make=(tid,tag='div')=>{const e=document.createElement(tag);e.dataset.tid=tid;document.body.append(e);return e;};
   const card=make(root+';DBImportWizard'),done=make(root+';DoneWizard');
   const connection=make(wiz+'edtConnection');connection.append(document.createElement('input'));connection.firstChild.value='/own/people.db';
   make(wiz+'pedTableName;ValueControl').append(document.createElement('input'));
   const connect=make(wiz+'btnConnect','button');connect.textContent='Activate';
   const radio=make(wiz+'rbSQL;DisplayEl','button');radio.textContent='SQL';
   const container=make(wiz+'cmpQueryCM');
   const error=make(root+';btnError','button');error.style.display='none';error.dataset.qtip='Connection lost';
   const next=make(root+';btnNext','button');next.textContent='Next';
   const audit={switches:0,nexts:0,typed:0,editorAtModeSwitch:0,owner:true};window.audit=audit;
   let query='',active=card;
   const wizard={Connected:false,IsNowSQLImportMode:false,FImportObjSql:{GetQuery:()=>query},Items:{},constructor:{name:'DBImportWizard'}};
   connect.onclick=()=>{wizard.Connected=true;};
   radio.onclick=()=>{
    audit.switches++;wizard.IsNowSQLImportMode=true;
    audit.editorAtModeSwitch=container.querySelectorAll('.CodeMirror').length;
    if(fault==='native_error'){setTimeout(()=>{error.style.display='block';},100);return;}
    if(fault==='owner'){setTimeout(()=>{audit.owner=false;},100);return;}
    if(fault==='absent')return;
    setTimeout(()=>{
     const editor=document.createElement('textarea');editor.className='CodeMirror';editor.style.visibility='hidden';container.append(editor);
     editor.oninput=()=>{query=editor.value;audit.typed++;};
     setTimeout(()=>{editor.style.visibility='visible';},100);
    },150);
   };
   next.onclick=()=>{audit.nexts++;active=done;};
   const controller={FWizardItems:[{FWizard:wizard}],FCardLayout:{getActiveItem:()=>({el:{dom:active}})}};
   const workspace={getActiveTab:()=>({Controller:{FController:controller}})};
   window.bg={app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{Items:{Workspace:workspace}}}}}};
  },fault);
  const task={document_id:'doc',workflow_ref:{workflow_id:'flow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]},
   node:{document_id:'doc',workflow_id:'flow',node_id:'node'},database_path:'/own/people.db',mode:'sql',sql:'SELECT Id FROM People',origin:'http://database.test',build:'7.4.2',deadline:Date.now()+2000};
  // Stub only prepared ownership; run the serialized production configure and
  // receipt envelope, so a missing editor exercises DATABASE_STEP_UNCONFIRMED.
  const boundPage={locator:selector=>page.locator(selector),mouse:page.mouse,keyboard:page.keyboard,waitForTimeout:ms=>page.waitForTimeout(ms),
   evaluate:async(fn,arg)=>arg&&Object.keys(arg).sort().join(',')==='document_id,node,workflow_ref'
    ?{verified:await page.evaluate(()=>window.audit.owner),surface:'wizard'}:page.evaluate(fn,arg)};
  const records=[],request={document_id:task.document_id,workflow_ref:task.workflow_ref,target:{kind:'new',type:'imports.database'},mode:'sql',parameters:{database:{database_path:task.database_path,sql:task.sql}}};
  const operation={id:'configure',parameters:request,deadline:task.deadline,nodeApply:{request,node:task.node,phases:[]}};
  const support=createDatabaseImportNodeSupport({targetOrigin:task.origin,targetBuild:task.build});
  const drivers=support.nodeApplyDriverFactory({operation,execute:code=>new Function('page','return ('+code+')(page)')(boundPage),
   onRecord:async r=>{records.push(r);return r;},now:Date.now,receiptOptions:()=>({})});
  if(fault==='delayed')await drivers.configureCalculator(task,request.parameters);
  else await assert.rejects(drivers.configureCalculator(task,request.parameters),/Database import:/);
  const outcome=records.find(r=>r.phase==='node_step_completed')?.outcome;
  assert.ok(outcome,'configure must preserve its receipt');
  const result=outcome.output;
  const audit=await page.evaluate(()=>window.audit);
  assert.equal(audit.switches,1);assert.equal(audit.editorAtModeSwitch,0);
  if(fault==='delayed'){
   assert.equal(result.verified,true,JSON.stringify(result));
   assert.equal(result.configuration.sql,task.sql);assert.equal(audit.typed,1);assert.equal(audit.nexts,1);
   return;
  }
  assert.equal(result.verified,false);assert.equal(result.effect_possible,true);assert.equal(result.cleanup_complete,false);
  assert.equal(outcome.error.code,'DATABASE_STEP_UNCONFIRMED');
  assert.equal(audit.typed,0);assert.equal(audit.nexts,0);
  assert.match(result.error,fault==='absent'?/SQL editor.*did not settle/:fault==='native_error'?/Connection lost/:/owned node wizard changed/);
 });
});
