import {DOMParser} from '@xmldom/xmldom';
import {Uint8ArrayReader, Uint8ArrayWriter, ZipReader} from '@zip.js/zip.js';

const maxBytes = 2 * 1024 * 1024;
const guid = value => {
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)) throw Error('Missing package GUID');
  return value.toLowerCase();
};

export async function readSaveGraph(budgetMs) {
  const bg = globalThis.bg, app = bg?.app;
  const activeDiagram = () => app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab()?.Controller?.FController?.FDiagram;
  const diagram = activeDiagram();
  const nodes = diagram?.FNodes?.FCollection, links = diagram?.FLinks?.FCollection;
  if (!Array.isArray(nodes) || nodes.length > 200 || !Array.isArray(links) || links.length > 500)
    throw Error('Bounded pre-save diagram unavailable');
  if (nodes.some(node => node.FLabel?.parent !== node || typeof node.FLabel.FRawValue !== 'string'))
    throw Error('Pre-save node labels are not bound to their GUIDs');
  const owned = new Set(nodes);
  const graph = {
    nodes: nodes.map(node => ({id: node.FGuid, label: node.FLabel.FRawValue,
      sorting: node.FIconCls === 'bg-vendor-icon-sorting'})),
    links: links.filter(link => owned.has(link.FSourcePort?.parent) && owned.has(link.FTargetPort?.parent))
      .map(link => [link.FSourcePort.parent.FGuid, link.FSourcePort.FGuid, link.FTargetPort.parent.FGuid, link.FTargetPort.FGuid]),
  };
  const deadline = Date.now() + budgetMs;
  const sameGraph = () => activeDiagram() === diagram && diagram.FNodes.FCollection === nodes && diagram.FLinks.FCollection === links;
  const live = () => sameGraph() && Date.now() < deadline;
  const readNames = async (model, readCollection) => {
    const acquired = [];
    const own = async read => {
      if (!live()) throw Error('Sorting pre-save read expired');
      const proxy = await read();
      if (!proxy || typeof proxy.dispose !== 'function') throw Error('Sorting proxy unavailable');
      acquired.push(proxy);
      if (proxy.$S !== model.$S || !live()) throw Error('Sorting proxy owner changed');
      return proxy;
    };
    try {
      const collection = await readCollection(own);
      const count = await collection.get_Count();
      if (!Number.isSafeInteger(count) || count < 0 || count > 128) return undefined;
      const names = [];
      for (let index = 0; index < count; index++) {
        const item = await own(() => collection.getItem(index));
        const name = await item.get_Name();
        if (typeof name !== 'string' || !name || name.length > 128 || !live()) return undefined;
        names.push(name);
      }
      if (new Set(names).size !== names.length) return undefined;
      return names;
    } catch { return undefined; }
    finally {
      let released = true;
      for (const proxy of acquired.reverse()) try { await proxy.dispose(); } catch { released = false; }
      if (!released) throw Error('Sorting proxy release unconfirmed');
    }
  };
  const readSorting = async () => {
    let bytes = 0;
    for (const [index, node] of nodes.entries()) {
      const snapshot = graph.nodes[index], model = node.data;
      if (!live()) break;
      if (!snapshot?.sorting || !model?.$S || !Array.isArray(node.FPorts) || node.FPorts.length > 16
        || node.FPorts.some(list => !Array.isArray(list.FCollection) || list.FCollection.length > 16)) continue;
      const ports = node.FPorts.flatMap(list => list.FCollection)
        .filter(port => port.parent === node && port.FType === 1 && port.FSubType === 1 && port.data?.$S === model.$S);
      const fields = ports.length === 1 ? await readNames(model, async own => {
        const socket = await own(() => ports[0].data.get_Socket());
        const output = await own(() => socket.get_Output());
        const source = await own(() => output.QueryInterface(bg.IBGCustomDerivedDataSource));
        const definitions = await own(() => source.get_ColumnDefs());
        if (await definitions.get_Count() !== 0 || await source.get_SyncThroughColumns() !== true) return definitions;
        const effective = await own(() => output.QueryInterface(bg.IBGDataSource));
        return own(() => effective.get_Columns());
      }).catch(() => undefined) : undefined;
      const keys = bg.IBGSortingEngine ? await readNames(model, async own => {
        const component = await own(() => model.get_Component());
        const engine = await own(() => component.get_Engine());
        const sorting = await own(() => engine.QueryInterface(bg.IBGSortingEngine));
        return own(() => sorting.get_SortingColumns());
      }).catch(() => undefined) : undefined;
      const order = {keys, fields};
      bytes += new TextEncoder().encode(JSON.stringify(order)).length;
      if (bytes > 16 * 1024) break;
      if (live() && nodes[index] === node && node.data === model && node.FGuid === snapshot.id && (keys || fields)) snapshot.sortingOrder = order;
    }
  };
  if (budgetMs > 0 && graph.nodes.some(node => node.sorting)) {
    let timer;
    try { await Promise.race([readSorting(), new Promise(resolve => { timer = setTimeout(resolve, budgetMs); })]); }
    finally { clearTimeout(timer); }
  }
  if (!sameGraph()) throw Error('Pre-save diagram changed');
  return graph;
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
    const previousRead = globalThis.__loginomDockSavedFileReadV1;
    if (previousRead && !previousRead.released) throw Error('Previous saved package stream release is unconfirmed');
    const release = {token:options.token, document, released:false};
    globalThis.__loginomDockSavedFileReadV1 = release;
    let cards;
    try {
      verify();
      cards = workspace.items?.items;
      if (!Array.isArray(cards) || cards.length > 32 || !cards.includes(card)) throw Error('Workspace tab inventory unavailable');
    } catch (error) {
      release.released = true;
      throw error;
    }
    const initial = new Set(cards);
    const isFiles = candidate => candidate?.Controller?.FController?.constructor?.name === 'FileStorageForm';
    const inventory = () => {
      const current = app.Application.FInstance.FMainForm.Items.Workspace;
      if (current !== workspace || prep.document !== document) throw Error('Workspace changed during saved package read');
      return current.items.items;
    };
    const openedFiles = () => {
      const added = inventory().filter(candidate => !initial.has(candidate) && isFiles(candidate));
      if (added.length > 1) throw Error('Ambiguous new Files tabs');
      return added[0];
    };
    return {verify, workspace, card, isFiles, inventory, openedFiles, path: options.path, limit: options.limit, release};
  }, options);
  const tab = page.locator('[data-tid='+JSON.stringify(options.tabTid)+']');
  let files, attempted = false, readerStarted = false;
  try {
    if (await tab.count() !== 1 || !await tab.evaluate((element, owner) =>
      owner.card.tab?.el?.dom === element && element.classList.contains('x-tab-active'), owner))
      throw Error('Save workflow tab is not active');
    attempted = true;
    await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnFilestorage"]').click({timeout: 1500});
    files = await page.waitForFunction(owner => {
      owner.verify();
      const card = owner.workspace.getActiveTab(), controller = card?.Controller?.FController;
      return controller?.constructor?.name === 'FileStorageForm' && controller.FFileStorage ? card : null;
    }, owner, {timeout: 2500});
    readerStarted = true;
    return await page.evaluate(async ({owner, files}) => {
      const verify = () => {
        owner.verify();
        if (owner.workspace.getActiveTab() !== files) throw Error('Saved package Files tab changed');
      };
      let downloader, readTimer, cleanupTimer, opening;
      const deadline = new Promise((_, reject) => {
        readTimer = setTimeout(() => reject(Error('Saved package read timed out')), 9000);
      });
      const dispose = async () => {
        const acquired = await opening;
        if (downloader) {
          if (acquired && await downloader.ReleaseStreamObj() === false) throw Error('Saved package stream release refused');
          const result = await downloader.Dispose();
          if (result === false || !downloader.IsDisposed || (acquired && !downloader.IsStreamReleased()))
            throw Error('Saved package stream did not close');
        }
        owner.release.released = true;
      };
      try {
        verify();
        const name = owner.path.split('/').at(-1), dir = owner.path.slice(0, -name.length);
        if (bg.TBGFileOpenMode.fomRead !== 0) throw Error('Native read-only mode changed');
        downloader = new bg.filestorage.FileDownloader(name, dir, files.Controller.FController.FFileStorage);
        if (downloader.FullFilename !== owner.path) throw Error('Native saved path differs');
        const size = await Promise.race([downloader.GetFileSize(), deadline]);
        if (!Number.isSafeInteger(size) || size < 1 || size > owner.limit) throw Error('Saved package size outside bound');
        verify();
        opening = Promise.resolve().then(() => downloader.GetFileStream());
        const stream = await Promise.race([opening, deadline]);
        if (downloader.FShareDenyNone) throw Error('Saved package does not have an exclusive read');
        const bytes = new Uint8Array(size);
        for (let offset = 0; offset < size; offset += 16384) {
          verify();
          const chunk = new Uint8Array(Math.min(16384, size-offset));
          await Promise.race([stream.ReadBuffer(chunk), deadline]);
          bytes.set(chunk, offset);
        }
        verify();
        return {base64:bytes.toBase64()};
      } finally {
        clearTimeout(readTimer);
        const cleanupDeadline = new Promise((_, reject) => {
          cleanupTimer = setTimeout(() => reject(Error('Saved package stream cleanup timed out')), 2500);
        });
        try { await Promise.race([dispose(), cleanupDeadline]); }
        finally { clearTimeout(cleanupTimer); }
      }
    }, {owner, files});
  } finally {
    try {
      if (!readerStarted) await owner.evaluate(owner => { owner.release.released = true; });
      if (attempted) {
        const opened = await owner.evaluateHandle((owner, files) => {
          if (files) return owner.openedFiles() === files ? files : null;
          return owner.openedFiles() ?? null;
        }, files);
        try {
          try {
            if (await owner.evaluate((owner, files) => {
              const active = owner.workspace.getActiveTab();
              return (files ? active === files : owner.isFiles(active)) && owner.inventory().includes(owner.card);
            }, files)) {
              const original = await owner.evaluateHandle(owner => owner.card.tab?.el?.dom);
              try {
                await original.asElement()?.click({timeout: 1500});
                await page.waitForFunction(owner => owner.workspace.getActiveTab() === owner.card, owner, {timeout: 1500});
              } finally { await original.dispose(); }
            }
          } finally {
            if (await opened.evaluate((card, owner) => card !== null && owner.inventory().includes(card), owner)) {
              const close = await opened.evaluateHandle((card, owner) => {
                const buttons = card === owner.openedFiles() && card.tab?.el?.dom?.querySelectorAll('[data-ref="closeEl"]');
                return buttons?.length === 1 ? buttons[0] : null;
              }, owner);
              try {
                const button = close.asElement();
                if (!button) throw Error('Owned Files close control unavailable');
                await button.click({timeout: 1500});
                await page.waitForFunction(({owner, opened}) => !owner.inventory().includes(opened), {owner, opened}, {timeout: 1500});
              } finally { await close.dispose(); }
            }
          }
        } finally { await opened.dispose(); }
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

export function makeSavedPackageReleaseCode(token) {
  return `async page=>page.evaluate(token=>{
    const read=globalThis.__loginomDockSavedFileReadV1;
    return {released:read?.token===token && read.document===document && read.released===true};
  },${JSON.stringify(token)})`;
}

export function savedPackageReleaseConfirmed(response) {
  return !response?.isError && response?.content?.some(block => block.type === 'text'
    && /^\{\s*"released"\s*:\s*true\s*\}$/.test(resultText(block).trim()));
}

const resultText = block => block.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1] ?? block.text;

export function parseSavedPackageBytes(response) {
  if (!response?.isError) for (const block of response?.content ?? []) {
    if (block.type !== 'text') continue;
    const text = resultText(block);
    if (text.length > Math.ceil(maxBytes / 3) * 4 + 64) continue;
    try {
      const {base64} = JSON.parse(text);
      if (typeof base64 !== 'string') continue;
      const bytes = Buffer.from(base64, 'base64');
      if (bytes.length && bytes.length <= maxBytes && bytes.toString('base64') === base64) return bytes;
    } catch {}
  }
  throw Error('Saved package read unavailable');
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

export async function compareSavedPackageGraph({bytes, before, intendedLabels = new Map()}) {
  const expected = new Map(before.nodes.map(node => [guid(node.id), node]));
  if (!expected.size || expected.size !== before.nodes.length) throw Error('Pre-save node identity unavailable');
  const graphs = await savedGraphs(bytes);
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
    const prior = previous.sortingOrder;
    const component = child(node, 'Component'), engine = child(component, 'Engine');
    const keys = child(engine, 'SortingColumns');
    const sheet = section => child(child(items(child(component, section)).find(socket => socket.getAttribute('Name') === 'DataSource'), 'Socket'), 'DataSource');
    const output = sheet('OutputSockets'), input = sheet('InputSockets');
    const columns = child(output, 'ColumnDefs');
    const savedOutput = columns && names(columns);
    const fields = savedOutput?.length === 0 && output.getAttribute('SyncThroughColumns') === 'true'
      ? child(input, 'ColumnDefs') && names(child(input, 'ColumnDefs')) : savedOutput;
    if (type(engine) !== 'TBGSortingEngine') { uncheckedSorting.push(id); continue; }
    const orders = [['sorting_key_order', prior?.keys, keys && names(keys)], ['sorting_field_order', prior?.fields, fields]];
    if (orders.some(([, before, saved]) => !before || !saved || saved.some(name => !name))) uncheckedSorting.push(id);
    for (const [kind, before, saved] of orders) {
      if (before && saved && saved.every(Boolean) && JSON.stringify(before) !== JSON.stringify(saved))
        changes.push({kind, node_id:id, label, before, saved});
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

export function savedGraphMessage(report, mask = value => value) {
  if (report.status === 'unavailable') return 'Пакет сохранён, но его сохранённую структуру не удалось сверить. Не повторяйте сохранение только ради сверки.';
  const label = value => [...mask(value).replace(/\s+/g, ' ').toWellFormed()].slice(0, 100).join('');
  const renames = report.changes.filter(change => change.kind === 'node_renamed');
  const order = report.changes.some(change => change.kind.startsWith('sorting_'));
  const links = report.changes.some(change => change.kind.startsWith('link_'));
  return [...renames.slice(0, 3).map(rename => `В сохранённом пакете имя узла отличается: «${label(rename.before)}» → «${label(rename.saved)}».`),
    renames.length > 3 && `Другие отличия в именах: ${renames.length - 3}.`,
    order && 'В сохранённом пакете изменился порядок полей «Сортировки».',
    links && 'В сохранённом пакете изменились связи.',
    !renames.length && !order && !links && (report.changes.length ? 'Сохранённый граф отличается.' : 'В проверенной части сохранённого графа расхождений нет.'),
    report.changes.length > 0 && 'Дальше используйте имена из сохранённого пакета; не исправляйте автоматически.',
    report.unchecked_sorting.length > 0 && 'Порядок полей проверен не для всех узлов «Сортировки».',
  ].filter(Boolean).join(' ');
}
