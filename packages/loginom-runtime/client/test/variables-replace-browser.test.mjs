import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {variablesReplaceLocator,configureVariablesReplace} from '../lib/variables-replace-procedure.mjs';
test('native pair cell duplicated by the summary selects only the rendered data row',{
 skip:!process.env.LOGINOM_DOCK_TEST_BROWSER&&'Set LOGINOM_DOCK_TEST_BROWSER to pinned Chromium',timeout:15000,
},async t=>{
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true,args:['--no-proxy-server']});
 t.after(()=>browser.close());const page=await browser.newPage();
 const tid='MF;TF-1;WizrdMCF;ReplaceVariablesWizard;colReplaceValue_0';
 await page.setContent(`<table><tbody><tr id="data"><td data-tid="${tid}">2</td></tr><tr class="x-grid-row-summary" id="summary"><td data-tid="${tid}">Итого</td></tr></tbody></table>`);
 await page.evaluate(()=>{globalThis.clicked=[];for(const row of document.querySelectorAll('tr'))row.ondblclick=()=>globalThis.clicked.push(row.id);});
 assert.equal(await page.locator('[data-tid='+JSON.stringify(tid)+']').count(),2);
 const cell=variablesReplaceLocator(page,tid);assert.equal(await cell.count(),1);
 await cell.scrollIntoViewIfNeeded();await cell.dblclick();
 assert.deepEqual(await page.evaluate(()=>globalThis.clicked),['data']);
});
test('replacement selects Zero below the native grid viewport before its guarded click',{
 skip:!process.env.LOGINOM_DOCK_TEST_BROWSER&&'Set LOGINOM_DOCK_TEST_BROWSER to pinned Chromium',timeout:15000,
},async t=>{
 const browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true,args:['--no-proxy-server']});
 t.after(()=>browser.close());const page=await browser.newPage();
 await page.route('http://variables.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));await page.goto('http://variables.test/');
 await page.evaluate(()=>{
  const root='MF;TF;WizrdMCF',base=root+';ReplaceVariablesWizard';
  document.body.innerHTML=`<style>#grid {height:150px;overflow:auto;width:300px} td {height:28px;width:200px}</style><div data-tid="${root}"><div data-tid="${base}"><div id="grid" data-tid="${base};grdDataList"><table></table></div><div style="height:300px">Adjacent wizard content</div></div></div>`;
  const names=['Count','Amount','Color','Case','Enabled','Missing','Empty','Zero','Untouched','NullInt'];
  const records=names.map(name=>({internalId:name})),rows=names.map((name,i)=>{
   const row=document.createElement('tr'),cell=document.createElement('td');cell.dataset.tid=base+';colInputData_'+name;cell.textContent=name;row.append(cell);document.querySelector('table').append(row);
   row.onclick=()=>{globalThis.selected=name;};return row;
  });
  globalThis.selected='Count';globalThis.bg={app:{Version:'7.4.2'}};
  const grid=document.querySelector('#grid');globalThis.Ext={getCmp:id=>id==='grid'?{el:{dom:grid},getStore:()=>({getData:()=>({items:records})}),getView:()=>({getNode:r=>rows[records.indexOf(r)],getRecord:n=>records[rows.indexOf(n)]})}:null};
 });
 const owner={verified:true,document_id:'doc',workflow_id:'wf',node_id:'replace',surface:'wizard',tid:'MF;TF;WizrdMCF'};
 const readContext=async()=>({verified:true,inventory_complete:true,node_context:owner,input_fields:[{record_id:'Count',name:'Count',label:'Count',type:'integer',mode:'none'},{record_id:'Zero',name:'Zero',label:'Zero',type:'integer',mode:'manual'}],selected:await page.evaluate(()=>globalThis.selected),pairs:[],other:{mode:'keep'},precision:0});
 const result=await configureVariablesReplace(page,{binding:{workflow_ref:{prefix:'MF;TF'}},origin:'http://variables.test',build:'7.4.2',deadline:Date.now()+10000,parameters:{},new_node:false,finish:'close'},async()=>owner,readContext);
 assert.equal(result.status,'SUCCEEDED',result.error);
 assert.equal(await page.evaluate(()=>globalThis.selected),'Zero');
 assert.ok(await page.locator('#grid').evaluate(e=>e.scrollTop)>0);
});
