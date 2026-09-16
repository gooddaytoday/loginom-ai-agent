// Diagnostic exports can reference their immutable journal instead of duplicating it.
import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function readDiagnosticEvents(evidence,{root=process.cwd()}={}) {
 if(Array.isArray(evidence.events))return evidence.events;
 const ref=evidence.events_ref;
 if(evidence.executor!=='Codex operator diagnostic'||evidence.model_started!==false||!ref
   ||typeof ref.path!=='string'||!/^[a-f0-9]{64}$/.test(ref.sha256))throw Error('Explicit model-free journal reference required');
 const base=await fs.realpath(path.join(root,'.dock/stream-runtime/sessions'));
 const file=await fs.realpath(path.resolve(root,ref.path));const relative=path.relative(base,file);
 if(!/^[a-f0-9-]{36}\/execution-events\.jsonl$/.test(relative))throw Error('Owned original session journal required');
 const bytes=await fs.readFile(file);
 if(createHash('sha256').update(bytes).digest('hex')!==ref.sha256)throw Error('Original journal hash changed');
 return bytes.toString('utf8').trim().split('\n').map(JSON.parse);
}
