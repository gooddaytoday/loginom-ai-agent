import {compactNodeResult} from './user-results.mjs';
import {boundedUserToolReply} from './user-response-budget.mjs';
const nodeReply=(value,omitPorts)=>({content:[{type:'text',text:JSON.stringify(value)}],
 structuredContent:omitPorts&&value.output?.ports!==undefined?{...value,
  output:Object.fromEntries(Object.entries(value.output).filter(([key])=>key!=='ports'))}:value});

// Check the actual MCP envelope, including its JSON-escaped text copy. Never
// truncate exact_table or turn full coverage into an ordinary sample on overflow.
// The runtime's completed mutation checkpoint is retained for inspection.
export function nodeResultReply(result,{userProfile=false,tool}={}) {
 // The model reads content; structuredContent retains control fields without
 // transporting a second table. Other tools and diagnostic replies stay intact.
 const omitPorts=userProfile&&tool==='dock_node_wait';
 const delivered=['source','context'].includes(result?.kind)?result:userProfile?compactNodeResult(result,
  {wireSize:value=>Buffer.byteLength(JSON.stringify(nodeReply(value,omitPorts)),'utf8')}):result;
 const reply=nodeReply(delivered,omitPorts);
 const ports=result.outcome?.output?.output?.ports??[];
 if(ports.some(p=>p.exact_table!==undefined)&&Buffer.byteLength(JSON.stringify(reply),'utf8')>1048576) {
  const error=Error('Exact full result exceeds the 1 MiB serialized MCP limit; no table was delivered. The original node checkpoint is retained.');
  error.code='EXACT_FULL_SERIALIZATION_LIMIT';throw error;
 }
 return userProfile?boundedUserToolReply(reply):reply;
}
