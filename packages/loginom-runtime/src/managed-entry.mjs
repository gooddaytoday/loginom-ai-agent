// Register before linking the managed implementation. Exact channel objects only.
const pending=[];let receive,draining=false;
function drain(){
 if(!receive||draining||process.connected===false)return;
 draining=true;
 try{while(pending.length&&process.connected!==false)receive(pending.shift())}finally{draining=false}
}
process.on('message',message=>{pending.push(message);drain()});
// Fixed module, never selected by input. Original handler creates its own task/control.
const implementation=await import('./managed-session.mjs');
receive=implementation.receiveManagedMessage;
drain();
