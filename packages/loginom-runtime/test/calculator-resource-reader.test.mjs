import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
const {createCalculatorResourceReader} = await import(process.env.CALCULATOR_READER_SOURCE
  ? pathToFileURL(process.env.CALCULATOR_READER_SOURCE) : new URL('../src/acceptance/calculator-resource-reader.mjs', import.meta.url));

// Serialized Page/handle and native Session objects are doubles, not native
// authority. The actual production reader executes unchanged in this realm.
function fixture() {
  const document = {}, packages = {Count: 1}, events = [];
  const user = {async get_Name() { events.push('name'); return 'own'; }};
  const session = {async get_CurrentUser() { events.push('user'); return user; }};
  const connection = {Session: session, Connected: true, UserName: 'own'};
  const tree = {FServerConnection: connection, PackageNodes: packages, HasRunningNodes: () => false};
  const globals = {document, location: {origin: 'https://own.invalid'},
    __loginomStartupV1: {document, id: 'owner', account: 'own'},
    bg: {app: {Version: '7.4.2', Application: {FInstance: {FMainForm: {FMapTree: tree}}}}}};
  const realm = vm.createContext(globals);
  const evaluate = (fn, arg) => { realm.arg = arg; return vm.runInContext(`(${fn.toString()})(arg)`, realm); };
  const page = {isClosed: () => false, async evaluateHandle(fn, arg) {
    events.push('retain'); const refs = await evaluate(fn, arg);
    return {evaluate: fn => evaluate(fn, refs), async dispose() { events.push('dispose'); if ('disposeError' in page) throw page.disposeError; }};
  }};
  const context = {pages: () => [page]}, controller = new AbortController();
  const owner = {id: 'owner', account: 'own', origin: 'https://own.invalid', page, context,
    deadline: null, signal: controller.signal};
  owner.readinessBinding = Object.freeze({...owner});
  return {owner, page, controller, connection, session, user, tree, packages, globals, events};
}
const identityChanges = {
  document: f => { f.globals.document = {}; },
  marker: f => { f.globals.__loginomStartupV1 = {...f.globals.__loginomStartupV1}; },
  'marker.document': f => { f.globals.__loginomStartupV1.document = {}; },
  'marker.id': f => { f.globals.__loginomStartupV1.id = 'different'; },
  'marker.account': f => { f.globals.__loginomStartupV1.account = 'different'; },
  origin: f => { f.globals.location.origin = 'https://different.invalid'; },
  build: f => { f.globals.bg.app.Version = 'different'; },
  tree: f => { f.globals.bg.app.Application.FInstance.FMainForm.FMapTree = {...f.tree}; },
  connection: f => { f.tree.FServerConnection = {...f.connection}; },
  session: f => { f.connection.Session = {...f.session}; },
  connected: f => { f.connection.Connected = false; },
  account: f => { f.connection.UserName = 'different'; },
  packages: f => { f.tree.PackageNodes = {...f.packages}; },
};
for (const [member, change] of Object.entries(identityChanges))
  test(`diagnostic first member ${member} retains refusal and does not replay`, async () => {
    const f = fixture(), reader = await createCalculatorResourceReader(f.owner);
    change(f);
    let first;
    for (let i = 0; i < 2; i++) {
      await assert.rejects(reader.read(), error => {
        assert.equal(error.message, 'LOGINOM_CALCULATOR_NATIVE_IDENTITY_CHANGED');
        assert.equal(error.cause, member);
        if (i === 0) first = error; else assert.equal(error, first);
        return true;
      });
    }
    assert.deepEqual(f.events, ['retain']);
  });
