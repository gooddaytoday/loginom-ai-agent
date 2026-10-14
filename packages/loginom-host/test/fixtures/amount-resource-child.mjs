let current;
process.on('message',m=>{
 if(m.operation==='start'){process.send({id:m.id,result:{protocol:1,ready:true,generation:m.input.generation,chat:m.input.chat}});return}
 if(m.operation==='close'){process.send({id:m.id,result:{closed:true}},()=>process.disconnect());return}
 if(m.operation==='acceptance.resources'){
  current=m;
  if(m.input!==undefined||typeof m.deadline!=='number'){process.send({id:m.id,rejection:{kind:'Error',name:'Error',message:'packet'}});return}
  setTimeout(()=>{if(current===m){current=undefined;process.send({id:m.id,result:{resourceReadComplete:true,fixture:true}})}},50);return
 }
 if(m.operation==='readonly.preReady.cancel'){
  if(!current||m.input.phase!=='amount'||m.input.requestId!==current.id||m.input.method!==current.operation||m.input.deadline!==current.deadline)return;
  const original=current;current=undefined;
  // Labelled peer terminal acknowledgement of the original held request.
  setTimeout(()=>process.send({id:original.id,rejection:m.input.rejection,rejectionOrigin:'control'}),20);
 }
});
