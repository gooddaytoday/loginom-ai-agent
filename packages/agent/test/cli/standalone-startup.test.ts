import { expect, test } from "bun:test"
import { access, mkdir, mkdtemp, readFile, realpath, rm, rmdir, symlink, unlink, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { watch } from "node:fs"

test.each(["run", "management"])(
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
            ...(mode === "run" ? ["run", "--headless"] : ["loginom", "status"]),
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
        const timer = setTimeout(() => child.kill("SIGKILL"), 10_000)
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
  50_000,
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
