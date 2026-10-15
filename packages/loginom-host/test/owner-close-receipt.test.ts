import {test,expect} from 'bun:test';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
const root=process.env.OWNER_SOURCE_ROOT??new URL('../src/',import.meta.url).pathname;
const supervisor=await readFile(root+'/supervisor.ts','utf8'),clientSource=await readFile(root+'/node-client.ts','utf8');
function fixture(kind:string,value:any){const events:string[]=[],timers:any[]=[],failure=Error('original evidence failure'),state:any={},closing:any={};let reply=value;
 const request=async()=>{events.push('request');if(reply==='throw')throw failure;return reply};
 const sandbox={state,closing,request,client:{request,close:()=>events.push('transport-close')},child:{kill:()=>events.push('SIGKILL')},exited:Promise.resolve({code:0,signal:null}),setTimeout:(fn:any,ms:number)=>{timers.push({fn,ms});return timers.length},clearTimeout:()=>{},Error};
 let body;
 if(kind==='supervisor')body=supervisor.slice(supervisor.indexOf('  const closing: {'),supervisor.indexOf('  // Connection validation')).replace('const closing: { promise?: Promise<void> }','const closing');
 else{const start=clientSource.indexOf('    close() {');body='function '+clientSource.slice(start,clientSource.indexOf('    },',start)+5).trim().replace(/,$/,'');}
 const close=vm.runInNewContext(body+';close',sandbox);
 return {events,timers,failure,close,setReply:(v:any)=>reply=v,advance:()=>{for(const t of timers)t.fn()}};
}
for(const kind of ['supervisor','node-client'])for(const [name,value] of [['refused',{closed:false}],['missing',undefined],['false',false],['throw','throw'],['evidence-error','throw']])test(kind+' retains owner on '+name,async()=>{
 const f=fixture(kind,value);const first=f.close();expect(f.close()).toBe(first);let original;try{await first}catch(e){original=e};expect(original).toBeDefined();if(value==='throw')expect(original).toBe(f.failure);
 f.advance();expect(f.events).not.toContain('SIGKILL');expect(f.events).not.toContain('transport-close');expect(f.timers).toHaveLength(0);
 f.setReply({closed:true});await f.close();expect(f.events.filter(x=>x==='request')).toHaveLength(2);if(kind==='node-client')expect(f.events).toContain('transport-close');
});
