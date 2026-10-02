import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { buildKeychain } from "../../../loginom-host/script/build-keychain"

test.each(["run", "tui", "status"])("actual standalone entry enables package teardown only for run: %s", async (mode) => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-cli-package-policy-"))
  try {
    const bundle = join(directory, "bundle")
    await mkdir(join(bundle, "bin"), { recursive: true })
    await mkdir(join(bundle, "host"))
    await symlink(node, join(bundle, "bin/node"))
    if (process.platform === "darwin") await buildKeychain(join(bundle, "bin"))
    // Actual CLI entry, Node fork and profile cleanup. The external Host answers
    // only preflight: no model, browser or product candidate is claimed here.
    await Bun.write(join(bundle, "host/node-host.mjs"), `
      import {writeFileSync} from 'node:fs';
      process.on('message', m=>{
        if(m.method==='start') {
          writeFileSync(${JSON.stringify(join(directory, "policy.json"))},JSON.stringify({
            policy:m.input.closeSavedPackageOnShutdown??null,headless:m.input.headless
          }));
          process.send({id:m.id,result:{protocol:1,ready:true,pid:process.pid}});
        }
        if(m.method==='connection.status') process.send(${mode === "tui"
          ? "{id:m.id,error:'LOGINOM_NOT_READY'}"
          : "{id:m.id,result:{state:'unconfigured',hasApiKey:false,hasPassword:false,generation:0,revision:0,url:'http://example.test/app',username:'user',folder:'/user'}}"});
        if(m.method==='close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
      });
    `)
    const args = mode === "status" ? ["loginom", "status", "--format", "json"] :
      mode === "run" ? ["run", "--no-headless", "--format", "json", "preflight only"] : ["--no-headless"]
    const child = Bun.spawn([process.execPath, "run", "./src/standalone.ts", ...args], {
      cwd: resolve(import.meta.dir, "../.."),
      env: { ...process.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
        LOGINOM_AI_AGENT_CLI_PROFILE: join(directory, "profile"), LOGINOM_AI_AGENT_CLI_BUNDLE: bundle },
      stdin: "ignore", stdout: "pipe", stderr: "pipe",
    })
    const output = new Response(child.stdout).text()
    const errors = new Response(child.stderr).text()
    const timer = setTimeout(() => child.kill("SIGKILL"), 10_000)
    try {
      expect(await child.exited).toBe(mode === "status" ? 0 : mode === "run" ? 2 : 1)
      const stdout = await output
      const stderr = await errors
      if (mode === "run") expect(stdout).toContain("LOGINOM_CONFIG_REQUIRED")
      if (mode === "tui") expect(stderr).toContain("CLI_RUN_FAILED")
      expect(JSON.parse(await readFile(join(directory, "policy.json"), "utf8")))
        .toEqual({ policy: mode === "run" ? true : mode === "tui" ? false : null, headless: false })
      expect(await readdir(join(directory, "profile"))).not.toContain(".writer")
    } finally {
      clearTimeout(timer)
      child.kill()
      await child.exited
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 15_000)