test('diagnostic first mismatch short-circuits later getters', async () => {
  const f = fixture(), reader = await createCalculatorResourceReader(f.owner);
  identityChanges.document(f);
  Object.defineProperty(f.tree, 'FServerConnection', {get() {throw Error('later getter must not run');}});
  await assert.rejects(reader.read(), error => error.cause === 'document');
});
for (const stage of ['user', 'name'])
  test(`diagnostic identity loss after ${stage} await retains member`, async () => {
    const f = fixture(), reader = await createCalculatorResourceReader(f.owner);
    if (stage === 'user') f.session.get_CurrentUser = async () => {identityChanges.session(f); return f.user;};
    else f.user.get_Name = async () => {identityChanges.packages(f); return 'own';};
    await assert.rejects(reader.read(), error => {
      assert.equal(error.message, stage === 'user' ? 'LOGINOM_CALCULATOR_NATIVE_IDENTITY_CHANGED' : 'LOGINOM_CALCULATOR_RESOURCE_CHANGED');
      assert.equal(error.cause, stage === 'user' ? 'session' : 'packages');
      return true;
    });
  });
for (const value of [undefined, null, false, 0, '', Error('getter', {cause: 0})])
  test(`diagnostic throwing identity getter preserves raw ${String(value)}`, async () => {
    const f = fixture(), reader = await createCalculatorResourceReader(f.owner);
    Object.defineProperty(f.connection, 'Session', {get() {throw value;}});
    const observed = await reader.read().then(() => ({ok:true}), error => ({ok:false,error}));
    assert.equal(observed.ok, false);
    if (value instanceof Error) {assert.equal(observed.error.message,value.message);assert.equal(observed.error.cause,0);}
    else assert.equal(observed.error,value);
  });
test('same Page opaque refs produce only bounded current-session facts', async () => {
  const f = fixture(), reader = await createCalculatorResourceReader(f.owner);
  const result = await reader.read();
  assert.equal(result.package_count, 1); assert.equal(result.running, false);
  assert.equal(result.scope, 'current-owned-session'); assert.equal(result.account_wide_safety_verified, false);
  assert.equal(result.historical_cleanup_verified, false); assert.ok(!('session' in result));
  await reader.dispose(); await reader.dispose(); assert.equal(f.events.filter(x => x === 'dispose').length, 1);
  await assert.rejects(reader.read());
});
for (const field of ['id', 'account', 'origin', 'page', 'context', 'deadline', 'signal'])
  test(`original host ${field} cannot be rebound`, async () => {
    const f = fixture(), reader = await createCalculatorResourceReader(f.owner);
    f.owner[field] = field === 'deadline' ? Date.now() + 50000 : {};
    await assert.rejects(reader.read(), /OWNER_CHANGED/); assert.deepEqual(f.events, ['retain']);
  });
for (const field of ['session', 'connection', 'packages', 'document', 'marker'])
  test(`same-name native ${field} replacement refuses before read`, async () => {
    const f = fixture(), reader = await createCalculatorResourceReader(f.owner);
    if (field === 'session') f.connection.Session = {...f.session};
    if (field === 'connection') f.tree.FServerConnection = {...f.connection};
    if (field === 'packages') f.tree.PackageNodes = {...f.packages};
    if (field === 'document') f.globals.document = {};
    if (field === 'marker') f.globals.__loginomStartupV1 = {...f.globals.__loginomStartupV1};
    await assert.rejects(reader.read(), /NATIVE_IDENTITY_CHANGED/); assert.deepEqual(f.events, ['retain']);
  });
for (const value of [undefined, null, false, '', -1, 1.5, NaN])
  test(`unknown count ${String(value)} refuses`, async () => {
    const f = fixture(), reader = await createCalculatorResourceReader(f.owner); f.packages.Count = value;
    await assert.rejects(reader.read(), /RESOURCE_FACT_UNKNOWN/);
  });
for (const value of [undefined, null, 0, '', Error('unknown')])
  test(`non-boolean running ${String(value)} refuses`, async () => {
    const f = fixture(), reader = await createCalculatorResourceReader(f.owner); f.tree.HasRunningNodes = () => value;
    await assert.rejects(reader.read(), /RESOURCE_FACT_UNKNOWN/);
  });
