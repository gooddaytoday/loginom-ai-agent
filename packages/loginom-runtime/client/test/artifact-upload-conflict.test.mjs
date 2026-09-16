import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {resolveArtifactUploadConflict} from '../lib/artifact-upload-conflict.mjs';
function fixture(fault,overwrite='reject') {
 let clicks=0,disposed=0;
 const task={operation_id:'decision',overwrite,expected_origin:'https://test',expected_build:'7.4.2',document:'doc',prefix:'MF;TF-2',directory:'/user/dock-p3',destination:'/user/dock-p3/input.csv',name:'input.csv',bytes:64};
 const visible=()=>({x:100,y:100,width:100,height:25});
 const title={textContent:'Конфликт файлов с одинаковыми именами'},message={textContent:'Файл с таким же именем уже существует в этом расположении:"'+task.destination+'".'},check={checked:false,indeterminate:false};
 const button={isConnected:true,textContent:overwrite==='reject'?'Пропустить':'Заменить',getBoundingClientRect:visible,getAttribute:()=>null,contains:e=>e===button};
 const win={getBoundingClientRect:visible,contains:e=>[button,title,message,check].includes(e)};
 const input={isConnected:true,files:[{name:'input.csv',size:64}]};
 class FileSenderManager {constructor(){this.CurrentDirectory='/user/dock-p3/';this.FActiveLoadersCount=0;this.FCurrentUploadFilePaths={};}}
 class FileStorageForm {constructor(){this.FFileSenderManager=new FileSenderManager();this.FFileInput=input;this.FView={el:{dom:{getAttribute:()=>task.prefix+';FileStorageForm'}}};}}
 const form=new FileStorageForm(),state={epoch:'doc'};
 const document={querySelectorAll:s=>s==='.x-window'?(clicks?[]:[win]):s.includes('p.h;p.t')?[title]:s.includes('cnt;cnt;cmp')?[message]:s.includes('InputEl')?[check]:[],elementFromPoint:()=>fault==='covered'?{}:button};
 const workspace={getActiveTab:()=>({Controller:{FController:form}})};
 const bg={app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{Items:{Workspace:workspace}}}}}};
 const context=vm.createContext({document,location:{origin:'https://test'},bg,getComputedStyle:()=>({display:'block',visibility:'visible'})});
 context[Symbol.for('loginom-dock.workspace-ui.identity.v1')]=state;
 if(fault==='document')state.epoch='foreign';
 if(fault==='directory')form.FFileSenderManager.CurrentDirectory='/foreign/';
 if(fault==='cached_replace')form.FFileSenderManager.FLastConflictResult=1;
 if(fault==='all')check.checked=true;
 if(fault==='file')input.files[0].name='other.csv';
 if(fault==='size')input.files[0].size=65;
 if(fault==='path')message.textContent=message.textContent.replace('/input.csv','/other.csv');
 if(fault==='title')title.textContent='Delete files';
 const evaluate=(fn,...args)=>vm.runInContext('('+fn.toString()+')',context)(...args);
 const handle={evaluate:async(fn,arg)=>evaluate(fn,button,arg),click:async()=>{clicks++;input.files=[];if(fault==='lost_click')throw Error('Lost reply');},dispose:async()=>{disposed++;}};
 const page={locator:()=>({count:async()=>fault==='duplicate'?2:1,isVisible:async()=>true,isEnabled:async()=>true,elementHandle:async()=>handle}),
 evaluate:async(fn,arg)=>{if(fault==='lost_settlement')throw Error('Lost read');return evaluate(fn,arg);},waitForTimeout:async()=>{}};
 return {task,run:()=>resolveArtifactUploadConflict(page,task),get clicks(){return clicks;},get disposed(){return disposed;}};
}
for(const policy of ['reject','replace'])test('one exact conflict decision '+policy+' confirms cleanup without claiming uploaded bytes',async()=>{
 const f=fixture(undefined,policy),r=await f.run();assert.equal(r.status,'SUCCEEDED');assert.equal(r.cleanup_complete,true);
 assert.equal(r.output.disposition,policy==='reject'?'rejected':'replace');assert.equal(r.output.upload_completion_verified,false);assert.equal(f.clicks,1);assert.equal(f.disposed,1);
});
for(const fault of ['document','directory','cached_replace','all','file','size','path','title','covered','duplicate'])test('conflict rejects '+fault+' before gesture',async()=>{
 const f=fixture(fault),r=await f.run();assert.equal(r.status,'NOT_APPLIED');assert.equal(r.effect_possible,false);assert.equal(f.clicks,0);
});
for(const fault of ['lost_click','lost_settlement'])test('conflict keeps '+fault+' ambiguous without another decision',async()=>{
 const f=fixture(fault),r=await f.run();assert.equal(r.status,'AMBIGUOUS');assert.equal(r.cleanup_complete,false);assert.equal(f.clicks,1);
});
