import assert from 'node:assert/strict';
import test from 'node:test';
import {TextReader, Uint8ArrayWriter, ZipWriter} from '@zip.js/zip.js';
import {compareSavedPackageWorkflows, readSavedPackageFacts, savedGraphMessage} from '../lib/saved-package-graph.mjs';

const join = '4527f5b0-c77f-4fcc-91be-fccae0406581';
const sortingNode = '4abeb776-ab7c-48ba-ba43-0858d760c9e1';
const output = '4ba0e2c2-69ad-3a32-bbdc-75714efe7a51';
const input = '9dc72a3f-56bf-3bfc-84ec-f979daf4da6b';
const before = {
  nodes:[{id:join.toUpperCase(), label:'Слияние'}, {id:sortingNode, label:'Сортировка', sorting:true}],
  links:[[join, output, sortingNode, input]],
};
const sorting = new Map([[sortingNode, {keys:['Region', 'Revenue'], fields:['Region', 'Revenue'] }]]);
const path = '/common/fixture.lgp';
const response = value => ({content:[{type:'text', text:`### Result\n${JSON.stringify(value)}\n### Ran Playwright code`}]});

async function fixture({label='Слияние', fixedOrder=true, linked=true, sourceNode=join}={}) {
  const columns = order => order.map(name => `<Item Name="${name}"/>`).join('');
  const archive = new ZipWriter(new Uint8ArrayWriter(), {useWebWorkers:false});
  await archive.add('Unit_0/Unit.xml', new TextReader(`<Unit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><WorkFlow>
    <Nodes><Item Guid="${sourceNode}" DisplayName="${label}"/><Item Guid="${sortingNode}" DisplayName="Сортировка">
      <Component><InputSockets><Item Name="DataSource"><Socket><DataSource><ColumnDefs>${columns(['Revenue', 'Region'])}</ColumnDefs></DataSource></Socket></Item></InputSockets>
      <OutputSockets><Item Name="DataSource"><Socket><DataSource SyncThroughColumns="${!fixedOrder}"><ColumnDefs>${fixedOrder ? columns(['Region', 'Revenue']) : ''}</ColumnDefs></DataSource></Socket></Item></OutputSockets>
      <Engine xsi:type="TBGSortingEngine"><SortingColumns>${columns(['Region', 'Revenue'])}</SortingColumns></Engine></Component>
    </Item></Nodes><Links>${linked ? `<Item><SourcePort NodeGuid="${join}" PortGuid="${output}"/><TargetPort NodeGuid="${sortingNode}" PortGuid="${input}"/></Item>` : ''}</Links>
    </WorkFlow></Unit>`));
  const base64 = Buffer.from(await archive.close()).toString('base64');
  return response({fileExists:true,base64});
}

async function compare({graph=before, intendedLabels, ...options}={}) {
  const {graphs} = await readSavedPackageFacts({path, response:await fixture(options), before:graph});
  return {status:'compared', rename_attribution:'observed_during_save', ...compareSavedPackageWorkflows({graphs,before:graph,sorting,intendedLabels})};
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
  const {save} = await readSavedPackageFacts({path, before, response:response({fileExists:true,base64:Buffer.from('not a package').toString('base64')})});
  assert.deepEqual(save, {path,fileExists:true,fileRead:false,nodeCount:null,workflowGuidMatch:null,runVerified:null,rowCount:null});
  assert.match(savedGraphMessage({status:'unavailable'}), /Пакет сохранён, но/);
});

test('saved node count and GUID composition are independent checks', async () => {
  const {save} = await readSavedPackageFacts({path, before, response:await fixture()});
  assert.deepEqual(save, {path,fileExists:true,fileRead:true,nodeCount:2,workflowGuidMatch:true,runVerified:null,rowCount:null});
  const changed = await readSavedPackageFacts({path, before, response:await fixture({sourceNode:input})});
  assert.deepEqual(changed.save, {...save,workflowGuidMatch:false});
  const noExpectedGraph = await readSavedPackageFacts({path, response:await fixture()});
  assert.deepEqual(noExpectedGraph.save, {...save,workflowGuidMatch:null});
});

test('only an explicit file lookup miss establishes absence', async () => {
  const missing = await readSavedPackageFacts({path, before, response:response({fileExists:false})});
  const failed = await readSavedPackageFacts({path, before, response:{isError:true}});
  assert.deepEqual(missing.save, {path,fileExists:false,fileRead:false,nodeCount:null,workflowGuidMatch:null,runVerified:null,rowCount:null});
  assert.deepEqual(failed.save, {...missing.save,fileExists:null});
});
