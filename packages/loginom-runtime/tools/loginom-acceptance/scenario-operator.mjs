// Isolated real Dock bridge for operator diagnosis. One MCP request per line.
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {createRedactor} from '../../client/lib/redact.mjs';
process.umask(0o077);
const [configPath,out]=process.argv.slice(2);
if(!path.isAbsolute(configPath??'')||!path.isAbsolute(out??''))throw Error('Explicit absolute config and new output directory required');
await fs.mkdir(out,{mode:0o700});await fs.mkdir(path.join(out,'runtime'));
await fs.symlink(path.join(process.env.HOME,'.loginom-dock/runtime/browsers'),path.join(out,'runtime/browsers'));
const config=JSON.parse(await fs.readFile(configPath,'utf8')),redactor=createRedactor([config.api_key]);
const client=new Client({name:'dock-scenario-operator',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('client/bin/loginom-dock.mjs'),'--config',configPath,'--state-dir',out,'--agent','hermes','--adapter-revision','mimo-stability-operator'],env:getDefaultEnvironment(),stderr:'pipe'});
transport.stderr.on('data',()=>{});
const raw=process.stdin.isTTY&&typeof process.stdin.setRawMode==='function';if(raw)process.stdin.setRawMode(true);
const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});let sequence=0;
try{
 await client.connect(transport,{timeout:180000});await fs.writeFile(path.join(out,'tools.json'),JSON.stringify(await client.listTools(),null,2));
 console.log(JSON.stringify({ready:true,out}));
 for await(const line of lines){
  let request;try{request=JSON.parse(line);}catch{console.log('INVALID_JSON');continue;}
  if(request.operator==='close')break;
  const id=++sequence;await fs.appendFile(path.join(out,'requests.jsonl'),JSON.stringify(redactor.redact({id,request}))+'\n');
  try{
   const result=await client.callTool(request,undefined,{timeout:180000});
   const file=path.join(out,id+'.json');await fs.writeFile(file,JSON.stringify(redactor.redact(result),null,2));
   console.log(JSON.stringify({id,file,isError:result.isError??false}));
  }catch{console.log(JSON.stringify({id,error:'CALL_FAILED',bridge_retained:true}));}
 }
}finally{lines.close();if(raw)process.stdin.setRawMode(false);process.stdin.pause();await client.close();}
