import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {variablesReplaceLocator} from '../lib/variables-replace-procedure.mjs';
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
