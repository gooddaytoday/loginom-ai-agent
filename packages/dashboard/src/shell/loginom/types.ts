import type { Binding, Parameter, TableSample } from "../../contract/snapshot"

export type TargetBinding = typeof Binding.Type
export type Parameters = ReadonlyArray<typeof Parameter.Type>
export type Table = typeof TableSample.Type
export type Update = { name: string; value: number }
export type State = {
  value: string | number | boolean | null
  parameters: Parameters
  table: Table | null
  error: string | null
}
export type Dashboard = {
  state(): Promise<State>
  change(value: number, name?: string): Promise<State>
  run(): Promise<State>
}
export type Frame = HTMLIFrameElement & { dashboard?: Dashboard }
export type OutValue = { value?: unknown }
type Collection<T> = { get_Count(): Promise<number>; getItem(index: number): Promise<T> }
type Variable = {
  get_DataType(): Promise<number>
  get_Name(): Promise<string>
  get_Value(): Promise<{ set_AsVariant(value: number): Promise<void>; get_AsVariant(): Promise<unknown> }>
}
type Assist = { BeginOperationEx(cookie: OutValue): Promise<void> }
type VariablesSocket = { get_Variables(): Promise<{ get_Elements(): Promise<Collection<Variable>> }> }
type DataSource = {
  get_Columns(): Promise<Collection<{ get_Name(): Promise<string>; get_DataType(): Promise<number> }>>
  get_RowCount(): Promise<number>
  AsVariant(row: number, column: number): Promise<unknown>
}
type Query<T> = { QueryInterface(type: unknown): Promise<T> }
type Socket<T> = { get_Socket(): Promise<Query<T>> }
export type VariablesNode = {
  get_Status(): Promise<unknown>
  GetConfigureAssist(): Promise<Assist>
  get_Component(): Promise<{
    get_OutputSockets(): Promise<{ ItemByName(name: string): Promise<Socket<VariablesSocket>> }>
  }>
}
export type Node = {
  get_Guid(): Promise<string>
  get_DisplayName(): Promise<string>
  get_Status(): Promise<unknown>
  ActivateCancellable(mode: unknown, cancellation: OutValue, asynchronous: unknown): Promise<void>
  get_OutputPorts(): Promise<{ getItem(index: number): Promise<Socket<{ get_Output(): Promise<Query<DataSource>> }>> }>
}
export type Visual = { GetData(): Node; GetOutputPorts(): { SubType: number }[] }
export type Tab = {
  View: { el: { dom: HTMLElement } }
  FNode?: { data: { node?: { ModelUnitItem?: { get_Guid(): Promise<string> } } }; parentNode?: Tab["FNode"] }
}
export type View = {
  Controller: Form
  rendered: boolean
  destroyed?: boolean
  on(event: string, callback: () => void, scope?: null, options?: { single: boolean }): void
}
export type Form = {
  GetOneSelectedNode(multiple: boolean): Visual | undefined
  FGenericNode?: { get_Guid(): Promise<string> }
  FDiagram: {
    VariablesNode?: { GetData(): VariablesNode }
    GetMxGraph(): {
      getSelectionModel(): {
        addListener(event: unknown, callback: () => void): void
        removeListener(callback: () => void): void
      }
    }
  }
  Items: {
    tlbModel: {
      getComponent(id: string): unknown
      insert(
        index: number,
        options: { itemId: string; text: string; handler(): Promise<void> },
      ): { setVisible(value: boolean): void; setText(value: string): void }
    }
  }
}
export type Studio = {
  bg: {
    IBGModelPackage: unknown
    IBGModelOutputSocket: unknown
    IBGDataSource: unknown
    IBGEditableVariablesOutputSocket: unknown
    TBGDataType: { dtFloat: number; dtInteger: number; dtBoolean: number }
    TBGModelNodeStatus: { mnsActive: unknown }
    TBGProcessingMode: { pmExecute: unknown }
    TBGNodeActivateMode: { namAsynchronous: unknown }
    AsyncInvoker(node: Node, method: Node["ActivateCancellable"], context: null): Node["ActivateCancellable"]
    selectAsyncValue(node: Node, selector: () => unknown, callback: (node: Node) => void): Promise<void>
    ScopeFindObjectSelector(type: unknown, callback: (value: { FileName: string }) => string[]): unknown
    ScopeFindObject(node: Node, type: unknown): { FileName: string }
    EndOperationEx(assist: Assist, cookie: OutValue | null, cancel: boolean): Promise<void>
    app: { Application: { Instance: { FMainForm: { GetActiveTab(): Tab } } } }
  }
  Ext: {
    onReady(callback: () => void): void
    create(
      name: string,
      options: { id: string },
    ): { control(selector: string, options: { afterrender(view: View): void }): void }
    ComponentQuery: { query(selector: string): View[] }
  }
  mxEvent: { CHANGE: unknown }
  Out: new () => OutValue
  ReleaseObject(value: unknown): void
}
