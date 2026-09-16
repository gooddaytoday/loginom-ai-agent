import {compactNodeResult} from './user-results.mjs';

// Check the actual MCP envelope, including its JSON-escaped text copy. Never
// truncate exact_table or turn full coverage into an ordinary sample on overflow.
// The runtime's completed mutation checkpoint is retained for inspection.
export function nodeResultReply(result,{userProfile=false}={}) {
 const delivered=userProfile?compactNodeResult(result):result;
 const reply={content:[{type:'text',text:JSON.stringify(delivered)}],structuredContent:delivered};
 const ports=result.outcome?.output?.output?.ports??[];
 if(ports.some(p=>p.exact_table!==undefined)&&Buffer.byteLength(JSON.stringify(reply),'utf8')>1048576) {
  const error=Error('Exact full result exceeds the 1 MiB serialized MCP limit; no table was delivered. The original node checkpoint is retained.');
  error.code='EXACT_FULL_SERIALIZATION_LIMIT';throw error;
 }
 return reply;
}
