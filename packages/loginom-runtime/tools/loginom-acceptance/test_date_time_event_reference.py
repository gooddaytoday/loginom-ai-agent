"""Reference-only operator export rejects foreign or changed journals."""
import subprocess
import unittest
from pathlib import Path

class EventReference(unittest.TestCase):
    def test_owned_hash_pinned_reference_and_negative_boundaries(self):
        root=Path(__file__).resolve().parents[2]
        script=r"""
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {readDiagnosticEvents} from './tools/loginom-acceptance/date-time-event-reference.mjs';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'node13-ref-'));try{
const dir=path.join(root,'.dock/stream-runtime/sessions/11111111-1111-1111-1111-111111111111');await fs.mkdir(dir,{recursive:true});
const file=path.join(dir,'execution-events.jsonl'),bytes='{"phase":"proof"}\n';await fs.writeFile(file,bytes);
const value={executor:'Codex operator diagnostic',model_started:false,events_ref:{path:file,sha256:createHash('sha256').update(bytes).digest('hex')}};
assert.deepEqual(await readDiagnosticEvents(value,{root}),[{phase:'proof'}]);
await assert.rejects(()=>readDiagnosticEvents({...value,model_started:true},{root}));
await assert.rejects(()=>readDiagnosticEvents({...value,events_ref:{...value.events_ref,sha256:'0'.repeat(64)}},{root}));
const foreign=path.join(root,'foreign');await fs.writeFile(foreign,bytes);await fs.unlink(file);await fs.symlink(foreign,file);await assert.rejects(()=>readDiagnosticEvents(value,{root}));
await fs.unlink(file);await fs.writeFile(file,bytes+'{}\n');await assert.rejects(()=>readDiagnosticEvents(value,{root}));
assert.deepEqual(await readDiagnosticEvents({events:[{phase:'normal'}]}),[{phase:'normal'}]);
}finally{await fs.rm(root,{recursive:true,force:true});}
"""
        subprocess.run([str(Path.home()/'.loginom-dock/current/runtime/node'),'--input-type=module','-e',script],cwd=root,check=True,capture_output=True,text=True)

if __name__=='__main__':unittest.main()
