import {randomBytes} from 'node:crypto';
import {mkdir,writeFile,lstat,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {privatePath} from './platform.mjs';
const identity=value=>typeof value==='string'&&value.length>0&&value.length<=256&&!/[\x00-\x1f\x7f]/.test(value);

// Issued by Hermes' native hook, including messages without attachments. The
// model cannot select a session: the hook replaces this field on EVERY call.
export async function issueHostSession(config,{session_id,turn_id}) {
 if(config.agent!=='hermes'||!identity(session_id)||!identity(turn_id))throw Error('Native Hermes identity required');
 const root=join(config.stateDir,'host-sessions');await mkdir(root,{recursive:true,mode:0o700});
 const stat=await lstat(root);if(!stat.isDirectory()||stat.isSymbolicLink()||!privatePath(stat))throw Error('Invalid native session directory');
 const token=randomBytes(32).toString('hex');
 await writeFile(join(root,token+'.json'),JSON.stringify({version:1,agent:'hermes',session_id,turn_id,created_at:Date.now()}),{mode:0o600,flag:'wx'});
 return {token};
}
export async function readHostSession(config,token) {
 if(config.agent!=='hermes'||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw Error('Native Hermes session ticket required');
 const root=join(config.stateDir,'host-sessions'),stat=await lstat(root);
 if(!stat.isDirectory()||stat.isSymbolicLink()||!privatePath(stat))throw Error('Invalid native session directory');
 const file=await open(join(root,token+'.json'),constants.O_RDONLY|constants.O_NOFOLLOW);
 let value;
 try{const info=await file.stat();if(!info.isFile()||info.size>4096||!privatePath(info))throw Error('Invalid native session ticket');value=JSON.parse(await file.readFile('utf8'));}finally{await file.close();}
 if(value.version!==1||value.agent!=='hermes'||!identity(value.session_id)||!identity(value.turn_id)
   ||!Number.isFinite(value.created_at)||Date.now()-value.created_at>86400000||value.created_at>Date.now()+60000)throw Error('Expired or invalid native session ticket');
 return {session_id:value.session_id,turn_id:value.turn_id};
}
