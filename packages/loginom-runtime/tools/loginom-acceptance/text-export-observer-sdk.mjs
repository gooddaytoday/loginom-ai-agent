// Installed only in the isolated acceptance process; no product files changed.
import {readFile,realpath,open,mkdir} from 'node:fs/promises';
import {dirname,resolve,join,basename} from 'node:path';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {createReadObserverGate} from './text-export-read-observer.mjs';
import {createNativeObserver} from './text-export-observer-native.mjs';
import {bindObserver} from './text-export-observer-binding.mjs';
import {refuseDiagnosticDispatch} from './text-export-download-diagnosis-policy.mjs';
import {need} from './text-export-observer-policy.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
async function append(path,line){const f=await open(path,constants.O_WRONLY|constants.O_APPEND|constants.O_CREAT|constants.O_NOFOLLOW,0o600);try{await f.writeFile(line);await f.sync();}finally{await f.close();}}
export function installObserverSdk({Client,Server,CallToolRequestSchema,runDirectory,stateDirectory,run,overallDeadline,diagnosisOnly=false,clock=()=>performance.now()}){
 const originals={connect:Client.prototype.connect,callTool:Client.prototype.callTool,request:Client.prototype.request,set:Server.prototype.setRequestHandler};
 let browser=null,sessionDirectory=null,exclusive=false,violated=false,serverInstalled=false,publicActive=false,gate=null,chain=null,actualSeq=0;
 const permits=new WeakSet();
 Client.prototype.connect=async function(transport,...rest){
  if(exclusive){violated=true;throw Error('OBSERVER_NEW_CONNECTION_FORBIDDEN');}
  if(this._clientInfo?.name==='loginom-dock-browser'){
   need(!browser,'Duplicate owned browser');const p=transport?._serverParams;
   need(p?.command===process.execPath&&p.args?.length===3&&p.args[1]==='--config','Unexpected browser transport');
   const directory=dirname(p.args[2]);need(await realpath(directory)===directory&&dirname(directory)===join(stateDirectory,'sessions')&&p.cwd===directory&&basename(p.args[2])==='playwright.json','Foreign browser directory');
   browser=this;sessionDirectory=directory;
  }
  return originals.connect.call(this,transport,...rest);
 };
 Client.prototype.callTool=async function(request,...rest){
  if(exclusive){
   if(this!==browser||!permits.has(request)){violated=true;throw Error('UNREGISTERED_OBSERVER_INVOCATION');}
  }
  return originals.callTool.call(this,request,...rest);
 };
 Client.prototype.request=async function(request,...rest){
  if(exclusive){
   if(this!==browser||request.method!=='tools/call'||!permits.has(request.params)){violated=true;throw Error('UNREGISTERED_OBSERVER_REQUEST');}
   permits.delete(request.params);
  }
  return originals.request.call(this,request,...rest);
 };
 Server.prototype.setRequestHandler=function(schema,handler){
  if(schema!==CallToolRequestSchema)return originals.set.call(this,schema,handler);
  need(!serverInstalled,'Duplicate public dispatcher');serverInstalled=true;
  return originals.set.call(this,schema,async(request,extra)=>{
   if(publicActive){if(exclusive)violated=true;throw Error('OBSERVER_PUBLIC_DISPATCH_BUSY');}
   publicActive=true;let timer;
   try{
    if(violated||gate?.state().poisoned)throw Error('OBSERVER_GATE_BLOCKED');
    const isReplace=request.params.name==='dock_node_apply'&&request.params.arguments?.parameters?.overwrite==='replace';
    if(!isReplace)return await handler(request,extra);
    need(browser&&sessionDirectory,'Owned browser unavailable');need(!gate,'Second replace observer forbidden');
    exclusive=true;const observerDeadline=Math.min(overallDeadline,clock()+60000);
    const observation=(async()=>{
    const artifactRoot=join(runDirectory,'observer');await mkdir(artifactRoot,{mode:0o700});
    const session=JSON.parse(await readFile(join(sessionDirectory,'session.json'),'utf8'));
    need(session.sessionId===basename(sessionDirectory),'Session metadata differs');
    const journal=await readFile(join(sessionDirectory,'execution-events.jsonl'),'utf8');
    const context=bindObserver({journal,request,run,session,overallDeadline:observerDeadline});
    need(!violated&&clock()<observerDeadline,'Observer binding deadline');
    const call=async({code,signal,timeout})=>{
     need(!violated,'Unknown observer action was attempted');signal.throwIfAborted();
     const req={name:'browser_run_code_unsafe',arguments:{code}};permits.add(req);
     return browser.callTool(req,undefined,{signal:extra?.signal?AbortSignal.any([signal,extra.signal]):signal,timeout});
    };
    const native=createNativeObserver({invoke:call,artifactRoot,clock,cancellationSignal:extra?.signal,recordResponse:e=>append(join(artifactRoot,'observer-responses.jsonl'),JSON.stringify(e)+'\n'),record:e=>append(join(artifactRoot,'observer-actions.jsonl'),JSON.stringify(e)+'\n')});
    gate=createReadObserverGate({artifactRoot,clock,append:async line=>{need(!violated,'Unknown observer action was attempted');await append(join(artifactRoot,'observer.jsonl'),line);chain=sha(line.trimEnd());},
     observe:async options=>{const r=await native(options);need(!violated,'Unknown observer action was attempted');return r;},
     dispatch:async body=>{
      need(!violated&&!extra?.signal?.aborted,'Observer owner/cancel changed');
      await refuseDiagnosticDispatch({diagnosisOnly,run,request:body,record:e=>append(join(artifactRoot,'diagnostic-stop.jsonl'),JSON.stringify({...e,session_id:session.sessionId,mono_ms:clock(),after_observer_chain_sha256:chain})+'\n')});
      // This host anchor is written immediately before invoking the original
      // handler. Transport/result uncertainty never becomes a success receipt.
      const event={seq:++actualSeq,run_id:run.run_id,session_id:session.sessionId,operation_id:body.params.arguments.operation_id,after_observer_chain_sha256:chain,mono_ms:clock(),before_product_dispatch:true,request:body,journal_prefix_sha256:sha(journal),journal_line_count:journal.trimEnd().split('\n').length};
      await append(join(artifactRoot,'actual-dispatch.jsonl'),JSON.stringify(event)+'\n');
      need(!violated&&!extra?.signal?.aborted,'Observer dispatch canceled');clearTimeout(timer);exclusive=false;
      return handler(body,extra);
     }});
    return await gate.invoke(request,context);
    })();
    const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{violated=true;reject(Error('OBSERVER_TOTAL_INTERVAL_EXPIRED'));},Math.max(1,observerDeadline-clock()));});
    return await Promise.race([observation,expired]);
   }catch(error){if(exclusive)violated=true;throw error;}
   finally{clearTimeout(timer);publicActive=false;if(!violated)exclusive=false;}
  });
 };
 return {state:()=>({owned:!!browser,exclusive,violated}),uninstall(){Client.prototype.connect=originals.connect;Client.prototype.callTool=originals.callTool;Client.prototype.request=originals.request;Server.prototype.setRequestHandler=originals.set;}};
}
