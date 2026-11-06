import { expect, test } from "bun:test"
import { access, mkdir, mkdtemp, readFile, realpath, rm, rmdir, symlink, unlink, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { watch } from "node:fs"

test.each(["run", "tui", "management"])(
  "startup failure releases the profile only after confirmed cleanup: %s",
  async (mode) => {
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
    for (const cleanupMode of [
      "confirmed",
      "bad-ack",
      "exit-without-ack",
      "disconnect",
      "ack-without-exit",
      "secret-error",
    ]) {
      const confirmed = cleanupMode === "confirmed" || cleanupMode === "secret-error"
      const startupError = cleanupMode === "secret-error" ? "LOGINOM_HOST_REQUEST_FAILED" : "LOGINOM_HANDSHAKE_INVALID"
      const directory = await mkdtemp(join(tmpdir(), "standalone-startup-"))
      const bundle = join(directory, "bundle")
      const profile = join(directory, "profile")
      const marker = join(directory, "child.json")
      try {
        await mkdir(join(bundle, "bin"), { recursive: true })
        await mkdir(join(bundle, "host"))
        await symlink(node, join(bundle, "bin/node"))
        await writeFile(
          join(bundle, "host/node-host.mjs"),
          `import {writeFileSync} from 'node:fs';
        process.on('message', m => {
          if (m.method === 'start') {
            writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,tmp:process.env.TMPDIR}));
            process.send({id:m.id,error:${JSON.stringify(cleanupMode === "secret-error" ? "private-startup-sentinel" : "LOGINOM_HANDSHAKE_INVALID")}});
          }
          if (m.method !== 'close') return;
          if (${JSON.stringify(cleanupMode)} === 'exit-without-ack') {process.exit(0);return;}
          if (${JSON.stringify(cleanupMode)} === 'disconnect') {setInterval(()=>{},1000);process.disconnect();return;}
          if (${JSON.stringify(cleanupMode)} === 'ack-without-exit') {setInterval(()=>{},1000);process.send({id:m.id,result:{closed:true}});return;}
          process.send({id:m.id,result:{closed:${confirmed}}},()=>process.exit(${confirmed ? 0 : 1}));
        });`,
        )
        const child = Bun.spawn(
          [
            ...(process.env.LOGINOM_AI_AGENT_TEST_CLI_BIN
              ? [process.env.LOGINOM_AI_AGENT_TEST_CLI_BIN]
              : [process.execPath, "run", "./src/standalone.ts"]),
            ...(mode === "run" ? ["run", "--headless"] : mode === "tui" ? [] : ["loginom", "status"]),
            "--format=json",
          ],
          {
            cwd: resolve(import.meta.dir, "../.."),
            env: {
              ...process.env,
              BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
              LOGINOM_AI_AGENT_PURE: "1",
              LOGINOM_AI_AGENT_CHANNEL: process.env.LOGINOM_AI_AGENT_TEST_CLI_BIN ? "prod" : "dev",
              LOGINOM_AI_AGENT_CLI_PROFILE: profile,
              LOGINOM_AI_AGENT_CLI_BUNDLE: bundle,
            },
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
          },
        )
        const output = new Response(child.stdout).text()
        const errors = new Response(child.stderr).text()
        // The real CLI owns a 60-second teardown budget; the test guard must allow it to finish.
        const timer = setTimeout(() => child.kill("SIGKILL"), 75_000)
        try {
          expect(await child.exited).toBe(1)
          expect(await errors).toContain(confirmed ? startupError : "LOGINOM_HOST_CLEANUP_FAILED")
          if (confirmed) expect(await output).toContain(startupError)
          expect((await output) + (await errors)).not.toContain("private-startup-sentinel")
          expect(
            await access(join(profile, ".writer")).then(
              () => true,
              () => false,
            ),
          ).toBe(!confirmed)
          const owner = JSON.parse(await readFile(marker, "utf8"))
          expect(() => process.kill(owner.pid, 0)).toThrow()
        } finally {
          clearTimeout(timer)
          child.kill()
          await child.exited
        }
      } finally {
        const owner = await readFile(marker, "utf8").then(
          (text) => JSON.parse(text),
          () => undefined,
        )
        if (owner) {
          try {
            process.kill(owner.pid, "SIGKILL")
          } catch {}
        }
        if (owner?.tmp && (await realpath(owner.tmp).catch(() => undefined)) === join(profile, "cache/tmp")) {
          await unlink(owner.tmp)
          await rmdir(dirname(owner.tmp))
        }
        await rm(directory, { recursive: true, force: true })
      }
    }
  },
  180_000,
)

test("the writer stays held during startup cleanup and the next invocation can reuse the profile", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "startup-writer-barrier-"))
  const bundle = join(directory, "bundle")
  const profile = join(directory, "profile")
  await mkdir(join(bundle, "bin"), { recursive: true })
  await mkdir(join(bundle, "host"))
  await symlink(node, join(bundle, "bin/node"))
  await writeFile(
    join(bundle, "host/node-host.mjs"),
    `import {writeFileSync,watch} from 'node:fs';
    process.on('message',m=>{
      if(m.method==='start') process.send({id:m.id,error:'LOGINOM_HANDSHAKE_INVALID'});
      if(m.method==='close') {
        const waiter=watch(${JSON.stringify(directory)},(_,name)=>{
          if(name!=='release')return;
          waiter.close();process.send({id:m.id,result:{closed:true}},()=>process.exit(0));
        });
        writeFileSync(${JSON.stringify(join(directory, "closing"))},JSON.stringify({pid:process.pid,tmp:process.env.TMPDIR}));
      }
    });`,
  )
  const closing = Promise.withResolvers<void>()
  const watcher = watch(directory, (_, name) => {
    if (name === "closing") closing.resolve()
  })
  const env = {
    ...process.env,
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
    LOGINOM_AI_AGENT_PURE: "1",
    LOGINOM_AI_AGENT_CHANNEL: process.env.LOGINOM_AI_AGENT_TEST_CLI_BIN ? "prod" : "dev",
    LOGINOM_AI_AGENT_CLI_PROFILE: profile,
    LOGINOM_AI_AGENT_CLI_BUNDLE: bundle,
  }
  const invoke = (args: string[]) =>
    Bun.spawn(
      [
        ...(process.env.LOGINOM_AI_AGENT_TEST_CLI_BIN
          ? [process.env.LOGINOM_AI_AGENT_TEST_CLI_BIN]
          : [process.execPath, "run", "./src/standalone.ts"]),
        ...args,
      ],
      { cwd: resolve(import.meta.dir, "../.."), env, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
    )
  const child = invoke(["run", "--format=json"])
  const output = new Response(child.stdout).text()
  const error = new Response(child.stderr).text()
  const timer = setTimeout(() => child.kill("SIGKILL"), 10_000)
  try {
    await Promise.race([
      closing.promise,
      child.exited.then(() => {
        throw Error("CLI_RETURNED_BEFORE_CLEANUP")
      }),
    ])
    expect(
      await access(join(profile, ".writer")).then(
        () => true,
        () => false,
      ),
    ).toBe(true)
    const busy = invoke(["providers", "list"])
    const busyErrors = new Response(busy.stderr).text()
    expect(await busy.exited).toBe(3)
    expect(await busyErrors).toContain("PROFILE_BUSY")
    await writeFile(join(directory, "release"), "release")
    expect(await child.exited).toBe(1)
    expect(await error).toContain("LOGINOM_HANDSHAKE_INVALID")
    await output
    expect(
      await access(join(profile, ".writer")).then(
        () => true,
        () => false,
      ),
    ).toBe(false)
    const retry = invoke(["providers", "list"])
    const retryErrors = new Response(retry.stderr).text()
    expect(await retry.exited).toBe(0)
    expect(await retryErrors).not.toContain("PROFILE_BUSY")
  } finally {
    clearTimeout(timer)
    watcher.close()
    await writeFile(join(directory, "release"), "release")
    child.kill()
    await child.exited
    const owner = await readFile(join(directory, "closing"), "utf8").then(
      (text) => JSON.parse(text),
      () => undefined,
    )
    if (owner) {
      try {
        process.kill(owner.pid, "SIGKILL")
      } catch {}
    }
    if (owner?.tmp && (await realpath(owner.tmp).catch(() => undefined)) === join(profile, "cache/tmp")) {
      await unlink(owner.tmp)
      await rmdir(dirname(owner.tmp))
    }
    await rm(directory, { recursive: true, force: true })
  }
}, 20_000)

