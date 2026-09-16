// Validate server-built candidate bytes with the real client parser; no build.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pinActionCatalog} from '../../client/lib/action-catalog.mjs';
const dir=path.resolve(process.argv[2]),uri=process.argv[3],expected=process.argv[4];
const manifest=await fs.readFile(path.join(dir,'manifest.json'),'utf8');
if(createHash('sha256').update(manifest).digest('hex')!==expected)throw Error('Manifest bytes differ');
const remote={callTool:async({arguments:a})=>{const u=a.uris[0],name=u.slice(u.lastIndexOf('/')+1);
  if(!u.startsWith(uri.slice(0,uri.lastIndexOf('/')+1))||!['manifest.json','actions.json','selectors.json','source-index.json'].includes(name))throw Error('Unexpected catalog file');
  return {content:[{type:'text',text:await fs.readFile(path.join(dir,name),'utf8')}]};}};
const p=await pinActionCatalog(remote,{manifestUri:uri,manifestSha256:expected,allowCandidate:true});
if(p.compatibility.loginom_build!=='7.4.2'||p.compatibility.platform!=='macos'||p.compatibility.browser!=='chromium')throw Error('Wrong compatibility');
for(const key of ['package.save_as','package.save_checkpoint']){
 const a=p.actionsJson.actions.find(a=>a.action_key===key);
 if(!a||JSON.stringify(a.effect.allowed_roots)!=='["/test-3"]'||a.status!=='candidate')throw Error('Wrong save scope');
}
console.log(JSON.stringify({passed:true,manifest_sha256:expected,compatibility:p.compatibility,
 save_checkpoint_revision:p.actionsJson.actions.find(a=>a.action_key==='package.save_checkpoint').revision,model_started:false}));
