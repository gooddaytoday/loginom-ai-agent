import {DOMParser} from '@xmldom/xmldom';
import {Uint8ArrayReader, Uint8ArrayWriter, ZipReader} from '@zip.js/zip.js';

const maxBytes = 2 * 1024 * 1024;
const guid = value => {
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)) throw Error('Missing package GUID');
  return value.toLowerCase();
};

export function readSaveGraph() {
  const app = globalThis.bg?.app;
  const diagram = app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab()?.Controller?.FController?.FDiagram;
  const nodes = diagram?.FNodes?.FCollection, links = diagram?.FLinks?.FCollection;
  if (!Array.isArray(nodes) || nodes.length > 200 || !Array.isArray(links) || links.length > 500)
    throw Error('Bounded pre-save diagram unavailable');
  if (nodes.some(node => node.FLabel?.parent !== node || typeof node.FLabel.FRawValue !== 'string'))
    throw Error('Pre-save node labels are not bound to their GUIDs');
  const owned = new Set(nodes);
  return {
    nodes: nodes.map(node => ({id: node.FGuid, label: node.FLabel.FRawValue,
      sorting: node.FIconCls === 'bg-vendor-icon-sorting'})),
    links: links.filter(link => owned.has(link.FSourcePort?.parent) && owned.has(link.FTargetPort?.parent))
      .map(link => [link.FSourcePort.parent.FGuid, link.FSourcePort.FGuid, link.FTargetPort.parent.FGuid, link.FTargetPort.FGuid]),
  };
}

async function inSavedFileTab(page, options) {
  const owner = await page.evaluateHandle(options => {
    const app = globalThis.bg?.app, prep = globalThis.__loginomDockPreparationV1;
    const form = app?.Application?.FInstance?.FMainForm, workspace = form?.Items?.Workspace;
    const card = workspace?.getActiveTab(), connection = form?.FMapTree?.FServerConnection;
    let pack = card?.Controller?.Node?.data?.node;
    for (let depth = 0; pack && !(pack instanceof app.PackageTreeNode) && depth < 32; depth++) pack = pack.ParentNode;
    const verify = () => {
      if (location.origin !== options.origin || app?.Version !== options.build || app.Version !== '7.4.2'
        || globalThis.__loginomDockPreparationV1 !== prep || prep?.document !== document || prep.id !== options.documentId
        || ![...prep.receipts.values()].some(receipt => receipt.phase === 'verified' && receipt.packageNode === pack
          && JSON.parse(receipt.request).session === options.sessionId)
        || form.FReconnecting === true || form.FMapTree.FServerConnection !== connection
        || connection?.Connected !== true || connection.UserName !== options.account || connection.Session !== session
        || !(pack instanceof app.PackageTreeNode) || pack.HasRunningNodes() !== false
        || '/' + pack.PackageFileName.replaceAll('\\', '/').replace(/^\/+/, '') !== options.path
        || !Array.from({length: form.FMapTree.PackageNodes.Count}, (_, index) => form.FMapTree.PackageNodes.Items(index)).includes(pack))
        throw Error('Saved package owner changed');
    };
    const session = connection?.Session;
    verify();
    return {verify, workspace, card, path: options.path, limit: options.limit};
  }, options);
  const tab = page.locator('[data-tid='+JSON.stringify(options.tabTid)+']');
  let files, entered = false;
  try {
    if (await tab.count() !== 1 || !await tab.evaluate(element => element.classList.contains('x-tab-active')))
      throw Error('Save workflow tab is not active');
    await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnFilestorage"]').click({timeout: 1500});
    entered = true;
    files = await page.waitForFunction(owner => {
      owner.verify();
      const card = owner.workspace.getActiveTab(), controller = card?.Controller?.FController;
      return controller?.constructor?.name === 'FileStorageForm' && controller.FFileStorage ? card : null;
    }, owner, {timeout: 2500});
    return await page.evaluate(async ({owner, files}) => {
      const verify = () => {
        owner.verify();
        if (owner.workspace.getActiveTab() !== files) throw Error('Saved package Files tab changed');
      };
      verify();
      const name = owner.path.split('/').at(-1), dir = owner.path.slice(0, -name.length);
      if (bg.TBGFileOpenMode.fomRead !== 0) throw Error('Native read-only mode changed');
      const storage = files.Controller.FController.FFileStorage;
      const info = await storage.GetFileInfo(owner.path);
      if (info === null || info === undefined) {
        const directoryExists = await storage.DirectoryExists(dir.slice(0, -1));
        verify();
        if (directoryExists !== true) throw Error('Saved package directory unavailable');
        return {fileExists:false};
      }
      await ReleaseObject(info, true);
      verify();
      const downloader = new bg.filestorage.FileDownloader(name, dir, storage);
      try {
        if (downloader.FullFilename !== owner.path) throw Error('Native saved path differs');
        const size = await downloader.GetFileSize();
        if (!Number.isSafeInteger(size) || size < 1 || size > owner.limit) return {fileExists:true};
        verify();
        const stream = await downloader.GetFileStream();
        if (downloader.FShareDenyNone) throw Error('Saved package does not have an exclusive read');
        const bytes = new Uint8Array(size);
        for (let offset = 0; offset < size; offset += 16384) {
          verify();
          const chunk = new Uint8Array(Math.min(16384, size-offset));
          await stream.ReadBuffer(chunk);
          bytes.set(chunk, offset);
        }
        verify();
        return {fileExists:true, base64:bytes.toBase64()};
      } catch {
        verify();
        return {fileExists:true};
      } finally {
        await downloader.Dispose();
        if (!downloader.IsStreamReleased() || !downloader.IsDisposed) throw Error('Saved package stream did not close');
      }
    }, {owner, files});
  } finally {
    try {
      if (entered && await owner.evaluate((owner, files) => files
        ? owner.workspace.getActiveTab() === files
        : owner.workspace.getActiveTab()?.Controller?.FController?.constructor?.name === 'FileStorageForm', files)) {
        await tab.click({timeout: 1500});
        await page.waitForFunction(owner => owner.workspace.getActiveTab() === owner.card, owner, {timeout: 1500});
      }
    } finally {
      await files?.dispose();
      await owner.dispose();
    }
  }
}

