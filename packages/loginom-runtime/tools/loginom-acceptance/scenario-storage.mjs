// Operator-only UI setup for an isolated corpus run; never called by the model.
import fs from 'node:fs/promises';
import path from 'node:path';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {createSession} from '../../client/lib/session.mjs';
process.umask(0o077);
const [out,loginomUrl,user,folder,mode]=process.argv.slice(2);
if(loginomUrl!=='http://10.200.11.224/app/?testable=true')throw Error('Explicit diagnostic Loginom origin required');
if(mode!==undefined&&mode!=='inspect')throw Error('Unknown storage mode');
if(!path.isAbsolute(out??'')||user!=='mimo'||!/^MiMo-[A-Za-z0-9-]+$/.test(folder??''))throw Error('Explicit isolated destination required');
await fs.mkdir(path.join(out,'runtime'),{recursive:true,mode:0o700});
await fs.symlink(path.join(process.env.HOME,'.loginom-dock/runtime/browsers'),path.join(out,'runtime/browsers'));
const session=await createSession({stateDir:out,agent:'codex',adapterRevision:'mimo-storage-setup',mode:'executor-replay'});
const client=new Client({name:'dock-corpus-storage-setup',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:[session.browserCli,'--config',session.browserConfig],env:{...getDefaultEnvironment(),PLAYWRIGHT_BROWSERS_PATH:session.browserRoot},stderr:'pipe'});
transport.stderr.on('data',()=>{});
const setup=async(page,{url,user,folder,mode})=>{
 await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnFilestorage"]').click();
 const exact=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']');
 let own=page.locator('[data-tid$=";FileStorageForm;colName_'+user+'"]');
 const create=page.locator('[data-tid$=";FileStorageForm;btnCreateDirectory"]');await create.waitFor();
 const grid=page.locator('[data-tid$=";FileStorageForm;pnlFileStorage;tbl"]');
 const scrolls=[];
 for(let i=0;i<80&&!await own.count();i++){
  const move=await grid.evaluate(e=>{const from=e.scrollTop,max=e.scrollHeight-e.clientHeight;e.scrollTop=Math.min(max,from+700);return {from,to:e.scrollTop,max};});
  scrolls.push(move);if(move.from===move.to)break;await page.waitForTimeout(100);
 }
 if(await own.count()!==1) return {verified:false,reason:'Explicit account directory not found',scrolls};
 await own.dblclick();
 if(mode==='inspect'){
  const destination=page.locator('[data-tid$=";FileStorageForm;colName_'+folder+'"]');
  await destination.waitFor();await destination.dblclick();await destination.waitFor({state:'detached'});
  const listing=await grid.evaluate(e=>({text:e.innerText,scrollTop:e.scrollTop,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,
   visible_names:[...e.querySelectorAll('[data-tid]')].filter(x=>x.getAttribute('data-tid').includes(';colName_')).map(x=>x.textContent)}));
  return {directory:'/'+user+'/'+folder,created:false,verified:true,listing};
 }
 if(await page.locator('[data-tid$=";FileStorageForm;colName_'+folder+'"]').count())throw Error('Destination already exists');
 await create.click();await exact('msgbox;cnt;cnt;txt').locator('input').fill(folder);await exact('msgbox;tlb;ok').click();
 const created=page.locator('[data-tid$=";FileStorageForm;colName_'+folder+'"]');await created.waitFor();await created.dblclick();
 return {directory:'/'+user+'/'+folder,created:true,verified:true,window:await page.evaluate(()=>({width:innerWidth,height:innerHeight,outer_width:outerWidth,outer_height:outerHeight}))};
};
const login=async(page,{url,user})=>{
 if(page.url()!==url)throw Error('Storage browser URL changed');
 const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']');
 await at('LoginForm;Login;edtUsername').locator('input').fill(user);
 await at('LoginForm;Login;btnLogin').click();
 await at('MF;cntMain;tlbMainToolbar;btnAvatar').waitFor();
 // Login completes before PrepareFileStorage registers its tree node. The
 // toolbar may already be clickable; MainForm.DoOpenFileStorage asserts if
 // clicked in that interval. Observe the cached native registration only.
 await page.waitForFunction(expected=>{
  const app=globalThis.bg?.app,f=app?.Application?.FInstance?.FMainForm,m=f?.FMapTree;
  return location.origin==='http://10.200.11.224'&&app?.Version==='7.4.2'&&m?.FServerConnection?.UserName===expected
   &&app.FileStorageTreeNode&&m.FileStorageNode instanceof app.FileStorageTreeNode&&!!f.FMapStore?.GetNodeByRef(m.FileStorageNode);
 },user,{timeout:30000});
 const state=await page.evaluate(expected=>{
  const app=globalThis.bg?.app,m=app?.Application?.FInstance?.FMainForm?.FMapTree;
  return {verified:location.origin==='http://10.200.11.224'&&app?.Version==='7.4.2'&&m?.FServerConnection?.UserName===expected&&m.FServerConnection.Connected===true&&m.PackageNodes.Count===0,packages:m?.PackageNodes?.Count};
 },user);
 if(!state.verified)throw Error('Storage login requires exact account and no open packages');
 return {...state,status:'READY',created_draft:false};
};
const logout=async(page,user)=>{
 const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']');
 const verify=()=>page.evaluate(expected=>{
  const app=globalThis.bg?.app,m=app?.Application?.FInstance?.FMainForm?.FMapTree;
  return location.origin==='http://10.200.11.224'&&app?.Version==='7.4.2'&&m?.FServerConnection?.UserName===expected&&m.FServerConnection.Connected===true&&m.PackageNodes.Count===0;
 },user);
 if(!await verify())return {status:'BLOCKED',reason:'STORAGE_SESSION_IDENTITY_CHANGED'};
 await at('MF;cntMain;tlbMainToolbar;btnAvatar').click();
 if((await at('MF;AppMenuForm;p.h;p.t').innerText()).trim()!==user||!await verify())return {status:'BLOCKED',reason:'STORAGE_LOGOUT_IDENTITY_CHANGED'};
 await at('MF;AppMenuForm;btnLogOut').click();
 await at('LoginForm;Login;edtUsername').locator('input').waitFor({state:'visible'});
 if(await at('MF;cntMain;tlbMainToolbar;btnAvatar').isVisible())return {status:'BLOCKED',reason:'STORAGE_LOGOUT_UNCONFIRMED'};
 return {status:'SUCCEEDED',account:user,packages_before:0,logged_out:true,created_draft:false};
};
let loginVerified=false;
try{
 await client.connect(transport);
 await client.callTool({name:'browser_navigate',arguments:{url:loginomUrl}});
 const prepared=await client.callTool({name:'browser_run_code_unsafe',arguments:{code:'async page=>('+login.toString()+')(page,'+JSON.stringify({url:loginomUrl,user})+')'}},undefined,{timeout:90000});
 await fs.writeFile(path.join(out,'prepared.json'),JSON.stringify(prepared,null,2));
 const preparedText=prepared.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
 const preparedRaw=preparedText.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1];
 if(!preparedRaw||JSON.parse(preparedRaw).status!=='READY')throw Error('Storage browser preparation not ready');
 loginVerified=true;
 const reply=await client.callTool({name:'browser_run_code_unsafe',arguments:{code:'async page=>('+setup.toString()+')(page,'+JSON.stringify({url:loginomUrl,user,folder,mode})+')'}},undefined,{timeout:90000});
 await fs.writeFile(path.join(out,'storage-proof.json'),JSON.stringify(reply,null,2));
 const text=reply.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');
 const raw=text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1];
 if(!raw)throw Error('Storage setup failed; inspect private proof');
 const result=JSON.parse(raw);if(result.verified!==true)throw Error('Storage not verified');
 console.log(JSON.stringify(result));
}finally{
 try{
 if(loginVerified){
  const response=await client.callTool({name:'browser_run_code_unsafe',arguments:{code:'async page=>('+logout.toString()+')(page,'+JSON.stringify(user)+')'}},undefined,{timeout:30000});
  await fs.writeFile(path.join(out,'storage-cleanup.json'),JSON.stringify(response,null,2));
  const text=response.content.filter(x=>x.type==='text').map(x=>x.text).join('\n'),raw=text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1];
  if(!raw||JSON.parse(raw).status!=='SUCCEEDED'){process.exitCode=1;console.error('Storage logout unconfirmed; inspect cleanup evidence.');}
  else {console.log(JSON.stringify(JSON.parse(raw)));await client.callTool({name:'browser_close',arguments:{}});}
 }
 }finally{await client.close();}
}
