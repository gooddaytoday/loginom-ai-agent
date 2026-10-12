import {durabilityFixture,serial} from './startup-durability-fixture.mjs';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const scenario=process.argv[2];
const f=await durabilityFixture({source:process.env.STARTUP_SOURCE,managed:process.env.STARTUP_MANAGED,
 phase:scenario==='normal'||scenario==='lost-reply'?undefined:'file_sync',
 when:scenario==='normal'?'before':'after',rejected:0});
let lose=scenario==='lost-reply';
process.on('message',async m=>{
 if(m.operation==='start') {process.send({id:m.id,result:{protocol:1,ready:true,fixture:true,owner:f.owner.id}});return}
 if(m.operation!=='close')return;
 try {
  const p=f.lifecycle.close();
  const shared=f.lifecycle.close();if(p!==shared)throw Error('CLOSE_PROMISE_NOT_SHARED');
  await p;
  const result={closed:true,fixture:true,owner:f.owner.id,native:f.native(),context:f.context(),events:f.events,evidence:f.owner.evidence};
  await writeFile(join(process.env.REVIEW_RESULTS,scenario+'.json'),JSON.stringify(result,null,2)+'\n');
  if(lose){lose=false;return}
  process.send({id:m.id,result},async()=>{await f.dispose();process.disconnect()});
 }catch(error){process.send({id:m.id,result:{closed:false,retained:true,failed:true,rejection:serial(error),owner:f.owner.id,native:f.native(),context:f.context(),events:f.events}})}
});
