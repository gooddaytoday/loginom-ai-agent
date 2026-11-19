import { parameters } from "./parameters"
import type { Form, Node, Studio, Tab, View, Visual, TargetBinding, Update } from "./types"

function missingMethod(...methods: unknown[]) {
  return methods.some((method) => typeof method !== "function")
}

export function connect() {
  const runtime = window as Window & Partial<Studio>
  if (!runtime.bg || !runtime.mxEvent || !runtime.Out || !runtime.ReleaseObject) return
  const { bg, mxEvent, Out, ReleaseObject } = runtime
  if (
    missingMethod(
      Out,
      ReleaseObject,
      bg.AsyncInvoker,
      bg.selectAsyncValue,
      bg.ScopeFindObjectSelector,
      bg.ScopeFindObject,
      bg.EndOperationEx,
      bg.app?.Application?.Instance?.FMainForm?.GetActiveTab,
    )
  )
    return
  const dataTypes = bg.TBGDataType
  const activeStatus = bg.TBGModelNodeStatus?.mnsActive
  const executeMode = bg.TBGProcessingMode?.pmExecute
  const asyncMode = bg.TBGNodeActivateMode?.namAsynchronous
  if (
    [
      bg.IBGModelPackage,
      bg.IBGModelOutputSocket,
      bg.IBGDataSource,
      bg.IBGEditableVariablesOutputSocket,
      dataTypes?.dtFloat,
      dataTypes?.dtInteger,
      dataTypes?.dtBoolean,
      activeStatus,
      executeMode,
      asyncMode,
      mxEvent.CHANGE,
    ].some((value) => value == null)
  )
    return
  const guid = (value: string) => String(value).replace(/[{}]/g, "").toLowerCase()
  async function binding(tab: Tab, form: Form, node: Node): Promise<TargetBinding> {
    let filename: string | undefined
    await bg.selectAsyncValue(
      node,
      () => bg.ScopeFindObjectSelector(bg.IBGModelPackage, (p) => [p.FileName]),
      (n) => {
        filename = bg.ScopeFindObject(n, bg.IBGModelPackage).FileName
      },
    )
    let tree = tab.FNode
    while (tree && !tree.data.node?.ModelUnitItem) tree = tree.parentNode
    const workflow = await (form.FGenericNode || tree?.data.node?.ModelUnitItem)?.get_Guid()
    if (!workflow || !filename) throw Error("Не удалось определить пакет и сценарий узла.")
    return {
      packagePath: "/" + filename.replaceAll("\\", "/").replace(/^\/+/, ""),
      workflowGuid: guid(workflow),
      nodeGuid: guid(await node.get_Guid()),
    }
  }

  async function table(node: Node, maxRows = 10_000, limitSize = true) {
    // RPC getters return proxies shared with Loginom; the runtime manages their lifetime.
    const port = await (await node.get_OutputPorts()).getItem(0)
    const base = await port.get_Socket()
    const socket = await base.QueryInterface(bg.IBGModelOutputSocket)
    const output = await socket.get_Output()
    const source = await output.QueryInterface(bg.IBGDataSource)
    const cols = await source.get_Columns()
    const schema: { name: string; type: number }[] = []
    for (let i = 0, n = await cols.get_Count(); i < n; i++) {
      const col = await cols.getItem(i)
      schema.push({ name: await col.get_Name(), type: await col.get_DataType() })
    }
    const totalRows = await source.get_RowCount()
    const rows: (string | number | boolean | null)[][] = []
    let truncated = totalRows > maxRows
    let size = 0
    for (let r = 0, n = Math.min(totalRows, maxRows); r < n; r++) {
      const row = []
      for (let c = 0; c < schema.length; c++) {
        const raw = await source.AsVariant(r, c)
        const type = schema[c].type
        if (raw == null) {
          row.push(null)
          continue
        }
        const text = String(raw)
        if (type === dataTypes.dtFloat || (type === dataTypes.dtInteger && Number.isSafeInteger(Number(text))))
          row.push(Number(text))
        else if (type === dataTypes.dtBoolean) row.push(text.toLowerCase() === "true")
        else {
          row.push(limitSize ? text.slice(0, 10_000) : text)
          if (limitSize && text.length > 10_000) truncated = true
        }
      }
      if (limitSize) {
        const length = JSON.stringify(row).length
        if (size + length > 5_000_000) {
          truncated = true
          break
        }
        size += length
      }
      rows.push(row)
    }
    return { schema, rows, truncated, totalRows }
  }

  const active = async (node: Node) => (await node.get_Status()) === activeStatus
  async function execute(node: Node) {
    const cancellation = new Out()
    try {
      await bg.AsyncInvoker(node, node.ActivateCancellable, null)(
        executeMode,
        cancellation,
        asyncMode,
      )
      if (!(await active(node))) throw Error("Узел не завершил расчёт.")
    } finally {
      ReleaseObject(cancellation.value)
    }
  }

  return {
    available(view: View) {
      const form = view.Controller
      const toolbar = form?.Items?.tlbModel
      const graph = form?.FDiagram?.GetMxGraph
      if (missingMethod(form?.GetOneSelectedNode, toolbar?.insert, toolbar?.getComponent, graph, view.on)) return false
      const selection = form.FDiagram.GetMxGraph()?.getSelectionModel?.()
      return !missingMethod(selection?.addListener, selection?.removeListener)
    },
    selected(form: Form) {
      const visual = form.GetOneSelectedNode(false)
      if (!missingMethod(visual?.GetOutputPorts, visual?.GetData)) return visual
    },
    tableNode(visual: Visual) {
      // Loginom PortAbstract: subtype 1 is a table. Never execute an export to discover its type.
      return visual.GetOutputPorts()[0]?.SubType === 1 ? visual.GetData() : undefined
    },
    name: (node: Node) => node.get_DisplayName(),
    binding,
    table,
    active,
    execute,
    parameters: (form: Form, update?: Update) => parameters({ bg, Out }, form, update),
    tab: () => bg.app.Application.Instance.FMainForm.GetActiveTab(),
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
  if (missingMethod(Ext?.onReady, Ext?.create, Ext?.ComponentQuery?.query)) return
  Ext!.onReady(() => {
    const controller = Ext!.create("Ext.app.Controller", { id: "loginomDashboardApp" })
    if (typeof controller?.control !== "function") return
    controller.control("panel#pnlModelForm", { afterrender: install })
    Ext!.ComponentQuery.query("panel#pnlModelForm").filter((view) => view.rendered).forEach(install)
  })
}
