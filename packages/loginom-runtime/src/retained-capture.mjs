// Private managed/bridge ABI. Handles never enter an IPC or model operand.
export function retainCaptureOwner(state, binding, resource) {
  const startup = state.captureStartupBinding, owner = state.startupOwner, session = state.session;
  const retained = Object.freeze({state, startup, owner, session, binding, resource,
    context:startup?.context, page:startup?.page, directory:session?.directory,
    sessionId:session?.metadata.sessionId, clientRevision:session?.metadata.clientRevision,
    runtime:Object.seal({bridge:undefined,client:undefined})});
  assertCaptureOwner(retained);
  return retained;
}

export function bindCaptureRuntime(retained, bridge, client) {
  assertCaptureOwner(retained);
  if(Object.isFrozen(retained.runtime) || !bridge || !client
      || retained.state.bridge!==bridge || retained.state.client!==client)
    throw Error('LOGINOM_CAPTURE_RETAINED_OWNER_REFUSED');
  retained.runtime.bridge=bridge; retained.runtime.client=client;
  Object.freeze(retained.runtime);
}

export function assertCaptureOwner(retained) {
  const {state, startup, owner, session, binding, resource} = retained;
  if (!startup || !owner || !session || !binding || !Object.isFrozen(binding)
      || !resource || !Object.isFrozen(resource) || !/^[a-f0-9]{64}$/.test(resource.sha256)
      || state.captureStartupBinding !== startup || state.startupOwner !== owner || state.session !== session
      || startup.owner !== owner || startup.id !== owner.id || !startup.id
      || !retained.context || !retained.page || owner.context !== retained.context || owner.page !== retained.page
      || typeof retained.context.pages!=='function' || typeof retained.page.isClosed!=='function'
      || retained.page.isClosed() || retained.context.pages().length!==1 || retained.context.pages()[0]!==retained.page
      || startup.context !== retained.context || startup.page !== retained.page
      || startup.account !== owner.account || startup.account !== binding.account
      || startup.origin !== owner.origin || startup.generation !== binding.generation || startup.chat !== binding.chat
      || owner.generation !== binding.generation || owner.chat !== binding.chat
      || binding.lease !== `${binding.owner}:${binding.run}` || !binding.admission
      || binding.session !== retained.sessionId || session.metadata.sessionId !== retained.sessionId
      || typeof retained.clientRevision!=='string' || !retained.clientRevision
      || session.metadata.clientRevision!==retained.clientRevision
      || session.directory !== retained.directory || owner.closed || owner.contextClosed || state.bridgeCleanup
      || Object.isFrozen(retained.runtime) && (state.bridge!==retained.runtime.bridge || state.client!==retained.runtime.client)
      || Date.now() >= binding.expires) throw Error('LOGINOM_CAPTURE_RETAINED_OWNER_REFUSED');
  return retained;
}

// Refuse getters, prototypes, non-JSON values and cycles before validators/IO.
export function captureData(value, seen = new Set()) {
  if (value === null || ['string','boolean'].includes(typeof value)) return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!value || typeof value !== 'object' || seen.has(value)
      || ![Object.prototype,Array.prototype,null].includes(Object.getPrototypeOf(value)))
    throw Error('LOGINOM_CAPTURE_RESULT_INVALID');
  if(Array.isArray(value)) {
    const keys=Reflect.ownKeys(value);
    if(keys.length!==value.length+1 || keys.some(key=>key!=='length' &&
        (typeof key!=='string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key)>=value.length)))
      throw Error('LOGINOM_CAPTURE_RESULT_INVALID');
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const field = Object.getOwnPropertyDescriptor(value,key);
    if (typeof key !== 'string' || !field.enumerable || !Object.hasOwn(field,'value'))
      throw Error('LOGINOM_CAPTURE_RESULT_INVALID');
    captureData(field.value,seen);
  }
  seen.delete(value);
}

export function capturePublication(retained, node, identity) {
  assertCaptureOwner(retained);
  const binding=retained.binding;
  if (node.request.document_id!==identity.document_id
      || node.request.workflow_ref.tab_tid!==identity.tab_tid
      || node.state.node.document_id!==identity.document_id
      || node.state.node.workflow_id!==node.request.workflow_ref.workflow_id
      || typeof node.state.node.node_id!=='string' || !node.state.node.node_id
      || node.signal.aborted || Date.now()>=node.deadline)
    throw Error('LOGINOM_CAPTURE_NODE_REFUSED');
  return Object.freeze({...identity,owner:binding.owner,run:binding.run,lease:binding.lease,
    generation:binding.generation,chat:binding.chat,admission:binding.admission,
    resource_path:retained.resource.path,resource_sha256:retained.resource.sha256,
    origin:retained.startup.origin,runtime_revision:retained.clientRevision,
    operation_id:node.request.operation_id,opening_operation_id:node.opening.receipt_id,
    workflow_id:node.request.workflow_ref.workflow_id,node_id:node.state.node.node_id,
    deadline:node.deadline,request_sha256:node.requestSha256,opening_sha256:node.openingSha256});
}

export function assertCapturePublication(receipt, publication) {
  captureData(receipt);
  if (!['DIAGNOSTIC_READ','NOT_APPLIED'].includes(receipt?.status)
      || receipt.effect_possible !== false || receipt.admission_confirmed !== false
      || receipt.settings_applied !== false || !receipt.publication || !receipt.root
      || typeof receipt.root!=='object' || Array.isArray(receipt.root)
      || ['document_id','workflow_id','node_id','session_id','account','package_path'].some(key=>
        receipt.root[key]!==publication[key])
      || Object.keys(receipt.publication).length !== Object.keys(publication).length
      || Object.keys(publication).some(key=>receipt.publication[key] !== publication[key]))
    throw Error('LOGINOM_CAPTURE_RESULT_INVALID');
}

export function freezeCaptureResult(value) {
  // Only the validated JSON result is frozen; Page/owner/native handles are not.
  if(value && typeof value==='object') {
    for(const field of Object.values(value))freezeCaptureResult(field);
    Object.freeze(value);
  }
  return value;
}
