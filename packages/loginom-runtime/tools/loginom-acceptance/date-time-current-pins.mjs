// Read-only bundled skill and frontend fingerprints. No browser or model.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadConfig} from '../../client/lib/config.mjs';
import {createSkillLoader} from '../../client/lib/skill.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const config=await loadConfig({configPath:process.argv[2],stateDir:process.cwd()+'/.dock/stream-runtime',agent:'codex',adapterRevision:'node13-candidate-preparation'});
const prepared=await createSkillLoader({resources:config.resources}).prepare(),detail=prepared.detail;
const base=new URL(config.loginomUrl);base.search='';base.hash='';
if(base.href!=='http://logi-test-plan.bg.local/app/')throw Error('Unexpected frontend target');
async function read(url){const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Frontend unavailable');return Buffer.from(await r.arrayBuffer());}
const html=await read(base),text=html.toString().replace(/<!--[\s\S]*?-->/g,'');
const urls=[...text.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/gi)].map(m=>new URL(m[1],base));
const files={[base.href]:sha(html)};
for(const u of urls){if(u.origin!==base.origin)throw Error('Foreign frontend dependency');files[u.href]=sha(await read(u));}
const result={scope:'current_bundled_skill_and_frontend_entry_assets',model_started:false,browser_started:false,
  skill:{source:detail.source,directory:prepared.directory,revision:detail.revision,content_sha256:detail.content_sha256,
    files:detail.files.map(({path,sha256})=>({path,sha256}))},
  frontend:{url:base.href,files,coverage:'HTML and statically linked entry assets; dynamically loaded modules require live prepared build verification'}};
await fs.writeFile(process.argv[3],JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({passed:true,skill_revision:detail.revision,frontend_files:Object.keys(files).length,model_started:false}));
