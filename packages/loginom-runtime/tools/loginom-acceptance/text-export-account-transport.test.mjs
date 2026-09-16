import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';import {Server} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js';import {InMemoryTransport} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js';import {CallToolRequestSchema} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js';
import {createSerialGate} from '../../client/lib/clipboard.mjs';
import {installAccountProbe,nativeAccountProbe} from './text-export-account-probe.mjs';
test('real SDK response channel permits nested browser call after awaited preparation gate releases',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'node17-account-transport-'))),state=join(root,'private/dock-state'),directory=join(state,'sessions/s');await mkdir(directory,{recursive:true});
 const profile={profile_id:'loginom-7.4.2-macos-chromium-ru',loginom_build:'7.4.2',platform:'macos',browser:'chromium'};
 await writeFile(join(directory,'session.json'),JSON.stringify({sessionId:'s',resultProfile:'user-v1',targetIdentity:profile}));
 const oldConnect=Client.prototype.connect,oldSet=Server.prototype.setRequestHandler;
 const bs=new Server({name:'test-browser',version:'1'},{capabilities:{tools:{}}}),ps=new Server({name:'test-public',version:'1'},{capabilities:{tools:{}}}),bc=new Client({name:'loginom-dock-browser',version:'1'}),pc=new Client({name:'test-operator',version:'1'});let gateHeld=false,calls=0,publicReturned=false;
 bs.setRequestHandler(CallToolRequestSchema,async req=>{calls++;if(calls===1)return {content:[{type:'text',text:'{}'}]};assert.equal(gateHeld,false);assert.equal(publicReturned,false);
  const code=req.params.arguments.code,b=JSON.parse(code.slice(code.lastIndexOf(')(page,')+7,-1));
  const o={...b,url:b.origin+'/app/',build:'7.4.2',prepared_verified:true,active_tab:true,avatar_count:1,menu_count:0,account:null,line_visible:false};
  const value={status:'SUCCEEDED',account:'test-2',opened:true,closed:true,elapsed_ms:1,observations:[o,{...o,menu_count:1,account:'test-2',line_visible:true},o]};return {content:[{type:'text',text:JSON.stringify(value)}]};});
 try{
  installAccountProbe({Client,Server,CallToolRequestSchema,runDirectory:root,stateDirectory:state,overallDeadline:performance.now()+60000});
  const gate=createSerialGate();ps.setRequestHandler(CallToolRequestSchema,async()=>{await gate(async()=>{gateHeld=true;await bc.callTool({name:'browser_run_code_unsafe',arguments:{code:'prepare fixture'}});gateHeld=false;});return {content:[{type:'text',text:JSON.stringify({prepared:true,sessionId:'s',workspace:{status:'READY',document_id:'d',operation_id:'prepare',workflow_ref:{workflow_id:'w',tab_tid:'t'}}})}]};});
  const [a,b]=InMemoryTransport.createLinkedPair();a._serverParams={command:process.execPath,args:['cli','--config',join(directory,'playwright.json')],cwd:directory};await bs.connect(b);await bc.connect(a);
  const [c,d]=InMemoryTransport.createLinkedPair();await ps.connect(d);await pc.connect(c);
  const reply=await pc.callTool({name:'dock_prepare',arguments:{}},undefined,{timeout:5000});publicReturned=true;assert.equal(reply.isError,undefined);assert.equal(calls,2);
 }finally{Client.prototype.connect=oldConnect;Server.prototype.setRequestHandler=oldSet;await Promise.allSettled([pc.close(),ps.close(),bc.close(),bs.close()]);await rm(root,{recursive:true,force:true});}
});
test('unclosed menu returns bounded partial steps with no further UI operations queued',async()=>{
 const b={origin:'http://logi-test-plan.bg.local',session_id:'s',document_id:'d',workflow_id:'w',tab_tid:'t',operation_id:'prepare',deadline_epoch_ms:Date.now()+20000};let reads=0,clicks=0,keys=0;
 const page={evaluate:async(_,args)=>{reads++;return {...b,url:b.origin,build:'7.4.2',prepared_verified:true,active_tab:true,avatar_count:1,menu_count:reads===1?0:1,account:args.readAccount?'test-2':null,line_visible:args.readAccount};},locator:()=>({click:async()=>clicks++}),keyboard:{press:async()=>keys++},waitForTimeout:async()=>{}};
 const value=await nativeAccountProbe(page,b);assert.equal(value.status,'FAILED');assert.equal(value.reason,'ACCOUNT_EVIDENCE_LIMIT');assert.equal(value.account,'test-2');assert.equal(value.closed,false);assert.equal(value.pending_ui_actions,0);assert.ok(value.steps.some(s=>s.step==='close_gesture_completed'));assert.equal(clicks,2);assert.equal(keys,0);assert.ok(value.observations.length<=32);const final=reads;await new Promise(r=>setTimeout(r,5));assert.equal(reads,final);
});
