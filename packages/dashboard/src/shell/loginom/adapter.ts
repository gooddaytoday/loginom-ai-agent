import { parameters } from "./parameters"
import type { Form, Node, Studio, Tab, View, Visual, TargetBinding, Update } from "./types"

export function connect() {
  const runtime = window as Window & Partial<Studio>
  const bg = runtime.bg
  const mxEvent = runtime.mxEvent
  const Out = runtime.Out
  const ReleaseObject = runtime.ReleaseObject
  if (!bg || !mxEvent || !Out || !ReleaseObject) return
  if (
    [
      Out,
      ReleaseObject,
      bg.AsyncInvoker,
      bg.selectAsyncValue,
      bg.ScopeFindObjectSelector,
      bg.ScopeFindObject,
      bg.EndOperationEx,
      bg.app?.Application?.Instance?.FMainForm?.GetActiveTab,
    ].some((method) => typeof method !== "function")
  )
    return
  if (
    [
      bg.IBGModelPackage,
      bg.IBGModelOutputSocket,
      bg.IBGDataSource,
      bg.IBGEditableVariablesOutputSocket,
      bg.TBGDataType?.dtFloat,
      bg.TBGDataType?.dtInteger,
      bg.TBGDataType?.dtBoolean,
      bg.TBGModelNodeStatus?.mnsActive,
      bg.TBGProcessingMode?.pmExecute,
      bg.TBGNodeActivateMode?.namAsynchronous,
      mxEvent.CHANGE,
    ].some((value) => value == null)
  )
    return
  const studio = { bg, Out, ReleaseObject }
  const guid = (value: string) => String(value).replace(/[{}]/g, "").toLowerCase()
  async function binding(tab: Tab, form: Form, visual: Visual): Promise<TargetBinding> {
    const node = visual.GetData()
    let filename: string | undefined
    await studio.bg.selectAsyncValue(
      node,
      () => studio.bg.ScopeFindObjectSelector(studio.bg.IBGModelPackage, (p) => [p.FileName]),
      (n) => {
        filename = studio.bg.ScopeFindObject(n, studio.bg.IBGModelPackage).FileName
      },
    )
    let tree = tab.FNode
    while (tree && !tree.data.node?.ModelUnitItem) tree = tree.parentNode
    const workflow = await (form.FGenericNode || tree?.data.node?.ModelUnitItem)?.get_Guid()
    if (!workflow || !filename) throw Error("Не удалось определить пакет и сценарий узла.")
    return {
      server: location.origin,
      packagePath: "/" + filename.replaceAll("\\", "/").replace(/^\/+/, ""),
      workflowGuid: guid(workflow),
      nodeGuid: guid(await node.get_Guid()),
      port: 0,
    }
  }

  async function table(node: Node, maxRows = Infinity) {
    // RPC getters return proxies shared with Loginom; the runtime manages their lifetime.
    const port = await (await node.get_OutputPorts()).getItem(0)
    const base = await port.get_Socket()
    const socket = await base.QueryInterface(studio.bg.IBGModelOutputSocket)
    const output = await socket.get_Output()
    const source = await output.QueryInterface(studio.bg.IBGDataSource)
    const cols = await source.get_Columns()
    const schema: { name: string; type: number }[] = []
    for (let i = 0, n = await cols.get_Count(); i < n; i++) {
      const col = await cols.getItem(i)
      schema.push({ name: await col.get_Name(), type: await col.get_DataType() })
    }
    const rows: (string | number | boolean | null)[][] = []
    for (let r = 0, n = Math.min(await source.get_RowCount(), maxRows); r < n; r++) {
      const row = []
      for (let c = 0; c < schema.length; c++) {
        const raw = await source.AsVariant(r, c)
        const type = schema[c].type
        if (raw == null) row.push(null)
        else if (type === studio.bg.TBGDataType.dtFloat) row.push(Number(String(raw)))
        else if (type === studio.bg.TBGDataType.dtInteger && Number.isSafeInteger(Number(String(raw))))
          row.push(Number(String(raw)))
        else if (type === studio.bg.TBGDataType.dtBoolean)
          row.push(raw === true || String(raw).toLowerCase() === "true")
        else row.push(String(raw))
      }
      rows.push(row)
    }
    return { schema, rows }
  }

  const active = async (node: Node) => (await node.get_Status()) === studio.bg.TBGModelNodeStatus.mnsActive
  async function execute(node: Node) {
    const cancellation = new studio.Out()
    try {
      await studio.bg.AsyncInvoker(node, node.ActivateCancellable, null)(
        studio.bg.TBGProcessingMode.pmExecute,
        cancellation,
        studio.bg.TBGNodeActivateMode.namAsynchronous,
      )
      if (!(await active(node))) throw Error("Узел не завершил расчёт.")
    } finally {
      studio.ReleaseObject(cancellation.value)
    }
  }

  return {
    available(view: View) {
      const form = view.Controller
      const toolbar = form?.Items?.tlbModel
      const graph = form?.FDiagram?.GetMxGraph
      if (
        [form?.GetOneSelectedNode, toolbar?.insert, toolbar?.getComponent, graph, view.on].some(
          (method) => typeof method !== "function",
        )
      )
        return false
      const selection = form.FDiagram.GetMxGraph()?.getSelectionModel?.()
      return typeof selection?.addListener === "function" && typeof selection?.removeListener === "function"
    },
    binding,
    table,
    active,
    execute,
    parameters: (form: Form, update?: Update) => parameters(studio, form, update),
    tab: () => studio.bg.app.Application.Instance.FMainForm.GetActiveTab(),
    listen(view: View, update: () => void, remove: () => void) {
      const selection = view.Controller.FDiagram.GetMxGraph().getSelectionModel()
      selection.addListener(mxEvent.CHANGE, update)
      view.on("hide", remove)
      view.on(
        "destroy",
        () => {
          selection.removeListener(update)
          remove()
        },
        null,
        { single: true },
      )
    },
  }
}

// Uses.js loads the application asynchronously. Register with Ext up front;
// the main form and the runtime APIs become available when a workflow renders.
export function views(install: (view: View) => void) {
  const Ext = (window as Window & Partial<Studio>).Ext
  if ([Ext?.onReady, Ext?.create, Ext?.ComponentQuery?.query].some((method) => typeof method !== "function")) return
  Ext!.onReady(() => {
    const controller = Ext!.create("Ext.app.Controller", { id: "loginomDashboardApp" })
    if (typeof controller?.control !== "function") return
    controller.control("panel#pnlModelForm", { afterrender: install })
    Ext!.ComponentQuery.query("panel#pnlModelForm").filter((view) => view.rendered).forEach(install)
  })
}