for (const error of [undefined, null, false, 0, '', Error('primary', {cause: 0})])
  test(`raw native rejection ${String(error)} is retained without replay`, async () => {
    const f = fixture(), reader = await createCalculatorResourceReader(f.owner);
    f.session.get_CurrentUser = async () => { f.events.push('reject'); throw error; };
    let first;
    for (let i = 0; i < 2; i++) {
      const observed = await reader.read().then(() => ({ok: true}), value => ({ok: false, value}));
      assert.equal(observed.ok, false);
      if (error instanceof Error) { assert.equal(observed.value.message, error.message); assert.equal(observed.value.cause, error.cause); }
      else assert.equal(observed.value, error);
      if (i === 0) first = observed.value; else assert.equal(observed.value, first);
    }
    assert.equal(f.events.filter(x => x === 'reject').length, 1); await reader.dispose();
  });
test('authority loss between native awaits refuses', async () => {
  const f = fixture(), reader = await createCalculatorResourceReader(f.owner);
  f.session.get_CurrentUser = async () => { f.connection.Session = {...f.session}; return f.user; };
  await assert.rejects(reader.read(), /NATIVE_IDENTITY_CHANGED/);
});
test('count change during read is not a settled resource snapshot', async () => {
  const f = fixture(), reader = await createCalculatorResourceReader(f.owner);
  f.user.get_Name = async () => { f.packages.Count++; return 'own'; };
  await assert.rejects(reader.read(), /RESOURCE_CHANGED/);
});
test('cancel leaves original pending read in custody until its own settlement', async () => {
  const f = fixture(), reader = await createCalculatorResourceReader(f.owner);
  let settle, entered;
  const started = new Promise(resolve => { entered = resolve; });
  f.session.get_CurrentUser = () => { entered(); return new Promise(resolve => { settle = resolve; }); };
  const pending = reader.read().then(() => ({ok: true}), error => ({ok: false, error}));
  await started;
  const reason = Error('cancel', {cause: 0}); f.controller.abort(reason);
  assert.equal((await pending).error, reason);
  assert.throws(() => reader.assertSettled(), /READ_PENDING/);
  await assert.rejects(reader.dispose(), /READ_PENDING/);
  await assert.rejects(reader.read()); assert.equal(f.events.includes('dispose'), false);
  settle(f.user); await new Promise(resolve => setImmediate(resolve));
  reader.assertSettled(); // Settled read still does not authorize expired/aborted cleanup.
  await assert.rejects(reader.dispose(), error => error === reason);
});
test('capture uses its current deadline, not an expired completed startup budget', async () => {
  const f = fixture(); f.owner.deadline = Date.now() + 1000;
  f.owner.readinessBinding = Object.freeze({...f.owner});
  const reader = await createCalculatorResourceReader(f.owner);
  await new Promise(resolve => setTimeout(resolve, 1050));
  assert.equal((await reader.read({deadline: Date.now() + 1000})).package_count, 1);
  await reader.dispose();
});
test('expired capture deadline refuses before native read', async () => {
  const f = fixture(), reader = await createCalculatorResourceReader(f.owner);
  await assert.rejects(reader.read({deadline: Date.now() - 1}), /READ_DEADLINE/);
  assert.deepEqual(f.events, ['retain']); await reader.dispose();
});
for (const error of [undefined, null, false, 0, '', Error('dispose', {cause: 0})])
  test(`handle disposal rejection ${String(error)} does not replay`, async () => {
    const f = fixture(), reader = await createCalculatorResourceReader(f.owner); f.page.disposeError = error;
    for (let i = 0; i < 2; i++) {
      const result = await reader.dispose().then(() => ({ok: true}), value => ({ok: false, value}));
      assert.equal(result.ok, false); assert.equal(result.value, error);
    }
    assert.equal(f.events.filter(x => x === 'dispose').length, 1);
  });
