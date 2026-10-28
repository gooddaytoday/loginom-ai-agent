// Fixed diagnostic labels only: browser errors can embed page text, URLs,
// script sources or credentials. Never forward those strings into model/logs.
export function browserFailureCategory(response){
 const text=(response?.content??[]).filter(b=>b.type==='text'&&typeof b.text==='string').map(b=>b.text.slice(0,16384)).join('\n');
 const known=[
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
// replace it with upload uncertainty. Never retain raw browser text or stacks.
export function operationFailureDiagnostic(error){
 const message=String(error?.message??'');
 const pinned=/^Pinned browser capability call failed \[([A-Z][A-Z0-9_]{1,100})\](?: \((reason=(?:owner|dialog|attempted|capacity|awaiting_original_attempt)|exception=(?:ReferenceError|TypeError|SyntaxError|RangeError))\))?$/.exec(message);
 const code=/^[A-Z][A-Z0-9_]{1,100}$/.test(error?.code??'')?error.code
  :/^[A-Z][A-Z0-9_]{1,100}$/.test(message)?message:'UNCLASSIFIED_ERROR';
 return {code:pinned?.[1]??code,detail:pinned?.[2]??null,
  exception:['Error','AbortError','TypeError','ReferenceError','SyntaxError','RangeError'].includes(error?.name)?error.name:'Error'};
}
