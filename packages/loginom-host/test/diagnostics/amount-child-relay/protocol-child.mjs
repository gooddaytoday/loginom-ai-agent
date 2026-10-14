import {appendFileSync} from 'node:fs';import{join}from'node:path';let root,active;
const encoded=value=>({kind:'value',value:value===undefined?null:value,is_undefined:value===undefined});
process.on('message',m=>{
 if(m.operation==='start'){root=m.input.stateDir;process.send({id:m.id,result:{protocol:1,ready:true,generation:m.input.generation,chat:m.input.chat}});return}
 if(m.operation==='close'){process.send({id:m.id,result:{closed:true}},()=>process.disconnect());return}
 if(m.operation==='acceptance.capture'){
  active=m;appendFileSync(join(root,'trace.jsonl'),JSON.stringify({capture:m})+'\n');
  if(root.includes('unknown'))process.send({id:m.id,result:'foreign',amountCaptureReceipt:{}});
  if(root.includes('immediate'))reply(false);
  return;
 }
 if(m.operation==='readonly.preReady.cancel'){
  appendFileSync(join(root,'trace.jsonl'),JSON.stringify({cancel:m})+'\n');
  setTimeout(()=>reply(root.includes('fulfilled')),80);
 }
});
function reply(fulfilled){const frame=active.amountCapture,amountCaptureReceipt={frame,settled:true,evidenceSettled:false,cleanupSettled:false,acknowledged:false};process.send({id:active.id,...(fulfilled?{result:{cleanupComplete:true}}:{rejection:encoded(false),rejectionOrigin:'await'}),amountCaptureReceipt})}
