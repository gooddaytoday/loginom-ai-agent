import {appendFileSync}from'node:fs';
let mode,path;
process.on('message',m=>{
 if(m.operation==='start'){mode=m.input.connection.username;path=m.input.stateDir+'/close-events.jsonl';process.send({id:m.id,result:{ready:true,protocol:1,generation:m.input.generation,chat:m.input.chat}});return}
 if(m.operation==='close'){
  appendFileSync(path,JSON.stringify({id:m.id,at:Date.now(),operation:m.operation})+'\n');
  if(mode==='lost'){process.disconnect();return}
  if(mode==='refused'){process.send({id:m.id,result:{closed:false}});return}
  const reply=()=>process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
  if(mode==='late')setTimeout(reply,6200);else reply();return
 }
 if(m.operation==='fixture.finish')process.disconnect();
});
