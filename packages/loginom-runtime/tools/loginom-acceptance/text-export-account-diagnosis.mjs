// Operator component preflight through the exact real stdio acceptance entry.
import * as fs from 'node:fs/promises';import {join,resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';import {performance} from 'node:perf_hooks';import {execFileSync} from 'node:child_process';import readline from 'node:readline';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
const assignment='node17:account-probe-diagnosis:1:95a8105c',need=(x,m)=>{if(!x)throw Error(m)},hash=x=>createHash('sha256').update(x).digest('hex');
need(process.argv.length===4&&process.argv[2]==='--assignment'&&process.argv[3]===assignment,'Explicit component assignment required');process.umask(0o077);
const root=resolve('.'),work=join(root,'tools/loginom-acceptance');
const admission=JSON.parse(execFileSync('/usr/bin/python3',[join(work,'text_export_readiness.py'),'user-v1-component'],{encoding:'utf8',timeout:30000}));
const manifest=JSON.parse(await fs.readFile(join(root,'docs/plans/loginom-dock/17-text-export-final-admission.json'),'utf8'));
const runId=new Date().toISOString().slice(0,19).replaceAll('-','').replace('T','-').replaceAll(':','')+'-'+randomBytes(4).toString('hex');
const runDir=join(root,'.dock/node17/user-v1-component',runId),stateDir=join(runDir,'private/dock-state');await fs.mkdir(join(stateDir,'runtime'),{recursive:true,mode:0o700});
await fs.symlink(join(process.env.HOME,'.loginom-dock/runtime/browsers'),join(stateDir,'runtime/browsers'));
const globalConfig=join(process.env.HOME,'.loginom-dock/config.json'),configPath=join(runDir,'private/user-v1-config.json'),globalConfigHash=hash(await fs.readFile(globalConfig));
execFileSync('/usr/bin/python3',['-c','import sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from text_export_readiness import isolated_user_config;isolated_user_config(Path(sys.argv[2]),Path(sys.argv[3]))',work,globalConfig,configPath],{stdio:'pipe'});
const disk=await fs.statfs(root),free=Number(disk.bavail)*Number(disk.bsize);need(free>2*1024**3,'Insufficient disk');
const save=(name,value)=>fs.writeFile(join(runDir,name),JSON.stringify(value,null,2)+'\n');
const run={assignment,run_id:runId,goal_id:'text-export-node-complete',scope:'source_runtime',probe_scope:'account-diagnosis',result_profile:'user-v1',model_launched:false,storage_directory:'/test-2',loginom_url:'http://logi-test-plan.bg.local/app/?testable=true',manifest_uri:manifest.catalog.uri,manifest_sha256:manifest.catalog.sha256,runtime_source_pin:{client_revision:manifest.runtime,inputs:manifest.runtime_inputs},harness_inputs:manifest.harness_inputs,acceptance_observer:{contract:2,entry:'text-export-observer-client.mjs',settings_verified:false},acceptance_readiness:admission};
await save('request.json',run);await save('one-smoke-marker.json',{assignment,runId,free,model_launched:false});
const overallDeadline=performance.now()+600000,epochDeadline=Date.now()+600000;
let phase='starting',stopped=false,setupUsed=false,smokeUsed=false,prep,prepared,session,baseline,replaceRequest,seq=0;
const config={resultProfile:'user-v1'};
const stage=async(value,extra={})=>{phase=value;await save('smoke-state.json',{phase,assignment,run_id:runId,smoke_used:smokeUsed,setup_used:setupUsed,...extra});console.log(JSON.stringify({phase,run_dir:runDir,...extra}));};
const guard=()=>need(!stopped&&performance.now()<overallDeadline,'Component deadline');
const args=[join(work,'text-export-observer-client.mjs'),'--config',configPath,'--state-dir',stateDir,'--agent','hermes','--adapter-revision','node17-user-v1-component','--mode','executor-replay','--action-manifest-uri',manifest.catalog.uri,'--action-manifest-sha256',manifest.catalog.sha256,'--replay-bootstrap','--replay-login-user','test-2','--replay-loginom-url',run.loginom_url];
await save('entry-launch.json',{command:process.execPath,args,environment:{DOCK_ACCEPTANCE_RUN_DIR:runDir,DOCK_ACCEPTANCE_PURPOSE:'account-diagnosis',DOCK_ACCEPTANCE_DEADLINE_EPOCH_MS:String(epochDeadline)}});
const transport=new StdioClientTransport({command:process.execPath,args,cwd:root,stderr:'pipe',env:{...process.env,DOCK_ACCEPTANCE_RUN_DIR:runDir,DOCK_ACCEPTANCE_PURPOSE:'account-diagnosis',DOCK_ACCEPTANCE_DEADLINE_EPOCH_MS:String(epochDeadline)}});
const client=new Client({name:'node17-user-v1-component-operator',version:'1'});
const wire=async(name,args)=>{guard();const call_id='component-'+(++seq);await fs.appendFile(join(runDir,'public-wire.jsonl'),JSON.stringify({phase:'request',call_id,name,args})+'\n');const reply=await client.callTool({name,arguments:args},undefined,{timeout:Math.max(1,Math.min(300000,overallDeadline-performance.now()))});const result=JSON.parse(reply.content[0].text);await fs.appendFile(join(runDir,'public-wire.jsonl'),JSON.stringify({phase:'response',call_id,name,reply,result})+'\n');need(!reply.isError,'Public operation refused');return result;};
try{
 await client.connect(transport);const prepared=await wire('dock_prepare',{operation_id:'smoke-prepare',intent:'new_draft',timeout_ms:120000});
 need(prepared.prepared&&prepared.workspace.status==='READY','Preparation incomplete');await save('preparation.json',prepared);
 const probe=JSON.parse(await fs.readFile(join(runDir,'account-probe.json'),'utf8'));need(probe.value.status==='SUCCEEDED','Native account probe incomplete');
 await stage('diagnosis_completed',{session_id:prepared.sessionId,account:probe.value.account,closed:probe.value.closed,probe_elapsed_ms:probe.value.elapsed_ms});
}catch(e){await save('failure.json',{phase,error:String(e.message),diagnostic_only:true});console.log(JSON.stringify({phase:'diagnosis_failed',run_dir:runDir,error:String(e.message)}));process.exitCode=1;}
finally{await client.close();await save('session-close.json',{browser_transport_closed:true,logged_out:false,global_config_unchanged:hash(await fs.readFile(globalConfig))===globalConfigHash});console.log(JSON.stringify({phase:'closed',run_dir:runDir}));}
