import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ACCEPTANCE_CHECKS, EXECUTOR_REVISION } from '../lib/action-catalog.mjs';
import { minimumExecutorRevision, configurePackageRoots, configureSessionStorage } from '../../../../services/loginom-ai/deploy/loginom-dock/build-action-catalog.mjs';
import { requireCapability } from '../lib/capability-registry.mjs';
import { makeCapabilityCode } from '../lib/executor.mjs';

test('session storage catalogs require prepared host directories and retain immutable source actions', async () => {
  const source=JSON.parse(await readFile(new URL('../../executor/catalog/actions.json',import.meta.url),'utf8'));
  const before=JSON.stringify(source),catalog=configureSessionStorage(source);
  assert.equal(JSON.stringify(source),before);
  for(const action of catalog.actions.filter(a=>a.action_key.startsWith('package.'))){
    assert.equal(action.effect.destination_policy,'session_storage');assert.equal(action.effect.allowed_roots,undefined);
    assert.equal(action.min_executor_revision,'1.3.0');requireCapability(action);
    assert.throws(()=>makeCapabilityCode(action,new Map(),{path:'/operator/Мои пакеты/a.lgp'}),/not prepared/);
    const binding={document_id:'doc',loginom_account:'other-name',directories:{packages:'/operator/Мои пакеты',inputs:'/operator/Вход',exports:'/operator/Выход'}};
    assert.throws(()=>makeCapabilityCode(action,new Map(),{path:'/operator/Мои пакеты-extra/a.lgp'},{storage_binding:binding}),/outside/);
    const code=makeCapabilityCode({...action,selector_symbols:[]},new Map(),{path:'/operator/Мои пакеты/a.lgp'},{storage_binding:binding});
    assert.match(code,/session_storage/);
    assert.equal(new RegExp(action.input_schema.properties.path.pattern).test('/operator/Мои пакеты/a.lgp'),true);
  }
  assert.deepEqual(configureSessionStorage(catalog),catalog);
});

const exec = promisify(execFile);
const builder = fileURLToPath(new URL('../../../../services/loginom-ai/deploy/loginom-dock/build-action-catalog.mjs', import.meta.url));
const publisher = fileURLToPath(new URL('../../../../services/loginom-ai/deploy/loginom-dock/publish-action-catalog.py', import.meta.url));
const canonical = value => JSON.stringify(value, null, 2) + '\n';
const sha256 = value => createHash('sha256').update(value).digest('hex');

async function buildFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dock-admission-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const build = join(directory, 'candidate');
  await exec(process.execPath, [builder, '--out', build]);
  const manifestText = await readFile(join(build, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestText);
  // Synthetic contract evidence exists only in this test's temporary directory.
  const acceptance = { schema_version: 1, status: 'PASSED', manifest_sha256: sha256(manifestText),
    runtime: { clientRevision: 'd'.repeat(64), playwright: 'test', chromiumRevision: 'test', executorRevision: EXECUTOR_REVISION, capabilityAbi: 1 },
    target: manifest.compatibility, agent: { name: 'hermes', provider: 'openai-codex', model: 'gpt-5.6-sol', reasoning_effort: 'low' },
    checks: Object.fromEntries(ACCEPTANCE_CHECKS.map(key => [key, true])),
    evidence_uri: 'unit-test:synthetic', evidence_sha256: 'e'.repeat(64), recorded_at: '2026-09-04T00:00:00Z' };
  const attestation = join(directory, 'synthetic-acceptance.json');
  await writeFile(attestation, canonical(acceptance));
  return { directory, build, manifest, acceptance, attestation };
}