test.skipIf(!process.env.LOGINOM_AI_AGENT_TEST_CLI_BIN)(
  "the compiled CLI recovers after a real bundled host constructor fails",
  async () => {
    const executable = process.env.LOGINOM_AI_AGENT_TEST_CLI_BIN!
    const profile = await mkdtemp(join(tmpdir(), "native-startup-profile-"))
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      LOGINOM_AI_AGENT_CLI_PROFILE: profile,
      LOGINOM_AI_AGENT_CHANNEL: "prod",
      LOGINOM_AI_AGENT_PURE: "1",
    }
    delete env.LOGINOM_AI_AGENT_CLI_BUNDLE
    const invoke = async (args: string[]) => {
      const child = Bun.spawn([executable, ...args], { env, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
      const stdout = new Response(child.stdout).text()
      const stderr = new Response(child.stderr).text()
      const deadline = setTimeout(() => child.kill("SIGKILL"), 15000)
      try {
        return { code: await child.exited, stdout: await stdout, stderr: await stderr }
      } finally {
        clearTimeout(deadline)
        child.kill()
        await child.exited
      }
    }
    try {
      expect(await invoke(["providers", "list"])).toMatchObject({ code: 0 })
      for (const args of [
        ["run", "--format=json"],
        ["loginom", "status", "--format=json"],
      ]) {
        await mkdir(join(profile, "loginom"), { recursive: true })
        await writeFile(join(profile, "loginom/recovery"), "private-startup-sentinel")
        const failed = await invoke(args)
        expect(failed).toMatchObject({ code: 1 })
        expect(failed.stderr).toContain("LOGINOM_HOST_REQUEST_FAILED")
        expect(failed.stdout + failed.stderr).not.toContain("private-startup-sentinel")
        await expect(access(join(profile, ".writer"))).rejects.toMatchObject({ code: "ENOENT" })
        await unlink(join(profile, "loginom/recovery"))
        const recovered = await invoke(["loginom", "status", "--format=json"])
        expect(recovered).toMatchObject({ code: 0, stderr: "" })
        expect(JSON.parse(recovered.stdout)).toMatchObject({ state: "unconfigured" })
        await rm(join(profile, "loginom/recovery"), { recursive: true, force: true })
      }
    } finally {
      await rm(profile, { recursive: true, force: true })
    }
  },
  60000,
)

test.each([false, true])(
  "TUI offers saved cloud sign-in on the same Host and hands off cancellation: accept=%s",
  async (accept) => {
    const directory = await mkdtemp(join(tmpdir(), "tui-cloud-startup-"))
    const bundle = join(directory, "bundle")
    const profile = join(directory, "profile")
    await mkdir(join(bundle, "bin"), { recursive: true })
    await mkdir(join(bundle, "host"))
    await symlink(process.env.LOGINOM_AI_AGENT_TEST_NODE!, join(bundle, "bin/node"))
    const calls = join(directory, "calls.jsonl")
    await writeFile(
      join(bundle, "host/node-host.mjs"),
      `
    import {appendFileSync} from 'node:fs';
    let connected=false;
    process.on('message', m => {
      appendFileSync(${JSON.stringify(calls)},JSON.stringify(m.method)+'\\n');
      if(m.method==='start') return process.send({id:m.id,result:{protocol:1,ready:true,pid:process.pid}});
      if(m.method==='close') return process.send({id:m.id,result:{closed:true}},()=>process.exit(0));
      if(m.method==='connection.cloud-start')connected=true;
      process.send({id:m.id,result:{mode:'cloud',hasApiKey:false,server:'primary',help:{state:connected?'ready':'connection-required'},cloud:{connected},revision:1,generation:1,url:'https://example.test/app/',username:'user',folder:'/user',hasPassword:false,state:connected?'ready':'connection-required'}});
    });`,
    )
    const child = Bun.spawn(
      [
        process.execPath,
        "-e",
        `
    import {mock} from 'bun:test';
    import {existsSync} from 'node:fs';
    import {standalone} from './src/cli/standalone.ts';
    import {standaloneCancellation} from './src/cli/standalone-cancellation.ts';
    Object.defineProperty(process.stdin,'isTTY',{value:true});
    mock.module('@clack/prompts',()=>({confirm:async options=>{
      console.log(JSON.stringify({prompt:options.message,signal:!!standaloneCancellation(),guard:existsSync(${JSON.stringify(join(profile, ".writer"))})}));
      return ${accept};
    },isCancel:()=>false}));
    mock.module('./src/cli/cmd/tui',()=>({setTuiLoginomHost:()=>{},setTuiStartupWarning:()=>{},TuiThreadCommand:{command:'$0',handler:()=>{console.log(JSON.stringify({tui:true,signal:!!standaloneCancellation(),guard:existsSync(${JSON.stringify(join(profile, ".writer"))})}));}}}));
    const {standaloneRun}=await import('./src/cli/standalone-run.ts');
    await standalone([],(_,paths)=>standaloneRun([],paths,'tui'));
    process.stdin.pause();
  `,
      ],
      {
        cwd: resolve(import.meta.dir, "../.."),
        env: {
          ...process.env,
          BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
          LOGINOM_AI_AGENT_CHANNEL: "dev",
          LOGINOM_AI_AGENT_CLI_PROFILE: profile,
          LOGINOM_AI_AGENT_CLI_BUNDLE: bundle,
          LOGINOM_AI_AGENT_SYSTEM_PROXY: "off",
          LOGINOM_AI_AGENT_PURE: "1",
        },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const output = new Response(child.stdout).text()
    const errors = new Response(child.stderr).text()
    const timer = setTimeout(() => child.kill("SIGKILL"), 20_000)
    try {
      expect({ exit: await child.exited, errors: await errors }).toEqual({
        exit: 0,
        errors: accept ? "" : "Для входа позже выйдите из TUI, выполните loginom connect и откройте TUI снова.\n",
      })
      const rows = (await output)
        .trim()
        .split("\n")
        .map((row) => JSON.parse(row))
      expect(rows).toEqual([
        {
          prompt: "Подключиться к Loginom AI сейчас? Можно продолжить обычный чат без подключения.",
          signal: true,
          guard: true,
        },
        { tui: true, signal: false, guard: true },
      ])
      const operations = (await readFile(calls, "utf8"))
        .trim()
        .split("\n")
        .map((row) => JSON.parse(row))
      expect(operations.filter((operation) => operation === "start")).toHaveLength(1)
      expect(operations.filter((operation) => operation === "connection.cloud-start")).toHaveLength(accept ? 1 : 0)
      expect(operations.at(-1)).toBe("close")
      await expect(access(join(profile, ".writer"))).rejects.toMatchObject({ code: "ENOENT" })
    } finally {
      clearTimeout(timer)
      child.kill()
      await child.exited
      await rm(directory, { recursive: true, force: true })
    }
  },
  30_000,
)

test.each([
  { confirmed: true, tui: false, complete: false },
  { confirmed: false, tui: false, complete: false },
  { confirmed: true, tui: true, complete: false },
  { confirmed: false, tui: true, complete: false },
  { confirmed: true, tui: false, complete: true },
  { confirmed: false, tui: false, complete: true },
])(
  "connect cancellation keeps the writer through repeated SIGINT and confirmed shutdown: %j",
  async ({ confirmed, tui, complete }) => {
    const directory = await mkdtemp(join(tmpdir(), "connect-cleanup-"))
    const bundle = join(directory, "bundle")
    const profile = join(directory, "profile")
    await mkdir(join(bundle, "bin"), { recursive: true })
    await mkdir(join(bundle, "host"))
    await symlink(process.env.LOGINOM_AI_AGENT_TEST_NODE!, join(bundle, "bin/node"))
    await writeFile(
      join(bundle, "host/node-host.mjs"),
      `
    import {writeFileSync,existsSync} from 'node:fs';
    const root=${JSON.stringify(directory)};
    const view={mode:'cloud',hasApiKey:false,server:'primary',help:{state:'connection-required'},cloud:{connected:false},revision:1,generation:1,url:'https://example.test/app/',username:'user',folder:'/user',hasPassword:false,state:'connection-required'};
    function after(file,run){const timer=setInterval(()=>{if(!existsSync(root+'/'+file))return;clearInterval(timer);run();},10)}
    process.on('message',m=>{
      if(m.method==='start')return process.send({id:m.id,result:{protocol:1,ready:true,pid:process.pid}});
      if(m.method==='connection.cloud-start'){
        writeFileSync(root+'/starting','1');
        return after('release-start',()=>process.send({id:m.id,result:{...view,cloud:${complete ? "{connected:true}" : "{connected:false,pending:{userCode:'SAFE-CODE',verificationUrl:'https://example.test/device',expiresAt:Date.now()+60000}}"}}}));
      }
      if(m.method==='close'){
        writeFileSync(root+'/closing',JSON.stringify({pid:process.pid,tmp:process.env.TMPDIR}));
        return after('release-close',()=>process.send({id:m.id,result:{closed:${confirmed}}},()=>process.exit(0)));
      }
      process.send({id:m.id,result:view});
    });`,
    )
    const environment = {
      ...process.env,
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
      LOGINOM_AI_AGENT_PURE: "1",
      LOGINOM_AI_AGENT_CHANNEL: "dev",
      LOGINOM_AI_AGENT_CLI_PROFILE: profile,
      LOGINOM_AI_AGENT_CLI_BUNDLE: bundle,
    }
    const child = Bun.spawn(
      tui
        ? [
            process.execPath,
            "-e",
            `
    import {mock} from 'bun:test';
    Object.defineProperty(process.stdin,'isTTY',{value:true});
    mock.module('@clack/prompts',()=>({confirm:async()=>true,isCancel:()=>false}));
    process.argv=['bun','standalone','--format=json'];
    await import('./src/standalone.ts');
  `,
          ]
        : [process.execPath, "run", "./src/standalone.ts", "loginom", "connect", "--format=json"],
      { cwd: resolve(import.meta.dir, "../.."), env: environment, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
    )
    const output: string[] = []
    const errors = new Response(child.stderr).text()
    const drained = (async () => {
      const reader = child.stdout.getReader()
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) return
        output.push(Buffer.from(chunk.value).toString())
      }
    })()
    const timer = setTimeout(() => child.kill("SIGKILL"), 15_000)
    async function until(file: string) {
      const deadline = Date.now() + 10_000
      while (Date.now() < deadline && child.exitCode === null) {
        if (await Bun.file(join(directory, file)).exists()) return
        await Bun.sleep(10)
      }
      throw Error(`Missing ${file}: ${await errors}`)
    }
    try {
      await until("starting")
      if (!complete) child.kill("SIGINT")
      await writeFile(join(directory, "release-start"), "1")
      await until("closing")
      expect(
        await access(join(profile, ".writer")).then(
          () => true,
          () => false,
        ),
      ).toBe(true)
      child.kill("SIGINT")
      await Bun.sleep(50)
      expect(child.exitCode).toBeNull()
      expect(output.join("")).toBe("")
      const busy = Bun.spawn(
        [process.execPath, "run", "./src/standalone.ts", "loginom", "disconnect", "--format=json"],
        { cwd: resolve(import.meta.dir, "../.."), env: environment, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
      )
      expect(await busy.exited).toBe(3)
      expect(await new Response(busy.stderr).text()).toContain("PROFILE_BUSY")
      await writeFile(join(directory, "release-close"), "1")
      expect(await child.exited).toBe(confirmed ? 130 : 1)
      await drained
      expect(await errors).toContain(confirmed ? "CLI_CANCELLED" : "LOGINOM_HOST_CLEANUP_FAILED")
      expect(output.join("")).toBe(
        confirmed
          ? tui
            ? '{"type":"error","error":{"name":"CLI_CANCELLED","data":{"message":"CLI_CANCELLED"}}}\n'
            : '{"ok":false,"code":"CLI_CANCELLED"}\n'
          : "",
      )
      expect(
        await access(join(profile, ".writer")).then(
          () => true,
          () => false,
        ),
      ).toBe(!confirmed)
      const owner = JSON.parse(await readFile(join(directory, "closing"), "utf8"))
      expect(() => process.kill(owner.pid, 0)).toThrow()
    } finally {
      clearTimeout(timer)
      await writeFile(join(directory, "release-start"), "1")
      await writeFile(join(directory, "release-close"), "1")
      child.kill()
      await child.exited
      const owner = await readFile(join(directory, "closing"), "utf8").then(JSON.parse, () => undefined)
      if (owner?.tmp && (await realpath(owner.tmp).catch(() => undefined)) === join(profile, "cache/tmp")) {
        await unlink(owner.tmp)
        await rmdir(dirname(owner.tmp))
      }
      await rm(directory, { recursive: true, force: true })
    }
  },
  30_000,
)
