import {createRedactor} from './redact.mjs';

const redact=createRedactor();
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const guid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export function nativeErrorText(message,redactor=redact) {
  return redactor.nativeText(message);
}

export function nativeFeedError(delivered,redactor) {
  if(delivered.state!=='settled'||!['FAILED','AMBIGUOUS','NOT_APPLIED'].includes(delivered.status))return undefined;
  const native=delivered.error?.native;
  if(delivered.error?.code!=='NODE_EXECUTION_FAILED'||typeof native?.message!=='string')return undefined;
  const error={code:delivered.error.code,message:nativeErrorText(native.message,redactor),source:'loginom'};
  if(native.source==='native_group_error_details'||native.source==='loginom_post_launch_error_toast'&&native.attribution==='own_action_wait')
    return {...error,attribution:'after_launch'};
  if(!['loginom_error_toast','native_child_error_details'].includes(native.source))return undefined;
  const {document_id,workflow_id,node_id}=native.node??{};
  const node=id(document_id)&&id(workflow_id)&&typeof node_id==='string'&&guid.test(node_id.replace(/^\{(.+)\}$/,'$1'))
    ?{document_id,workflow_id,node_id}:undefined;
  return {...error,attribution:'verified_node',...(node?{node}:{})};
}
