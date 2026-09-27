import { afterEach, expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { mkdtemp, readdir, realpath, rm, mkdir, writeFile, symlink, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createHash } from "node:crypto"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(
  options: {
    managed?: "normal" | "duplicate" | "parallel" | "foreign" | "management" | "empty" | "missing-fd" | "abort"
    managementCommand?: boolean
    status?: string
    wrongBinding?: boolean
    noSession?: boolean
    twice?: boolean
    closeFailure?: boolean
    signalDuringFinish?: boolean
    failOptions?: boolean
    extraReceipt?: boolean
    integration?: { modelUrl: string; unregistered?: boolean }
  } = {},
) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "cli-completion-")))
  roots.push(root)
  if (options.managed) {
    await mkdir(join(root, "registration"))
    await writeFile(
      join(root, "registration/session-registration.json"),
      JSON.stringify({ version: 2, attemptId: "trusted-attempt", loginBarrier: 2 }),
      { mode: 0o600 },
    )
  }
  const directCode = `
    import { standalone } from './src/cli/standalone.ts';
    import { standaloneSessionCompletion } from './src/cli/standalone-run.ts';
    import { spawnSync } from 'node:child_process';
    import { fstatSync } from 'node:fs';
    import { createHash } from 'node:crypto';
    const options = ${JSON.stringify(options)};
    const events = [];
    const abort = new AbortController();
    let privateResult;
    const original = fstatSync(3);
    await standalone(['run'], async () => {
      if(options.managed === "missing-fd") delete process.env.LOGINOM_AI_AGENT_CLI_CONTROL_FD;
      const control = await standaloneSessionCompletion(abort.signal, options.managed ? ${JSON.stringify(join(root, "registration"))} : undefined);
      const descendant = spawnSync(process.execPath, ['--eval',
        'import {fstatSync} from "node:fs"; let same=false;try{const s=fstatSync(3);same=s.dev==='+original.dev+'&&s.ino==='+original.ino+'}catch{}; console.log(JSON.stringify({same,hasKey:process.env.LOGINOM_AI_AGENT_CLI_CONTROL_FD!==undefined}))'],
        {env:process.env,encoding:'utf8'});
      privateResult = { envRemoved: process.env.LOGINOM_AI_AGENT_CLI_CONTROL_FD === undefined,
        descendant: JSON.parse(descendant.stdout) };
      try {
        if (options.managed) {
          const binding={attemptId:options.managed==='foreign'?'foreign':'trusted-attempt',loginId:'00112233-4455-4677-8899-aabbccddeeff',generation:7,purpose:options.managed==='management'?'validation':'readiness',chat:options.managed==='management'?'00112233-4455-4677-8899-aabbccddeeff':'readiness',account:'fresh-user'};
          if(options.managed==='parallel') {
            await Promise.all([control.loginBarrier({phase:'begin',binding}),control.loginBarrier({phase:'begin',binding})]);
          } else if(options.managed!=='empty') {
            await control.loginBarrier({phase:'begin',binding});
            if(options.managed==='abort')abort.abort();
            if(options.managed==='duplicate')await control.loginBarrier({phase:'begin',binding});
            await control.loginBarrier({phase:'authenticated',binding});
          }
          if(options.managed==='management') { control.managementComplete();return }
        }
        if (!options.noSession) control.session('ses_actual_backend');
        if (options.twice) control.session('ses_foreign');
        await control.complete({ request: async (method, input) => {
          events.push(method);
          const binding = {attemptId:'trusted-attempt',generation:7,
            chat:createHash('sha256').update('ses_actual_backend').digest('hex'),
            sessionId:'fresh-user:19',documentId:'document-1',account:'fresh-user',
            packagePath:'/fresh-user/saved.lgp',saveOperationId:'saved-operation',mutationRevision:2};
          if (method === 'connection.session-completion-options') {
            if(options.failOptions) throw Error('arbitrary-secret-from-remote');
            if(options.wrongBinding) binding.chat='a'.repeat(64);
            return binding;
          }
          if (options.signalDuringFinish) abort.abort();
          return {version:1,completionId:input.completionId,binding:input.binding,
            status:options.status ?? 'SUCCEEDED', packageClosed:true,loggedOut:true,reason:null,
            ...(options.extraReceipt ? {unknown:'secret'} : {})};
        }}, 7);
      } finally {
        events.push('host.close');
        control.close();
        if(options.closeFailure)throw Error('fixture cleanup failed');
      }
    }).catch(() => {process.exitCode=1});
    console.log(JSON.stringify({events,...privateResult}));
  `
  if (options.integration) {
    const { acquireProfile } = await import("../../src/cli/profile")
    const { testProviderConfig } = await import("../lib/test-provider")
    const profile = await acquireProfile(join(root, "profile"), "dev")
    await writeFile(
      join(profile.paths.config, "loginom-ai-agent.json"),
      JSON.stringify({
        ...testProviderConfig(options.integration.modelUrl),
        permission: { "loginom_*": "allow" },
      }),
    )
    await profile.release()
    const bundle = join(root, "bundle")
    await mkdir(join(bundle, "host"), { recursive: true })
    await mkdir(join(bundle, "bin"))
    await symlink(process.env.LOGINOM_AI_AGENT_TEST_NODE!, join(bundle, "bin/node"))
    // Synthetic host fixture never uses Keychain/Chromium/Loginom.
    await writeFile(join(bundle, "bin/loginom-keychain"), "")
    await writeFile(
      join(bundle, "host/node-host.mjs"),
      `
      import {writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
      const seen={starts:0,acquires:[],finishes:0,envKeyPresent:process.env.LOGINOM_AI_AGENT_CLI_CONTROL_FD!==undefined};
      let binding;
      process.on('message',m=>{
        const reply=result=>process.send({id:m.id,result});
        if(m.method==='start'){seen.starts++;return reply({protocol:1,ready:true,pid:process.pid})}
        if(m.method==='connection.status')return reply({revision:1,generation:7,url:'https://fixture.test/',username:'fresh-user',folder:'/',hasApiKey:true,hasPassword:false,state:'ready',recoveryMode:'strict',${options.integration.unregistered ? "" : "sessionCompletion:'open',"}recoveries:[]});
        if(m.method==='acquire'){
          seen.acquires.push(m.input.session);
          binding={attemptId:'trusted-attempt',generation:7,chat:createHash('sha256').update(m.input.session).digest('hex'),
            sessionId:'fresh-user:19',documentId:'document-1',account:'fresh-user',packagePath:'/fresh-user/saved.lgp',saveOperationId:'saved-operation',mutationRevision:2};
          return reply({generation:7});
        }
        if(m.method==='tools')return reply({tools:[{name:'probe',description:'Synthetic fixture only',inputSchema:{type:'object',properties:{}}}]});
        if(m.method==='admit')return reply({admitted:true});
        if(m.method==='call')return reply({result:{content:[{type:'text',text:'{"ok":true}'}],isError:false},recoveryPending:false});
        if(m.method==='release')return reply(true);
        if(m.method==='connection.session-completion-options')return reply(binding);
        if(m.method==='connection.finish-own-session'){seen.finishes++;return reply({version:1,...m.input,status:'SUCCEEDED',packageClosed:true,loggedOut:true,reason:null})}
        if(m.method==='close'){writeFileSync(${JSON.stringify(join(root, "host-seen.json"))},JSON.stringify(seen));process.send({id:m.id,result:{closed:true}},()=>process.exit(0));return}
        process.send({id:m.id,error:'LOGINOM_HOST_REQUEST_FAILED'});
      });
    `,
    )
  }
  if (options.managementCommand) {
    const { acquireProfile } = await import("../../src/cli/profile")
    const profile = await acquireProfile(join(root, "profile"), "dev")
    await writeFile(
      join(profile.paths.loginom, "session-registration.json"),
      JSON.stringify({ version: 2, attemptId: "trusted-attempt", loginBarrier: 2 }),
      { mode: 0o600 },
    )
    await profile.release()
    const bundle = join(root, "bundle")
    await mkdir(join(bundle, "host"), { recursive: true })
    await mkdir(join(bundle, "bin"))
    await symlink(process.env.LOGINOM_AI_AGENT_TEST_NODE!, join(bundle, "bin/node"))
    await writeFile(join(bundle, "bin/loginom-keychain"), "")
    await writeFile(
      join(bundle, "host/node-host.mjs"),
      `
      import {randomUUID} from 'node:crypto';
      import {writeFileSync} from 'node:fs';
      let pending, ack;
      process.on('message',m=>{
        const reply=result=>process.send({id:m.id,result});
        if(m.id===ack){process.send({id:pending,error:'LOGINOM_LOGIN_BARRIER_UNKNOWN'});return}
        if(m.method==='start')return reply({protocol:1,ready:true,pid:process.pid});
        if(m.method==='connection.status')return reply({revision:1,generation:7,url:'https://fixture.test/',username:'fresh-user',folder:'/',hasApiKey:true,hasPassword:false,state:'ready'});
        if(m.method==='connection.check'){
          pending=m.id;ack=randomUUID();
          return process.send({id:ack,method:'login-barrier',input:{phase:'begin',binding:{attemptId:'trusted-attempt',loginId:'00112233-4455-4677-8899-aabbccddeeff',generation:7,purpose:'validation',chat:'00112233-4455-4677-8899-aabbccddeeff',account:'fresh-user'}}});
        }
        if(m.method==='close'){writeFileSync(${JSON.stringify(join(root, "managed-closed.json"))},JSON.stringify({closed:true}));process.send({id:m.id,result:{closed:true}},()=>process.exit(0))}
      });
    `,
    )
  }
  const code = options.managementCommand
    ? `
    import {standalone} from './src/cli/standalone.ts';
    import {standaloneCommand} from './src/cli/standalone-command.ts';
    await standalone(['loginom','check','--headless'],standaloneCommand).catch(()=>{process.exitCode=1});
    console.log(JSON.stringify({finished:true}));
  `
    : options.integration
      ? `
      import {fstatSync,writeFileSync} from 'node:fs';
      const original=fstatSync(3);
      // The local synthetic provider invokes this through the real backend bash tool.
      writeFileSync(${JSON.stringify(join(root, "capability-probe.ts"))},
        'import {fstatSync,writeFileSync} from "node:fs";let same=false;try{const s=fstatSync(3);same=s.dev==='+original.dev+'&&s.ino==='+original.ino+'}catch{};writeFileSync("capability-result.json",JSON.stringify({same,hasKey:process.env.LOGINOM_AI_AGENT_CLI_CONTROL_FD!==undefined,runtime:process.versions.bun}));');
      process.argv=['bun','standalone','run','--headless','--format','json','--dir',${JSON.stringify(root)},'--model','test/test-model','--dangerously-skip-permissions','--','fixture probe'];await import('./src/standalone.ts');`
      : directCode
  const relay = `
    const {spawn}=require('node:child_process');
    const child=spawn(${JSON.stringify(process.execPath)}, ['--eval', ${JSON.stringify(code)}], {
      cwd:${JSON.stringify(resolve(import.meta.dir, "../.."))},env:process.env,stdio:['ignore','pipe','pipe','pipe']});
    let out='',err='',buffer='';
    child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>err+=chunk);
    const channel=child.stdio[3];
    channel.on('error',()=>{});
    channel.on('data',chunk=>{buffer+=chunk;while(buffer.includes('\\n')){
      const end=buffer.indexOf('\\n');console.log(JSON.stringify({frame:JSON.parse(buffer.slice(0,end))}));buffer=buffer.slice(end+1);}});
    process.stdin.on('data',chunk=>{if(chunk.toString()==='__CLOSE__\\n')channel.end();else channel.write(chunk);});
    child.on('close',code=>{console.log(JSON.stringify({result:{code,stdout:out,stderr:err}}));process.exit(0)});
    process.on('SIGTERM',()=>{child.kill('SIGKILL');process.exit(1)});
  `
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("LOGINOM_AI_AGENT_TEST_NODE is required")
  const child = spawn(node, ["--eval", relay], {
    env: {
      ...process.env,
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
      LOGINOM_AI_AGENT_CLI_PROFILE: join(root, "profile"),
      LOGINOM_AI_AGENT_CLI_CONTROL_FD: "3",
      LOGINOM_AI_AGENT_CHANNEL: "dev",
      ...(options.integration || options.managementCommand
        ? {
            LOGINOM_AI_AGENT_CLI_BUNDLE: join(root, "bundle"),
            LOGINOM_AI_AGENT_PURE: "1",
            LOGINOM_AI_AGENT_STRICT_RECOVERY: "1",
          }
        : {}),
    },
    stdio: ["pipe", "pipe", "pipe"],
  })
  let buffer = "",
    errors = ""
  const frames: unknown[] = []
  const readers: { resolve(value: unknown): void; reject(error: Error): void }[] = []
  const result = Promise.withResolvers<{ code: number; stdout: string; stderr: string }>()
  child.stderr!.on("data", (chunk) => {
    errors += chunk
  })
  child.stdout!.on("data", (chunk) => {
    buffer += chunk.toString()
    while (buffer.includes("\n")) {
      const end = buffer.indexOf("\n"),
        value = JSON.parse(buffer.slice(0, end))
      buffer = buffer.slice(end + 1)
      if (value.result) {
        result.resolve(value.result)
        readers.splice(0).forEach((reader) => reader.reject(Error(JSON.stringify(value.result))))
        continue
      }
      const reader = readers.shift()
      if (reader) reader.resolve(value.frame)
      else frames.push(value.frame)
    }
  })
  child.on("exit", () => {
    readers.splice(0).forEach((reader) => reader.reject(Error("closed")))
  })
  const timer = setTimeout(
    () => {
      child.kill("SIGTERM")
      result.reject(Error("fixture deadline"))
    },
    options.integration ? 20000 : 7000,
  )
  return {
    root,
    peer: {
      write(value: string) {
        child.stdin!.write(value)
      },
      end() {
        child.stdin!.write("__CLOSE__\n")
      },
    },
    send(method: string) {
      child.stdin!.write(JSON.stringify({ version: options.managed ? 2 : 1, method }) + "\n")
    },
    async read() {
      return frames.length
        ? frames.shift()
        : new Promise<unknown>((resolve, reject) => readers.push({ resolve, reject }))
    },
    async result() {
      const value = await result.promise
      clearTimeout(timer)
      expect(errors).toBe("")
      expect(value.stderr).toBe(options.integration?.unregistered ? "CLI_START_FAILED\n" : "")
      expect(value.code).not.toBeNull()
      return {
        code: value.code,
        observation: options.integration ? {} : JSON.parse(value.stdout),
        guarded: (await readdir(join(root, "profile"))).includes(".writer"),
        stdout: value.stdout,
      }
    },
  }
}

