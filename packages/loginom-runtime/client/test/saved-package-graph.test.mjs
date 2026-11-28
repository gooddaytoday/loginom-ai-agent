import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {TextReader, Uint8ArrayWriter, ZipWriter} from '@zip.js/zip.js';
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


test('reads a saved package for a step in another module and restores the active module tab', async () => {
  const bytes = await readFile(new URL('../../../loginom-host/test/fixtures/package-docs/deep.lgp', import.meta.url));
  const origin = 'https://loginom.test', tabTid = 'module-b-tab', document = {};
  const path = '/analyst/Package.lgp';
  let downloads = 0, modified = false, editWhileReading = false;
  class PackageTreeNode {
    PackageFileName = path;
    Package = {};
    HasRunningNodes() { return false; }
  }
  class FileStorageForm { FFileStorage = {}; }
  class BrowserBytes extends Uint8Array { toBase64() { return Buffer.from(this).toString('base64'); } }
  class FileDownloader {
    FullFilename = path;
    async GetFileSize() { downloads++; return bytes.length; }
    async GetFileStream() {
      let offset = 0;
      return { async ReadBuffer(buffer) {
        buffer.set(bytes.subarray(offset, offset += buffer.length));
        if (editWhileReading) modified = true;
      } };
    }
    async Dispose() { this.IsDisposed = true; }
    IsStreamReleased() { return this.IsDisposed; }
  }
  const pack = new PackageTreeNode();
  const moduleB = { Controller: { Node: { data: { node: { ParentNode: pack } } } } };
  const files = { Controller: { FController: new FileStorageForm() } };
  let active = moduleB;
  const tab = { getAttribute: () => tabTid, classList: { contains: () => active === moduleB } };
  const nativeSession = { IsPackageModified: async () => modified };
  const connection = { Connected: true, UserName: 'analyst', Session: nativeSession };
  const form = { Items: { Workspace: { getActiveTab: () => active } }, FMapTree: {
    FServerConnection: connection, PackageNodes: { Count: 1, Items: () => pack },
  }};
  const owner = { packageNode: pack, request: JSON.stringify({session:'chat'}), tab };
  const departed = { ...owner, phase: 'superseded', workflowId: 'module-a',
    tab: { getAttribute: () => 'module-a-tab' }, openConnection: connection, openServerSession: nativeSession };
  const receipts = new Map([
    ['older', departed],
    ['current', { ...owner, phase: 'verified', workflowId: 'module-b', stepSession: { connection, nativeSession } }],
  ]);
  const globals = { Uint8Array: BrowserBytes, document, location: {origin}, __loginomDockPreparationV1: { document, id: 'doc', receipts },
    bg: { app: { Version:'7.4.2', PackageTreeNode, Application:{FInstance:{FMainForm:form}} },
      TBGFileOpenMode: {fomRead:0}, filestorage: {FileDownloader} },
  };
  const evaluate = (fn, ...args) => runInNewContext(`(${fn})(...args)`, {...globals, args, setTimeout, clearTimeout});
  const handle = value => ({ value, evaluate: (fn, other) => evaluate(fn, value, other?.value), async dispose() {} });
  const page = {
    evaluateHandle: (fn, input) => handle(evaluate(fn, input)),
    locator: selector => ({
      count: async () => Number(selector.includes('data-tid')),
      evaluate: (fn, owner) => evaluate(fn, tab, owner.value),
      click: async () => { active = selector.includes('btnFilestorage') ? files : moduleB; },
    }),
    waitForFunction: (fn, owner) => handle(evaluate(fn, owner.value)),
    evaluate: (fn, {owner, files, target}) => evaluate(fn, {owner:owner.value, files:files.value,target}),
  };
  const read = runInNewContext(makeSavedPackageGraphCode({ origin, build:'7.4.2', documentId:'doc',
    sessionId:'chat', account:'analyst', path, tabTid, target:{preparationId:'current', workflowId:'module-a'} }));
  modified = true;
  assert.equal((await read(page)).saveRequired, true);
  assert.equal(downloads, 0);
  assert.equal(active, moduleB);

  modified = false;
  const result = await read(page);
  assert.equal(result.base64, bytes.toString('base64'));
  assert.equal(active, moduleB);
  editWhileReading = true;
  const changed = await read(page);
  assert.equal(changed.saveRequired, true);
  assert.equal(changed.base64, undefined);
  assert.throws(() => parseSavedPackageBytes({ content: [{ type: 'text', text: JSON.stringify(changed) }] }), {
    code: 'PACKAGE_SCHEMA_SAVE_REQUIRED',
  });
  assert.equal(active, moduleB);

  receipts.get('current').tab = departed.tab;
  await assert.rejects(read(page), /Saved package owner changed/);
  receipts.get('current').tab = tab;

  departed.openServerSession = {};
  await assert.rejects(read(page), /Saved package owner changed/);
  departed.openServerSession = nativeSession;

  departed.packageNode = new PackageTreeNode();
  await assert.rejects(read(page), /Saved package owner changed/);
  assert.equal(downloads, 2);
});
