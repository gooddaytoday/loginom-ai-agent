import {USER_PREVIEW_WIRE_BUDGET} from './user-preview-budget.mjs';

export const JAVASCRIPT_DESCRIBE_WIRE_BUDGET=20000;
const textReply=value=>({content:[{type:'text',text:JSON.stringify(value)}]});

const fitsDescribeBudget=(description,value)=>Buffer.byteLength(JSON.stringify(textReply({...description,...value})),'utf8')<=USER_PREVIEW_WIRE_BUDGET;

// Group complete cards first-fit into ordered requests that each fit as one
// reply. A batch's modes are the requested modes of its cards, so each card
// keeps exactly the modes it was refused with.
function describeRecovery(description,modes) {
 const batches=[],undeliverable=[],actionRequests=[];
 let fitting=0;
 for(const node of description?.node_types??[]){
  const selected=modes?.filter(mode=>node.modes.includes(mode))??[];
  const args={node_types:[node.type],...(selected.length?{modes:selected}:{})};
  // Never send a model back to the same oversized single-card request.
  if(!fitsDescribeBudget(description,{actions:[],node_types:[node]})){undeliverable.push(args);continue;}
  fitting++;
  const batch=batches.find(batch=>(batch.modes===undefined)===(selected.length===0)
   &&fitsDescribeBudget(description,{actions:[],node_types:[...batch.cards,node]}));
  if(batch){
   batch.cards.push(node);batch.node_types.push(node.type);
   if(selected.length)batch.modes=modes.filter(mode=>batch.modes.includes(mode)||selected.includes(mode));
  }else batches.push({cards:[node],node_types:[node.type],...(selected.length?{modes:[...selected]}:{})});
 }
 for(const action of description?.actions??[]){
  const args={action_keys:[action.action_key]};
  if(fitsDescribeBudget(description,{actions:[action],node_types:[]}))actionRequests.push(args);
  else undeliverable.push(args);
 }
 const requests=[...batches.map(({node_types,modes})=>({node_types,...(modes?{modes}:{})})),...actionRequests];
 return {...(requests.length?{tool:'dock_action_describe',arguments:requests[0],remaining_requests:requests.slice(1)}:{}),
  ...(undeliverable.length?{undeliverable_requests:undeliverable}:{}),
  instruction:requests.length
   ?`${fitting>1?`The ${fitting} deliverable node cards are grouped into ${batches.length} node request${batches.length===1?'':'s'} that each fit one reply. `:''}Run arguments, then each remaining_requests entry exactly as given, preserving modes. Do not regroup or repeat the refused request. Earlier cards remain valid. Report undeliverable_requests; never retry them or guess rules.`
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
 const describe=tool==='dock_action_describe',recovery=describe&&!cardTooLarge?describeRecovery(description,modes):null;
 const refusal={result_delivery:'refused',error:{code:'USER_RESPONSE_BUDGET',
   message:cardTooLarge?'The complete JavaScript description exceeds its own delivery budget. Report this limitation; smaller batches cannot deliver this card and its schema/rules were not truncated.'
     :describe?(recovery.tool?'Description exceeds the delivery budget; no cards delivered. next_step groups the cards into requests that fit. Schemas and rules are intact.'
       :'Description exceeds the delivery budget; no cards delivered. Schemas and rules are intact.')
     :'The complete reply exceeds the delivery budget and was not delivered. Original operation receipts remain retained; inspect them before any correction and never repeat uncertain mutations.',
   scope:cardTooLarge?'javascript_description':'whole_response'},
   ...(retained?{original_operation_id:retained}:{}),
   next_step:cardTooLarge?{instruction:'Report the JavaScript description delivery limitation. Do not guess missing schema or rules or repeat the same oversized single-card request.'}
     :describe?recovery
     :retained?{tool:'dock_operation_inspect',arguments:{operation_id:retained},instruction:tool==='dock_prepare'
       ?'Read the retained preparation receipt without the input artifact list or knowledge bundle. Do not repeat preparation to retrieve node cards; request selected node_types and modes through dock_action_describe.'
       :'Inspect the original operation. A local full receipt is not model delivery; obtain smaller analytical output only after effects are reconciled.'}
       :{instruction:'Request a smaller reply. This delivery refusal does not establish the state of any browser effect.'}};
 return {...textReply(refusal),isError:true};
}