test("real private FD returns current-session binding and receipt before cleanup; capability is absent in a child", async () => {
  const f = await fixture()
  expect(await f.read()).toEqual({ version: 1, type: "ready" })
  f.send("options")
  const options = (await f.read()) as { binding: { chat: string }; completionId: string }
  expect(options.binding.chat).toBe(createHash("sha256").update("ses_actual_backend").digest("hex"))
  expect(options.completionId).toMatch(/^[a-f0-9-]{36}$/)
  f.send("finish")
  expect(await f.read()).toMatchObject({
    type: "receipt",
    receipt: { status: "SUCCEEDED", completionId: options.completionId },
  })
  const result = await f.result()
  expect(result).toMatchObject({
    code: 0,
    guarded: false,
    observation: {
      envRemoved: true,
      descendant: { same: false, hasKey: false },
      events: ["connection.session-completion-options", "connection.finish-own-session", "host.close"],
    },
  })
  expect(result.stdout).not.toContain("trusted-attempt")
})

test("zero exit/model completion never sends finish without an explicit private request", async () => {
  const f = await fixture()
  await f.read()
  f.send("options")
  await f.read()
  f.peer.end()
  expect(await f.result()).toMatchObject({
    code: 1,
    guarded: true,
    observation: { events: ["connection.session-completion-options", "host.close"] },
  })
})

