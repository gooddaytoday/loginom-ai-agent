// Private controller pipe only. Raw CLI data and known secrets never go to disk.
import {createHash} from 'node:crypto';
import {readFile,realpath} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {once} from 'node:events';

process.umask(0o077);
const visible = new Set(['tool_use','text','step_start','step_finish','error']);
const hidden = value => value && typeof value === 'object' &&
  (['system','developer'].includes(value.role) || ['analysis','summary'].includes(value.channel)
    || ['reasoning','image','audio','video','file','resource'].includes(value.type));
const binaryText = text => text.replace(/data:[^\s"'<>;,]+(?:;[^\s"'<>;,]+)*;base64,[A-Za-z0-9+/=_-]+/gi,'[binary omitted]');
function withoutBinary(value,depth=0) {
  if(depth>40)throw Error('cli_capture_nesting_limit');
  if(hidden(value))return {omitted:'non_public_content'};
  if(typeof value==='string') {
    if(/^\s*[\[{]/.test(value)) {
      try{return JSON.stringify(withoutBinary(JSON.parse(value),depth+1));}
      catch(error){if(!(error instanceof SyntaxError))throw error;}
    }
    return binaryText(value);
  }
  if(Array.isArray(value))return value.map(item=>withoutBinary(item,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(
    Object.entries(value).map(([key,item])=>[key,withoutBinary(item,depth+1)]));
  return value;
}
// MCP flattens multiple text blocks as JSON documents separated by blank
// lines. Redact those as objects: text regexes can otherwise break JSON quotes.
function outputDocuments(text) {
  if(typeof text!=='string')return null;
  const documents=[];
  let start=0,depth=0,quoted=false,escaped=false;
  for(let index=0;index<text.length;index++) {
    const char=text[index];
    if(depth===0) {
      if(/\s/.test(char))continue;
      if(char!=='{'&&char!=='[')return null;
      start=index;depth=1;continue;
    }
    if(quoted) {
      if(escaped)escaped=false;
      else if(char==='\\')escaped=true;
      else if(char==='"')quoted=false;
      continue;
    }
    if(char==='"')quoted=true;
    else if(char==='{'||char==='[')depth++;
    else if(char==='}'||char===']') {
      depth--;
      if(depth===0) {
        try{documents.push(JSON.parse(text.slice(start,index+1)));}
        catch{return null;}
      }
    }
  }
  return depth===0&&documents.length>1 ? documents : null;
}
let redactor,mode,closed=false,privateKey=false;
const counts={event:0,error:0,omitted:0};

async function reply(value) {
  if(!process.stdout.write(JSON.stringify(value)+'\n'))await once(process.stdout,'drain');
}
async function dispatch(message) {
  if(!redactor) {
    const module=message.module;
    if(message.kind!=='initialize'||!module||!isAbsolute(module.path)
      ||await realpath(module.path)!==module.path||!/^[a-f0-9]{64}$/.test(module.sha256)
      ||createHash('sha256').update(await readFile(module.path)).digest('hex')!==module.sha256
      ||!Array.isArray(message.known_values)||message.known_values.length>128
      ||!['cli','cold'].includes(message.mode??'cli')
      ||message.known_values.some(value=>typeof value!=='string'||Buffer.byteLength(value,'utf8')>16384))
      throw Error('cli_capture_redactor_initialization');
    const {createRedactor}=await import(pathToFileURL(module.path));
    if(typeof createRedactor!=='function')throw Error('cli_capture_redactor_export');
    redactor=createRedactor(message.known_values);
    mode=message.mode??'cli';
    await reply({kind:'ready',version:1});return;
  }
  if(message.kind==='close') {
    closed=true;await reply({kind:'closed',version:1,counts,private_key_block_closed:!privateKey});return;
  }
  if(!['stdout','stderr'].includes(message.kind)||typeof message.line!=='string'
    ||Buffer.byteLength(message.line,'utf8')>1048576)throw Error('cli_capture_private_frame');
  const omit=async(reason,expected=false)=>{counts.omitted++;await reply({kind:'omitted',reason,expected});};
  if(message.kind==='stderr') {
    // A PEM block can span separate stderr frames; never persist its body
    // before the canonical whole-text sanitizer could see the closing marker.
    if(privateKey||/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(message.line)) {
      privateKey=!/-----END (?:[A-Z ]+ )?PRIVATE KEY-----/.test(message.line);
      counts.error++;await reply({kind:'error',line:'[redacted]'});return;
    }
    // Prefer structured cleanup when stderr is JSON; raw stack/error lines still
    // use the canonical text sanitizer, never a raw preliminary dump.
    let value;
    try{value=JSON.parse(message.line);}catch{}
    if(hidden(value)||hidden(value?.part))return omit('non_public_stderr',true);
    let cleaned;
    try{cleaned=value && typeof value==='object' ? redactor.redact(withoutBinary(value)) : null;}
    catch{return omit('redaction_failed');}
    if(cleaned?.type==='redaction_failure')return omit('redaction_failed');
    const line=redactor.text(cleaned ? JSON.stringify(cleaned) : binaryText(message.line));
    counts.error++;await reply({kind:'error',line});return;
  }
  let value;
  try{value=JSON.parse(message.line);}catch{return omit('stdout_invalid_json');}
  if(hidden(value)||hidden(value?.part))return omit('non_public_stdout',true);
  if(mode==='cold') {
    if(!value||typeof value!=='object'||Array.isArray(value)
      ||Object.keys(value).sort().join(',')!=='cleanup,report,status,work_stage'
      ||!['OBSERVED','FAILED','CLEANUP_UNCONFIRMED','EVIDENCE_UNCONFIRMED'].includes(value.status)
      ||typeof value.work_stage!=='string'||typeof value.report!=='string'
      ||!value.cleanup||typeof value.cleanup!=='object'||Array.isArray(value.cleanup))
      return omit('cold_unknown_summary');
    let cleaned;
    try{cleaned=redactor.redact(withoutBinary(value));}
    catch{return omit('redaction_failed');}
    if(cleaned?.type==='redaction_failure')return omit('redaction_failed');
    counts.event++;await reply({kind:'event',value:cleaned});return;
  }
  if(!value||typeof value!=='object'||Array.isArray(value)||!visible.has(value.type))
    return omit('stdout_unknown_event');
  const documents=value.type==='tool_use' ? outputDocuments(value.part?.state?.output) : null;
  if(documents)value.part.state.output=documents;
  let cleaned;
  try{cleaned=redactor.redact(withoutBinary(value));}
  catch{return omit('redaction_failed');}
  if(cleaned?.type==='redaction_failure')return omit('redaction_failed');
  if(documents) {
    if(!Array.isArray(cleaned.part?.state?.output))return omit('redaction_failed');
    cleaned.part.state.output=cleaned.part.state.output.map(document=>JSON.stringify(document)).join('\n\n');
  }
  counts.event++;await reply({kind:'event',value:cleaned});
}

async function main() {
  let pending=Buffer.alloc(0);
  for await(const chunk of process.stdin) {
    pending=Buffer.concat([pending,chunk]);
    if(pending.length>8*1024*1024)throw Error('cli_capture_private_wire_limit');
    for(let end;(end=pending.indexOf(10))>=0;) {
      if(closed)throw Error('cli_capture_frame_after_close');
      const line=pending.subarray(0,end);pending=pending.subarray(end+1);
      await dispatch(JSON.parse(line.toString('utf8')));
    }
  }
  if(pending.length||!closed)throw Error('cli_capture_private_eof_without_close');
}
await main().catch(async()=>{
  await reply({kind:'failed',reason:'cli_capture_worker_failed'}).catch(()=>{});
  process.exitCode=1;
});
