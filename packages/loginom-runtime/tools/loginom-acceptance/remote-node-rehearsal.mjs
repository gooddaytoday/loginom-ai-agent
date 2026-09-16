// Operator-controlled real bridge rehearsal. No Hermes or model invocation.
// One JSON MCP request per stdin line; {"operator":"close"} or EOF closes it.
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import {createHash} from 'node:crypto';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {createRedactor} from '../../client/lib/redact.mjs';
process.umask(0o077);
const [configPath,directory,runId,storage,user]=process.argv.slice(2);
if(!configPath||!path.isAbsolute(directory??'')||!/^\d{8}-\d{6}-[a-f0-9]{8}$/.test(runId??'')
 ||!/^\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(storage??'')||!user)throw Error('Explicit config, new absolute directory, run ID, storage and account required');
await fs.mkdir(directory,{mode:0o700});
const selected=JSON.parse(await fs.readFile(configPath,'utf8')).mcp_servers['loginom-dock'];
const args=[...selected.args];
const state=path.join(directory,'dock-state');
await fs.mkdir(state,{mode:0o700});await fs.mkdir(path.join(state,'runtime'),{mode:0o700});
await fs.symlink(path.join(process.env.HOME,'.loginom-dock/runtime/browsers'),path.join(state,'runtime/browsers'));
const replace=(key,value)=>{const i=args.indexOf(key);if(i<0)throw Error('Missing '+key);args[i+1]=value;};
replace('--state-dir',state);replace('--adapter-revision','subplan03-operator-remote');
const privateConfig=JSON.parse(await fs.readFile(args[args.indexOf('--config')+1],'utf8'));
const redactor=createRedactor([privateConfig.api_key]);
const input=path.resolve('tools/loginom-acceptance/fixtures/data-pipeline/sales.csv');
const bytes=await fs.readFile(input),sha256=createHash('sha256').update(bytes).digest('hex');
if(bytes.length!==230||sha256!=='f628434c20873f7dd9a8ee142c17af7c0b99f447114fcf60e983f6ed6b357eb3')throw Error('Fixture changed');
const artifact={name:'Dock-upload-'+runId+'.csv',bytes:bytes.length,sha256,upload:{directory:storage,overwrite:'replace'}};
args.push('--replay-bootstrap','--replay-login-user',user,'--input-artifact',JSON.stringify({...artifact,sourcePath:input}));
await fs.writeFile(path.join(directory,'operator.json'),JSON.stringify({run_id:runId,storage_directory:storage,input_artifact:artifact,
 operator_rehearsal:true,model_started:false,hermes_acceptance:false},null,2));
const client=new Client({name:'codex-operator-node-rehearsal',version:'1'});
const transport=new StdioClientTransport({command:selected.command,args,env:{...getDefaultEnvironment(),...selected.env},stderr:'pipe'});
transport.stderr?.on('data',()=>{});
// macOS canonical PTY input truncates long node requests before Node sees them.
// Raw input keeps complete JSON; this operator harness has an explicit close.
const rawInput=process.stdin.isTTY && typeof process.stdin.setRawMode==='function';
if(rawInput)process.stdin.setRawMode(true);
const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
let row=0;
const append=async(file,value)=>fs.appendFile(path.join(directory,file),JSON.stringify(redactor.redact(value))+'\n');
try {
 await client.connect(transport,{timeout:180000});
 const tools=await client.listTools();await fs.writeFile(path.join(directory,'tools.json'),JSON.stringify(tools,null,2));
 process.stdout.write(JSON.stringify({ready:true,directory,model_started:false})+'\n');
 for await(const line of lines){
  let request;
  try{request=JSON.parse(line);}catch{process.stdout.write('{"error":"INVALID_REQUEST_JSON"}\n');continue;}
  if(request.operator==='close'&&Object.keys(request).length===1)break;
  if(!tools.tools.some(t=>t.name===request.name)){process.stdout.write('{"error":"UNKNOWN_TOOL"}\n');continue;}
  const id='operator-'+(++row);
  await append('calls.jsonl',{row,session_id:runId,tool_call_id:id,tool:'mcp__loginom_dock__'+request.name,arguments:request.arguments??{}});
  try{
   const raw=await client.callTool(request,undefined,{timeout:180000});
   let result=raw.structuredContent;
   if(result===undefined){try{result=JSON.parse(raw.content?.[0]?.text);}catch{result=raw;}}
   if(raw.isError)result={isError:true,content:raw.content};
   const reply={row:++row,session_id:runId,tool_call_id:id,tool:'mcp__loginom_dock__'+request.name,result};
   await append('tools.jsonl',reply);await fs.writeFile(path.join(directory,id+'.json'),JSON.stringify(redactor.redact(raw),null,2));
   process.stdout.write(JSON.stringify({id,response_file:path.join(directory,id+'.json'),state:result?.state,status:result?.status,
    prepared:result?.prepared,isError:raw.isError??false})+'\n');
  }catch{
   // Observation timeout does not prove operation termination. Keep the bridge
   // alive so the operator can inspect the same operation instead of replaying.
   await append('transport-errors.jsonl',{id,row:++row,tool:request.name,error:'MCP_CALL_FAILED'});
   process.stdout.write(JSON.stringify({id,error:'MCP_CALL_FAILED',bridge_retained:true})+'\n');
  }
 }
}finally{lines.close();if(rawInput)process.stdin.setRawMode(false);process.stdin.pause();await client.close().catch(()=>{});}