for (const frame of [
  '{"version":1,"method":"finish"}',
  '{"version":1,"method":"options","generation":7}',
  '{"version":1,"method":"options","method":"finish"}',
  '{"version":1,"method":"options"}\n{"version":1,"method":"finish"}',
  "x".repeat(257),
])
  test(`reject malformed, premature or caller-identity frame ${frame.slice(0, 60)}`, async () => {
    const f = await fixture()
    await f.read()
    f.peer.write(frame + "\n")
    const result = await f.result()
    expect(result.code).toBe(1)
    expect(result.guarded).toBe(true)
    expect(result.observation.events).not.toContain("connection.finish-own-session")
  })

for (const options of [{ wrongBinding: true }, { failOptions: true }, { noSession: true }, { twice: true }])
  test(`refuse absent/ambiguous/stale target ${JSON.stringify(options)}`, async () => {
    const f = await fixture(options)
    if (!options.noSession && !options.twice) {
      await f.read()
      f.send("options")
    }
    const result = await f.result()
    expect(result.code).toBe(1)
    expect(result.guarded).toBe(true)
    expect(result.observation.events).not.toContain("connection.finish-own-session")
  })

for (const options of [
  { status: "UNKNOWN" },
  { status: "BLOCKED" },
  { signalDuringFinish: true },
  { extraReceipt: true },
  { closeFailure: true },
])
  test(`non-success or lost cleanup keeps barrier ${JSON.stringify(options)}`, async () => {
    const f = await fixture(options)
    await f.read()
    f.send("options")
    await f.read()
    f.send("finish")
    const result = await f.result()
    expect(result.code).toBe(1)
    expect(result.guarded).toBe(true)
    expect(result.observation.events.filter((v: string) => v === "connection.finish-own-session")).toHaveLength(1)
  })

