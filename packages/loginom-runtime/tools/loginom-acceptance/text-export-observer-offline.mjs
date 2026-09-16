// Synthetic real-SDK transport exercise. Never launches a browser or model.
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {Server} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js';
import {InMemoryTransport} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js';
import {CallToolRequestSchema} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js';
import {mkdir,writeFile,readFile,realpath,appendFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {installObserverSdk} from './text-export-observer-sdk.mjs';
import {syntheticBinding,syntheticNativeResponses} from './text-export-observer-fixture.mjs';
import {bindObserver} from './text-export-observer-binding.mjs';
export async function offlineProof(root,{changeResponse=(r)=>r,changeJournal=x=>x,illegalCallAt=null,illegalDirect=false,compactWorkflow=false,transformResponses=x=>x,diagnosisOnly=false}={}){
 root=await realpath(root);const state=join(root,'private','dock-state'),sessionDir=join(state,'sessions','session');await mkdir(sessionDir,{recursive:true,mode:0o700});
 const f=syntheticBinding();f.journal=changeJournal(f.journal);const overallDeadline=performance.now()+60000;
 await writeFile(join(sessionDir,'session.json'),JSON.stringify(f.session));await writeFile(join(sessionDir,'execution-events.jsonl'),f.journal);
 if(compactWorkflow)f.request.params.arguments.workflow_ref={workflow_id:f.workflow_ref.workflow_id};
 const context=bindObserver({...f,overallDeadline}),responses=transformResponses(syntheticNativeResponses(context));
 const originalPath=join(sessionDir,context.baseline.native_file);await mkdir(join(originalPath,'..'),{recursive:true});await writeFile(originalPath,'x\n');
 const browserServer=new Server({name:'synthetic-browser',version:'1'},{capabilities:{tools:{}}});let calls=0,dispatched=0,illegalBlocked=false,hook;
 const browser=new Client({name:'loginom-dock-browser',version:'1'}),foreign=new Client({name:'foreign',version:'1'});
 browserServer.setRequestHandler(CallToolRequestSchema,async request=>{
  const index=calls++,response=changeResponse(responses[index],index);
  if(index===illegalCallAt){try{if(illegalDirect)await browser.request({method:'tools/call',params:{name:'browser_run_code_unsafe',arguments:{code:'async page=>page.reload()'}}});else await foreign.callTool({name:'browser_run_code_unsafe',arguments:{code:'async page=>page.reload()'}});}catch{illegalBlocked=true;}}
  if(response.observer_download_count){const match=request.params.arguments.code.match(/"download_path":("[^"\\]*(?:\\.[^"\\]*)*")/);if(!match)throw Error('Synthetic download path missing');await writeFile(JSON.parse(match[1]),'x\n');}
  return {content:[{type:'text',text:JSON.stringify(response)}]};
 });
 const publicServer=new Server({name:'synthetic-public',version:'1'},{capabilities:{tools:{}}});const publicClient=new Client({name:'offline-test',version:'1'});
 try{
  hook=installObserverSdk({Client,Server,CallToolRequestSchema,runDirectory:root,stateDirectory:state,run:f.run,overallDeadline,diagnosisOnly});
  const [ba,bb]=InMemoryTransport.createLinkedPair();ba._serverParams={command:process.execPath,args:['synthetic-cli','--config',join(sessionDir,'playwright.json')],cwd:sessionDir};
  await browserServer.connect(bb);await browser.connect(ba);
  publicServer.setRequestHandler(CallToolRequestSchema,async request=>{dispatched++;await appendFile(join(sessionDir,'execution-events.jsonl'),JSON.stringify({session_id:'session',runtime_revision:f.session.clientRevision,phase:'node_apply_prepared',operation_id:request.params.arguments.operation_id,request:{...request.params.arguments,workflow_ref:f.workflow_ref}})+'\n');return {content:[{type:'text',text:JSON.stringify({actual_reply:true,request})}]};});
  const [pa,pb]=InMemoryTransport.createLinkedPair();await publicServer.connect(pb);await publicClient.connect(pa);
  let error=null;try{await publicClient.callTool(f.request.params);}catch(e){error=e.message;}
  if(!error){const actual=JSON.parse((await readFile(join(root,'observer','actual-dispatch.jsonl'),'utf8')).trim());
   const bound=JSON.parse((await readFile(join(root,'observer','observer.jsonl'),'utf8')).split('\n')[0]).payload;
   // Actual run derives expected from the raw ledger separately in Python.
   const expected={...context,overall_deadline_ms:bound.overall_deadline_ms,actual_replace_dispatch:actual};
   await writeFile(join(root,'synthetic-expected.json'),JSON.stringify({expected,request:actual.request,replace_request:{...actual.request.params.arguments,workflow_ref:f.workflow_ref},run:f.run}));
  }
  return {calls,dispatched,illegalBlocked,error,hook:hook.state()};
 }finally{hook?.uninstall();await Promise.allSettled([publicClient.close(),publicServer.close(),browser.close(),browserServer.close()]);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv[2]!=='--synthetic-fixture'||!process.argv[3])throw Error('Explicit synthetic fixture directory required');
 const result=await offlineProof(process.argv[3]);console.log(JSON.stringify(result));if(result.error)process.exitCode=1;
}
