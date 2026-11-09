// Numeric user variables belong to the workflow open in this ModelForm.
window.loginomDashboardParameters = async function (form, update) {
  const node = form.FDiagram.VariablesNode?.GetData();
  if (!node) return [];
  // RPC getters return proxies shared with Loginom; the runtime manages their lifetime.
  // An inactive variables node exposes configured values inside an edit operation.
  const editing = update !== undefined;
  const configure = editing || await node.get_Status() !== bg.TBGModelNodeStatus.mnsActive;
  const assist = configure ? await node.GetConfigureAssist() : null;
  const cookie = assist ? new Out() : null;
  if (assist) await assist.BeginOperationEx(cookie);
  let cancel = true;
  try {
    const comp = await node.get_Component();
    const sockets = await comp.get_OutputSockets();
    const item = await sockets.ItemByName('UserVariables');
    const base = await item.get_Socket();
    const socket = await base.QueryInterface(bg.IBGEditableVariablesOutputSocket);
    const variables = await socket.get_Variables();
    const elements = await variables.get_Elements();
    const rows = [];
    for (let i = 0, n = await elements.get_Count(); i < n; i++) {
      const variable = await elements.getItem(i);
      const type = await variable.get_DataType();
      if (type !== bg.TBGDataType.dtFloat && type !== bg.TBGDataType.dtInteger) continue;
      const name = await variable.get_Name();
      const value = await variable.get_Value();
      if (editing && update.name === name) {
        if (!Number.isFinite(update.value) || type === bg.TBGDataType.dtInteger && !Number.isSafeInteger(update.value))
          throw Error('Значение не соответствует числовому типу переменной ' + name);
        await value.set_AsVariant(update.value);
      }
      const actual = await value.get_AsVariant();
      rows.push({name, value: actual == null ? null : Number(String(actual))});
    }
    if (editing && !rows.some(row => row.name === update.name))
      throw Error('Числовая переменная не найдена: ' + update.name);
    cancel = !editing;
    return rows;
  } finally {
    if (assist) await bg.EndOperationEx(assist, cookie, cancel);
  }
};
