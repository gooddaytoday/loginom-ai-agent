import assert from 'node:assert/strict';
import test from 'node:test';
import {TextReader, Uint8ArrayWriter, ZipWriter} from '@zip.js/zip.js';
import {chromium} from 'playwright';
import {compareSavedPackageGraph, makeSavedPackageGraphCode, parseSavedPackageBytes, savedGraphMessage} from '../lib/saved-package-graph.mjs';

const join = '4527f5b0-c77f-4fcc-91be-fccae0406581';
const sortingNode = '4abeb776-ab7c-48ba-ba43-0858d760c9e1';
const output = '4ba0e2c2-69ad-3a32-bbdc-75714efe7a51';
const input = '9dc72a3f-56bf-3bfc-84ec-f979daf4da6b';
const before = {
  nodes:[{id:join.toUpperCase(), label:'Слияние'}, {id:sortingNode, label:'Сортировка', sorting:true}],
  links:[[join, output, sortingNode, input]],
};
const sorting = new Map([[sortingNode, {keys:['Region', 'Revenue'], fields:['Region', 'Revenue'] }]]);

async function compare({label='Слияние', fixedOrder=true, linked=true, graph=before, intendedLabels}={}) {
  const columns = order => order.map(name => `<Item Name="${name}"/>`).join('');
  const archive = new ZipWriter(new Uint8ArrayWriter(), {useWebWorkers:false});
  await archive.add('Unit_0/Unit.xml', new TextReader(`<Unit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><WorkFlow>
    <Nodes><Item Guid="${join}" DisplayName="${label}"/><Item Guid="${sortingNode}" DisplayName="Сортировка">
      <Component><InputSockets><Item Name="DataSource"><Socket><DataSource><ColumnDefs>${columns(['Revenue', 'Region'])}</ColumnDefs></DataSource></Socket></Item></InputSockets>
      <OutputSockets><Item Name="DataSource"><Socket><DataSource SyncThroughColumns="${!fixedOrder}"><ColumnDefs>${fixedOrder ? columns(['Region', 'Revenue']) : ''}</ColumnDefs></DataSource></Socket></Item></OutputSockets>
      <Engine xsi:type="TBGSortingEngine"><SortingColumns>${columns(['Region', 'Revenue'])}</SortingColumns></Engine></Component>
    </Item></Nodes><Links>${linked ? `<Item><SourcePort NodeGuid="${join}" PortGuid="${output}"/><TargetPort NodeGuid="${sortingNode}" PortGuid="${input}"/></Item>` : ''}</Links>
    </WorkFlow></Unit>`));
  const base64 = Buffer.from(await archive.close()).toString('base64');
  const bytes = parseSavedPackageBytes({content:[{type:'text', text:`### Result\n${JSON.stringify({base64})}\n### Ran Playwright code`}]});
  return {status:'compared', rename_attribution:'observed_during_save', ...await compareSavedPackageGraph({bytes,before:graph,sorting,intendedLabels})};
}

test('a saved rename follows the node GUID and offers a request, not a mutation', async () => {
  const report = await compare({label:'Левое'});
  assert.deepEqual(report.saved_labels.find(node => node.node_id === join), {node_id:join, label:'Левое'});
  assert.equal(report.changes.length, 1);
  const [change] = report.changes;
  assert.equal(change.kind, 'node_renamed');
  assert.equal(change.repair.label, 'Попросить исправить');
  assert.match(change.repair.prompt, new RegExp(join));
  assert.match(savedGraphMessage(report), /Loginom переименовал узел «Слияние» → «Левое»/);
});

test('an earlier rename differs from agent intent without attributing it to Save', async () => {
  const graph = {...before, nodes:[{...before.nodes[0], label:'Левое'}, before.nodes[1]]};
  const report = await compare({graph,label:'Левое',intendedLabels:new Map([[join,'Слияние']])});
  assert.equal(report.changes[0].before, 'Слияние');
  assert.equal(report.changes[0].saved, 'Левое');
  assert.doesNotMatch(savedGraphMessage(report), /Loginom переименовал/);
});

test('saved autosync falls back to input order, exposing a lost custom output order', async () => {
  const report = await compare({fixedOrder:false});
  assert.deepEqual(report.changes, [{kind:'sorting_field_order', node_id:sortingNode, label:'Сортировка',
    before:['Region','Revenue'], saved:['Revenue','Region']}]);
  assert.match(savedGraphMessage(report), /изменился порядок полей/);
});

