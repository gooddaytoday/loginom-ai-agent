import {readFileSync} from 'node:fs';
import {dirname, join, basename} from 'node:path';
import {createHash, randomBytes} from 'node:crypto';
import {privatePath, savePrivateArtifact, configBindings, verifyParentEnvelope} from './parent-readback.mjs';
import {verifyBeforeBucket, verifyHeldAccountGuard, requireSameObserver} from './account-identity.mjs';
import {verifyCalibratedInventory, verifyFinalReadback} from './account-lifecycle.mjs';
import {bootstrapBindings} from './admin-bindings.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const fail = code => {throw Object.assign(Error(code), {code});};
const registered = new WeakSet();
const live = record => {
  const fields = readFileSync(`/proc/${record.pid}/stat`, 'utf8').split(')').at(-1).trim().split(/\s+/);
  if (fields[19] !== record.start_ticks || ['Z', 'X'].includes(fields[0])) fail('CAPTURE_PARENT_PROVENANCE_UNKNOWN');
};

export function verifyHarnessGuards(envelope, operation) {
  const audit = envelope.audit;
  if (audit?.schema !== 'parent-held-audited-harness-v1' || audit.source_sha !== operation.source.sha
    || audit.manifest_sha256 !== operation.source.manifest_sha256 || audit.entrypoint !== 'qualify-preparation.mjs'
    || !Number.isSafeInteger(audit.parent?.pid) || !/^\d+$/.test(audit.parent?.start_ticks)) fail('CAPTURE_GUARD_AUDIT_UNKNOWN');
  live(audit.parent);
  const root = dirname(dirname(new URL(import.meta.url).pathname));
  const manifest = readFileSync(join(root, 'VERSION.json'));
  if (hash(manifest) !== audit.manifest_sha256) fail('CAPTURE_SOURCE_CHANGED');
  for (const [path, digest] of Object.entries(JSON.parse(manifest).files)) {
    if (hash(readFileSync(join(root, path))) !== digest) fail('CAPTURE_SOURCE_CHANGED');
  }
  const proofFile = join(dirname(process.env.LOGINOM_ACCOUNTS_GUARDS_FILE), 'flock-barrier.json');
  privatePath(proofFile);
  const raw = readFileSync(proofFile), proof = JSON.parse(raw);
  if (proof.schema !== 'account-flock-barrier-v1' || proof.flock_policy !== 'deny-all-EPERM'
    || proof.no_new_privs !== true || JSON.stringify(proof.guards) !== JSON.stringify(envelope.guards))
    fail('CAPTURE_FLOCK_BARRIER_UNKNOWN');
  const architecture = {x64: ['x86_64', 0xc000003e, 73], arm64: ['aarch64', 0xc00000b7, 32]}[process.arch];
  if (!architecture || architecture[0] !== proof.arch) fail('CAPTURE_FLOCK_BARRIER_UNKNOWN');
  const instructions = [[0x20, 0, 0, 4], [0x15, 1, 0, architecture[1]], [0x06, 0, 0, 0x80000000],
    [0x20, 0, 0, 0], [0x45, 0, 1, 0x40000000], [0x06, 0, 0, 0x80000000],
    [0x15, 0, 1, architecture[2]], [0x06, 0, 0, 0x50001], [0x06, 0, 0, 0x7fff0000]];
  const program = Buffer.alloc(instructions.length * 8);
  instructions.forEach(([code, jt, jf, value], i) => {
    program.writeUInt16LE(code, i * 8); program[i * 8 + 2] = jt; program[i * 8 + 3] = jf;
    program.writeUInt32LE(value, i * 8 + 4);
  });
  if (hash(program) !== proof.program_sha256) fail('CAPTURE_FLOCK_BARRIER_UNKNOWN');
  live(proof.supervisor);
  const current = readFileSync('/proc/self/stat', 'utf8').split(')').at(-1).trim().split(/\s+/);
  const parent = readFileSync(`/proc/${proof.supervisor.pid}/stat`, 'utf8').split(')').at(-1).trim().split(/\s+/);
  const command = readFileSync('/proc/self/cmdline', 'utf8').split('\0').filter(Boolean);
  if (Number(current[1]) !== proof.supervisor.pid || Number(parent[1]) !== audit.parent.pid
    || hash(JSON.stringify(command)) !== proof.command_sha256 || JSON.stringify(command) !== JSON.stringify(proof.command))
    fail('CAPTURE_PARENT_PROVENANCE_UNKNOWN');
  const entrypoint = command[1];
  const production = join(root, 'scripts/qualify-preparation.mjs');
  const fixture = join(root, 'tests/linked-harness.mjs');
  const bootstrapFixture = join(root, 'tests/admin-harness.mjs');
  if (![production, fixture, bootstrapFixture].includes(entrypoint)) fail('CAPTURE_FIXED_HARNESS_REQUIRED');
  if (entrypoint === production) {
    const bootstrap = operation.schema === 'lab53-admin-bootstrap-operation-v1';
    const parentCommand = readFileSync(`/proc/${audit.parent.pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
    if (parentCommand[1] !== join(root, bootstrap ? 'scripts/admin-bootstrap.py' : 'scripts/qualification-coordinator.py')
      || hash(JSON.stringify(parentCommand)) !== audit.parent_command_sha256)
      fail('CAPTURE_FIXED_COORDINATOR_REQUIRED');
    const count = bootstrap ? 3 : 4;
    if (envelope.guards.length !== count || new Set(envelope.guards.map(g => g.fd)).size !== count)
      fail('CAPTURE_GUARD_AUDIT_UNKNOWN');
  }
  for (const pid of [process.pid, proof.supervisor.pid]) {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    if (!/^NoNewPrivs:\s+1$/m.test(status) || !/^Seccomp:\s+2$/m.test(status)) fail('CAPTURE_FLOCK_BARRIER_UNKNOWN');
  }
  for (const guard of envelope.guards) {
    const kernel = readFileSync(`/proc/${audit.parent.pid}/fdinfo/${guard.fd}`, 'utf8');
    if (!kernel.split('\n').some(line => /^lock:\s+\d+:\s+FLOCK\s+ADVISORY\s+WRITE\s/.test(line)
      && line.includes(':' + guard.inode + ' '))) fail('CAPTURE_PARENT_FLOCK_UNKNOWN');
    verifyHeldAccountGuard(guard, basename(guard.path).replace(/\.lock$/, ''));
  }
  return {...audit, receipt_sha256: hash(raw), barrier_program_sha256: proof.program_sha256,
    executed_entrypoint: entrypoint, executed_entrypoint_sha256: hash(readFileSync(entrypoint)),
    execution_kind: entrypoint === production ? 'production-qualification' : 'offline-fixture'};
}

export async function awaitPrivateResponse(directory, name, diagnostics) {
  const path = join(directory, name);
  while (true) {
    diagnostics.remaining();
    try {privatePath(path); return JSON.parse(readFileSync(path));}
    catch (error) {if (error.code !== 'ENOENT') throw error;}
    await new Promise(resolve => setTimeout(resolve, Math.min(50, diagnostics.remaining())));
  }
}

// The only production capture provider. No callback, executable, network,
// observer creation, credential or caller-supplied child identity is accepted.
export function makePrivateCaptureHarness({directory, operation, envelope, configs, diagnostics}) {
  return privateHarness({directory, operation, envelope, configs, diagnostics}, false);
}

export function makePrivateBootstrapHarness(options) {
  if (options.operation.schema !== 'lab53-admin-bootstrap-operation-v1') fail('BOOTSTRAP_OPERATION_UNKNOWN');
  return privateHarness(options, true);
}

function privateHarness({directory, operation, envelope, configs, diagnostics}, bootstrap) {
  privatePath(directory, true);
  const source = operation.source;
  const expectedObserver = operation.expected_observer;
  requireSameObserver(expectedObserver, {...expectedObserver, connected: true, mst_self_count: 1}, operation.stand);
  if (!/^[a-f0-9]{40}$/.test(source?.sha) || !/^[a-f0-9]{40}$/.test(source.tree)
    || !/^[a-f0-9]{64}$/.test(source.manifest_sha256)) fail('CAPTURE_SOURCE_UNKNOWN');
  const guards = () => verifyHarnessGuards(envelope, operation);
  guards();
  const readBindings = () => bootstrap ? bootstrapBindings(configs, operation.issue_id, operation.stand)
    : configBindings(configs, operation.issue_id, operation.stand);
  const {bindings} = readBindings();
  let sequence = 0;
  const retiredEffects = [];
  const sessions = new Map();
  const checkConfigs = () => {
    const now = readBindings().bindings;
    if (JSON.stringify(now) !== JSON.stringify(bindings)) fail('CAPTURE_CONFIG_CHANGED');
  };
  const phase = async (binding, phase) => {
    guards(); checkConfigs();
    const nonce = randomBytes(32).toString('hex');
    const request = {schema: 'lab53-parent-readback-request-v1', issue_id: operation.issue_id,
      operation_id: operation.operation_id, source, nonce, phase, stand: operation.stand,
      configs: bindings, effects: [], expected_observer: expectedObserver, capture_binding: binding,
      after: new Date().toISOString(), observer_access: 'existing-owner-Mac-Admin-native-CUA'};
    const name = 'capture-' + (++sequence) + '-' + phase;
    savePrivateArtifact(directory, name + '-request.json', request);
    const response = await awaitPrivateResponse(directory, name + '-response.json', diagnostics);
    const readback = verifyParentEnvelope(request, response);
    verifyCalibratedInventory(readback, request.after);
    if (bootstrap && retiredEffects.length && phase === 'before-operation') verifyFinalReadback(readback, retiredEffects, request.after);
    checkConfigs(); guards();
    savePrivateArtifact(directory, 'consumed-' + nonce + '.json', {request_sha256: hash(JSON.stringify(request)),
      response_sha256: hash(JSON.stringify(response)), operation_id: operation.operation_id, state: 'UNKNOWN'});
    const common = Object.fromEntries(['issue_id', 'operation_id', 'source_sha', 'nonce', 'config_sha256', 'user_hash', 'role']
      .map(key => [key, binding[key]]));
    return {...common, phase, readback};
  };
  const harness = Object.freeze({async before(config, role) {
    const users = readBindings().users;
    const index = bootstrap ? users.indexOf(hash(config.loginom.username)) : role === 'admin' ? 0 : role === 'worker' ? 1 : 2;
    if ((bootstrap ? role !== 'admin' || index < 0 : !['admin', 'worker', 'reviewer'].includes(role))
      || hash(config.loginom.username) !== users[index]) fail('CAPTURE_TARGET_UNKNOWN');
    const guard = envelope.guards.find(item => basename(item.path) === config.loginom.username + '.lock');
    const accountLock = verifyHeldAccountGuard(guard, config.loginom.username);
    const binding = {schema: 'lab53-causal-binding-v1', issue_id: operation.issue_id, operation_id: operation.operation_id,
      source_sha: source.sha, nonce: randomBytes(32).toString('hex'), config_sha256: bindings[index].sha256,
      role, user_hash: hash(config.loginom.username), stand: operation.stand, after: new Date().toISOString(),
      account_lock: accountLock, expected_observer: expectedObserver,
      ...(role === 'admin' && expectedObserver.user_hash === hash(config.loginom.username) ? {owner_baseline: expectedObserver} : {})};
    const before = await phase(binding, 'before-operation');
    verifyBeforeBucket(binding, before.readback);
    if (bootstrap && index === 0 && before.readback.rows.some(row => row.user_hash === users[1])) fail('BOOTSTRAP_TARGET_BUCKET_NOT_EMPTY');
    const token = Object.freeze({}); sessions.set(token, {binding, before}); return token;
  }, async during(token) {
    const session = sessions.get(token); if (!session || session.used) fail('CAPTURE_TOKEN_UNKNOWN');
    session.used = true;
    const during = await phase(session.binding, 'while-connected');
    return {...session, during, guard_audit: guards()};
  }, ...(bootstrap ? {retired(effect) {retiredEffects.push(effect);}} : {}), guards});
  registered.add(harness); return harness;
}

export function requireFixedHarness(harness) {
  if (!registered.has(harness)) fail('CAPTURE_FIXED_HARNESS_REQUIRED');
}
