import test from 'node:test'
import assert from 'node:assert/strict'
import { loginPage } from '../src/connection-check.mjs'

function fixture(clickError, observe, record = async () => {}) {
  const events = []
  const read = () => ({ diagnostic_only: true })
  const page = {
    goto: async () => {},
    locator(selector) {
      return {
        locator() { return this }, or() { return this }, first() { return this },
        waitFor: async () => {}, isVisible: async () => false,
        fill: async () => { events.push(selector.includes('edtUsername') ? 'username' : 'password-fill') },
        click: async () => { events.push(selector.includes('edtPassword') ? 'password-click' : 'login-click'); throw clickError },
        inputValue: async () => { events.push('password-value'); return '' },
      }
    },
    async evaluate(fn, binding) {
      if (fn !== read) { events.push('marker'); return }
      events.push('diagnostic')
      assert.deepEqual(binding, { ownerId: 'owner', account: 'User', origin: 'https://example.test' })
      return observe()
    },
  }
  const owner = {
    id: 'owner', account: 'User', origin: 'https://example.test', page,
    context: { pages: () => [page] },
    passwordClickDiagnostic: { read, record: async value => { events.push('receipt'); await record(value) } },
    close: async () => { events.push('close') },
  }
  const run = async () => {
    try { await loginPage(page, { url: 'https://example.test/app/', username: 'User', password: 'secret' }, owner) }
    finally { await owner.close() }
  }
  return { page, owner, events, run }
}

for (const original of [new Error('password click timed out'), undefined, null, false, 0, '']) {
  test('private receipt precedes close and retains click rejection ' + String(original), async () => {
    const receipt = { diagnostic_only: true, authority: false, items: [] }
    const f = fixture(original, async () => receipt, async value => assert.equal(value, receipt))
    let rejected = false
    try { await f.run() } catch (value) { rejected = true; assert.equal(value, original) }
    assert.equal(rejected, true)
    assert.deepEqual(f.events, ['marker', 'username', 'password-click', 'diagnostic', 'receipt', 'close'])
    assert.equal(f.owner.loginSubmitted, undefined)
    assert.equal(f.owner.deadline, undefined)
  })
}

for (const stage of ['evaluate', 'record']) {
  test(stage + ' failure cannot replace the original TimeoutError', async () => {
    const original = new Error('click timeout'); original.name = 'TimeoutError'
    const f = fixture(original,
      async () => { if (stage === 'evaluate') throw Error('read failed'); return {} },
      async () => { throw Error('record failed') })
    await assert.rejects(f.run(), error => error === original)
    assert.equal(f.events.filter(event => event === 'diagnostic').length, 1)
    assert.equal(f.owner.loginSubmitted, undefined)
    assert.equal(f.events.includes('login-click'), false)
    assert.equal(f.events.includes('password-fill'), false)
  })
}

test('slow evaluate stays before close, preserves primary, and never proceeds to login', async () => {
  let release, started
  const observed = new Promise(resolve => { started = resolve })
  const pending = new Promise(resolve => { release = resolve })
  const original = new Error('click timeout'); original.name = 'TimeoutError'
  const f = fixture(original, () => { started(); return pending })
  const run = f.run()
  await observed
  assert.deepEqual(f.events, ['marker', 'username', 'password-click', 'diagnostic'])
  assert.equal(f.owner.loginSubmitted, undefined)
  release({ diagnostic_only: true })
  await assert.rejects(run, error => error === original)
  assert.deepEqual(f.events.slice(-2), ['receipt', 'close'])
})

test('never-settling evaluate releases the primary error and cleanup at 1000ms', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let started
  const observed = new Promise(resolve => { started = resolve })
  const original = new Error('click timeout'); original.name = 'TimeoutError'
  const f = fixture(original, () => { started(); return new Promise(() => {}) })
  const run = f.run()
  await observed
  t.mock.timers.tick(999)
  assert.equal(f.events.includes('close'), false)
  t.mock.timers.tick(1)
  await assert.rejects(run, error => error === original)
  assert.deepEqual(f.events, ['marker', 'username', 'password-click', 'diagnostic', 'close'])
  assert.equal(f.owner.loginSubmitted, undefined)
  assert.equal(f.owner.deadline, undefined)
})

for (const late of ['returned', 'rejected']) {
  test('evaluate ' + late + ' after expiry never records or retries', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    let finish, fail, started
    const observed = new Promise(resolve => { started = resolve })
    const pending = new Promise((resolve, reject) => { finish = resolve; fail = reject })
    const original = new Error('click timeout')
    const f = fixture(original, () => { started(); return pending })
    const run = f.run()
    await observed
    t.mock.timers.tick(1000)
    await assert.rejects(run, error => error === original)
    if (late === 'returned') finish({ diagnostic_only: true })
    else fail(Error('late diagnostic failure'))
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(f.events, ['marker', 'username', 'password-click', 'diagnostic', 'close'])
    assert.equal(f.owner.loginSubmitted, undefined)
    assert.equal(f.owner.deadline, undefined)
  })
}

for (const change of ['no-opt-in', 'foreign-page', 'foreign-context', 'empty-binding', 'late-page-drift']) {
  test('diagnostic refuses ' + change + ' without changing the click error', async () => {
    const original = new Error('click timeout')
    const f = fixture(original, async () => {
      if (change === 'late-page-drift') f.owner.page = {}
      return {}
    })
    if (change === 'no-opt-in') delete f.owner.passwordClickDiagnostic
    if (change === 'foreign-page') f.owner.page = {}
    if (change === 'foreign-context') f.owner.context.pages = () => []
    if (change === 'empty-binding') f.owner.id = ''
    await assert.rejects(f.run(), error => error === original)
    assert.equal(f.events.includes('diagnostic'), change === 'late-page-drift')
    assert.equal(f.events.includes('receipt'), false)
    assert.equal(f.owner.loginSubmitted, undefined)
    assert.equal(f.events.includes('password-fill'), false)
    assert.equal(f.events.includes('login-click'), false)
  })
}
