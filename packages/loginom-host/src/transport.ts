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
// Fixed factory uses this one request registry on the existing IPC channel.
// Capture an owned acquire reply before other exposed port listeners can mutate
// its JSON object. This copy alone is not ownership; node-client holds provenance.
type OwnedRejection={primary?:{value:unknown};secondary?:{value:unknown}}
export function privateNodeHostTransport(port:Port) {
 const client=requests(port)
 return {request:client.request,close:client.close,requestOwnedAcquire:client.ownedAcquire}
}
// Only the closed FP launcher uses this internal fixed-method capability.
// Ordinary transport never accepts control/authority from a fourth argument.
export function privateFPTransport(port: Port) {
  const client = requests(port), consumed = new Set<string>()
  return {
    request: client.request, close: client.close,
    start(input: {protocol: 1; acceptanceCapture: {authorization: string; harness: "field-parameters-preservation-v1"}}, control: Control) {
      const {signal, deadline} = control
      signal.throwIfAborted()
      if (!Number.isSafeInteger(deadline) || Date.now() >= deadline) return Promise.reject(Error("LOGINOM_PRE_READY_READ_EXPIRED"))
      const authorization = input.acceptanceCapture.authorization, harness = input.acceptanceCapture.harness
      return client.startControlled(input, {signal, deadline}, {phase: "startup", authorization, harness, deadline})
    },
    readPreReady(input: { run: string; authorization: string }, control: Control) {
      const { signal, deadline } = control
      const { run, authorization } = input
      signal.throwIfAborted()
      if (!Number.isSafeInteger(deadline) || Date.now() >= deadline)
        return Promise.reject(Error("LOGINOM_PRE_READY_READ_EXPIRED"))
      if (consumed.has(run)) return Promise.reject(Error("LOGINOM_RECOVERY_REQUIRED"))
      consumed.add(run)
      return client.controlled({ run, authorization }, { signal, deadline })
    },
  }
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
    capture(input:{run:string;authorization:string;amountControl:{authorization:string;operation:string;request:string}},control:AmountControl) {
      return client.amountControlled("acceptance.capture",input,control,{phase:"capture",run:input.run,...input.amountControl,deadline:control.deadline},receive);
    },
    acquire(input:{run:string;session:string;amountControl:{authorization:string;operation:string;request:string}},control:AmountControl) {
      return client.amountControlled("acquire",input,control,{phase:"acquired",run:input.run,...input.amountControl,deadline:control.deadline},receive);
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
  const pending = new Map<string, { resolve(value: unknown): void; reject(value: unknown): void; dispose(): void; controlled?: boolean; primary?:{value:unknown}; ownedReply?:boolean;owned?:OwnedRejection; receive?:(value:unknown,origin:unknown,secondary?:{value:unknown})=>unknown; cancel?(value: unknown): void }>()
  function settle(id: string, error: boolean, value: unknown) {
    const request = pending.get(id)
    if (!request) return
    pending.delete(id); request.dispose()
    if (error) request.reject(value)
    else if(request.ownedReply) {
      try {request.resolve(JSON.parse(JSON.stringify(value)))}catch(error){request.reject(error)}
    }else request.resolve(value)
  }
  function response({ data }: { data: unknown }) {
    if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string") return
    const owned=pending.get(data.id)
    if(owned?.owned) {
      const rejected='rejection' in data || 'error' in data
      const value='rejection' in data?decode(data.rejection):'error' in data?new Error(hostError(data.error)):undefined
      if(rejected) {
        if(owned.owned.primary)owned.owned.secondary??={value};else owned.owned.primary={value}
      }
      if(owned.owned.primary){settle(data.id,true,owned.owned.primary.value);return}
    }
    if ("rejection" in data && pending.get(data.id)?.controlled) { const request=pending.get(data.id)!;const value=decode(data.rejection);settle(data.id, true, request.receive ? request.receive(value,"rejectionOrigin" in data?data.rejectionOrigin:"guard","secondaryRejection" in data?{value:decode(data.secondaryRejection)}:undefined):value); return }
    if ("error" in data) {
      const request=pending.get(data.id),error=new Error(hostError(data.error));
      settle(data.id,true,request?.primary&&request.receive?request.receive(error,"await"):error);return
    }
    const cancelled=pending.get(data.id)?.primary
    if(cancelled){settle(data.id,true,cancelled.value);return}
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
  function send(method: string, input: unknown, timeout: number, control?: Control, cancellation?: object, receive?:(value:unknown,origin:unknown,secondary?:{value:unknown})=>unknown,ownedReply=false,owned?:OwnedRejection) {
    if (state.closed) return Promise.reject(Error("LOGINOM_HOST_CLOSED"))
    if (control) {
      control.signal.throwIfAborted()
      if (!Number.isSafeInteger(control.deadline) || Date.now() >= control.deadline)
        return Promise.reject(Error("LOGINOM_PRE_READY_READ_EXPIRED"))
      timeout = control.deadline - Date.now()
    }
    const id = randomUUID()
    // This fixed sender owns the capture ID before dispatch. Never write into
    // caller input; cancellation targets this same request, not its successor.
    const amountCapture=receive && method==="acceptance.capture"
    const wireInput=amountCapture?{...(input as object),captureRequestId:id}:input
    return new Promise<unknown>((resolve, reject) => {
      let dispatched = false, cancelled=false
      function cancel(value: unknown) {
        if (!pending.has(id) || cancelled && !state.closed) return
        if (control && dispatched && !(amountCapture&&cancelled)) {
          try { port.postMessage({ id: randomUUID(), method: "readonly.preReady.cancel",
            input: { ...(cancellation ?? input as object), requestId: id, ...(amountCapture?{captureRequestId:id}:{}), rejection: encode(value) } }) } catch { /* Original refusal remains primary. */ }
        }
        if(owned && dispatched && !state.closed){owned.primary??={value};cancelled=true;return}
        if(owned){owned.primary??={value};settle(id,true,owned.primary.value);return}
        if(receive && dispatched && !state.closed){const reason=receive(value,"control");if(amountCapture)pending.get(id)!.primary??={value:reason};cancelled=true;return}
        settle(id, true, receive?receive(value,"await"):value)
      }
      const abort = () => cancel(control!.signal.reason)
      const timer = setTimeout(() => cancel(Error(control ? "LOGINOM_PRE_READY_READ_EXPIRED" : "LOGINOM_HOST_TIMEOUT")), timeout)
      pending.set(id, {resolve, reject, ...(ownedReply?{ownedReply:true,controlled:true}:{}),...(owned?{owned,cancel}:{}), ...(receive?{receive}:{}), ...(control ? {cancel,controlled:true} : {}), dispose() { clearTimeout(timer); control?.signal.removeEventListener("abort", abort) }})
      control?.signal.addEventListener("abort", abort, {once: true})
      if (control?.signal.aborted) { cancel(control.signal.reason); return }
      try { dispatched = true; port.postMessage({id, method, input:wireInput, ...(control ? {deadline: control.deadline} : {})}) }
      catch (error) { if (control) settle(id, true, error); close() }
    })
  }
  return { request: (method: string, input: unknown, timeout = 180_000) => send(method, input, timeout),
    ownedAcquire:(input:{run:string;session?:string;receiverPurpose:'union-acquired-service-v1';receiverPhase?:'current'},owned:OwnedRejection)=>send('acquire',input,180_000,undefined,undefined,undefined,true,owned),
    startControlled: (input: unknown, control:Control, cancellation:object) => send("start", input, 0, control, cancellation),
    amountControlled:(method:"start"|"acquire"|"acceptance.capture",input:unknown,control:Control,cancellation:object,receive:(value:unknown,origin:unknown,secondary?:{value:unknown})=>unknown)=>send(method,input,0,control,cancellation,receive),
    controlled: (input: {run:string;authorization:string}, control:Control) => send("readonly.preReady", input, 0, control), close }
}
