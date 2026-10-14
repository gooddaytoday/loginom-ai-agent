import { randomUUID } from "node:crypto"
import { hostError } from "./errors"

export type Port = {
  postMessage(value: unknown): void
  on(event: "message", listener: (event: { data: unknown }) => void): void
  off?(event: "message", listener: (event: { data: unknown }) => void): void
  start(): void
  onClose?(listener: () => void): void
}
type Control = { signal: AbortSignal; deadline: number }
export function transport(port: Port) {
  const client = requests(port)
  return { request: client.request, close: client.close }
}
export function privateAmountTransport(port: Port, receive:(value:unknown,origin:unknown,secondary?:{value:unknown})=>unknown) {
  const client=requests(port);
  type AmountControl=Control & {operation:string;request:string};
  return {request:client.request,close:client.close,
    start(input:{protocol:1;acceptanceCapture:{authorization:string;harness:"amount-import-type-v1"};amountStartup:{operation:string;request:string}},control:AmountControl) {
      const authorization=input.acceptanceCapture.authorization;
      return client.amountControlled("start",input,control,{phase:"startup",authorization,harness:"amount-import-type-v1",deadline:control.deadline,
        operation:control.operation,request:control.request},receive);
    },
    acquire(input:{run:string;session:string;amountControl:{authorization:string;operation:string;request:string}},control:AmountControl) {
      return client.amountControlled("acquire",input,control,{phase:"acquired",run:input.run,...input.amountControl,deadline:control.deadline},receive);
    },
    dispatch(method:"acceptance.resources"|"acceptance.prepare"|"acceptance.capture",input:{run:string;authorization:string;operation:string;request:string},control:AmountControl) {
      return client.amountControlled(method,input,control,{phase:"dispatch",method,...input,deadline:control.deadline},receive);
    }}
}
function encode(value: unknown): unknown {
  if (value instanceof Error) return { kind: "Error", name: value.name, message: value.message,
    ...("cause" in value ? { cause: encode(value.cause) } : {}) }
  return { kind: "value", value: value === undefined ? null : value, is_undefined: value === undefined }
}
function decode(value: any): unknown {
  if (value?.kind === "Error") { const error = new Error(value.message, "cause" in value ? {cause: decode(value.cause)} : undefined); error.name = value.name; return error }
  return value?.is_undefined ? undefined : value?.value
}
function requests(port: Port) {
  const state = { closed: false }
  const pending = new Map<string, { resolve(value: unknown): void; reject(value: unknown): void; dispose(): void; controlled?: boolean; receive?:(value:unknown,origin:unknown,secondary?:{value:unknown})=>unknown; cancel?(value: unknown): void }>()
  function settle(id: string, error: boolean, value: unknown) {
    const request = pending.get(id)
    if (!request) return
    pending.delete(id); request.dispose()
    if (error) request.reject(value); else request.resolve(value)
  }
  function response({ data }: { data: unknown }) {
    if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string") return
    if ("rejection" in data && pending.get(data.id)?.controlled) { const request=pending.get(data.id)!;const value=decode(data.rejection);settle(data.id, true, request.receive ? request.receive(value,"rejectionOrigin" in data?data.rejectionOrigin:"guard","secondaryRejection" in data?{value:decode(data.secondaryRejection)}:undefined):value); return }
    if ("error" in data) { settle(data.id, true, new Error(hostError(data.error))); return }
    settle(data.id, false, "result" in data ? data.result : undefined)
  }
  let removeClose: unknown
  function close() {
    if (state.closed) return
    state.closed = true
    for (const [id, request] of pending) {
      if (request.cancel) request.cancel(Error("LOGINOM_HOST_CLOSED")); else settle(id, true, Error("LOGINOM_HOST_CLOSED"))
    }
    port.off?.("message", response); if (typeof removeClose === "function") removeClose()
  }
  port.on("message", response)
  removeClose = port.onClose?.(close)
  if (state.closed && typeof removeClose === "function") removeClose()
  port.start()
  function send(method: string, input: unknown, timeout: number, control?: Control, cancellation?: object, receive?:(value:unknown,origin:unknown,secondary?:{value:unknown})=>unknown) {
    if (state.closed) return Promise.reject(Error("LOGINOM_HOST_CLOSED"))
    if (control) {
      control.signal.throwIfAborted()
      if (!Number.isSafeInteger(control.deadline) || Date.now() >= control.deadline)
        return Promise.reject(Error("LOGINOM_PRE_READY_READ_EXPIRED"))
      timeout = control.deadline - Date.now()
    }
    const id = randomUUID()
    return new Promise<unknown>((resolve, reject) => {
      let dispatched = false, cancelled=false
      function cancel(value: unknown) {
        if (!pending.has(id) || cancelled && !state.closed) return
        if(receive && dispatched && !state.closed){receive(value,"control");cancelled=true;}
        if (control && dispatched) {
          try { port.postMessage({ id: randomUUID(), method: "readonly.preReady.cancel",
            input: { ...(cancellation ?? input as object), requestId: id, rejection: encode(value) } }) } catch (secondary) { if(receive)receive(secondary,"await") }
        }
        if(receive && dispatched && !state.closed)return
        settle(id, true, receive?receive(value,"await"):value)
      }
      const abort = () => cancel(control!.signal.reason)
      const timer = setTimeout(() => cancel(Error(control ? "LOGINOM_PRE_READY_READ_EXPIRED" : "LOGINOM_HOST_TIMEOUT")), timeout)
      pending.set(id, {resolve, reject, ...(receive?{receive}:{}), ...(control ? {cancel,controlled:true} : {}), dispose() { clearTimeout(timer); control?.signal.removeEventListener("abort", abort) }})
      control?.signal.addEventListener("abort", abort, {once: true})
      if (control?.signal.aborted) { cancel(control.signal.reason); return }
      try { dispatched = true; port.postMessage({id, method, input, ...(control ? {deadline: control.deadline} : {})}) }
      catch (error) { if (control) settle(id, true, receive?receive(error,"await"):error); close() }
    })
  }
  return { request: (method: string, input: unknown, timeout = 180_000) => send(method, input, timeout),
    startControlled: (input: unknown, control:Control, cancellation:object) => send("start", input, 0, control, cancellation),
    amountControlled:(method:"start"|"acquire"|"acceptance.resources"|"acceptance.prepare"|"acceptance.capture",input:unknown,control:Control,cancellation:object,receive:(value:unknown,origin:unknown,secondary?:{value:unknown})=>unknown)=>send(method,input,0,control,cancellation,receive),
    controlled: (input: {run:string;authorization:string}, control:Control) => send("readonly.preReady", input, 0, control), close }
}
