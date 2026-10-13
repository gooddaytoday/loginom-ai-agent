// Input acquisition checker only. Never install these proxies or dispatch native IO.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import vm from 'node:vm';

const directory = process.argv[2];
assert(directory, 'usage: node terminal-native-input-check.mjs <pinned-input-directory>');
const pins = {
  'MainForm.js': 'd0b2324d7162816d675e52adc5a5674b46b635d516157ced799ea33690a3c42e',
  'bg.model.rpc.js': '53d043e4a7ee9dcc8006aa8915ca43d83a1df427fa0d73d8ea403357ec61a28f',
  'bg.rtl.js': '052ec6039e68de03f2e34fea56c3e3ed8b7b0dddadb03281ff8d9a816e6e5dc9',
  'bg.rtl.rpc.js': '11ac2c63d2e8162b974f57d14e0f4f57b19cc80d3d39797be377e22eced6a973',
};
const inputs = {};
for (const [name, hash] of Object.entries(pins)) {
  const bytes = readFileSync(join(directory, name));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, name);
  inputs[name] = bytes.toString('utf8');
}
function body(file, type, method) {
  const text = inputs[file];
  const start = text.indexOf(`ss.initClass($bg_rpc_${type}_Proxy, $asm, {`);
  assert(start >= 0, type);
  const end = text.indexOf('\n\tss.initClass(', start + 1);
  const block = text.slice(start, end);
  const marker = `\n\t\t${method}: function`;
  const begin = block.indexOf(marker);
  assert(begin >= 0, method);
  const finish = block.indexOf('\n\t\t},', begin);
  assert(finish >= 0, method);
  return block.slice(begin + marker.length - 'function'.length, finish + 4);
}
const save = body('bg.model.rpc.js', 'TIBGBaseDeductorServerSession', 'SavePackageAs');
const own = body('bg.rtl.rpc.js', 'TIBGFileStorage', 'get_IsOwnCurrentDirectory');
const open = body('bg.rtl.rpc.js', 'TIBGFileStorage', 'OpenFile');
const persist = body('bg.rtl.rpc.js', 'TIBGStreamPersist', 'SaveToStream');
assert(save.includes('1808, 0)'));
assert(save.includes('$I(APackage, 893, false)'));
assert(save.startsWith('function(APackage, AFileName)'));
assert(own.includes('910, 0)'));
assert(open.includes('921, 0)'));
assert(open.includes('$R(x__ObjectData.W, x__ObjectData.O, 402)'));
assert(persist.includes('1291, 0)'));
assert(inputs['MainForm.js'].includes('Session.SavePackage(modelPackage)'));

// Exact proxy bodies, with explicitly doubled Saltarelle task/transport services.
// No Page, package serializer, storage implementation or native completion is mocked as proof.
async function execute(source, args, expected, rejected = false, primary) {
  let resume;
  const facts = { dispatches: 0, releases: 0, object: null, strings: [] };
  class TaskCompletionSource {
    constructor() { this.task = new Promise((resolve, reject) => { this.setResult = resolve; this.setException = reject; }); }
  }
  const response = {
    Release() { facts.releases++; }, set_StaticDataSize() {},
    ReadParameterBoolean() { return expected; },
    ReadParameterInt32(offset) { return offset ? 73 : 11; },
  };
  const request = {
    set_StaticDataSize() {}, InitializeMethodCallMessage(...args) { facts.method = args[2]; },
    WriteParameter$a() {}, WriteParameterEnum() {},
    WriteString(value) { facts.strings.push(value); return 0; },
    Release() { facts.releases++; },
  };
  const session = {
    $M: { GetDynamicData() { return request; } },
    $I(object, type) { facts.object = object; facts.type = type; return { W: 11, O: 73 }; },
    $R(owner, object, type) { assert.deepEqual([owner, object, type], [11, 73, 402]); return expected; },
    DispatchMessageAsync() {
      facts.dispatches++;
      return { continueWith(fn) { resume = fn; }, getAwaitedResult() { if (rejected) throw primary; return response; } };
    },
  };
  const fn = vm.runInNewContext(`(${source})`, {
    ss: { TaskCompletionSource, mkdel(owner, fn) { return fn.bind(owner); }, Exception: { wrap(value) { return value; } } },
  });
  const task = fn.apply({ $: { $OW: 11, $O: 73 }, $S: session }, args);
  const outcome = task.then(value => ({ ok: true, value }), value => ({ ok: false, value }));
  let settled = false;
  outcome.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(facts.releases, 0);
  assert.equal(facts.dispatches, 1);
  resume();
  const result = await outcome;
  assert.equal(result.ok, !rejected);
  assert.equal(result.value, rejected ? primary : expected);
  assert.equal(facts.releases, rejected ? 0 : 2);
  return facts;
}
const original = {};
const saved = await execute(save, [original, '/personal/fixed-uuid.lgp'], null);
assert.equal(saved.object, original);
assert.deepEqual(saved.strings, ['/personal/fixed-uuid.lgp']);
for (const value of [new Error('transport', { cause: 0 }), undefined, null, false, 0, '']) {
  await execute(save, [original, '/personal/fixed-uuid.lgp'], null, true, value);
}
await execute(own, [], true);
await execute(own, [], false);
await execute(open, ['/personal/fixed-uuid.lgp', 0, 1], {});
console.log(JSON.stringify({
  checks: 10, pins, proxy_bodies_unchanged: true,
  transport_task_doubles: true, actual_native_dispatches: 0,
  save_reply: null, saved_bytes_returned: false,
  stream_reader_qualified: false, package_stream_persist_qualified: false,
  complete_content_coverage: false, original_personal_root_qualified: false,
  terminal_save_authorized: false,
}, null, 2));
