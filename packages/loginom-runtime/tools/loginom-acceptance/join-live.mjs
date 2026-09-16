// Operator-only source-runtime diagnostic. Public calls use the real MCP wire;
// a script may inspect the owned browser for diagnosis, never as Hermes guidance.
import fs from 'node:fs/promises';
import readline from 'node:readline';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {createSession} from '../../client/lib/session.mjs';
process.umask(0o077);
const option=k=>{const i=process.argv.indexOf(k);if(i<0||!process.argv[i+1])throw Error('Required '+k);return process.argv[i+1];};
const loginomUrl=option('--loginom-url'),user=option('--loginom-user'),storage=option('--storage'),packagePath=option('--package');
const url=new URL(loginomUrl);
if(url.username||url.password||!/^\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(storage)||!packagePath.startsWith(storage+'/'))throw Error('Explicit safe URL and storage required');
const dir=process.cwd()+'/.dock/join-20260912/live-'+Date.now();await fs.mkdir(dir+'/runtime',{recursive:true});
await fs.symlink(process.env.HOME+'/.loginom-dock/runtime/browsers',dir+'/runtime/browsers');
const session=await createSession({stateDir:dir,agent:'codex',adapterRevision:'Join-20260912-diagnostic',mode:'executor-replay'});
session.metadata.targetIdentity={origin:url.origin,loginom_build:'7.4.2'};
await fs.writeFile(dir+'/session.json',JSON.stringify(session.metadata,null,2));
const client=new Client({name:'join-live',version:'1'}),transport=new StdioClientTransport({command:process.execPath,
 args:[session.browserCli,'--config',session.browserConfig],env:{...getDefaultEnvironment(),PLAYWRIGHT_BROWSERS_PATH:session.browserRoot},stderr:'pipe'});
transport.stderr?.on('data',()=>{});let sequence=0,ctx;
const execute=async code=>{
 const r=await client.callTool({name:'browser_run_code_unsafe',arguments:{code}},undefined,{timeout:60000});
 await fs.writeFile(dir+'/browser-'+(++sequence)+'.json',JSON.stringify(r));
 const text=r.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'),raw=text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1];
 if(!raw)throw Error(text.slice(0,1000));return JSON.parse(raw);
};
try {
 await client.connect(transport);await client.callTool({name:'browser_navigate',arguments:{url:loginomUrl}});
 const geometry=await execute('async page=>({viewport:page.viewportSize(),window:await page.evaluate(()=>({width:innerWidth,height:innerHeight,outerWidth,outerHeight,availableWidth:screen.availWidth,availableHeight:screen.availHeight}))})');
 await fs.writeFile(dir+'/geometry.json',JSON.stringify(geometry));
 if(geometry.viewport!==null||geometry.window.width!==geometry.window.outerWidth||geometry.window.width<geometry.window.availableWidth*.9)throw Error('Visible native window is not maximized');
 await execute(`async page=>{await page.locator('[data-tid="LoginForm;Login;edtUsername"] input').fill(${JSON.stringify(user)});await page.locator('[data-tid="LoginForm;Login;btnLogin"]').click();await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]').waitFor({timeout:10000}).catch(()=>{});return {logged_in:await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]').isVisible()}}`);
 ctx={execute,session,dir,fs};
 console.log(JSON.stringify({dir,status:'LOGIN_READY',sessionId:session.metadata.sessionId,runtime:session.metadata.clientRevision,geometry,pid:process.pid}));
 for await(const line of readline.createInterface({input:process.stdin})) {
  if(!line.trim())continue;const command=JSON.parse(line);if(command.operator==='close')break;
  try{const body=await fs.readFile(command.file,'utf8');const result=await new Function('ctx','return (async()=>{'+body+'})()')(ctx);
   await fs.writeFile(dir+'/'+command.id+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify({id:command.id,result}));
  }catch(e){console.log(JSON.stringify({id:command.id,error:e.message}));}
 }
}finally{await ctx?.wire?.close();await client.callTool({name:'browser_close',arguments:{}}).catch(()=>{});await client.close();process.stdin.pause();process.stdin.unref?.();}
