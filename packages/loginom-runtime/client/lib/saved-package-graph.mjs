import {child,items,normalizePackageGuid,readSavedWorkflow,requirePackageGuid,withSavedPackage} from './saved-package-reader.mjs';

const maxBytes = 2 * 1024 * 1024;

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
    const owns = receipt => receipt?.packageNode === pack && JSON.parse(receipt.request).session === options.sessionId;
    const targetOwns = () => {
      const receipt = prep.receipts.get(options.target.preparationId);
      return owns(receipt) && ['verified', 'superseded'].includes(receipt.phase)
        && (receipt.stepSession?.connection ?? receipt.openConnection) === connection
        && (receipt.stepSession?.nativeSession ?? receipt.openServerSession) === session
        && [...prep.receipts.values()].some(receipt => owns(receipt) && receipt.workflowId === options.target.workflowId
          && ['verified', 'superseded'].includes(receipt.phase) && receipt.tab?.getAttribute('data-tid') === options.tabTid);
    };
    const verify = () => {
      if (location.origin !== options.origin || app?.Version !== options.build || app.Version !== '7.4.2'
        || globalThis.__loginomDockPreparationV1 !== prep || prep?.document !== document || prep.id !== options.documentId
        || (options.target ? !targetOwns() : ![...prep.receipts.values()].some(receipt => receipt.phase === 'verified' && owns(receipt)))
        || form.FReconnecting === true || form.FMapTree.FServerConnection !== connection
        || connection?.Connected !== true || connection.UserName !== options.account || connection.Session !== session
        || !(pack instanceof app.PackageTreeNode) || pack.HasRunningNodes() !== false
        || '/' + pack.PackageFileName.replaceAll('\\', '/').replace(/^\/+/, '') !== options.path
        || !Array.from({length: form.FMapTree.PackageNodes.Count}, (_, index) => form.FMapTree.PackageNodes.Items(index)).includes(pack))
        throw Error('Saved package owner changed');
    };
    const session = connection?.Session;
    const readModified = async () => {
      verify();
      const proxy = pack.Package;
      if (!proxy) return null;
      let timer;
      try {
        const modified = await Promise.race([
          session.IsPackageModified(proxy),
          new Promise(resolve => { timer = setTimeout(resolve, 3000, null); }),
        ]);
        verify();
        return pack.Package === proxy ? modified : null;
      } finally {
        clearTimeout(timer);
      }
    };
    verify();
    return {verify, readModified, workspace, card, path: options.path, limit: options.limit};
  }, options);
  const tab = page.locator('[data-tid='+JSON.stringify(options.tabTid)+']');
  let files, entered = false;
  try {
    if (options.target) {
      const modified = await owner.evaluate(owner => owner.readModified());
      if (modified === true) return {saveRequired:true};
      if (modified !== false) throw Error('Saved package modified state unavailable');
    }
    if (options.target && await page.locator('[role="dialog"]:visible,.x-window:visible,.bg-dialog:visible').count())
      throw Error('Saved package window is blocked');
    if (await tab.count() !== 1 || !await tab.evaluate(element => element.classList.contains('x-tab-active')))
      throw Error('Save workflow tab is not active');
    await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnFilestorage"]').click({timeout: 1500});
    entered = true;
    files = await page.waitForFunction(owner => {
      owner.verify();
      const card = owner.workspace.getActiveTab(), controller = card?.Controller?.FController;
      return controller?.constructor?.name === 'FileStorageForm' && controller.FFileStorage ? card : null;
    }, owner, {timeout: 2500});
    return await page.evaluate(async ({owner, files, target}) => {
      const verify = () => {
        owner.verify();
        if (owner.workspace.getActiveTab() !== files) throw Error('Saved package Files tab changed');
      };
      verify();
      const name = owner.path.split('/').at(-1), dir = owner.path.slice(0, -name.length);
      if (bg.TBGFileOpenMode.fomRead !== 0) throw Error('Native read-only mode changed');
      const downloader = new bg.filestorage.FileDownloader(name, dir, files.Controller.FController.FFileStorage);
      try {
        if (downloader.FullFilename !== owner.path) throw Error('Native saved path differs');
        const size = await downloader.GetFileSize();
        if (!Number.isSafeInteger(size) || size < 1 || size > owner.limit) throw Error('Saved package size outside bound');
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
        if (target) {
          const modified = await owner.readModified();
          verify();
          if (modified === true) return {saveRequired:true};
          if (modified !== false) throw Error('Saved package modified state unavailable');
        }
        return {base64:bytes.toBase64()};
      } finally {
        await downloader.Dispose();
        if (!downloader.IsStreamReleased() || !downloader.IsDisposed) throw Error('Saved package stream did not close');
      }
    }, {owner, files, target: !!options.target});
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

export function parseSavedPackageBytes(response) {
  if (!response?.isError) for (const block of response?.content ?? []) {
    if (block.type !== 'text') continue;
    const text = block.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1] ?? block.text;
    if (text.length > Math.ceil(maxBytes / 3) * 4 + 64) continue;
    let result;
    try { result = JSON.parse(text); }
    catch { continue; }
    if (result?.saveRequired === true) throw Object.assign(Error('Save the package first'), {code:'PACKAGE_SCHEMA_SAVE_REQUIRED'});
    if (typeof result?.base64 !== 'string') continue;
    const bytes = Buffer.from(result.base64, 'base64');
    if (bytes.length && bytes.length <= maxBytes && bytes.toString('base64') === result.base64) return bytes;
  }
  throw Error('Saved package read unavailable');
}

