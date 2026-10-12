// Internal fixed-read ABI; original references are captured by managed startup.
export function assertPreReadyOwner(retained) {
  if(!retained || !Object.isFrozen(retained) || retained.state.preReadyOwner!==retained
      || retained.state.readonlyBinding!==retained)throw Error('LOGINOM_PRE_READY_READ_REFUSED');
  const {state,startup,owner,session}=retained;
  if(!startup || !owner || !session || !retained.bridge || !retained.client
      || state.startupBinding!==startup || state.startupOwner!==owner || state.session!==session
      || state.bridge!==retained.bridge || state.client!==retained.client
      || retained.bridge.readPreReady!==retained.reader
      || startup.owner!==owner || !startup.id || startup.id!==owner.id
      || !startup.page || !startup.context || startup.page!==owner.page || startup.context!==owner.context
      || startup.account!==owner.account || startup.origin!==owner.origin
      || startup.generation!==owner.generation || startup.chat!==owner.chat
      || !Number.isSafeInteger(startup.generation) || typeof startup.chat!=='string'
      || startup.page.isClosed() || startup.context.pages().length!==1 || startup.context.pages()[0]!==startup.page
      || session.metadata!==retained.metadata || session.directory!==retained.directory
      || !retained.sessionId || session.metadata.sessionId!==retained.sessionId
      || owner.closed || owner.contextClosed || state.closing || state.bridgeCleanup
      || Object.hasOwn(state,'preReadyReadRefusal') || Object.hasOwn(state,'startupFailure') || state.closeFailure!==undefined)
    throw Error('LOGINOM_PRE_READY_READ_REFUSED');
  return retained;
}
export function qualifyPreReadyRead(retained,{signal,deadline}={}) {
  assertPreReadyOwner(retained);
  if(!signal || typeof signal.throwIfAborted!=='function' || !Number.isSafeInteger(deadline))
    throw Error('LOGINOM_PRE_READY_READ_REFUSED');
  if(retained.state.controller?.signal!==signal)throw Error('LOGINOM_PRE_READY_READ_REFUSED');
  signal.throwIfAborted();
  if(Date.now()>=deadline)throw Error('LOGINOM_PRE_READY_READ_EXPIRED');
  // Only the known initial, never-attempted preparation phase qualifies.
  if(retained.metadata.workspaceReady===true || retained.metadata.workspacePreparation!==undefined
      || retained.metadata.storageBinding!==undefined)
    throw Error('LOGINOM_PRE_READY_READ_REFUSED');
  return retained;
}

export function decodePreReadyRejection(value) {
  if(value?.kind==='Error'){const error=new Error(value.message,'cause' in value?{cause:decodePreReadyRejection(value.cause)}:undefined);error.name=value.name;return error}
  return value?.is_undefined?undefined:value?.value;
}