test('catalog builder selects the highest numeric action minimum and rejects malformed revisions', () => {
  const actions = revisions => revisions.map((revision, index) => ({
    action_key: `action.${index}`, min_executor_revision: revision,
  }));
  assert.equal(minimumExecutorRevision(actions(['1.9.100', '1.10.2', '1.10.1'])), '1.10.2');
  assert.equal(minimumExecutorRevision(actions(['2.0.0', '1.999.999', '0.999.999'])), '2.0.0');
  assert.equal(minimumExecutorRevision(actions(['1.0.10', '1.0.9', '1.0.10'])), '1.0.10');
  for (const invalid of [undefined, null, 1, '1.0', '1.0.0-beta', '1.0.0.1', '1.-1.0', '9007199254740992.0.0']) {
    assert.throws(() => minimumExecutorRevision(actions(['1.0.0', invalid])), /min_executor_revision/);
  }
  assert.throws(() => minimumExecutorRevision([]), /must contain actions/);
});

test('generated release manifest declares the actual highest minimum required by its actions', async t => {
  const fixture = await buildFixture(t);
  const { actions } = JSON.parse(await readFile(join(fixture.build, 'actions.json'), 'utf8'));
  const descending = actions.map(action => action.min_executor_revision).sort((left, right) => {
    const leftParts = left.split('.').map(Number), rightParts = right.split('.').map(Number);
    return rightParts[0] - leftParts[0] || rightParts[1] - leftParts[1] || rightParts[2] - leftParts[2];
  });
  assert.equal(fixture.manifest.min_executor_revision, descending[0]);
});

test('candidate build is the default and publisher admission requires complete exact replay evidence',
  { skip: process.platform === 'win32' && 'Publisher is a VPS Python component' }, async t => {
    const fixture = await buildFixture(t);
    assert.equal(fixture.manifest.status, 'candidate');
    assert.ok(JSON.parse(await readFile(join(fixture.build, 'actions.json'), 'utf8')).actions.every(action => action.status === 'candidate'));
    const base = [publisher, '--build', fixture.build, '--validate-only'];
    await exec('python3', [...base, '--stage']);
    await assert.rejects(exec('python3', [...base, '--activate']), /Replay acceptance must be an object/);
    await exec('python3', [...base, '--activate', '--attestation', fixture.attestation]);
    for (const mutate of [
      value => { value.manifest_sha256 = 'b'.repeat(64); },
      value => { value.checks.cleanup = false; },
      value => { value.runtime.clientRevision = 'not-a-digest'; },
      value => { value.target.loginom_build = 'another-build'; },
      value => { value.agent.provider = 'another-provider'; },
      value => { value.agent.model = 'mimo-v2.5'; },
      value => { value.agent.reasoning_effort = 'high'; },
      value => { delete value.agent.reasoning_effort; },
    ]) {
      const changed = structuredClone(fixture.acceptance); mutate(changed);
      await writeFile(fixture.attestation, canonical(changed));
      await assert.rejects(exec('python3', [...base, '--activate', '--attestation', fixture.attestation]), /Action catalog validation failed/);
    }
  });