test("actual standalone RunCommand callback retains one Host through private completion", async () => {
  const { ManagedRuntime } = await import("effect")
  const { TestLLMServer } = await import("../lib/llm-server")
  const provider = ManagedRuntime.make(TestLLMServer.layer)
  try {
    const llm = await provider.runPromise(TestLLMServer)
    await provider.runPromise(llm.tool("loginom_probe", {}))
    await provider.runPromise(
      llm.tool("bash", {
        command: `'${process.execPath.replaceAll("'", "'\\''")}' run capability-probe.ts`,
        description: "Check inherited capability isolation in synthetic fixture",
      }),
    )
    await provider.runPromise(llm.text("fixture completed"))
    const f = await fixture({ integration: { modelUrl: llm.url } })
    expect(await f.read()).toEqual({ version: 1, type: "ready" })
    f.send("options")
    const options = (await f.read()) as { binding: { chat: string } }
    f.send("finish")
    expect(await f.read()).toMatchObject({
      type: "receipt",
      receipt: { status: "SUCCEEDED", binding: options.binding },
    })
    const result = await f.result()
    expect(result.code).toBe(0)
    expect(result.guarded).toBe(false)
    const seen = JSON.parse(await readFile(join(f.root, "host-seen.json"), "utf8"))
    expect(seen).toMatchObject({ starts: 1, finishes: 1, envKeyPresent: false })
    expect(seen.acquires.length).toBeGreaterThan(0)
    expect(new Set(seen.acquires).size).toBe(1)
    expect(options.binding.chat).toBe(createHash("sha256").update(seen.acquires[0]).digest("hex"))
    expect(JSON.parse(await readFile(join(f.root, "capability-result.json"), "utf8"))).toEqual({
      same: false,
      hasKey: false,
      runtime: process.versions.bun,
    })
    expect(result.stdout).not.toContain('"type":"receipt"')
  } finally {
    await provider.dispose()
  }
}, 30000)

