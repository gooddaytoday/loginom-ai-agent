import {createRedactor} from './redact.mjs';

const redact=createRedactor();
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const guid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export function nativeErrorText(message,redactor=redact) {
  return redactor.text(message)
    .replace(/\b[a-z][a-z0-9+.-]*(?::\/\/|%3a%2f%2f)[^\s<>"'`]+/gi,'[URL скрыт]')
    .replace(/(["'`])(?:[a-z]:[\\/]|\\\\|~?\/)[^\r\n]*?\1/gi,'$1[путь скрыт]$1')
    .replace(/(^|[\s'"`(=:\[])(?:[a-z]:[\\/]|\\\\|~?\/)[^\r\n<>"`|;\]]+/gi,'$1[путь скрыт]')
    .replace(/\b(?:token|secret|pwd|sessionid|signature)\b["']?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}&]+)/gi,'[секрет скрыт]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[секрет скрыт]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'')
    .trim().slice(0,1000)||'[сообщение скрыто]';
}

export function nodeFailureMetadata(delivered) {
  if(delivered.state==='running'||!['FAILED','AMBIGUOUS','NOT_APPLIED'].includes(delivered.status))return undefined;
  const native=delivered.error?.native;
  if(delivered.error?.code!=='NODE_EXECUTION_FAILED'||typeof native?.message!=='string')return undefined;
  if(['loginom_post_launch_error_toast','native_group_error_details'].includes(native.source))
    return {kind:'post_launch_message',message:native.message};
  if(!['loginom_error_toast','native_child_error_details'].includes(native.source))return undefined;
  const {document_id,workflow_id,node_id}=native.node??{};
  const node=id(document_id)&&id(workflow_id)&&typeof node_id==='string'&&guid.test(node_id.replace(/^\{(.+)\}$/,'$1'))
    ?{document_id,workflow_id,node_id}:undefined;
  return {kind:'node_failed',message:native.message,...(node?{node}:{})};
}
