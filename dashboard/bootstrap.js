// Loaded by the normal Loginom client, after Uses.js.
(() => {
  const guid = value => String(value).replace(/[{}]/g, '').toLowerCase();
  async function post(path, body) {
    const res = await fetch('/dashboard/' + path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
    if (!res.ok) throw Error(await res.text());
    return res.json();
  }

  async function binding(tab, form, visual) {
    const node = visual.GetData();
    let filename;
    await bg.selectAsyncValue(node, () => bg.ScopeFindObjectSelector(bg.IBGModelPackage, p => [p.FileName]),
      n => {filename = bg.ScopeFindObject(n, bg.IBGModelPackage).FileName});
    let tree = tab.FNode;
    while (tree && !tree.data.node?.ModelUnitItem) tree = tree.parentNode;
    const workflow = form.FGenericNode ? await form.FGenericNode.get_Guid() : tree?.data.node.Guid;
    if (!workflow || !filename) throw Error('Не удалось определить пакет и сценарий узла.');
    return {server:location.origin, packagePath:'/' + filename.replaceAll('\\', '/').replace(/^\/+/, ''),
      workflowGuid:guid(workflow), nodeGuid:guid(await node.get_Guid()), port:0};
  }

  async function table(node, maxRows = Infinity) {
    // The node belongs to Loginom. Release only references acquired by this read.
    const refs = [];
    const take = async task => {const ref = await task; refs.push(ref); return ref};
    try {
      const port = await take((await take(node.get_OutputPorts())).getItem(0));
      const base = await take(port.get_Socket());
      const socket = await take(base.QueryInterface(bg.IBGModelOutputSocket));
      const output = await take(socket.get_Output());
      const source = await take(output.QueryInterface(bg.IBGDataSource));
      const cols = await take(source.get_Columns());
      const schema = [];
      for (let i=0,n=await cols.get_Count(); i<n; i++) {
        const col = await take(cols.getItem(i));
        schema.push({name:await col.get_Name(), type:await col.get_DataType()});
      }
      const rows = [];
      for (let r=0,n=Math.min(await source.get_RowCount(), maxRows); r<n; r++) {
        const row = [];
        for (let c=0; c<schema.length; c++) {
          const raw = await source.AsVariant(r, c);
          const type = schema[c].type;
          if (raw == null) row.push(null);
          else if (type === bg.TBGDataType.dtFloat) row.push(Number(String(raw)));
          else if (type === bg.TBGDataType.dtInteger && Number.isSafeInteger(Number(String(raw)))) row.push(Number(String(raw)));
          else if (type === bg.TBGDataType.dtBoolean) row.push(raw === true || String(raw).toLowerCase() === 'true');
          else row.push(String(raw));
        }
        rows.push(row);
      }
      return {schema, rows};
    } finally {
      for (const ref of refs.reverse()) await ref?.dispose();
    }
  }

  const active = async node => await node.get_Status() === bg.TBGModelNodeStatus.mnsActive;
  async function execute(node) {
    const cancellation = new Out();
    try {
      await bg.AsyncInvoker(node, node.ActivateCancellable, null)(
        bg.TBGProcessingMode.pmExecute, cancellation, bg.TBGNodeActivateMode.namAsynchronous);
      if (!await active(node)) throw Error('Узел не завершил расчёт.');
    } finally {
      ReleaseObject(cancellation.value);
    }
  }

  function install(view) {
    const form = view.Controller;
    const toolbar = form.Items.tlbModel;
    if (toolbar.getComponent('dashboardApp')) return;
    let overlay, pending = Promise.resolve(), busy = 0;
    const errors = new Map();
    const selected = () => form.GetOneSelectedNode(false);
    const tab = () => bg.app.Application.Instance.FMainForm.GetActiveTab();
    const close = () => {overlay?.remove(); overlay = undefined; update()};

    async function open() {
      const visual = selected();
      if (!visual || overlay) return;
      const owner = tab();
      const section = document.createElement('section');
      overlay = section;
      section.id = 'dashboard-tab-overlay';
      section.setAttribute('aria-label','Dashboard');
      section.style.cssText = 'position:absolute;inset:0;z-index:100;display:flex;flex-direction:column;background:#fff;font:14px system-ui;color:#242638';
      const header = document.createElement('header');
      header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:#393744;color:white';
      const title = document.createElement('strong');
      title.textContent = 'Dashboard';
      header.append(title);
      const back = document.createElement('button');
      back.textContent = 'Вернуться к сценарию';
      back.onclick = close;
      header.append(back);
      const note = document.createElement('p');
      note.style.cssText = 'padding:0 20px';
      note.setAttribute('role','status');
      section.append(header, note);
      owner.View.el.dom.append(section);
      back.focus();
      try {
        // Loginom PortAbstract: subtype 1 is a table. Never execute an export to discover its type.
        if (visual.GetOutputPorts()[0]?.SubType !== 1) {
          note.textContent = 'Dashboard для этого узла недоступен';
          return;
        }
        const node = visual.GetData();
        note.textContent = busy ? 'Идёт расчёт' : 'Открываем dashboard…';
        const target = await binding(owner, form, visual);
        const lookup = await post('lookup', target);
        await pending;
        if (overlay !== section) return;
        if (!lookup.exists && !await active(node)) {
          note.textContent = 'Идёт расчёт';
          await execute(node);
        }
        const parameters = () => window.loginomDashboardParameters(form);
        const available = await parameters();
        const sample = !errors.has(lookup.key) && await active(node) ? await table(node, 12) : null;
        if (overlay !== section) return;
        const snapshot = await post('targets', {binding:target, nodeName:await node.get_DisplayName(),
          schema:sample?.schema ?? [], rows:sample?.rows ?? [], parameters:available});
        if (overlay !== section) return;
        title.textContent = snapshot.nodeName;
        if (!lookup.exists) {
          note.textContent = 'Цель для чата: ' + snapshot.nodeName + '. Опишите в Codex, какой dashboard вам нужен. После публикации вернитесь к сценарию и откройте Dashboard.';
          return;
        }
        const state = async () => {
          const params = await parameters();
          const error = errors.get(lookup.key) ?? null;
          return {value:params[0]?.value ?? null, parameters:params,
            table:!error && await active(node) ? await table(node) : null, error};
        };
        const run = (update) => {
          busy++;
          const task = pending.then(async () => {
            try {
              if (update) await window.loginomDashboardParameters(form, update);
              await execute(node);
              errors.delete(lookup.key);
              return await state();
            } catch (e) {
              errors.set(lookup.key, String(e.message ?? e));
              return await state();
            }
          });
          pending = task.then(() => {busy--}, () => {busy--});
          return task;
        };
        const frame = document.createElement('iframe');
        frame.title = 'Dashboard';
        frame.style.cssText = 'border:0;flex:1;width:100%;min-height:0';
        frame.dashboard = {
          state:async () => {await pending; return state()},
          change:(value, name = available[0]?.name) => {
            if (!Number.isFinite(value) || !available.some(p => p.name === name) || (name === 'MinBudget' && value < 0))
              return Promise.reject(Error('Недопустимое значение параметра.'));
            return run({name, value});
          },
          run:() => run()
        };
        frame.src = '/dashboard/apps/' + lookup.key + '/';
        note.remove();
        section.append(frame);
      } catch (e) {note.textContent = 'Dashboard: ' + String(e.message ?? e)}
    }

    const button = toolbar.insert(0, {itemId:'dashboardApp', text:'Dashboard', handler:open});
    let revision = 0;
    async function update() {
      const seq = ++revision;
      const visual = selected();
      button.setVisible(Boolean(visual));
      if (!visual) return;
      button.setText('Dashboard');
      if (visual.GetOutputPorts()[0]?.SubType !== 1) return;
      try {
        const lookup = await post('lookup', await binding(tab(), form, visual));
        if (seq === revision && !view.destroyed) button.setText(lookup.exists ? 'Dashboard' : 'Создать dashboard');
      } catch { /* Opening the button reports the service error in the tab. */ }
    }
    const selection = form.FDiagram.GetMxGraph().getSelectionModel();
    selection.addListener(mxEvent.CHANGE, update);
    const remove = () => {overlay?.remove(); overlay = undefined};
    view.on('hide', remove);
    view.on('destroy', () => {revision++; selection.removeListener(update); remove()}, null, {single:true});
    update();
  }
  Ext.onReady(() => {
    const controller = Ext.create('Ext.app.Controller', {id:'loginomDashboardApp'});
    controller.control('panel#pnlModelForm', {afterrender:install});
    Ext.ComponentQuery.query('panel#pnlModelForm').filter(view => view.rendered).forEach(install);
  });
})();