test("actual standalone denies unregistered profile before any model call", async () => {
  const f = await fixture({ integration: { modelUrl: "http://127.0.0.1:1", unregistered: true } })
  const result = await f.result()
  expect(result.code).toBe(1)
  expect(result.guarded).toBe(true)
  expect(JSON.parse(await readFile(join(f.root, "host-seen.json"), "utf8"))).toMatchObject({
    starts: 1,
    finishes: 0,
    acquires: [],
  })
})

const loginId = "00112233-4455-4677-8899-aabbccddeeff"
async function acknowledgeLogin(
  f: Awaited<ReturnType<typeof fixture>>,
  phase: "begin" | "authenticated",
  purpose: "readiness" | "validation" = "readiness",
) {
  expect(await f.read()).toEqual({
    version: 2,
    type: "login",
    phase,
    binding: {
      attemptId: "trusted-attempt",
      loginId,
      generation: 7,
      purpose,
      chat: purpose === "validation" ? loginId : "readiness",
      account: "fresh-user",
    },
  })
  f.peer.write(JSON.stringify({ version: 2, method: "login-ack", loginId, phase }) + "\n")
}
test("managed v2 private FD registers before completion, keeps exact version and legacy receipt", async () => {
  const f = await fixture({ managed: "normal" })
  await acknowledgeLogin(f, "begin")
  await acknowledgeLogin(f, "authenticated")
  expect(await f.read()).toEqual({ version: 2, type: "ready" })
  f.send("options")
  expect(await f.read()).toMatchObject({ version: 2, type: "options" })
  f.send("finish")
  expect(await f.read()).toMatchObject({ version: 2, type: "receipt", receipt: { version: 1, status: "SUCCEEDED" } })
  expect(await f.result()).toMatchObject({ code: 0, guarded: false })
})
test.each(["foreign", "parallel", "empty", "missing-fd"] as const)(
  "managed %s refuses without successful login or completion",
  async (managed) => {
    const f = await fixture({ managed })
    expect(await f.result()).toMatchObject({ code: 1, guarded: true })
  },
)
test("managed duplicate begin is unknown after one acknowledged begin", async () => {
  const f = await fixture({ managed: "duplicate" })
  await acknowledgeLogin(f, "begin")
  expect(await f.result()).toMatchObject({ code: 1, guarded: true })
})
test.each(["wrong-id", "wrong-phase", "extra", "duplicate-key", "eof"])(
  "managed ACK %s denies authenticated step and retains guard",
  async (mode) => {
    const f = await fixture({ managed: "normal" })
    expect(await f.read()).toMatchObject({ version: 2, type: "login", phase: "begin" })
    if (mode === "eof") f.peer.end()
    else if (mode === "duplicate-key")
      f.peer.write('{"version":2,"version":2,"method":"login-ack","loginId":"' + loginId + '","phase":"begin"}\n')
    else
      f.peer.write(
        JSON.stringify({
          version: 2,
          method: "login-ack",
          loginId: mode === "wrong-id" ? "11112233-4455-4677-8899-aabbccddeeff" : loginId,
          phase: mode === "wrong-phase" ? "authenticated" : "begin",
          ...(mode === "extra" ? { extra: true } : {}),
        }) + "\n",
      )
    const result = await f.result()
    expect(result).toMatchObject({ code: 1, guarded: true })
    expect(result.observation.events).toEqual(["host.close"])
  },
)
test("management v2 closes after ACKs without producing a completion receipt", async () => {
  const f = await fixture({ managed: "management" })
  await acknowledgeLogin(f, "begin", "validation")
  await acknowledgeLogin(f, "authenticated", "validation")
  expect(await f.result()).toMatchObject({ code: 0, guarded: false, observation: { events: ["host.close"] } })
})

test("cancellation after begin ACK cannot authenticate or clear the profile guard", async () => {
  const f = await fixture({ managed: "abort" })
  await acknowledgeLogin(f, "begin")
  expect(await f.result()).toMatchObject({ code: 1, guarded: true, observation: { events: ["host.close"] } })
})

test("actual managed command failure propagates to the outer profile guard after confirmed local Host cleanup", async () => {
  const f = await fixture({ managementCommand: true })
  await acknowledgeLogin(f, "begin", "validation")
  expect(await f.result()).toMatchObject({ code: 1, guarded: true })
  expect(JSON.parse(await readFile(join(f.root, "managed-closed.json"), "utf8"))).toEqual({ closed: true })
})