export function makeSavedPackageGraphCode(options) {
  return `async page=>(${inSavedFileTab.toString()})(page,${JSON.stringify({...options, limit:maxBytes})})`;
}

function parseSavedPackageRead(response) {
  if (!response?.isError) for (const block of response?.content ?? []) {
    if (block.type !== 'text') continue;
    const text = block.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1] ?? block.text;
    if (text.length > Math.ceil(maxBytes / 3) * 4 + 64) continue;
    try {
      const {base64, fileExists} = JSON.parse(text);
      if (fileExists === false && base64 === undefined) return {fileExists};
      if (typeof base64 !== 'string') {
        if (fileExists === true) return {fileExists};
        continue;
      }
      const bytes = Buffer.from(base64, 'base64');
      if (fileExists !== false && bytes.length && bytes.length <= maxBytes && bytes.toString('base64') === base64)
        return {fileExists:true, bytes};
    } catch {}
  }
  return {fileExists:null};
}

const child = (parent, name) => Array.from(parent?.childNodes ?? []).find(element => element.nodeType === 1 && element.localName === name);
const items = parent => Array.from(parent?.childNodes ?? []).filter(element => element.nodeType === 1 && element.localName === 'Item');
const type = element => element?.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type');
const names = columns => items(columns).map(column => column.getAttribute('Name'));

