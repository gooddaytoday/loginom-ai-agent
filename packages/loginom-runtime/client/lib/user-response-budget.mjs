import {USER_PREVIEW_WIRE_BUDGET} from './user-preview-budget.mjs';

export const JAVASCRIPT_DESCRIBE_WIRE_BUDGET=20000;
const textReply=value=>({content:[{type:'text',text:JSON.stringify(value)}]});

function describeRecovery(description,modes) {
 const requests=[],undeliverable=[];
 for(const node of description?.node_types??[]){
  const selected=modes?.filter(mode=>node.modes.includes(mode));
  const args={node_types:[node.type],...(selected?.length?{modes:selected}:{})};
  const single=textReply({actions:[],node_types:[node],session_manifest:description.session_manifest});
  // Suggest only requests whose complete cards already fit individually. Never
  // send a model back to the same oversized single-card request.
  if(Buffer.byteLength(JSON.stringify(single),'utf8')>USER_PREVIEW_WIRE_BUDGET)undeliverable.push(args);
  else requests.push(args);
 }
 for(const action of description?.actions??[]){
  const args={action_keys:[action.action_key]};
  const single=textReply({actions:[action],node_types:[],session_manifest:description.session_manifest});
  if(Buffer.byteLength(JSON.stringify(single),'utf8')>USER_PREVIEW_WIRE_BUDGET)undeliverable.push(args);
  else requests.push(args);
 }
 return {...(requests.length?{tool:'dock_action_describe',arguments:requests[0],remaining_requests:requests.slice(1)}:{}),
  ...(undeliverable.length?{undeliverable_requests:undeliverable}:{}),
  instruction:requests.length
   ?'Run arguments and remaining_requests separately, preserving modes. Do not recombine. Earlier cards remain valid. Report undeliverable_requests; never retry them or guess rules.'
   :'Report this description delivery limitation. No smaller verified request is available; do not repeat the oversized request or guess missing schema or rules.'};
}

// The consumer reads joined text, while MCP also transports its escaped copy
// and structuredContent. Check the final reply without changing any receipt.
export function boundedUserToolReply(reply,{tool,operationId,modes}={}) {
 const text=reply.content.flatMap(block=>block.type==='text'?[block.text]:[]).join('\n\n');
 const wireBytes=Buffer.byteLength(JSON.stringify(reply),'utf8');
 const textBytes=Buffer.byteLength(text,'utf8'),lines=text.split('\n').length;
 const description=tool==='dock_action_describe'&&reply.isError!==true?JSON.parse(reply.content[0].text):null;
 const cards=Array.isArray(description?.node_types)?description.node_types.filter(node=>node.type==='programming.javascript'):[];
 const cardTooLarge=cards.some(node=>Buffer.byteLength(JSON.stringify(textReply({actions:[],node_types:[node],
   session_manifest:description.session_manifest})),'utf8')>JAVASCRIPT_DESCRIBE_WIRE_BUDGET);
 if(!cardTooLarge&&wireBytes<=USER_PREVIEW_WIRE_BUDGET&&textBytes<=50*1024&&lines<=2000)return reply;
 const id=reply.structuredContent?.operation_id??reply.structuredContent?.owner?.operation_id??operationId;
 const retained=typeof id==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(id)?id:null;
 const describe=tool==='dock_action_describe';
 const refusal={result_delivery:'refused',error:{code:'USER_RESPONSE_BUDGET',
   message:cardTooLarge?'The complete JavaScript description exceeds its own delivery budget. Report this limitation; smaller batches cannot deliver this card and its schema/rules were not truncated.'
     :describe?'Description exceeds the delivery budget; no cards delivered. Follow next_step. Schemas and rules are intact.'
     :'The complete reply exceeds the delivery budget and was not delivered. Original operation receipts remain retained; inspect them before any correction and never repeat uncertain mutations.',
   scope:cardTooLarge?'javascript_description':'whole_response'},
   ...(retained?{original_operation_id:retained}:{}),
   next_step:cardTooLarge?{instruction:'Report the JavaScript description delivery limitation. Do not guess missing schema or rules or repeat the same oversized single-card request.'}
     :describe?describeRecovery(description,modes)
     :retained?{tool:'dock_operation_inspect',arguments:{operation_id:retained},instruction:tool==='dock_prepare'
       ?'Read the retained preparation receipt without the input artifact list or knowledge bundle. Do not repeat preparation to retrieve node cards; request selected node_types and modes through dock_action_describe.'
       :'Inspect the original operation. A local full receipt is not model delivery; obtain smaller analytical output only after effects are reconciled.'}
       :{instruction:'Request a smaller reply. This delivery refusal does not establish the state of any browser effect.'}};
 return {...textReply(refusal),isError:true};
}
