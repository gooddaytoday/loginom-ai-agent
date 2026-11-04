import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
import {configureVariablesCalculator} from '../lib/variables-calculator-procedure.mjs';
import {readVariablesCalculatorContext} from '../lib/variables-calculator-context.mjs';
import {resolveVariablesCalculatorPatch} from '../lib/variables-calculator-parameters.mjs';
const fixture=JSON.parse(readFileSync(new URL('../../../../docs/node-development/nodes/variables-calculator/fixtures/expressions.json',import.meta.url)));
test('rendered UI creates the stage-0 expressions, changes limit and preserves the remaining native records',{
 skip:!process.env.LOGINOM_DOCK_TEST_BROWSER&&'Set LOGINOM_DOCK_TEST_BROWSER to pinned Chromium',timeout:30000,
},async t=>{
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true,args:['--no-proxy-server']});t.after(()=>browser.close());
 const page=await browser.newPage();
 await page.route('http://variables.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));await page.goto('http://variables.test/');
 await page.evaluate(()=>{
  const root=document.createElement('div'),base='MF;TF;WizrdMCF;CalcVariablesWizard',editor='MF;TF;WizrdMCF;ExprEditForm';root.dataset.tid=base;document.body.append(root);
  const components=new Map();let serial=0;
  const make=(parent,tid,tag='div')=>{const e=document.createElement(tag);e.id='c'+serial++;e.dataset.tid=tid;parent.append(e);return e;};
  const records=[{isModel:true,internalId:'r0',data:{ID:0,Index:0,Name:'Expr1',DisplayName:'Выражение1',DataType:3,Expression:'',Description:'',Intermediate:false}}];
  let selected=records[0],draft=null,adding=false;
  const grid=make(root,base+';grdExpressions'),ed=make(root,base+';cmpExpression'),wrapper=document.createElement('div'),input=document.createElement('textarea');
  wrapper.className='CodeMirror';wrapper.append(input);ed.append(wrapper);wrapper.onclick=()=>input.focus();
  const doc={lineCount:()=>input.value.split('\n').length,firstLine:()=>0,lastLine:()=>input.value.split('\n').length-1,getLine:i=>input.value.split('\n')[i]};
  wrapper.CodeMirror={getDoc:()=>doc,getWrapperElement:()=>wrapper,getInputField:()=>input};
  input.oninput=()=>{selected.data.Expression=input.value;};
  const render=()=>{grid.replaceChildren();for(const r of records){const row=make(grid,base+';colExpressionName_'+r.data.Name);row.textContent=r.data.Name;row.dataset.record=r.internalId;
   row.onclick=()=>{selected=r;input.value=r.data.Expression;};}};
  const store={$className:'Ext.data.Store',isLoading:()=>false,getData:()=>({items:records,getSource:()=>({items:records})}),getCount:()=>records.length,getTotalCount:()=>records.length};
  components.set(grid.id,{el:{dom:grid},getStore:()=>store,getSelectionModel:()=>({getSelection:()=>[selected]}),getView:()=>({getNode:r=>[...grid.children].find(e=>e.dataset.record===r.internalId),getRecord:e=>records.find(r=>r.internalId===e.dataset.record)})});
  const button=(tid,text,click)=>{const e=make(root,base+';'+tid,'button');e.textContent=text;e.onclick=click;components.set(e.id,{el:{dom:e},disabled:false});};
  const open=add=>{
   adding=add;draft=add?{Name:'Expr'+(records.length+1),DisplayName:'Выражение'+(records.length+1),DataType:3,Description:'',Intermediate:false}:structuredClone(selected.data);
   const mask=document.createElement('div');mask.className='x-mask';mask.style='position:fixed;inset:0;z-index:1;background:#ccc8';root.append(mask);
   const dialog=make(document.body,editor);dialog.setAttribute('role','dialog');dialog.style='position:absolute;left:350px;top:20px;background:white;border:1px solid black;padding:10px;z-index:2';
   for(const [key,prop] of [['edtName','Name'],['edtDisplayName','DisplayName'],['txtDescription','Description']]){
    const field=make(dialog,editor+';'+key),control=document.createElement('input');control.value=draft[prop];control.oninput=()=>{draft[prop]=control.value;};field.append(control);components.set(field.id,{el:{dom:field},getValue:()=>control.value});
   }
   const combo=make(dialog,editor+';cbxDataType'),picker=make(dialog,editor+';cbxDataType;boundlist');picker.style.display='none';
   const types=[[1,'Логический'],[3,'Вещественный'],[4,'Целый'],[5,'Строковый']].map(([Value,DisplayText])=>({data:{Value,DisplayText}}));
   for(const r of types){const item=make(picker,editor+';type'+r.data.Value);item.textContent=r.data.DisplayText;item.onclick=()=>{draft.DataType=r.data.Value;picker.style.display='none';};}
   const trigger=make(combo,editor+';cbxDataType;trg_picker','button');trigger.textContent='Тип';trigger.onclick=()=>{picker.style.display='block';};
   components.set(combo.id,{el:{dom:combo},getValue:()=>draft.DataType,getStore:()=>({getData:()=>({items:types})}),picker:{el:{dom:picker},getNode:r=>picker.children[types.indexOf(r)],getRecord:e=>types[[...picker.children].indexOf(e)]}});
   const apply=make(dialog,editor+';btnApply','button');apply.textContent='Применить';components.set(apply.id,{el:{dom:apply},disabled:false});
   apply.onclick=()=>{if(adding){selected={isModel:true,internalId:'r'+records.length,data:{...draft,ID:records.length,Index:records.length,Expression:''}};records.push(selected);}else Object.assign(selected.data,draft);input.value=selected.data.Expression;dialog.remove();mask.remove();render();};
  };
  button('btnAddExpr','Добавить',()=>open(true));button('btnExprEdit','Свойства',()=>open(false));render();
  globalThis.Ext={getCmp:id=>components.get(id)};globalThis.bg={app:{Version:'7.4.2'}};
 });
 const binding={document_id:'doc',workflow_ref:{prefix:'MF;TF'},node:{node_id:'node'}},owner={verified:true,surface:'wizard',document_id:'doc',workflow_id:'wf',node_id:'node'};
 const readNode=async()=>owner;
 let before=await readVariablesCalculatorContext(page,binding,readNode);assert.equal(before.verified,true);
 const parameters={expressions:fixture.expressions.map(e=>({target:{kind:'new'},...e}))};
 const plan=resolveVariablesCalculatorPatch(parameters,before,{newNode:true});
 const task={binding,plan,origin:'http://variables.test',build:'7.4.2',deadline:Date.now()+15000};
 const created=await configureVariablesCalculator(page,task,readNode);assert.equal(created.status,'SUCCEEDED',created.error);
 assert.deepEqual(created.configuration.expressions.map(({name,label,type,formula})=>({name,label,type,formula})),fixture.expressions);
 before=await readVariablesCalculatorContext(page,binding,readNode);
 const patch={expressions:[{target:{kind:'existing',name:'limit'},formula:'120'}]};
 const changed=await configureVariablesCalculator(page,{...task,plan:resolveVariablesCalculatorPatch(patch,before)},readNode);
 assert.equal(changed.status,'SUCCEEDED',changed.error);assert.equal(changed.configuration.expressions[0].formula,'120');
 assert.deepEqual(changed.configuration.expressions.slice(1).map(e=>({...e,selected:false})),before.expressions.slice(1).map(e=>({...e,selected:false})));
});
