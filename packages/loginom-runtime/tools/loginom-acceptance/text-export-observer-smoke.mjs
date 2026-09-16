// Explicit operator-only, one native smoke. No Hermes/model invocation.
import * as fs from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import readline from 'node:readline';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {Server} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js';
import {InMemoryTransport} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js';
import {CallToolRequestSchema} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js';
import {loadConfig} from '../../client/lib/config.mjs';
import {createSession} from '../../client/lib/session.mjs';
import {createBridge} from '../../client/lib/bridge.mjs';
import {admitStartupArtifacts} from '../../client/lib/artifacts.mjs';
import {createRedactor} from '../../client/lib/redact.mjs';
import {installObserverSdk} from './text-export-observer-sdk.mjs';
import {parseBrowserResult} from './text-export-observer-native.mjs';
const need=(v,m)=>{if(!v)throw Error(m);},hash=x=>createHash('sha256').update(x).digest('hex');
const assignment='node17:observer-navigation-origin-fix:1:e74d14d2';
need(process.argv.length===4&&process.argv[2]==='--assignment'&&process.argv[3]===assignment,'Explicit assigned smoke required');
process.umask(0o077);
const root=resolve('.'),work=join(root,'tools/loginom-acceptance');
const pin=JSON.parse(await fs.readFile(join(root,'docs/plans/loginom-dock/17-text-export-read-observer-v2.json'),'utf8'));
for(const [name,digest] of Object.entries(pin.runtime_inputs))need(hash(await fs.readFile(join(root,name)))===digest,'Runtime pin changed');
const disk=await fs.statfs(root),free=Number(disk.bavail)*Number(disk.bsize);need(free>2*1024**3,'Insufficient smoke disk budget');
const now=new Date(),runId=now.toISOString().slice(0,19).replaceAll('-','').replace('T','-').replaceAll(':','')+'-'+randomBytes(4).toString('hex');
const runDir=join(root,'.dock/node17/native-observer-smoke',runId),stateDir=join(runDir,'private/dock-state');
await fs.mkdir(join(stateDir,'runtime'),{recursive:true,mode:0o700});
await fs.symlink(join(process.env.HOME,'.loginom-dock/runtime/browsers'),join(stateDir,'runtime/browsers'));
await fs.writeFile(join(runDir,'one-smoke-marker.json'),JSON.stringify({assignment,runId,free,model_launched:false}),{flag:'wx'});
const overallDeadline=performance.now()+600000;let bridge,session,browser,hook,publicClient,redactor={redact:x=>x},prep,baseline,replaceRequest,phase='starting',smokeUsed=false,setupUsed=false,stopped=false;
const save=async(name,value)=>fs.writeFile(join(runDir,name),JSON.stringify(redactor.redact(value),null,2)+'\n');
const stage=async(value,extra={})=>{phase=value;await save('smoke-state.json',{assignment,run_id:runId,phase,smoke_used:smokeUsed,setup_used:setupUsed,...extra});console.log(JSON.stringify({phase,run_dir:runDir,...extra}));};
const guard=()=>need(performance.now()<overallDeadline&&!stopped,'Smoke overall deadline');
const config=await loadConfig({configPath:join(process.env.HOME,'.loginom-dock/config.json'),stateDir,agent:'hermes',adapterRevision:'node17-native-observer-smoke',mode:'executor-replay',actionManifestUri:'viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.13-node11.2-candidate/manifest.json',actionManifestSha256:'bb2fe2207e01d594108efb591d1c25036adc12f67168ef895dfde755d391ac2a',replayBootstrap:true,replayLoginUser:'test-2',replayLoginomUrl:'http://logi-test-plan.bg.local/app/?testable=true'});
need(['user-v1','diagnostic'].includes(config.resultProfile),'Unsupported configured result profile');redactor=createRedactor([config.apiKey]);
const wire=async(name,args)=>{
 guard();await fs.appendFile(join(runDir,'public-wire.jsonl'),JSON.stringify({phase:'request',at:performance.now(),name,args})+'\n');
 const reply=await publicClient.callTool({name,arguments:args},undefined,{timeout:Math.max(1,Math.min(300000,overallDeadline-performance.now()))});
 need(!reply.isError,'Public operation refused');const result=JSON.parse(reply.content[0].text);
 await fs.appendFile(join(runDir,'public-wire.jsonl'),JSON.stringify(redactor.redact({phase:'response',at:performance.now(),name,args,result}))+'\n');return result;
};
const node=async request=>{
 let r=await wire('dock_node_apply',request);
 while(r.state==='running'){guard();r=await wire('dock_node_wait',{operation_id:request.operation_id,timeout_ms:10000});}
 need(r.state==='settled','Node outcome unsettled');await save(request.operation_id+'.json',{request,result:r});return r.outcome?{...r,...r.outcome,...r.outcome.output,output:r.outcome.output?.output}:r;
};
const raw=async code=>parseBrowserResult(await browser.callTool({name:'browser_run_code_unsafe',arguments:{code}},undefined,{timeout:20000}));
async function setup(){
 need(!setupUsed&&!smokeUsed,'Setup is one-shot');setupUsed=true;await stage('baseline_setup_started');
 const a=session.artifactStore.list()[0];let delivered=await wire('dock_artifact_deliver',{operation_id:'smoke-deliver',artifact_id:a.artifact_id,upload_grant_id:a.upload.grant_id,budget_ms:120000});
 while(delivered.state==='running'){guard();delivered=await wire('dock_artifact_delivery_status',{operation_id:'smoke-deliver'});await new Promise(r=>setTimeout(r,250));}
 await save('delivery.json',delivered);need(delivered.status==='SUCCEEDED'||delivered.outcome?.status==='SUCCEEDED','Baseline upload unconfirmed');
 const settings={source:{source_path:a.upload.destination,encoding:'UTF-8 (65001)',rows_to_skip:0,first_line_as_title:true},format:{delimiter:';',decimal_separator:'.',null_marker:'?',text_qualifier:'"'},columns:[['id','integer'],['text','string'],['number','real']].map(([name,type])=>({name,label:name,type,data_kind:type==='string'?'Дискретный':'Непрерывный',used:true}))};
 const base={contract_revision:'1.0.0',document_id:prep.document_id,workflow_ref:config.resultProfile==='user-v1'?{workflow_id:prep.workflow_ref.workflow_id}:prep.workflow_ref,mode:'delimited',inputs:[],mappings:[],finish:'execute',read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:180000,execute_ms:60000,total_ms:240000}};
 const sourceRequest={...base,operation_id:'smoke-source',target:{kind:'new',type:'imports.text',label:'Main',position:{x:220,y:130}},parameters:{source:{artifact_id:a.artifact_id,upload_operation_id:'smoke-deliver:upload'},settings},read:{ports:[0],sample_rows:10,require_exact_numbers:false}};
 const source=await node(sourceRequest);need(source.status==='SUCCEEDED'&&source.output.ports[0].row_count===5,'Baseline source failed');await stage('baseline_source_ready');
 const parameters={destination:`/test-2/Dock-export-${runId}-csv.csv`,encoding:'UTF-8',delimiter:';',header:'names',bom:false,line_ending:'LF',decimal_separator:'.',null_marker:'?',text_qualifier:'"'};
 const originalRequest={...base,operation_id:'smoke-original',target:{kind:'new',type:'exports.text',label:'ExportCSV',position:{x:620,y:130}},inputs:[{source:source.node,output:0,input:0}],parameters};
 baseline=await node(originalRequest);need(baseline.status==='SUCCEEDED','Baseline export failed');
 const f=baseline.output.file_artifacts[0],bytes=await fs.readFile(join(session.directory,'artifacts/input','output-'+f.artifact_id,parameters.destination.split('/').at(-1))),golden=await fs.readFile(join(work,'fixtures/text-export/expected/csv.bin'));
 need(bytes.equals(golden)&&bytes.length===124&&hash(bytes)===f.sha256,'Native baseline differs from frozen CSV');
 const rejectRequest={...base,operation_id:'smoke-reject',target:{kind:'existing',type:'exports.text',ref:baseline.node},parameters};
 const rejected=await node(rejectRequest);need(rejected.status==='FAILED'&&rejected.cleanup_complete===true,'Reject not terminal/clean');
 replaceRequest={...rejectRequest,operation_id:'smoke-replace',parameters:{...parameters,overwrite:'replace'}};
 await save('replace-body.json',replaceRequest);await stage('baseline_reject_ready',{baseline_bytes:bytes.length,baseline_sha256:hash(bytes),session_id:session.metadata.sessionId});
}
async function smoke(){
 need(phase==='baseline_reject_ready'&&!smokeUsed,'Only one prepared observer interval permitted');smokeUsed=true;await stage('observer_interval_started');
 const start=performance.now();const result=await node(replaceRequest);
 need(result.status==='SUCCEEDED','Replace not successful');
 await stage('native_replace_completed',{elapsed_with_replace_ms:performance.now()-start,bytes:result.output?.file_artifacts?.[0]?.bytes});
}
async function diagnose(){
 // After failure the public replace remains permanently abandoned. Removing
 // the process hooks permits only this operator's fixed read-only diagnosis and
 // session closure. No continuation request is sent after this point.
 stopped=true;hook?.uninstall();hook=null;
 if(!browser)return;
 const value=await raw(`async page=>{const state=await page.evaluate(()=>({origin:location.origin,build:globalThis.bg?.app?.Version??null,visible:[...document.querySelectorAll('[data-tid]')].filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden').filter(e=>/msgbox|mask|cnrNaviMode|NavigationPanel|FileStorageForm;colName_|ModelForm;cmpDiagram|WizrdMCF|btnAvatar/.test(e.getAttribute('data-tid'))).slice(0,80).map(e=>({tid:e.getAttribute('data-tid'),text:e.textContent.trim().slice(0,140)}))}));await page.screenshot({path:${JSON.stringify(join(runDir,'diagnosis.png'))},fullPage:false});return state;}`);
 await save('readonly-diagnosis.json',value);await stage('readonly_diagnosis_saved',{origin:value.origin,build:value.build});
}
async function close(){
 stopped=true;hook?.uninstall();hook=null;const result={browser_closed:false,logged_out:false};
 if(browser){try{
  const code=`async page=>{const avatar=page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]');if(await avatar.isVisible()){await avatar.click();const logout=page.locator('[data-tid="MF;AppMenuForm;btnLogOut"]');if(await logout.isVisible())await logout.click();}return {login_visible:await page.locator('[data-tid="LoginForm;Login;edtUsername"] input').isVisible(),dialogs:await page.locator('[data-tid="msgbox;cnt;cnt;cmp"]').allTextContents()};}`;
  const r=await raw(code);result.logged_out=r.login_visible;result.dialogs=r.dialogs;
 }catch{result.logout_unconfirmed=true;}}
 await publicClient?.close().catch(()=>{});await bridge?.close();result.browser_closed=true;await save('session-close.json',result);console.log(JSON.stringify({phase:'closed',...result}));
}
let captureConnect;
try{
 session=await createSession(config);need(session.metadata.clientRevision===pin.runtime,'Session runtime changed');
 const run={assignment,run_id:runId,goal_id:'text-export-node-complete',result_profile:config.resultProfile,probe_scope:'reject_baseline_native_smoke_only',scope:'source_runtime',model_launched:false,loginom_url:config.loginomUrl,storage_directory:'/test-2',runtime_source_pin:{client_revision:pin.runtime,inputs:pin.runtime_inputs},budget:{timeout_seconds:600},free_before_browser:free,acceptance_observer:{contract:2,native_smoke_admitted:false}};
 const harness=Object.fromEntries(await Promise.all([...new Set([...Object.keys(pin.harness_inputs),...(await fs.readdir(work)).filter(n=>/\.(py|mjs)$/.test(n))])].map(async n=>[n,hash(await fs.readFile(join(work,n)))])));harness['text-export-observer-smoke.mjs']=hash(await fs.readFile(new URL(import.meta.url)));run.harness_inputs=harness;await save('request.json',run);
 const bytes=await fs.readFile(join(work,'fixtures/text-export/input/main.csv'));
 await admitStartupArtifacts(session.artifactStore,[{sourcePath:join(work,'fixtures/text-export/input/main.csv'),name:`Dock-export-${runId}-main.csv`,bytes:bytes.length,sha256:hash(bytes),upload:{directory:'/test-2',overwrite:'reject'}}]);
 hook=installObserverSdk({Client,Server,CallToolRequestSchema,runDirectory:runDir,stateDirectory:stateDir,run,overallDeadline});
 captureConnect=Client.prototype.connect;Client.prototype.connect=async function(...args){if(this._clientInfo?.name==='loginom-dock-browser')browser=this;return captureConnect.apply(this,args);};
 bridge=await createBridge(config,session);
 Client.prototype.connect=captureConnect;
 publicClient=new Client({name:'node17-native-smoke-operator',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await publicClient.connect(a);
 const prepared=await wire('dock_prepare',{operation_id:'smoke-prepare',intent:'new_draft',timeout_ms:120000});need(prepared.prepared&&prepared.workspace.status==='READY','New owned draft unavailable');prep=prepared.workspace;await save('preparation.json',prepared);
 const geometry=await raw(`async page=>{const avatar=page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]');await avatar.click();const identity=await page.locator('[data-tid="MF;AppMenuForm"]').innerText();await page.keyboard.press('Escape');return {viewport:page.viewportSize(),window:await page.evaluate(()=>({width:innerWidth,height:innerHeight,outerWidth,outerHeight,availableWidth:screen.availWidth,availableHeight:screen.availHeight})),avatar:identity};}`);
 await save('geometry.json',geometry);need(geometry.viewport===null&&geometry.window.width>=geometry.window.availableWidth*.9,'Browser not maximized');need(/test-2/.test(geometry.avatar),'Explicit test-2 avatar not verified');
 await stage('ready_for_setup',{session_id:session.metadata.sessionId,avatar:geometry.avatar,free_bytes:free});
 for await(const line of readline.createInterface({input:process.stdin})){
  const command=line.trim();if(command==='close'){await close();break;}
  try{if(command==='setup')await setup();else if(command==='smoke')await smoke();else if(command==='diagnose')await diagnose();else throw Error('Unknown bounded smoke command');}
  catch(e){await save('failure.json',{phase,error:String(e.message),smoke_used:smokeUsed,observer_state:hook?.state()});console.log(JSON.stringify({phase:'failed',at:phase,error:String(e.message)}));await diagnose();}
 }
} catch(e){await save('startup-failure.json',{phase,error:String(e.message)});console.log(JSON.stringify({phase:'startup_failed',error:String(e.message)}));await diagnose().catch(()=>{});await close();process.exitCode=1;}
finally{if(hook)hook.uninstall();if(bridge&&!stopped)await close();process.stdin.pause();process.stdin.unref?.();}