async function savedGraphs(bytes) {
  if (bytes.length > maxBytes) throw Error('Saved package size outside bound');
  const archive = new ZipReader(new Uint8ArrayReader(new Uint8Array(bytes)), {useWebWorkers:false});
  try {
    const entries = await archive.getEntries();
    const units = entries.filter(entry => /^Unit_\d+[\\/]Unit\.xml$/.test(entry.filename));
    if (!units.length || new Set(units.map(unit => unit.filename.replaceAll('\\', '/'))).size !== units.length
      || units.reduce((size, unit) => size + unit.uncompressedSize, 0) > 8 * maxBytes)
      throw Error('Saved package XML inventory outside bound');
    const graphs = [];
    const walk = (workflow, depth=0) => {
      if (!workflow || depth > 32) throw Error('Invalid package workflow');
      const graph = {nodes:items(child(workflow, 'Nodes')),
        links:[...items(child(workflow, 'Links')), ...items(child(workflow, 'ServiceLinks'))]};
      graphs.push(graph);
      for (const node of graph.nodes) {
        const unit = child(child(child(node, 'Component'), 'Engine'), 'ModelUnit');
        if (unit) walk(child(unit, 'WorkFlow'), depth+1);
      }
    };
    for (const unit of units) {
      const xml = new TextDecoder('utf-8', {fatal:true}).decode(await unit.getData(new Uint8ArrayWriter(), {checkSignature:true}));
      const fail = () => { throw Error('Invalid saved package XML'); };
      if (/<!DOCTYPE/i.test(xml)) fail();
      const doc = new DOMParser({errorHandler:{warning:fail, error:fail, fatalError:fail}}).parseFromString(xml, 'application/xml');
      walk(child(doc.documentElement, 'WorkFlow'));
    }
    return graphs;
  } finally { await archive.close(); }
}

export function uncheckedSaveFacts(path) {
  return {path, fileExists:null, fileRead:false, nodeCount:null, workflowGuidMatch:null, runVerified:null, rowCount:null};
}

export async function readSavedPackageFacts({path, response, before}) {
  const {bytes, fileExists} = parseSavedPackageRead(response);
  const facts = {...uncheckedSaveFacts(path), fileExists};
  if (!bytes) return {save:facts};
  let graphs;
  try { graphs = await savedGraphs(bytes); } catch { return {save:facts}; }
  facts.fileRead = true;
  facts.nodeCount = graphs.reduce((count, graph) => count + graph.nodes.length, 0);
  if (!before) return {save:facts, graphs};
  try {
    const expected = new Set(before.nodes.map(node => guid(node.id)));
    const inventories = graphs.map(graph => new Set(graph.nodes.map(node => guid(node.getAttribute('Guid')))));
    if (expected.size === before.nodes.length && inventories.every((ids, index) => ids.size === graphs[index].nodes.length)) {
      const matches = inventories.length === 1 ? inventories : inventories.filter(ids => [...expected].some(id => ids.has(id)));
      if (matches.length === 1) {
        const [actual] = matches;
        facts.workflowGuidMatch = expected.size === actual.size && [...expected].every(id => actual.has(id));
      }
    }
  } catch {}
  return {save:facts, graphs};
}