test('missing links are identified by both node and port GUIDs', async () => {
  assert.deepEqual((await compare({linked:false})).changes, [{kind:'link_removed', endpoints:[join,output,sortingNode,input]}]);
});

test('the same labels, links and field order produce no discrepancy', async () => {
  const report = await compare();
  assert.deepEqual(report.changes, []);
  assert.deepEqual(report.unchecked_sorting, []);
  assert.match(savedGraphMessage(report), /расхождений нет/);
});

test('an unverified archive cannot be reported as an unchanged graph', async () => {
  await assert.rejects(compareSavedPackageGraph({bytes:Buffer.from('not a package'),before}));
  assert.match(savedGraphMessage({status:'unavailable'}), /Пакет сохранён, но/);
});

test('saved-file read closes only its own Files tab, even if read or workflow return fails', async () => {
  const origin='https://loginom.invalid', path='/account/saved.lgp', tabTid='fixture-workflow';
  const browser=await chromium.launch({chromiumSandbox:true, executablePath:process.env.LOGINOM_DOCK_TEST_BROWSER, args:['--no-proxy-server']});
  try {
    const page=await browser.newPage();
    await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:
      '<div data-tid="fixture-workflow" class="x-tab-active">Workflow</div><button data-tid="MF;cntMain;tlbMainToolbar;btnFilestorage">Files</button>'}));
    const execute=Function('return '+makeSavedPackageGraphCode({origin,path,tabTid,build:'7.4.2',documentId:'doc',sessionId:'session',account:'account'}))();
    for (const scenario of ['success','read failed','return failed','existing']) {
      await page.goto(origin);
      await page.evaluate(({scenario,path,tabTid})=>{
        const workflow=document.querySelector('[data-tid="'+tabTid+'"]');
        class PackageTreeNode { PackageFileName=path; HasRunningNodes(){return false;} }
        class FileStorageForm { FFileStorage={}; }
        const pack=new PackageTreeNode(), card={Controller:{Node:{data:{node:pack}}},tab:{el:{dom:workflow}}};
        const filesTab=document.createElement('div');
        filesTab.dataset.tid='fixture-files';
        filesTab.innerHTML='Files <button data-ref="closeEl">Close</button>';
        const files={Controller:{FController:new FileStorageForm()},tab:{el:{dom:filesTab}}};
        let active=card, disposed=0;
        const cards=[card];
        const mount=()=>{if(!cards.includes(files)){cards.push(files);document.body.append(filesTab);}};
        if(scenario==='existing')mount();
        filesTab.querySelector('button').onclick=()=>{cards.splice(cards.indexOf(files),1);filesTab.remove();active=card;};
        workflow.onclick=()=>{if(scenario!=='return failed')active=card;};
        document.querySelector('[data-tid$="btnFilestorage"]').onclick=()=>{mount();active=files;};
        class FileDownloader {
          constructor(name,dir){this.FullFilename=dir+name;}
          GetFileSize(){return 1;}
          GetFileStream(){return {ReadBuffer(chunk){if(scenario==='read failed')throw Error('Read refused');chunk[0]=42;}};}
          Dispose(){disposed++;this.IsDisposed=true;}
          IsStreamReleased(){return this.IsDisposed;}
        }
        const FMapTree={FServerConnection:{Connected:true,UserName:'account',Session:{}},PackageNodes:{Count:1,Items:()=>pack}};
        const Workspace={getActiveTab:()=>active,items:{items:cards}};
        globalThis.bg={app:{Version:'7.4.2',PackageTreeNode,Application:{FInstance:{FMainForm:{Items:{Workspace},FMapTree}}}},
          TBGFileOpenMode:{fomRead:0},filestorage:{FileDownloader}};
        globalThis.__loginomDockPreparationV1={document,id:'doc',receipts:new Map([['save',
          {phase:'verified',packageNode:pack,request:'{"session":"session"}'}]])};
        globalThis.observedTabs=()=>({active:active===card?'workflow':'files', files:cards.includes(files), disposed});
      },{scenario,path,tabTid});
      if (scenario.endsWith('failed')) await assert.rejects(execute(page), /Read refused|Timeout/);
      else assert.deepEqual(await execute(page), {base64:'Kg=='});
      assert.deepEqual(await page.evaluate(()=>globalThis.observedTabs()),{active:'workflow',files:scenario==='existing',disposed:1},scenario);
    }
  } finally { await browser.close(); }
});
