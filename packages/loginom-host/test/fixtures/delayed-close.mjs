// Actual child IPC; startup/browser/native services are explicit doubles.
process.on('message',m=>{
 if(m.operation==='start')process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
 if(m.operation==='close')setTimeout(()=>process.send({id:m.id,result:m.input??{closed:true}},()=>process.exit(0)),6000);
});
