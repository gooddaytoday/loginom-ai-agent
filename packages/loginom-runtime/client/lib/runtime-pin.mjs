import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Include every executable module under lib, including new nested modules.
// The explicit list covers runtime inputs outside lib (plugins, lockfiles, etc.).
export async function createRuntimeSourcePin(baseUrl,fixedPaths=[]) {
 const files=new Set(fixedPaths);
 const visit=async prefix=>{
  for(const entry of await readdir(new URL(prefix,baseUrl),{withFileTypes:true})) {
   const path=prefix+entry.name;
   if(entry.isSymbolicLink())throw Error('Runtime source pin does not allow symlinks: '+path);
   if(entry.isDirectory())await visit(path+'/');
   else if(entry.isFile()&&/\.(?:mjs|d\.ts)$/.test(entry.name))files.add(path);
  }
 };
 await visit('./');
 const hash=createHash('sha256'),manifest=[];
 for(const path of [...files].sort()) {
  const bytes=await readFile(new URL(path,baseUrl));
  hash.update(path+'\0').update(bytes);
  manifest.push({path,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 return {revision:hash.digest('hex'),manifest};
}