export function compareSavedPackageWorkflows({graphs, before, sorting = new Map(), intendedLabels = new Map()}) {
  const expected = new Map(before.nodes.map(node => [guid(node.id), node]));
  if (!expected.size || expected.size !== before.nodes.length) throw Error('Pre-save node identity unavailable');
  const matching = graphs.filter(({nodes}) => nodes.some(node => expected.has(guid(node.getAttribute('Guid')))));
  if (matching.length !== 1) throw Error('Saved workflow identity unavailable');
  const {nodes, links} = matching[0];
  const observed = new Map(nodes.map(node => [guid(node.getAttribute('Guid')), node]));
  if (observed.size !== nodes.length) throw Error('Duplicate saved node GUID');
  const changes = [], uncheckedSorting = [];
  const savedLabels = [];
  for (const [id, previous] of expected) {
    const node = observed.get(id);
    if (!node) { changes.push({kind:'node_missing', node_id:id, before:previous.label}); continue; }
    const label = node.getAttribute('DisplayName') || node.getAttribute('Name');
    if (!label) throw Error('Saved node name unavailable');
    savedLabels.push({node_id:id, label});
    const previousLabel = intendedLabels.get(id) ?? previous.label;
    if (label !== previousLabel || label !== previous.label) {
      const baseline = label !== previousLabel ? previousLabel : previous.label;
      changes.push({kind:'node_renamed', node_id:id, before:baseline, saved:label, observed_before_save:previous.label,
        repair:{label:'Попросить исправить', prompt:`Проверьте, можно ли восстановить имя ${JSON.stringify(baseline)} у узла ${id}, сейчас сохранённого как ${JSON.stringify(label)}.`}});
    }
    if (!previous.sorting) continue;
    const intended = sorting.get(id);
    const component = child(node, 'Component'), engine = child(component, 'Engine');
    const keys = child(engine, 'SortingColumns');
    const sheet = section => child(child(items(child(component, section)).find(socket => socket.getAttribute('Name') === 'DataSource'), 'Socket'), 'DataSource');
    const output = sheet('OutputSockets'), input = sheet('InputSockets');
    const columns = child(output, 'ColumnDefs');
    const savedOutput = columns && names(columns);
    const fields = savedOutput?.length === 0 && output.getAttribute('SyncThroughColumns') === 'true'
      ? child(input, 'ColumnDefs') && names(child(input, 'ColumnDefs')) : savedOutput;
    if (!intended || type(engine) !== 'TBGSortingEngine' || !keys || !fields) { uncheckedSorting.push(id); continue; }
    for (const [kind, prior, saved] of [['sorting_key_order', intended.keys, names(keys)], ['sorting_field_order', intended.fields, fields]]) {
      if (JSON.stringify(prior) !== JSON.stringify(saved)) changes.push({kind, node_id:id, label, before:prior, saved});
    }
  }
  const edge = values => values.map(guid).join('/');
  const oldLinks = new Set(before.links.map(edge));
  const savedLinks = new Set(links.map(link => ['SourcePort','TargetPort'].flatMap(endpoint => {
    const port = child(link, endpoint);
    return [port?.getAttribute('NodeGuid'), port?.getAttribute('PortGuid')];
  })).filter(([source,,target]) => observed.has(source?.toLowerCase()) && observed.has(target?.toLowerCase())).map(edge));
  for (const [kind, left, right] of [['link_removed', oldLinks, savedLinks], ['link_added', savedLinks, oldLinks]])
    for (const link of left) if (!right.has(link)) changes.push({kind, endpoints:link.split('/')});
  return {scope:'active_workflow', saved_labels:savedLabels, changes, unchecked_sorting:uncheckedSorting};
}

export function savedGraphMessage(report) {
  if (report.status === 'unavailable') return 'Пакет сохранён, но его сохранённую структуру не удалось сверить. Не повторяйте сохранение только ради сверки.';
  const label = value => value.replace(/\s+/g, ' ').slice(0, 100);
  const renames = report.changes.filter(change => change.kind === 'node_renamed');
  const order = report.changes.some(change => change.kind.startsWith('sorting_'));
  const links = report.changes.some(change => change.kind.startsWith('link_'));
  return [...renames.slice(0, 3).map(rename => (report.rename_attribution === 'observed_during_save' && rename.before === rename.observed_before_save
      ? 'Loginom переименовал узел' : 'В сохранённом пакете имя узла отличается')
      + ` «${label(rename.before)}» → «${label(rename.saved)}».`),
    renames.length > 3 && `Другие переименования: ${renames.length - 3}.`,
    order && 'В сохранённом пакете изменился порядок полей «Сортировки».',
    links && 'В сохранённом пакете изменились связи.',
    !renames.length && !order && !links && (report.changes.length ? 'Сохранённый граф отличается.' : 'В проверенной части сохранённого графа расхождений нет.'),
    report.changes.length > 0 && 'Дальше используйте имена из сохранённого пакета; не исправляйте автоматически.',
    report.unchecked_sorting.length > 0 && 'Порядок полей проверен не для всех узлов «Сортировки».',
  ].filter(Boolean).join(' ');
}
