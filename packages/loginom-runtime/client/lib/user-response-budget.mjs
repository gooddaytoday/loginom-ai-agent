import {USER_PREVIEW_WIRE_BUDGET} from './user-preview-budget.mjs';

export const JAVASCRIPT_DESCRIBE_WIRE_BUDGET=20000;
const textReply=value=>({content:[{type:'text',text:JSON.stringify(value)}]});

// The consumer reads joined text, while MCP also transports its escaped copy
// and structuredContent. Check the final reply without changing any receipt.
export function boundedUserToolReply(reply,{tool,operationId}={}) {
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
     :describe?'The complete description exceeds the delivery budget. Request fewer node_types and saving action_keys separately; schemas and rules were not truncated.'
     :'The complete reply exceeds the delivery budget and was not delivered. Original operation receipts remain retained; inspect them before any correction and never repeat uncertain mutations.',
   scope:cardTooLarge?'javascript_description':'whole_response'},
   ...(retained?{original_operation_id:retained}:{}),
   next_step:cardTooLarge?{instruction:'Report the JavaScript description delivery limitation. Do not guess missing schema or rules or repeat the same oversized single-card request.'}
     :describe?{tool:'dock_action_describe',instruction:'Request one selected node type; request saving actions separately.'}
     :retained?{tool:'dock_operation_inspect',arguments:{operation_id:retained},instruction:'Inspect the original operation. A local full receipt is not model delivery; obtain smaller analytical output only after effects are reconciled.'}
       :{instruction:'Request a smaller reply. This delivery refusal does not establish the state of any browser effect.'}};
 return {...textReply(refusal),isError:true};
}
