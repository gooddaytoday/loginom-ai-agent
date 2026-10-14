// Register before linking the managed implementation. Exact channel objects only.
let first,last,receive,draining=false;
function drain(){
 if(!receive||draining||process.connected===false)return;
 draining=true;
 try{while(first&&process.connected!==false){const item=first;first=item.next;if(!first)last=undefined;receive(item.message)}}finally{draining=false}
}
process.on('message',message=>{const item={message,next:undefined};if(last)last.next=item;else first=item;last=item;drain()});
// Fixed module, never selected by input. Original handler creates its own task/control.
const implementation=await import('./managed-session.mjs');
receive=implementation.receiveManagedMessage;
drain();
