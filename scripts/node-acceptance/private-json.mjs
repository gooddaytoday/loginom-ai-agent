import {open,lstat,rename,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {randomUUID} from 'node:crypto';

export async function writePrivateJson(path,value){
 const old=await lstat(path).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
 if(old&&(old.isSymbolicLink()||!old.isFile()||old.mode&0o077
  ||typeof process.getuid==='function'&&old.uid!==process.getuid()))throw Error('PRIVATE_OUTPUT_INVALID');
 const temporary=path+'.tmp-'+randomUUID();let handle;
 try{
  handle=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  await handle.chmod(0o600);
  await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();await handle.close();handle=null;
  await rename(temporary,path);
 }finally{await handle?.close();await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