const type = element => element?.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type');
const names = columns => items(columns).map(column => column.getAttribute('Name'));

function* workflows(graph) {
  if(!graph.root)throw Error('Invalid package workflow');
  yield graph;
  for(const node of graph.nodes)if(node.submodel)yield* workflows(node.submodel);
}

async function savedGraphs(bytes) {
  if (bytes.length > maxBytes) throw Error('Saved package size outside bound');
  return withSavedPackage(bytes, 8 * maxBytes, async archive=>{
    const units=await archive.units();
    if(!units.length||new Set(units.map(unit=>unit.toLowerCase())).size!==units.length)
      throw Error('Saved package XML inventory outside bound');
    const result=await Promise.all(units.map(async unit=>
      [...workflows(readSavedWorkflow(child(await archive.xml(unit+'/Unit.xml'),'WorkFlow'),32))]));
    return result.flat();
  });
}

export async function compareSavedPackageGraph({bytes, before, sorting = new Map(), intendedLabels = new Map()}) {
  const expected = new Map(before.nodes.map(node => [requirePackageGuid(node.id), node]));
  if (!expected.size || expected.size !== before.nodes.length) throw Error('Pre-save node identity unavailable');
  const graphs = await savedGraphs(bytes);
  const matching = graphs.filter(({nodes}) => nodes.some(node => expected.has(requirePackageGuid(node.guid))));
  if (matching.length !== 1) throw Error('Saved workflow identity unavailable');
  const {nodes, links} = matching[0];
  const observed = new Map(nodes.map(node => [requirePackageGuid(node.guid), node]));
  if (observed.size !== nodes.length) throw Error('Duplicate saved node GUID');
  const changes = [], uncheckedSorting = [];
  const savedLabels = [];
  for (const [id, previous] of expected) {
    const node = observed.get(id);
    if (!node) { changes.push({kind:'node_missing', node_id:id, before:previous.label}); continue; }
    const label = node.label;
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
    const component = child(node.element, 'Component'), engine = child(component, 'Engine');
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
  const edge = values => values.map(requirePackageGuid).join('/');
  const oldLinks = new Set(before.links.map(edge));
  const savedLinks = new Set(links.map(link => [
    link.source_node_guid, link.source_port_guid, link.target_node_guid, link.target_port_guid,
  ]).filter(([source,,target]) => observed.has(normalizePackageGuid(source)) && observed.has(normalizePackageGuid(target))).map(edge));
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
