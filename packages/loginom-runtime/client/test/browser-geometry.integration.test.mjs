import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {runInNewContext} from 'node:vm';
import {chromium} from 'playwright-core';
import {makeWorkspaceUiCode} from '../lib/workspace-ui.mjs';

// Real layout, no overridden DOMRect: this checks the production serialized
// capability independently of the product's forced-DPR=1 launch policy.
const base='MF;TF-1;WizrdMCF;ColumnsMappingEngineOutputPortWizard;';
const html=`<!doctype html><style>
body{margin:0;font:10px sans-serif} #wizard{position:absolute;left:30px;top:100px;width:850px;height:650px}
#grid{position:absolute;left:70px;top:100px;width:600px;height:400px;overflow:auto}
.x-grid-item-container{width:500px}.x-grid-item{border-spacing:0;table-layout:fixed;width:500px;height:21.6px}
td{padding:0;width:100px;height:21.6px}.icon{display:inline-block;width:10px;height:10px}
</style><button data-tid="MF;cntMain;tlbMainToolbar;btnAvatar">user</button>
<div class="x-tab-active" data-tid="MF;cntMain;cntWorkspace;Workspace;t.br;tb-1">Scenario</div>
<div id="wizard" data-tid="MF;TF-1;WizrdMCF">
<button data-tid="${base}btnAddMappingColumn">Add</button>
<div data-tid="${base}TargetFilter"><input></div>
<div data-tid="${base}rbTable" class="x-form-cb-checked">Table</div>
<div data-tid="${base}rbLinks">Links</div>
<div id="grid" data-tid="${base}grdTargetColumns;tbl"><div class="x-grid-item-container">
${Array.from({length:6},(_,i)=>`<table class="x-grid-item" data-recordindex="${i}" data-boundview="grid"><tbody><tr>
${['colName_','colDisplayName_','colSourceDisplayName_','colDataKind_','colDefaultUsageType_'].map((key,j)=>`<td data-tid="${base+key}Field${i}">${j===1||j===2?'<span class="icon bg-TBGDataType-dtInteger"></span>':''}${j===3?'Непрерывный':j===4?'Не задано':'Field'+i}</td>`).join('')}
</tr></tbody></table>`).join('')}
</div></div></div><script>window.bg={app:{Version:'7.4.2'}};</script>`;

for(const scale of [1,1.25,1.5,1.75,2])test(`real Chromium definitions at DPR ${scale} reject clipping and retain complete rows`,{
  skip:!process.env.LOGINOM_DOCK_TEST_BROWSER&&'Set LOGINOM_DOCK_TEST_BROWSER to pinned Chromium',timeout:30000,
},async()=>{
  const http=createServer((request,response)=>{response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end(html);});
  await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${http.address().port}`;
  let browser;
  try {
    browser=await chromium.launch({executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER,headless:true,chromiumSandbox:true,
      args:[`--force-device-scale-factor=${scale}`,'--window-size=1280,900']});
    const page=await browser.newPage({viewport:null});
    await page.goto(origin);
    const measured=await page.evaluate(()=>{
      const rows=[...document.querySelectorAll('table')].map(e=>e.getBoundingClientRect());
      return {dpr:devicePixelRatio,deltas:rows.slice(1).map((r,i)=>r.y-rows[i].y-rows[i].height)};
    });
    assert.equal(measured.dpr,scale);
    if(scale===1.25||scale===1.75)assert.ok(measured.deltas.some(d=>d!==0),'fixture must expose actual fractional layout noise');
    const observe=()=>runInNewContext(makeWorkspaceUiCode({mode:'observe',expected_origin:origin,expected_build:'7.4.2',output_column_page:{offset:0,limit:8}}))(page);
    const result=await observe();
    assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
    assert.equal(result.output.wizard.output_columns.definition_coverage.status,'complete_configured_rows',JSON.stringify(result.output.geometry));
    assert.equal(result.output.wizard.output_columns.page.status,'complete_definition_page');
    assert.equal(result.output.geometry.device_pixel_ratio,scale);
    await page.locator('table').first().evaluate(e=>{e.style.width='500.5px';});
    const clipped=await observe();
    assert.equal(clipped.output.wizard.output_columns.definition_coverage.status,'partial');
    assert.equal(clipped.output.wizard.output_columns.page.status,'unverified_definition_page');
  } finally {
    await browser?.close();
    await new Promise(resolve=>http.close(resolve));
  }
});
