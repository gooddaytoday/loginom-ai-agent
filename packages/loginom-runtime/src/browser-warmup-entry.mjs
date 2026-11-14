// Installer-only worker. No connection, account, model or Loginom URL is admitted.
import { createRequire } from 'node:module';
import { appendFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { browserEnvironment, browserLoggingArguments } from './connection-check.mjs';
import { browserLaunch } from '../client/lib/browser-launch.mjs';

if (!process.send) throw Error('LOGINOM_PRIVATE_IPC_REQUIRED');
const require = createRequire(new URL('../client/package.json', import.meta.url));
const state = { initialized:false, closing:false, failed:false, work:undefined, close:undefined, root:undefined, chromium:undefined };
const phase = event => appendFile(join(state.root,'browser-warmup-phases.jsonl'),JSON.stringify({
  at:new Date().toISOString(),pid:process.pid,...event,
})+'\n',{mode:0o600}).catch(()=>undefined);
const reply = (message,disconnect=false) => {
  if (!process.connected) return;
  process.send(message,()=>{if(disconnect&&process.connected)process.disconnect();});
};
function close() {
  state.closing=true;
  return state.close ??= (async()=>{
    await state.work?.catch(()=>undefined);
    if(state.failed)throw Error('LOGINOM_BROWSER_WARMUP_FAILED');
  })();
}
async function dispatch(message) {
  if (!message || typeof message.id!=='string')return;
  try {
    if(message.method==='close') {
      await close();
      reply({id:message.id,result:{closed:true}},true);
      return;
    }
    if(state.closing)throw Error('LOGINOM_HOST_CLOSED');
    if(message.method==='start') {
      const input=message.input;
      if(state.initialized||input?.protocol!==1||input.headless!==true||!isAbsolute(input.root)||!isAbsolute(input.resources))
        throw Error('LOGINOM_HANDSHAKE_INVALID');
      state.initialized=true;state.root=input.root;
      const started=performance.now();
      await phase({phase:'browser.dependencies',status:'starting'});
      state.chromium=require('playwright-core').chromium;
      await phase({phase:'browser.dependencies',status:'ready',duration_ms:Math.round(performance.now()-started)});
      reply({id:message.id,result:{protocol:1,ready:true,pid:process.pid}});
      return;
    }
    if(message.method!=='warm'||!state.chromium||state.work||!isAbsolute(message.input?.browserPath)||!isAbsolute(message.input?.profile))
      throw Error('LOGINOM_HANDSHAKE_INVALID');
    const {browserPath,profile}=message.input;
    state.work=(async()=>{
      const started=performance.now(),launch=browserLaunch(true);
      await phase({phase:'browser.launch',status:'starting'});
      const context=await state.chromium.launchPersistentContext(profile,{
        ...launch,executablePath:browserPath,headless:true,chromiumSandbox:true,timeout:30_000,
        handleSIGINT:false,handleSIGTERM:false,handleSIGHUP:false,env:browserEnvironment(profile),
        args:['--no-proxy-server',...browserLoggingArguments(profile),...launch.args],
      });
      try {
        await phase({phase:'browser.launch',status:'ready',duration_ms:Math.round(performance.now()-started)});
        const page=context.pages()[0]??await context.newPage();
        if(page.url()!=='about:blank'||await page.evaluate(()=>document.readyState)!=='complete')
          throw Error('LOGINOM_BROWSER_WARMUP_FAILED');
      } finally {
        await context.close();
        await phase({phase:'browser.close',status:'ready'});
      }
      return {warmed:true};
    })();
    reply({id:message.id,result:await state.work});
  } catch {
    state.failed=true;
    reply({id:message.id,error:'LOGINOM_BROWSER_WARMUP_FAILED'},message.method==='close');
    if(message.method==='close')process.exitCode=1;
  }
}
process.on('message',message=>{void dispatch(message);});
process.on('disconnect',()=>{void close().catch(()=>{process.exitCode=1;});});
for(const signal of ['SIGTERM','SIGINT','SIGHUP'])process.on(signal,()=>{
  void close().catch(()=>{process.exitCode=1;}).finally(()=>{if(process.connected)process.disconnect();});
});
