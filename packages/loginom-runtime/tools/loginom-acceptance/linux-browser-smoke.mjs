// Source-runtime smoke only: opens an in-memory page, never Loginom or a model.
// Use the pinned bundle Node. --headless is suitable for distro containers;
// omit it to check the caller's explicit X11/Wayland desktop environment.
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {createSession} from '../../client/lib/session.mjs';
import {browserProcessEnvironment} from '../../client/lib/bridge.mjs';

process.umask(0o077);
const args=process.argv.slice(2),headless=args.includes('--headless');
const index=args.indexOf('--browsers');
if(index<0||!args[index+1])throw Error('Explicit --browsers path required');
const directory=await fs.mkdtemp(join(tmpdir(),'dock-linux-browser-'));
let client,session;
try{
 await fs.mkdir(join(directory,'runtime'));
 await fs.symlink(resolve(args[index+1]),join(directory,'runtime/browsers'));
 session=await createSession({stateDir:directory,agent:'codex',adapterRevision:'linux-browser-smoke-v1',mode:'executor-replay'},{headless});
 // Chromium cannot sandbox a root process. This exception is restricted to
 // an in-memory headless smoke inside Docker, as documented by Playwright:
 // https://playwright.dev/docs/docker#run-the-image
 // It never changes the product session defaults or visits Loginom.
 const containerRoot=headless&&process.getuid?.()===0&&await fs.access('/.dockerenv').then(()=>true,()=>false);
 if(containerRoot){
  const config=JSON.parse(await fs.readFile(session.browserConfig,'utf8'));
  config.browser.launchOptions.chromiumSandbox=false;
  await fs.writeFile(session.browserConfig,JSON.stringify(config),{mode:0o600});
 }
 client=new Client({name:'linux-browser-smoke',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:[session.browserCli,'--config',session.browserConfig],
  env:browserProcessEnvironment(session.browserRoot),stderr:'pipe'});
 transport.stderr?.on('data',()=>{});
 await client.connect(transport);
 const response=await client.callTool({name:'browser_run_code_unsafe',arguments:{code:`async page=>{
  await page.goto('data:text/html,<title>Dock Linux smoke</title><p>Dock Linux smoke</p>');
  return {title:await page.title(),viewport:page.viewportSize(),window:await page.evaluate(()=>({width:innerWidth,height:innerHeight,
   outerWidth,outerHeight,availableWidth:screen.availWidth,availableHeight:screen.availHeight})),browser:page.context().browser().version()};
 }`}},undefined,{timeout:60000});
 const text=response.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
 const raw=text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1];
 if(response.isError||!raw)throw Error('Pinned browser smoke failed: '+text.slice(0,1500));
 const result=JSON.parse(raw);
 if(result.title!=='Dock Linux smoke'||result.browser!==session.metadata.chromiumVersion)throw Error('Unexpected browser result or version');
 if(!headless&&result.viewport!==null)throw Error('Visible browser viewport must be native');
 console.log(JSON.stringify({status:'PASS',scope:'source_browser_only',headless,platform:process.platform,arch:process.arch,
  node:process.versions.node,source_revision:session.metadata.clientRevision,chromium_revision:session.metadata.chromiumRevision,
  display_present:!!process.env.DISPLAY,wayland_display_present:!!process.env.WAYLAND_DISPLAY,
  session_type:process.env.XDG_SESSION_TYPE??null,chromium_sandbox:containerRoot?'disabled_for_container_smoke':'product_default',...result}));
}finally{
 await client?.callTool({name:'browser_close',arguments:{}}).catch(()=>{});
 await client?.close();
 await fs.rm(directory,{recursive:true,force:true});
}
