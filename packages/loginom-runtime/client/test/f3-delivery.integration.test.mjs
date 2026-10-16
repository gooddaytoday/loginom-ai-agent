import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {runInNewContext} from 'node:vm';
import {chromium} from 'playwright-core';
import {makeWorkspaceUiCode} from '../lib/workspace-ui.mjs';

test('real Chromium delivers one F3 and leaves a delayed Preview to the next observation', {
  skip:!process.env.LOGINOM_DOCK_TEST_BROWSER,timeout:30000,
},async()=>{
  let deliver;
  const received=new Promise(resolve=>{deliver=resolve;});
  const http=createServer((request,response)=>{
    if(request.url==='/preview'){deliver(response);return;}
    response.end(`<button data-tid="MF;cntMain;tlbMainToolbar;btnAvatar">user</button>
      <div class="x-tab-active" data-tid="MF;cntMain;cntWorkspace;Workspace;t.br;tb-1">Scenario</div>
      <div data-tid="MF;TF-1;ModelForm;cmpDiagram"><button id="port" data-tid="MF;TF-1;Graph;Source;Output_Data-0">output</button></div>
      <script>window.bg={app:{Version:'7.4.2'}};window.keys=0;
      port.onkeydown=e=>{if(e.key==='F3'){e.preventDefault();keys++;
        const preview=document.createElement('div');preview.dataset.tid='MF;TF-1;ModelForm;PreviewWindow';preview.textContent='Loading';document.body.append(preview);
        const frame=document.createElement('iframe');frame.src='/preview';preview.append(frame);}};</script>`);
  });
  await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${http.address().port}`;
  let browser,response;
  try{
    browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,args:['--no-sandbox']});
    const page=await browser.newPage();await page.goto(origin);
    const run=options=>runInNewContext(makeWorkspaceUiCode({expected_origin:origin,expected_build:'7.4.2',...options}))(page);
    const snapshot=(await run({mode:'observe'})).output;
    const output=snapshot.ui.elements.find(e=>e.tid==='MF;TF-1;Graph;Source;Output_Data-0');assert.ok(output);
    const outcome=await run({mode:'act',snapshot,action:{verb:'press',ref:output.ref,key:'F3'}});
    response=await received;
    assert.equal(outcome.status,'SUCCEEDED',JSON.stringify(outcome.error));
    assert.equal(await page.evaluate(()=>keys),1);
    assert.equal(outcome.trace.filter(e=>e.event==='ui_key_delivered').length,1);
    assert.equal(outcome.output.verification_required,true);
    assert.equal(outcome.output.node_preview_schema,undefined);
    response.end('fixture preview loaded');response=undefined;
    const after=await run({mode:'observe'});assert.equal(after.status,'SUCCEEDED');
    assert.equal(await page.evaluate(()=>keys),1);
  }finally{response?.end();await browser?.close();http.closeAllConnections();await new Promise(resolve=>http.close(resolve));}
});
