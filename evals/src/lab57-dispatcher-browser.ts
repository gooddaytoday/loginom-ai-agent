import { dispatcherScope } from "./lab57-dispatcher"
import type { DispatcherInventory, DispatcherSession } from "./lab57-dispatcher"

/** d6 internal MCP browser_run_code_unsafe transport; no fabricated RPC, restored document or Dock UUID. */
export function dispatcherBrowserCode(target: DispatcherSession | null = null, expected: DispatcherInventory | null = null) {
  if (target && (!expected || target.type !== 0 || !/^user:[0-9]+$/.test(target.name)
    || target.packages.length !== 1 || target.packages[0]!.path !== dispatcherScope.packagePath
    || target.packages[0]!.readOnly !== true || target.packages[0]!.running !== false)) throw Error("GUARDED_INVENTORY_REQUIRED")
  const options = { origin: dispatcherScope.origin, build: dispatcherScope.build, target, expected }
  return `async page => page.evaluate(${vendorDispatcher.toString()}, ${JSON.stringify(options)})`
}

// The vendor client public interfaces below are present in the captured 7.4.2 scripts.
// Access/Name syntax/native behavior still require a genuine future operator observation.
async function vendorDispatcher(options: {origin: string; build: string; target: DispatcherSession | null; expected: DispatcherInventory | null}) {
  type ProxyPackage = {Name: Promise<string>; Path: Promise<string>; CreateTime: Promise<Date>;
    ModifyTime: Promise<Date>; ReadOnly: Promise<boolean>; ReferenceCount: Promise<number>; Progress: Promise<unknown>}
  type ProxySession = {Name: Promise<string>; CreateTime: Promise<Date>; SessionType: Promise<number>;
    SessionIP: Promise<string>; LastTime: Promise<Date>; PendingDisconnect: Promise<boolean>; Count: Promise<number>;
    PackageInfo(index: number): Promise<ProxyPackage>}
  type Manager = {Count: Promise<number>; UpdateSessionInfos(): Promise<void>; SessionInfo(index: number): Promise<ProxySession>;
    CloseSession(session: ProxySession, timeout: number): Promise<boolean>}
  const w = window as unknown as {bg?: {app?: {Version?: string; CurrentUser?: {Get(): {IsAdmin?: boolean}};
    Application?: {FInstance?: {GetConnection(): {Connected: boolean; ServerContainer: {Session: unknown}}}}};
    IBGDeductorSessionsManagerContainer: unknown; objectId(v: unknown): Promise<{toString(): string}>};
    safeCast?: (v: unknown, type: unknown) => {GetSessionsManager(): Promise<Manager>} | null }
  const app = w.bg?.app, connection = app?.Application?.FInstance?.GetConnection()
  const visible = (e: Element) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0
    && getComputedStyle(e).visibility !== "hidden"
  const blocked = () => [...document.querySelectorAll('[role="dialog"],.x-message-box,.bg-mask-message,.x-mask-msg')].some(visible)
  if (location.origin !== options.origin || app?.Version !== options.build || app.CurrentUser?.Get().IsAdmin !== true
    || connection?.Connected !== true || !w.safeCast || !w.bg || blocked()) throw Error("DISPATCHER_INTERFACE_OR_PRIVILEGE_UNCONFIRMED")
  const container = w.safeCast(connection.ServerContainer.Session, w.bg.IBGDeductorSessionsManagerContainer)
  if (!container) throw Error("DISPATCHER_INTERFACE_UNAVAILABLE")
  const manager = await container.GetSessionsManager()
  const proxies = new Map<string,ProxySession>()
  const capture = async (): Promise<DispatcherInventory> => {
    await manager.UpdateSessionInfos()
    const countBefore = await manager.Count
    if (!Number.isSafeInteger(countBefore) || countBefore < 1 || countBefore > 512) throw Error("DISPATCHER_COUNT_UNSAFE")
    const sessions: DispatcherSession[] = []
    proxies.clear()
    for (let i=0;i<countBefore;i++) {
      const s = await manager.SessionInfo(i), key = (await w.bg!.objectId(s)).toString(), packageCount = await s.Count
      if (!Number.isSafeInteger(packageCount) || packageCount < 0 || packageCount > 512) throw Error("DISPATCHER_PACKAGE_COUNT_UNSAFE")
      const packages = []
      for (let j=0;j<packageCount;j++) {
        const p = await s.PackageInfo(j), path = await p.Path, progress = await p.Progress
        const created = await p.CreateTime, modified = await p.ModifyTime
        packages.push({key:(await w.bg!.objectId(p)).toString(),name:await p.Name,
          path:path ? "/"+path.replaceAll("\\","/").replace(/^\/+/,"") : null,
          created:created instanceof Date ? created.getTime() : null, modified:modified instanceof Date ? modified.getTime() : null,
          readOnly:await p.ReadOnly,references:await p.ReferenceCount,running:progress != null})
      }
      if (packageCount !== await s.Count || proxies.has(key)) throw Error("DISPATCHER_ENUMERATION_RACE")
      proxies.set(key,s)
      sessions.push({key,name:await s.Name,type:await s.SessionType,created:(await s.CreateTime).getTime(),ip:await s.SessionIP,
        last:(await s.LastTime).getTime(),pendingDisconnect:await s.PendingDisconnect,packageCount,packages})
    }
    const self = sessions.filter(s => s.type === 1)
    return {version:1,origin:location.origin,build:app.Version!,observer:self.length === 1 ? self[0]!.key : "",admin:true,
      complete:true,filtered:false,dialogs:blocked(),countBefore,countAfter:await manager.Count,collectedAt:Date.now(),sessions}
  }
  const before = await capture()
  if (!options.target) return before
  const target = options.target
  const canonical = (v: unknown) => JSON.stringify(v,(_k,x: unknown) => x && typeof x === "object" && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))) : x)
  const observed = before.sessions.filter(s => s.key === target.key)
  if (before.countBefore !== before.countAfter || before.dialogs || observed.length !== 1
    || !options.expected || canonical(before.sessions) !== canonical(options.expected.sessions)
    || before.observer !== options.expected.observer
    || canonical(observed[0]) !== canonical(target) || target.type !== 0 || !/^user:[0-9]+$/.test(target.name)
    || target.packages.length !== 1 || target.packages[0]!.readOnly !== true || target.packages[0]!.running !== false
    || target.packages[0]!.references !== 1 || target.key === before.observer || blocked()) throw Error("CLOSE_TARGET_CHANGED_OR_UNSAFE")
  const proxy = proxies.get(target.key)
  if (!proxy) throw Error("CLOSE_TARGET_MISSING")
  // Exact vendor CloseSession(info, timeout) used by SessionsManagerForm.btnCloseHandler.
  // Zero timeout cannot wait for/cancel a running node; native refusal is NOT cessation.
  const acknowledged = await manager.CloseSession(proxy,0)
  const after = await capture()
  return {version:1,operation:"addressed_close",acknowledged,before,after}
}
