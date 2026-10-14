// FIXTURE transport only. Production forwarding stays with LAB-67. Real child
// IPC; Page/native/preparation/cancel are explicitly labelled fixture doubles.
import {fixture,captureControlledAmount} from './amount-controlled-page.mjs';
import {pathToFileURL} from 'node:url';
const root=process.env.AMOUNT_RUNTIME??new URL('../..',import.meta.url).pathname;
const {registerAmountControlProxy}=await import(pathToFileURL(root+'/src/acceptance/amount-caller-control.mjs'));
let bound,controller,continuation;
process.on('message',async frame=>{
 if(frame.kind==='cancel'||frame.kind==='continue') {
  if(!bound||JSON.stringify(frame.tuple)!==JSON.stringify(bound)) {process.send({kind:'foreign-refused'});return;}
  if(frame.kind==='cancel')controller.abort(frame.reason);
  else continuation?.();
  return;
 }
 if(frame.kind!=='start'||bound)return;
 bound=Object.freeze({...frame.tuple});controller=new AbortController();
 const f=fixture('success',{revision:1,harness:'amount-import-type-v1',...bound,expires:frame.deadline+100000,admission:'fixture-admission',packagePath:'/fixture/result.lgp'});
 let control;
 try {
  control=registerAmountControlProxy({signal:controller.signal,deadline:frame.deadline,tuple:bound},f.binding);
  if(frame.preabort)controller.abort(0);
  const call=f.browser.callTool,record=f.record;let calls=0;
  const pause=async stage=>{process.send({kind:'paused',stage});await new Promise(r=>{continuation=r});};
  f.browser.callTool=async(...args)=>{calls++;const result=await call(...args);if(frame.stage==='read'&&calls===1)await pause('read');return result;};
  f.record=async value=>{await record(value);if(frame.stage==='record'&&value.event==='amount_capture')await pause('record');};
  const result=await captureControlledAmount({...f,control});
  process.send({kind:'result',failed:false,cancel:result.cancel_verified,events:f.events,deadline:frame.deadline});
 }catch(error){process.send({kind:'result',failed:true,value:error instanceof Error?String(error):error,presence:true,events:f.events,deadline:frame.deadline});}
 process.disconnect();
});
