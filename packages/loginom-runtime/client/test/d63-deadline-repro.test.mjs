import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createNodeProcedure} from '../lib/node-procedure.mjs';
import {workspaceUiCapability} from '../lib/workspace-ui.mjs';
import {readPreparedNodeContext} from '../lib/node-context.mjs';
import {Page,build,origin} from './support/workspace-ui-fixture.mjs';

// LAB-82 reviewer counterexample, plus late asynchronous owner reads on either
// side of the single Execute. All timing uses the browser fixture clock.
for(const [readyAt,transportDelay,lateRead] of [[54000,10000],[64000,10000],[64000,59000],
 [54000,10000,'before'],[54000,10000,'after']])
test(`independent D63 absolute deadline: toast ready ${readyAt}, transport ${transportDelay}, late read ${lateRead??'none'}`,async()=>{
 let elapsed=1000,clicked=false,receipt,toast,dispatched=false;
 class Clock extends Date {static now(){return elapsed;}}
 const page=new Page({clock:Clock}),base='MF;TF-1;';
 const panel=page.add('div',base+'NavigationBar;NavigationPanel');
 let path='';const crumbs=[];
 for(const label of ['Сервер','Пакеты','Package1','Модуль1','Сценарий','Export','Настройка']){
  path+=(path?'>':'')+label;const c=page.add('a',base+'cnrNaviMode;b.s_'+path,label,undefined,panel);crumbs.push(c);
  if(label==='Сценарий')page.add('span',null,'',undefined,c).attrs.class='maptree-icon-workflow';
  if(label==='Export')page.add('span',null,'',undefined,c).attrs.class='bg-vendor-icon-exporttextfile';
  if(label==='Настройка')page.add('span',null,'',undefined,c).attrs.class='maptree-icon-wizard';
 }
 const wizard=page.add('div',base+'WizrdMCF');
 for(const [key,value] of [['edtDisplayName','Export'],['cbxNodeTitleMode','Пользовательская метка']]){
  const owner=page.add('div',base+'WizrdMCF;DoneWizard;'+key,'',undefined,wizard);
  page.add('input',null,'',undefined,owner).value=value;
 }
 page.add('button',base+'WizrdMCF;btnExecute','Execute',{x:500,y:300,width:100,height:30},wizard);
 const node={document_id:'doc',workflow_id:'wf',node_id:'node'};
 const workflow_ref={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:page.tab.getAttribute('data-tid'),navigation_path:[{tid:"scenario",label:"Scenario"}]};
 const binding={document_id:'doc',workflow_ref,node};
 const reader=async()=>{
  if(dispatched&&(lateRead==='before'&&!clicked||lateRead==='after'&&clicked))elapsed=65000;
  return {verified:true,...node,surface:clicked?'graph':'wizard',tid:base+(clicked?'Graph;Export':'WizrdMCF')};
 };
 const observed=await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
  {mode:'observe',expected_origin:origin,expected_build:build,prepared_node_context:binding},reader);
 assert.equal(observed.status,'SUCCEEDED');
 const button=observed.output.ui.elements.find(e=>e.wizard_finish);assert.ok(button);
 const click=page.mouse.click;page.mouse.click=async(...args)=>{
  await click(...args);clicked=true;wizard.remove();crumbs.at(-1).remove();crumbs.at(-2).remove();
  const graph=page.add('div',base+'ModelForm;cmpDiagram');
  const body=page.add('g',base+'Graph;Export','',undefined,graph);
  page.add('span',base+'Graph;Export;Label;Label','Export',undefined,body);
  toast=page.add('div','toast','Finished',{x:950,y:606.296875,width:300,height:184});toast.attrs.role='dialog';
 };
 page.waitForTimeout=async ms=>{elapsed+=ms;if(toast&&elapsed>=readyAt)toast.remove();};
 page.context.readOwnedContext=reader;
 const operation={id:'parent',deadline:60000,action:{action_key:'node.apply',revision:'1'}};
 const channel=createNodeProcedure({operation,preparedNodeContext:binding,targetOrigin:origin,targetBuild:build,
  now:()=>elapsed,wait:async()=>{},record:async e=>structuredClone(e),wrapMutation:(code,receipt)=>({code,receipt}),
  execute:async(code,options)=>{
   if(typeof code==='string')return {status:'SUCCEEDED',output:structuredClone(observed.output)};
   const dispatchedAt=elapsed;elapsed+=transportDelay;dispatched=true;
   // Execute the actual generated dispatch; replace only the native fixture reader.
   receipt=await vm.runInContext('('+code.code.replace(readPreparedNodeContext.toString(),'readOwnedContext')+')',page.context)(page);
   assert.ok(elapsed<=dispatchedAt+options.timeout,'Result is inside the actual transport timeout');
   return receipt;
  }});
 await channel.observe({condition:'own Export Done',ready:()=>true});
 let error;try{await channel.act({verb:'execute_wizard',ref:button.ref});}catch(e){error=e;}
 console.log(JSON.stringify({readyAt,transportDelay,elapsed,parentDeadline:operation.deadline,status:receipt?.status,
  code:receipt?.error?.code,clicks:page.events.filter(e=>e==='click').length,hostAccepted:!error}));
 if(readyAt<operation.deadline&&!lateRead){assert.ifError(error);assert.equal(receipt.status,'SUCCEEDED');}
 else {assert.ok(error,'Parent deadline must refuse this late completion');assert.equal(receipt.error.code,'UI_DEADLINE_EXCEEDED');}
 if(!lateRead)assert.ok(elapsed<=operation.deadline,'Observation cannot consume a fresh budget after transport');
 assert.equal(page.events.filter(e=>e==='click').length,transportDelay===59000||lateRead==='before'?0:1);
 if(lateRead){
  assert.equal(receipt.status,lateRead==='before'?'NOT_APPLIED':'AMBIGUOUS');
  assert.equal(receipt.effect_possible,lateRead==='after');
  assert.equal(receipt.trace.some(e=>e.event==='wizard_execute_graph_verified'),false);
 }
});
