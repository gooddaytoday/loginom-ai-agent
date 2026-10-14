import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assertAmountManagedStartup} from './fp-managed-startup.mjs';
import {assertCaptureOwner} from './retained-capture.mjs';
const pins=JSON.parse(await readFile(new URL('./amount-file-functions.json',import.meta.url),'utf8'));
// One fixed private operation. No package opener, shared-read fallback, or public
// browser callback registration. All native handles remain on their original Page.
export async function amountFilePhase(o) {
 const box=v=>v instanceof Error?{kind:'Error',message:v.message,...('cause' in v?{cause:box(v.cause)}:{})}:{kind:'value',undefined:v===undefined,value:v===undefined?null:v};
 const key='__loginomAmountFileReadV1';
 const refusals=new Set();const fail=code=>{const v=Error(code);refusals.add(v);throw v};
 const encoded=JSON.stringify(o.expected),e=o.expected;
 if(!e||Object.keys(e).sort().join(',')!=='account,bindingOwner,chat,deadline,generation,id,lease,operation,origin,path,request,run'
  ||!['storage','info','size','info_release','open','open_info','open_size','open_info_release','read','release'].includes(o.phase)
  ||typeof e.path!=='string'||!e.path.startsWith('/'+e.account+'/')
  ||e.path.split('/').length!==3||! /^[^/\\\x00-\x1f]+\.lgp$/.test(e.path.split('/').at(-1)))fail('ORIGINAL_FILE_PATH_REQUIRED');
 let table=globalThis[key];
 if(o.phase==='storage'){
  if(table!==undefined)fail('ORIGINAL_FILE_ALREADY_ATTEMPTED');
  const bg=globalThis.bg,app=bg?.app,application=app?.Application,instance=application?.FInstance,main=instance?.FMainForm;
  const own=globalThis.__loginomStartupV1,map=main?.FMapTree,connection=map?.FServerConnection,session=connection?.Session;
  table={phase:'new',busy:false,firstPresent:false};
  for(const [k,v] of Object.entries({encoded,bg,app,application,instance,main,own,map,connection,session,root:map?.FPackagesParentNode,inventory:map?.PackageNodes,getStorage:session?.get_FileStorage,path:e.path}))Object.defineProperty(table,k,{value:v});
  if(!own||Object.hasOwn(own,'__amountFileReadV1'))fail('ORIGINAL_FILE_ALREADY_ATTEMPTED');
  Object.defineProperty(own,'__amountFileReadV1',{value:table});globalThis[key]=table;
 }
 const s=table;const retain=(key,value)=>Object.defineProperty(s,key,{value});if(!s||s.encoded!==encoded)fail('ORIGINAL_FILE_BINDING_CHANGED');
 const owned=()=>{if(globalThis[key]!==s||s.own.__amountFileReadV1!==s||s.encoded!==JSON.stringify(o.expected)||s.path!==e.path)fail('ORIGINAL_FILE_BINDING_CHANGED')};
 const authority=()=>{
  owned();if(Date.now()>=e.deadline)fail('ORIGINAL_FILE_DEADLINE_EXPIRED');
  if(globalThis.bg!==s.bg||s.bg.app!==s.app||s.app.Application!==s.application||s.application.FInstance!==s.instance
   ||s.instance.FMainForm!==s.main||s.main.FMapTree!==s.map||s.map.FServerConnection!==s.connection||s.connection.Session!==s.session
   ||globalThis.__loginomStartupV1!==s.own||s.own?.document!==document||s.own.id!==e.id||s.own.account!==e.account
   ||location.origin!==e.origin||s.map.FPackagesParentNode!==s.root||s.map.PackageNodes!==s.inventory||s.connection.Connected!==true||s.connection.UserName!==e.account||s.app.Version!=='7.4.2'
   ||s.inventory?.Count!==0||s.session.get_FileStorage!==s.getStorage||s.getInfo&&s.storage.GetFileInfo!==s.getInfo||s.openFile&&s.storage.OpenFile!==s.openFile||s.transport&&(s.storage.$S!==s.transport||s.session.$S!==s.transport))fail('ORIGINAL_FILE_OWNER_CHANGED');
 };
 const pin=(name,fn)=>{if(typeof fn!=='function'||Function.prototype.toString.call(fn)!==o.functions[name])fail('NATIVE_FILE_FUNCTION_UNAVAILABLE:'+name)};
 const getter=(obj,name)=>{for(let d=0;obj&&d<8;d++,obj=Object.getPrototypeOf(obj)){const p=Object.getOwnPropertyDescriptor(obj,name);if(p)return p.get}};
 const construct=()=>{
  pin('constructor',s.bg.filestorage?.FileDownloader);const name=s.path.split('/').at(-1),dir=s.path.slice(0,-name.length);
  const d=new s.bg.filestorage.FileDownloader(name,dir,s.storage);
  pin('ReleaseStreamObj',d.ReleaseStreamObj);pin('Dispose',d.Dispose);
  pin('IsStreamReleased',d.IsStreamReleased);pin('IsDisposed',getter(d,'IsDisposed'));
  if(d.FullFilename!==s.path)fail('ORIGINAL_FILE_PATH_CHANGED');return d;
 };
 const release=async(d,handle)=>{
  owned();if(!s.releases?.has(d)&&d.FFileStream!==handle)fail('ORIGINAL_FILE_HANDLE_CHANGED');
  // ReleaseStreamObj delegates to the same generic ReleaseObject used by native
  // GetFileSize for file-info, with async=true. A flag alone is never completion.
  s.releases??=new Map();let entry=s.releases.get(d);
  if(!entry){entry={d,handle,pending:d.ReleaseStreamObj()};s.releases.set(d,entry)}
  if(entry.d!==d||entry.handle!==handle||!entry.pending||typeof entry.pending.then!=='function')fail('ORIGINAL_FILE_RELEASE_UNCONFIRMED');
  if(entry.completed)return;const value=await entry.pending;owned();if(value===false)throw value;if(!d.IsStreamReleased())fail('ORIGINAL_FILE_RELEASE_UNCONFIRMED');
  await d.Dispose();owned();if(!d.IsDisposed)fail('ORIGINAL_FILE_DISPOSE_UNCONFIRMED');entry.completed=true;
 };
 if(s.busy)fail('ORIGINAL_FILE_CALLBACK_PENDING');
 if(o.phase==='release'&&s.phase==='released')return {ok:true,phase:'released',released:true,operation:e.operation,path:s.path};
 const previous={storage:'new',info:'storage',size:'info',info_release:'size',open:'info_released',open_info:'open',open_size:'open_info',open_info_release:'open_size',read:'open_info_released'};
 if(o.phase!=='release'&&s.phase!==previous[o.phase])fail('ORIGINAL_FILE_PHASE_CHANGED');
 s.busy=true;let result;
 try{
  if(o.phase==='storage'){authority();if(typeof s.session.get_FileStorage!=='function')fail('NATIVE_FILE_STORAGE_UNAVAILABLE');retain('storage',await s.session.get_FileStorage());authority();if(!s.storage)fail('NATIVE_FILE_STORAGE_UNAVAILABLE');if(!s.session.$S||s.storage.$S!==s.session.$S)fail('NATIVE_FILE_PROXY_OWNER_UNAVAILABLE');retain('transport',s.session.$S);pin('GetFileInfo',s.storage.GetFileInfo);pin('OpenFile',s.storage.OpenFile);retain('getInfo',s.storage.GetFileInfo);retain('openFile',s.storage.OpenFile);if(s.bg.TBGFileOpenMode.fomRead!==0)fail('NATIVE_FILE_MODE_UNAVAILABLE');s.phase='storage';}
  if(o.phase==='info'){authority();retain('info',await s.getInfo.call(s.storage,s.path));if(!s.info)fail('NATIVE_FILE_INFO_UNAVAILABLE');if(s.info.$S!==s.transport)fail('ORIGINAL_FILE_FOREIGN_HANDLE');s.infoOwned=true;if(typeof s.info.get_Size!=='function')fail('NATIVE_FILE_SIZE_GETTER_UNAVAILABLE');retain('infoSize',s.info.get_Size);retain('infoRelease',construct());s.infoRelease.FFileStream=s.info;authority();s.phase='info';}
  if(o.phase==='size'){authority();retain('size',await s.infoSize.call(s.info));authority();if(!Number.isSafeInteger(s.size)||s.size<1||s.size>262144)fail('NATIVE_FILE_SIZE_UNAVAILABLE');s.phase='size';}
  if(o.phase==='info_release'){await release(s.infoRelease,s.info);authority();s.infoReleased=true;s.phase='info_released';}
  if(o.phase==='open'){authority();retain('downloader',construct());retain('stream',await s.openFile.call(s.storage,s.path,0,1));if(s.stream?.$S!==s.transport)fail('ORIGINAL_FILE_FOREIGN_HANDLE');s.streamOwned=true;s.downloader.FFileStream=s.stream;authority();pin('ReadBuffer',s.stream.ReadBuffer);retain('readBuffer',s.stream.ReadBuffer);s.phase='open';}
  if(o.phase==='open_info'){authority();retain('openInfo',await s.getInfo.call(s.storage,s.path));if(s.openInfo?.$S!==s.transport)fail('ORIGINAL_FILE_FOREIGN_HANDLE');s.openInfoOwned=true;if(typeof s.openInfo.get_Size!=='function')fail('NATIVE_FILE_SIZE_GETTER_UNAVAILABLE');retain('openInfoSize',s.openInfo.get_Size);retain('openInfoRelease',construct());s.openInfoRelease.FFileStream=s.openInfo;authority();s.phase='open_info';}
  if(o.phase==='open_size'){authority();const size=await s.openInfoSize.call(s.openInfo);authority();if(size!==s.size)fail('ORIGINAL_FILE_SIZE_CHANGED');s.phase='open_size';}
  if(o.phase==='open_info_release'){await release(s.openInfoRelease,s.openInfo);s.openInfoReleased=true;authority();s.phase='open_info_released';}
  if(o.phase==='read'){authority();const bytes=new Uint8Array(s.size);const reply=await s.readBuffer.call(s.stream,bytes);authority();if(reply!==null&&reply!==undefined)throw reply;s.base64=btoa(Array.from(bytes,x=>String.fromCharCode(x)).join(''));s.phase='read';result={base64:s.base64,bytes:s.size};}
  if(o.phase==='release'){
   owned();if(s.openInfo&&!s.openInfoReleased){if(!s.openInfoOwned)fail('ORIGINAL_FILE_FOREIGN_HANDLE');await release(s.openInfoRelease,s.openInfo);s.openInfoReleased=true;}
   if(s.stream&&!s.streamReleased){if(!s.streamOwned)fail('ORIGINAL_FILE_FOREIGN_HANDLE');await release(s.downloader,s.stream);s.streamReleased=true;}
   if(s.info&&!s.infoReleased){if(!s.infoOwned)fail('ORIGINAL_FILE_FOREIGN_HANDLE');if(!s.infoRelease){s.infoRelease=construct();s.infoRelease.FFileStream=s.info}await release(s.infoRelease,s.info);s.infoReleased=true;}
   s.phase='released';result={released:true};
  }
  return {ok:true,phase:s.phase,operation:e.operation,path:s.path,...result};
 }catch(v){if(!s.firstPresent){s.firstPresent=true;s.first=v}else{s.secondaryPresent=true;s.secondary=v}
  return {ok:false,phase:s.phase,operation:e.operation,path:s.path,origin:refusals.has(v)?'guard':'await',rejection:box(v),firstRejection:box(s.first),secondaryPresent:s.secondaryPresent===true,...(s.secondaryPresent?{secondary:box(s.secondary)}:{})};
 }finally{s.busy=false}
}
export function createAmountFileRead(retained,{guard,record,signal}) {
 const original=assertAmountManagedStartup(retained.state.controlledStartup,retained.state);
 const fixed={binding:retained.binding,owner:retained.owner,page:retained.page,context:retained.context,session:retained.session,startup:retained.startup,state:retained.state};
 const expected={bindingOwner:retained.binding.owner,lease:retained.binding.lease,generation:retained.binding.generation,chat:retained.binding.chat,id:retained.owner.id,account:retained.owner.account,origin:retained.owner.origin,path:retained.binding.packagePath,
  operation:original.operation,request:original.request,run:retained.binding.run,deadline:Math.min(original.deadline,retained.binding.expires)};
 let attempted=false,pending=false,held=false,unknown=false;
 const current=()=>{guard();assertCaptureOwner(retained);signal.throwIfAborted()};
 const cleanup=()=>{if(retained.binding!==fixed.binding||retained.owner!==fixed.owner||retained.page!==fixed.page||retained.context!==fixed.context
  ||retained.session!==fixed.session||retained.startup!==fixed.startup||retained.state!==fixed.state||fixed.state.startupOwner!==fixed.owner
  ||fixed.state.session!==fixed.session||fixed.page.isClosed()||fixed.context.pages().length!==1||fixed.context.pages()[0]!==fixed.page)throw Error('ORIGINAL_FILE_CLEANUP_OWNER_CHANGED')};
 let failurePresent=false,failure,secondaryPresent=false,secondary;
 const failureEvent=v=>{if(!failurePresent){failurePresent=true;failure=v}else{secondaryPresent=true;secondary=v}retained.state.controlledStartup.reject(v)};
 const unbox=b=>b.kind==='Error'?Error(b.message,...(b.cause?[{cause:unbox(b.cause)}]:[])):b.undefined?undefined:b.value;
 return {unsettled:()=>pending||held||unknown,failures:()=>({failurePresent,failure,secondaryPresent,secondary}),async read(){
  current();if(attempted)throw Error('ORIGINAL_FILE_ALREADY_ATTEMPTED');attempted=true;
  let firstPresent=false,first,bytes,known=true;
  const phase=async name=>{
   if(name==='release')cleanup();else current();
   pending=true;known=false;let r;
   try{r=await retained.page.evaluate(amountFilePhase,{expected,phase:name,functions:pins.functions})}
   catch(v){unknown=true;failureEvent(v);throw v}
   if(!r||r.operation!==expected.operation||r.path!==expected.path||typeof r.ok!=='boolean'){unknown=true;const v=Error('ORIGINAL_FILE_REPLY_UNCONFIRMED');failureEvent(v);throw v}
   known=true;pending=false;if(name==='storage')held=true;
   if(!r.ok){const v=unbox(r.rejection);if(r.origin==='await')failureEvent(v);else retained.state.controlledStartup.propagate(v);throw v}
   if(name==='release')held=false;
   if(name!=='release')current();return r;
  };
  try{for(const name of ['storage','info','size','info_release','open','open_info','open_size','open_info_release'])await phase(name);const r=await phase('read');bytes=Buffer.from(r.base64,'base64');if(bytes.length!==r.bytes||bytes.toString('base64')!==r.base64)throw Error('ORIGINAL_FILE_BYTES_INVALID')}
  catch(v){firstPresent=true;first=v}
  if(known){try{await phase('release')}catch(v){if(!firstPresent){firstPresent=true;first=v}}}
  if(firstPresent)throw first;
  current();const receipt={version:1,kind:'amount_owned_file_bytes',owner_id:expected.id,path:expected.path,operation:expected.operation,run:expected.run,
   sdk_session_id:retained.sessionId,original_deadline:original.deadline,effective_deadline:expected.deadline,mode:0,share_mode:1,
   bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),base64:bytes.toString('base64'),release_confirmed:!held&&!pending&&!unknown,
   mutation_authorized:false,release_authorized:false,persisted_content_verified:false};
  pending=true;try{await record({event:'amount_original_file_bytes',receipt});pending=false}catch(v){unknown=true;failureEvent(v);throw v}current();return receipt;
 }};
}
