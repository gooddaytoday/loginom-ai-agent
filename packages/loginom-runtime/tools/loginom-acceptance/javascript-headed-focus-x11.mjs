import {execFile as execute} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';

const execFile=promisify(execute);
const helper=new URL('./javascript-headed-focus-x11.py',import.meta.url).pathname;
const need=(ok,message)=>{if(!ok)throw Error(message);};
const run=async(file,args)=>((await execFile(file,args,{timeout:10000,maxBuffer:16384})).stdout).trim();
const windowId=value=>{const id=Number(value);need(Number.isSafeInteger(id)&&id>0,'X11 window identity unavailable');return id;};

export async function createJavascriptHeadedFocusX11({profile,browserPath,record}) {
 need(process.platform==='linux'&&process.env.XDG_SESSION_TYPE==='x11'&&!!process.env.DISPLAY,
  'Owned headed focus guard requires an existing X11 session');
 need(typeof record==='function','Focus evidence recorder required');
 const original=windowId(await run('xdotool',['getactivewindow']));
 const expectedProfile=resolve(profile),expectedBrowser=resolve(browserPath);
 let browserWindow=null,browserPid=null,expectedFocus=null,timer=null,polling=null,samples=0,browserFocusSamples=0,otherFocusSamples=0,pollFailures=0;
 const findPid=async()=>{
  const names=(await readdir('/proc')).filter(name=>/^\d+$/.test(name));
  const processes=await Promise.all(names.map(async name=>{
   const bytes=await readFile(join('/proc',name,'cmdline')).catch(()=>null);
   if(!bytes)return null;
   // Chromium rewrites argv[0] into a space-delimited process title on Linux.
   const title=bytes.toString('utf8').replaceAll('\0',' ');
   return title.startsWith(expectedBrowser+' ')&&title.includes(' --user-data-dir='+expectedProfile+' ')
    &&!title.includes(' --type=')?Number(name):null;
  }));
  const matches=processes.filter(pid=>pid!==null);
  need(matches.length===1,'One owned Chromium main process required');
  return matches[0];
 };
 const properties=async id=>run('xprop',['-id',String(id),'_NET_WM_PID','WM_NAME','WM_HINTS','WM_PROTOCOLS']);
 const inspect=async id=>{
  const value=await properties(id);
  need(new RegExp('_NET_WM_PID\\(CARDINAL\\): window id # 0x'+browserPid.toString(16)+'\\b|_NET_WM_PID\\(CARDINAL\\) = '+browserPid+'\\b').test(value),
   'X11 window PID differs from owned Chromium');
  return value;
 };
 return {
  async onContextCreated(context){
   try{
    need(context?.pages?.().length>=1,'Owned headed browser page required');
    const deadline=Date.now()+10000;
    while(Date.now()<deadline){
     browserPid=await findPid();
     const result=await run('xdotool',['search','--onlyvisible','--pid',String(browserPid)]).catch(()=> '');
     const windows=result.split(/\s+/).filter(Boolean).map(windowId);
     if(windows.length===1){browserWindow=windows[0];break;}
     await new Promise(done=>setTimeout(done,100));
    }
    need(browserWindow!==null,'One visible owned Chromium window required');
    await inspect(browserWindow);
    await run('python3',[helper,String(browserWindow)]);
    const after=await inspect(browserWindow);
    need(/Client accepts input or input focus:\s*False/.test(after)&&!after.includes('WM_TAKE_FOCUS'),
     'Owned Chromium non-focusable X11 hints unconfirmed');
    const active=windowId(await run('xdotool',['getactivewindow']));
    if(active===browserWindow)await run('xdotool',['windowactivate','--sync',String(original)]);
    expectedFocus=windowId(await run('xdotool',['getactivewindow']));
    const result={status:'applied',browser_pid:browserPid,browser_xid:browserWindow,original_xid:original,
     active_after_setup:expectedFocus,returned_original_once:active===browserWindow,
     input_hint_false:true,take_focus_removed:true};
    await record(result);
    timer=setInterval(()=>{
     if(polling)return;
     polling=run('xdotool',['getactivewindow']).then(value=>{
      const current=windowId(value);samples++;
      if(current===browserWindow)browserFocusSamples++;
      else if(current!==expectedFocus)otherFocusSamples++;
     }).catch(()=>{pollFailures++;}).finally(()=>{polling=null;});
    },40);
    timer.unref();
   }catch(error){
    await record({status:'refused',reason:String(error.message).slice(0,500)});
    throw Error('LOGINOM_FOCUS_SETUP_FAILED');
   }
  },
  async stop(){
   if(timer)clearInterval(timer);
   if(polling)await polling;
   return {status:browserWindow?'observed':'not_applied',browser_pid:browserPid,browser_xid:browserWindow,
    original_xid:original,active_after_setup:expectedFocus,samples,browser_focus_samples:browserFocusSamples,
    other_focus_samples:otherFocusSamples,poll_failures:pollFailures};
  },
};
}
