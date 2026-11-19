import {createRedactor} from './redact.mjs';

// Public failures use fixed labels. Original causes belong only in the
// redacted private execution journal, never in a model-facing receipt.
export function browserFailureCategory(response){
 const text=(response?.content??[]).filter(b=>b.type==='text'&&typeof b.text==='string').map(b=>b.text.slice(0,16384)).join('\n');
 const known=[
  ['UPLOAD_DEBUG_DIALOG',/\["confirm" dialog with message "Assert failed: at LoadView\.CorrectWindowPosition \(https?:\/\/[^\s")]+\/app\/bg\/filestorage\/LoadView\.js:94:23\)\n\nBreak into debugger\?"\]/],
  ['LOGINOM_DISCONNECTED',/Loginom connection is disconnected; (?:restore the original session|original session recovery unverified)/],
  ['LOGINOM_IDENTITY_CHANGED',/Loginom account or document changed; prepare the workspace again/],
  ['BROWSER_CLOSED',/Target page, context or browser has been closed|Browser has been closed|browser is closed/i],
  ['EXECUTION_CONTEXT_DESTROYED',/Execution context was destroyed|Cannot find context with specified id/i],
  ['BROWSER_CONNECTION_CLOSED',/Connection closed|Target closed|WebSocket is not open/i],
  ['BROWSER_TIMEOUT',/TimeoutError|Timeout \d+ms exceeded|Request timed out/i],
  ['BROWSER_SCRIPT_ERROR',/\b(?:ReferenceError|TypeError|SyntaxError|RangeError)\b/],
  ['BROWSER_RECEIPT_CAPACITY',/Browser receipt capacity reached/],
 ];
 return known.find(([,pattern])=>pattern.test(text))?.[0]??'UNCLASSIFIED_BROWSER_ERROR';
}

// Only exact runtime-owned reasons and exception names may survive redaction.
export function browserFailureDetails(response){
 const text=(response?.content??[]).filter(b=>b.type==='text'&&typeof b.text==='string').map(b=>b.text.slice(0,16384)).join('\n');
 const reason=text.match(/Loginom connection is disconnected; original session recovery unverified \((owner|dialog|attempted|capacity|awaiting_original_attempt)\)/)?.[1];
 if(reason)return 'reason='+reason;
 const exception=text.match(/\b(ReferenceError|TypeError|SyntaxError|RangeError)\b/)?.[1];
 return exception?'exception='+exception:null;
}

// Private journals retain the original fixed failure before cancellation can
// replace it with uncertainty. Original causes are opt-in for the upload
// journal or the path-masked private download diagnostic.
export function operationFailureDiagnostic(error,{uploadCause=false,downloadCause=false,redactor}={}){
 const message=String(error?.message??'');
 const pinned=/^Pinned browser capability call failed \[([A-Z][A-Z0-9_]{1,100})\](?: \((reason=(?:owner|dialog|attempted|capacity|awaiting_original_attempt)|exception=(?:ReferenceError|TypeError|SyntaxError|RangeError))\))?$/.exec(message);
 const code=/^[A-Z][A-Z0-9_]{1,100}$/.test(error?.code??'')?error.code
  :/^[A-Z][A-Z0-9_]{1,100}$/.test(message)?message:'UNCLASSIFIED_ERROR';
 const diagnostic={code:pinned?.[1]??code,detail:pinned?.[2]??null,
  exception:['Error','AbortError','TypeError','ReferenceError','SyntaxError','RangeError'].includes(error?.name)?error.name:'Error'};
 if(downloadCause)return {...diagnostic,...downloadFailureDiagnostic({
  name:String(error?.name??'Error'),message:String(error?.message??error),stack:error?.stack??null,
  original_message:typeof error?.cause?.message==='string'?error.cause.message:null,
  original_stack:typeof error?.cause?.stack==='string'?error.cause.stack:null,
 },redactor)};
 if(!uploadCause)return diagnostic;
 return {...diagnostic,name:String(error?.name??'Error').slice(0,80),
  message:String(error?.message??error).slice(0,2048),
  original_message:typeof error?.cause?.message==='string'?error.cause.message.slice(0,2048):null};
}

// Redact BEFORE bounding: truncating a secret first defeats exact-value
// masking. Omit complete URLs and local paths, including paths with spaces.
export function downloadFailureDiagnostic(value,redactor=createRedactor()){
 const cleaned=redactor.redact(value);
 const clean=item=>{
  if(typeof item==='string')return redactor.text(item)
   .replace(/(?:https?|file|blob):[^\s<>"'`]+/gi,'[url]')
   .replace(/[A-Za-z]:[\\/][^\r\n"']*|\\\\[^\r\n"']*/g,'[path]')
   .replace(/(["'])\/[^\r\n]*?\1/g,'[path]')
   .replace(/\/(?:[^\s<>"'`()]+\/)*[^\s<>"'`()]+/g,'[path]')
   .split('\n').slice(0,6).join('\n').slice(0,2048);
  if(Array.isArray(item))return item.slice(0,3).map(clean);
  if(item&&typeof item==='object')return Object.fromEntries(Object.entries(item).map(([key,v])=>[key,clean(v)]));
  return item;
 };
 return clean(cleaned);
}
