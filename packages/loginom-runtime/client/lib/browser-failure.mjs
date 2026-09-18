// Fixed diagnostic labels only: browser errors can embed page text, URLs,
// script sources or credentials. Never forward those strings into model/logs.
export function browserFailureCategory(response){
 const text=(response?.content??[]).filter(b=>b.type==='text'&&typeof b.text==='string').map(b=>b.text.slice(0,16384)).join('\n');
 const known=[
  ['LOGINOM_DISCONNECTED',/Loginom connection is disconnected; restore the original session/],
  ['LOGINOM_IDENTITY_CHANGED',/Loginom account or document changed; prepare the workspace again/],
  ['BROWSER_CLOSED',/Target page, context or browser has been closed|Browser has been closed|browser is closed/i],
  ['EXECUTION_CONTEXT_DESTROYED',/Execution context was destroyed|Cannot find context with specified id/i],
  ['BROWSER_CONNECTION_CLOSED',/Connection closed|Target closed|WebSocket is not open/i],
  ['BROWSER_TIMEOUT',/TimeoutError|Timeout \d+ms exceeded|Request timed out/i],
  ['BROWSER_RECEIPT_CAPACITY',/Browser receipt capacity reached/],
 ];
 return known.find(([,pattern])=>pattern.test(text))?.[0]??'UNCLASSIFIED_BROWSER_ERROR';
}
