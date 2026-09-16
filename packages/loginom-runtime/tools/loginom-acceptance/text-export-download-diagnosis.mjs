// Operator component preflight through the exact real stdio acceptance entry.
import * as fs from 'node:fs/promises';import {join,resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';import {performance} from 'node:perf_hooks';import {execFileSync} from 'node:child_process';import readline from 'node:readline';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
const assignment='node17:download-diagnosis:1:43a7d37f',need=(x,m)=>{if(!x)throw Error(m)},hash=x=>createHash('sha256').update(x).digest('hex');
need(process.argv.length===4&&process.argv[2]==='--assignment'&&process.argv[3]===assignment,'Explicit component assignment required');process.umask(0o077);
const root=resolve('.'),work=join(root,'tools/loginom-acceptance');
const admission=JSON.parse(execFileSync('/usr/bin/python3',[join(work,'text_export_download_diagnosis_admission.py'),assignment],{encoding:'utf8',timeout:30000}));
const manifest=JSON.parse(await fs.readFile(join(root,'docs/plans/loginom-dock/17-text-export-final-admission.json'),'utf8'));
await fs.mkdir(join(root,'.dock/node17/download-diagnosis-current'),{recursive:true,mode:0o700});
await fs.writeFile(join(root,'.dock/node17/download-diagnosis-current/one-shot.json'),JSON.stringify({assignment,manifest_sha256:admission.manifest_sha256}),{flag:'wx',mode:0o600});
const runId=new Date().toISOString().slice(0,19).replaceAll('-','').replace('T','-').replaceAll(':','')+'-'+randomBytes(4).toString('hex');
const runDir=join(root,'.dock/node17/download-diagnosis',runId),stateDir=join(runDir,'private/dock-state');await fs.mkdir(join(stateDir,'runtime'),{recursive:true,mode:0o700});
await fs.symlink(join(process.env.HOME,'.loginom-dock/runtime/browsers'),join(stateDir,'runtime/browsers'));
const globalConfig=join(process.env.HOME,'.loginom-dock/config.json'),configPath=join(runDir,'private/user-v1-config.json'),globalConfigHash=hash(await fs.readFile(globalConfig));
execFileSync('/usr/bin/python3',['-c','import sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from text_export_readiness import isolated_user_config;isolated_user_config(Path(sys.argv[2]),Path(sys.argv[3]))',work,globalConfig,configPath],{stdio:'pipe'});
const disk=await fs.statfs(root),free=Number(disk.bavail)*Number(disk.bsize);need(free>2*1024**3,'Insufficient disk');
const save=(name,value)=>fs.writeFile(join(runDir,name),JSON.stringify(value,null,2)+'\n');
const run={assignment,run_id:runId,goal_id:'text-export-node-complete',scope:'source_runtime',probe_scope:'download-diagnosis',result_profile:'user-v1',model_launched:false,storage_directory:'/test-2',loginom_url:'http://logi-test-plan.bg.local/app/?testable=true',manifest_uri:manifest.catalog.uri,manifest_sha256:manifest.catalog.sha256,runtime_source_pin:{client_revision:manifest.runtime,inputs:manifest.runtime_inputs},harness_inputs:manifest.harness_inputs,acceptance_observer:{contract:2,entry:'text-export-observer-client.mjs',settings_verified:false},acceptance_readiness:admission};
await save('request.json',run);await save('one-smoke-marker.json',{assignment,runId,free,model_launched:false});
const overallDeadline=performance.now()+600000,epochDeadline=Date.now()+600000;
let phase='starting',stopped=false,setupUsed=false,smokeUsed=false,prep,prepared,session,baseline,replaceRequest,seq=0;
const config={resultProfile:'user-v1'};
const stage=async(value,extra={})=>{phase=value;await save('smoke-state.json',{phase,assignment,run_id:runId,smoke_used:smokeUsed,setup_used:setupUsed,...extra});console.log(JSON.stringify({phase,run_dir:runDir,...extra}));};
const guard=()=>need(!stopped&&performance.now()<overallDeadline,'Component deadline');
const bytes=await fs.readFile(join(work,'fixtures/text-export/input/main.csv'));
const artifact={sourcePath:join(work,'fixtures/text-export/input/main.csv'),name:`Dock-export-${runId}-main.csv`,bytes:bytes.length,sha256:hash(bytes),upload:{directory:'/test-2',overwrite:'reject'}};
const args=[join(work,'text-export-observer-client.mjs'),'--config',configPath,'--state-dir',stateDir,'--agent','hermes','--adapter-revision','node17-download-diagnosis','--mode','executor-replay','--action-manifest-uri',manifest.catalog.uri,'--action-manifest-sha256',manifest.catalog.sha256,'--replay-bootstrap','--replay-login-user','test-2','--replay-loginom-url',run.loginom_url,'--input-artifact',JSON.stringify(artifact)];
await save('entry-launch.json',{command:process.execPath,args,environment:{DOCK_ACCEPTANCE_RUN_DIR:runDir,DOCK_ACCEPTANCE_PURPOSE:'download-diagnosis',DOCK_ACCEPTANCE_DEADLINE_EPOCH_MS:String(epochDeadline)}});
const transport=new StdioClientTransport({command:process.execPath,args,cwd:root,stderr:'pipe',env:{...process.env,DOCK_ACCEPTANCE_RUN_DIR:runDir,DOCK_ACCEPTANCE_PURPOSE:'download-diagnosis',DOCK_ACCEPTANCE_DEADLINE_EPOCH_MS:String(epochDeadline)}});
const client=new Client({name:'node17-download-diagnosis-operator',version:'1'});
const wire=async(name,args)=>{guard();const call_id='diagnosis-'+(++seq);await fs.appendFile(join(runDir,'public-wire.jsonl'),JSON.stringify({phase:'request',call_id,name,args})+'\n');let reply;
try{reply=await client.callTool({name,arguments:args},undefined,{timeout:Math.max(1,Math.min(300000,overallDeadline-performance.now()))});}
catch(e){await fs.appendFile(join(runDir,'public-wire.jsonl'),JSON.stringify({phase:'transport_failure',call_id,name,response_received:false,error_code:String(e.message).includes('DIAGNOSIS_OBSERVER_COMPLETED')?'DIAGNOSIS_OBSERVER_COMPLETED_PRODUCT_REPLACE_FORBIDDEN':'MCP_CALL_FAILED'})+'\n');throw e;}
const result=JSON.parse(reply.content[0].text);await fs.appendFile(join(runDir,'public-wire.jsonl'),JSON.stringify({phase:'response',call_id,name,reply,result})+'\n');need(!reply.isError,'Public operation refused');return result;};
const node=async request=>{let r=await wire('dock_node_apply',request);while(r.state==='running'){guard();r=await wire('dock_node_wait',{operation_id:request.operation_id,timeout_ms:10000});}need(r.state==='settled'&&r.result_version==='user-v1','Actual user-v1 result required');await save(request.operation_id+'.json',{request,result:r});return r;};
async function setup(){
 need(!setupUsed&&!smokeUsed,'Setup is one-shot');setupUsed=true;await stage('baseline_setup_started');
 const a=prepared.input_artifacts[0];let delivered=await wire('dock_artifact_deliver',{operation_id:'smoke-deliver',artifact_id:a.artifact_id,upload_grant_id:a.upload.grant_id,budget_ms:120000});
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
 throw Error('DIAGNOSIS_UNEXPECTED_PRODUCT_REPLACE');
 await stage('native_replace_completed',{elapsed_with_replace_ms:performance.now()-start,bytes:result.output?.file_artifacts?.[0]?.bytes});
}

async function close(){stopped=true;await client.close();await save('session-close.json',{browser_transport_closed:true,logged_out:false,global_config_unchanged:hash(await fs.readFile(globalConfig))===globalConfigHash});console.log(JSON.stringify({phase:'closed'}));}
try{
 await client.connect(transport);prepared=await wire('dock_prepare',{operation_id:'smoke-prepare',intent:'new_draft',timeout_ms:120000});need(prepared.prepared&&prepared.workspace.status==='READY','Owned draft unavailable');prep=prepared.workspace;await save('preparation.json',prepared);
 session={directory:join(stateDir,'sessions',prepared.sessionId),metadata:{sessionId:prepared.sessionId}};const metadata=JSON.parse(await fs.readFile(join(session.directory,'session.json'),'utf8'));need(metadata.resultProfile==='user-v1'&&metadata.clientRevision===manifest.runtime,'Effective profile/runtime mismatch');
 const playwright=JSON.parse(await fs.readFile(join(session.directory,'playwright.json'),'utf8'));await save('geometry.json',{window:prep.window,browser_config:playwright.browser});need(prep.window.width>=prep.window.available_width*.9&&playwright.browser.contextOptions.viewport===null&&playwright.browser.launchOptions.args.includes('--start-maximized'),'Window not maximized');
 const account=JSON.parse(await fs.readFile(join(runDir,'account-probe.json'),'utf8'));need(account.value.status==='SUCCEEDED'&&account.value.account==='test-2'&&account.value.closed===true&&account.session_id===prepared.sessionId,'Bound native account probe missing');
 await stage('ready_for_setup',{session_id:prepared.sessionId,result_profile:metadata.resultProfile,free_bytes:free});
 for await(const line of readline.createInterface({input:process.stdin})){const command=line.trim();if(command==='close')break;try{if(command==='setup')await setup();else if(command==='smoke')await smoke();else throw Error('Unknown command');}catch(e){await save('failure.json',{phase,error:String(e.message),smoke_used:smokeUsed});console.log(JSON.stringify({phase:'failed',at:phase,error:String(e.message)}));break;}}
}catch(e){await save('failure.json',{phase,error:String(e.message),smoke_used:smokeUsed});console.log(JSON.stringify({phase:'failed',at:phase,error:String(e.message)}));process.exitCode=1;}
finally{await close().catch(()=>{});process.stdin.pause();process.stdin.unref?.();}
