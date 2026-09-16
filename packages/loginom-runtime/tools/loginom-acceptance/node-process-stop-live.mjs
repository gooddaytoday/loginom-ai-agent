// Operator diagnostic for exact process cancellation. This is not a node type
// handler or proof of the public node.apply contract.
import fs from 'node:fs/promises';
import readline from 'node:readline';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {createSession} from '../../client/lib/session.mjs';
import {makeWorkspacePrepareCode} from '../../client/lib/workspace.mjs';
process.umask(0o077);
const option=name=>{const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1])throw Error('Required '+name);return process.argv[i+1];};
const loginomUrl=option('--loginom-url'),user=option('--loginom-user'),url=new URL(loginomUrl);
if(url.username||url.password)throw Error('Credentials must not be in URL');
const dir=process.cwd()+'/.dock/text-import-v3/process-stop-'+Date.now();
await fs.mkdir(dir+'/runtime',{recursive:true});await fs.symlink(process.env.HOME+'/.loginom-dock/runtime/browsers',dir+'/runtime/browsers');
const session=await createSession({stateDir:dir,agent:'codex',adapterRevision:'process-stop-diagnostic-v1',mode:'executor-replay'});
session.metadata.targetIdentity={origin:url.origin,loginom_build:'7.4.2'};
await fs.writeFile(dir+'/session.json',JSON.stringify(session.metadata,null,2));
const client=new Client({name:'node-process-stop-diagnostic',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:[session.browserCli,'--config',session.browserConfig],env:{...getDefaultEnvironment(),PLAYWRIGHT_BROWSERS_PATH:session.browserRoot},stderr:'pipe'});transport.stderr?.on('data',()=>{});
let sequence=0;
const execute=async code=>{const reply=await client.callTool({name:'browser_run_code_unsafe',arguments:{code}},undefined,{timeout:60000});
 await fs.writeFile(dir+'/browser-'+(++sequence)+'.json',JSON.stringify(reply));
 const text=reply.content.filter(x=>x.type==='text').map(x=>x.text).join('\n'),raw=text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1];if(!raw)throw Error(text);return JSON.parse(raw);};
try {
 await client.connect(transport);await client.callTool({name:'browser_navigate',arguments:{url:loginomUrl}});
 const geometry=await execute('async page=>({viewport:page.viewportSize(),window:await page.evaluate(()=>({width:innerWidth,height:innerHeight,outerWidth,outerHeight,availableWidth:screen.availWidth,availableHeight:screen.availHeight}))})');
 await fs.writeFile(dir+'/browser-geometry.json',JSON.stringify(geometry,null,2));
 if(geometry.viewport!==null||geometry.window.width!==geometry.window.outerWidth||geometry.window.width<geometry.window.availableWidth*0.9)throw Error('Browser is not maximized');
 await execute(`async page=>{await page.locator('[data-tid="LoginForm;Login;edtUsername"] input').fill(${JSON.stringify(user)});await page.locator('[data-tid="LoginForm;Login;btnLogin"]').click();await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]').waitFor();return true}`);
 const prep=await execute(makeWorkspacePrepareCode({loginomUrl,compatibility:{profile_id:'loginom-7.4.2-macos-chromium',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},sessionId:session.metadata.sessionId,operationId:'prepare',timeoutMs:15000}));
 if(prep.status!=='READY')throw Error('Workspace not prepared');await fs.writeFile(dir+'/preparation.json',JSON.stringify(prep,null,2));
 const ctx={execute,session,dir,fs,prep};console.log(JSON.stringify({dir,status:'DIAGNOSTIC_WAITING',runtime:session.metadata.clientRevision}));
 for await(const line of readline.createInterface({input:process.stdin})) {
  try{const command=JSON.parse(line),source=await fs.readFile(command.file,'utf8');
   const result=await new Function('ctx','return (async()=>{'+source+'})()')(ctx);
   await fs.writeFile(dir+'/'+command.id+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify({id:command.id,result}));
  }catch(error){console.log(JSON.stringify({error:String(error.stack)}));}
 }
}finally{await client.close();}