const publicationSimulation = String.raw`
import importlib.util, io, json, sys
sys.dont_write_bytecode = True
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse
spec = importlib.util.spec_from_file_location("publisher_under_test", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
build, attestation, scratch, failure = Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4]), sys.argv[5]
manifest = json.loads((build / "manifest.json").read_text())
index = json.loads((build / "source-index.json").read_text())
release = module.ROOT + "/releases/" + manifest["catalog_version"]
remote = {release + "/" + name: (build / name).read_text() for name in (*module.FILES, "manifest.json")}
remote[module.SOURCE_MANIFEST] = json.dumps({"commit": manifest["e2e_commit"], "files": [{"path": p, "sha256": s} for p, s in index["source_files"].items()]})
remote[module.ROOT + "/current.json"] = "previous-current"
events = []
reads = {}
def fake_urlopen(request, timeout=None):
    url = urlparse(request.full_url)
    if url.path.endswith("/read"):
        uri = parse_qs(url.query)["uri"][0]
        events.append(["read", uri])
        reads[uri] = reads.get(uri, 0) + 1
        if uri not in remote:
            raise HTTPError(request.full_url, 404, "not found", {}, None)
        result = remote[uri]
        if failure == "corrupt-readback" and uri == release + "/actions.json" and reads[uri] == 2:
            result += " "
    else:
        body = json.loads(request.data)
        uri = body["uri"]
        events.append(["write", uri])
        remote[uri] = body["content"]
        result = True
    return io.StringIO(json.dumps({"result": result}))
module.urlopen = fake_urlopen
admin = scratch / "fake-admin.json"
admin.write_text(json.dumps({"user_key": "synthetic-unit-test-key"}))
sys.argv = [sys.argv[1], "--build", str(build), "--activate", "--attestation", str(attestation), "--admin", str(admin), "--report", str(scratch / "report.json")]
error = None
try:
    module.main()
except SystemExit as caught:
    error = str(caught)
pointer = module.ROOT + "/current.json"
if failure == "corrupt-readback":
    assert error and "verification failed" in error
    assert remote[pointer] == "previous-current"
    assert not any(event == ["write", pointer] for event in events)
else:
    assert error is None
    pointer_write = events.index(["write", pointer])
    for name in (*module.FILES, "manifest.json"):
        uri = release + "/" + name
        assert remote[uri] == (build / name).read_text()
        assert ["write", uri] not in events
        assert sum(event == ["read", uri] for event in events[:pointer_write]) >= 2
    current = json.loads(remote[pointer])
    assert current["status"] == "production"
    assert current["manifest_sha256"] == module.digest((build / "manifest.json").read_text())
    assert events.index(["read", current["acceptance_uri"]], events.index(["write", current["acceptance_uri"]])) < pointer_write
print(json.dumps({"simulation_passed": True, "failure": failure}))
`;

test('publisher verifies immutable bytes before admission and leaves the old pointer on readback failure',
  { skip: process.platform === 'win32' && 'Publisher is a VPS Python component' }, async t => {
    const fixture = await buildFixture(t);
    for (const failure of ['none', 'corrupt-readback']) {
      const result = await exec('python3', ['-c', publicationSimulation, publisher, fixture.build,
        fixture.attestation, fixture.directory, failure]);
      assert.match(result.stdout, /"simulation_passed": true/);
    }
  });


test('package destination override is explicit, bounded and does not assume an account name',()=>{
  const source={actions:[{action_key:'package.save_as',revision:'1',status:'stale',effect:{kind:'save',resource:'package',allowed_roots:['/user/data/packages']}}]};
  for(const root of ['/test/packages','/analyst/team packages']) {
    const result=configurePackageRoots(source,[root]);
    assert.deepEqual(result.actions[0].effect.allowed_roots,[root]);assert.equal(result.actions[0].revision,'2');
    assert.equal(result.actions[0].status,'stale');assert.deepEqual(source.actions[0].effect.allowed_roots,['/user/data/packages']);
    assert.equal(configurePackageRoots(result,[root]).actions[0].revision,'2');
  }
  assert.equal(configurePackageRoots(source,undefined),source);
  for(const roots of [[],['/'],['/test/../user'],['relative'],['/test','/test'],['/test%2fsecret']])
    assert.throws(()=>configurePackageRoots(source,roots),/destination roots/);
});

test('package roots change the pinned catalog only under an explicit new candidate version',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'dock-package-root-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  await assert.rejects(exec(process.execPath,[builder,'--out',join(dir,'missing-version'),'--package-root','/test/packages']),/explicit new/);
  const out=join(dir,'candidate');
  await exec(process.execPath,[builder,'--out',out,'--version','2026.09.06-test-root','--package-root','/test/packages']);
  const text=await readFile(join(out,'actions.json'),'utf8'),catalog=JSON.parse(text),manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));
  assert.deepEqual(catalog.actions.find(a=>a.action_key==='package.save_as').effect.allowed_roots,['/test/packages']);
  assert.deepEqual(catalog.actions.find(a=>a.action_key==='package.save_checkpoint').effect.allowed_roots,['/test/packages']);
  assert.equal(manifest.files['actions.json'],sha256(text));assert.equal(manifest.status,'candidate');
});
